#!/usr/bin/env python3
"""Build bundled real railway geometry from OpenStreetMap for Station.

Missing route segments are added to the prepared bundle after OSM connectivity checks.
"""
import base64, heapq, json, math, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "stations" / "preparedRoutes.js"
ROUTES = {
    # Trať 180: skutečné úseky hlavní linky Plzeň–Domažlice.
    "plzen:nyrany": {
        "start": [49.74354, 13.38803],
        "end": [49.71495, 13.20954],
        "label": "Plzeň hl.n. → Nýřany",
    },
    "nyrany:stankov": {
        "start": [49.71495, 13.20954],
        "end": [49.547593219, 13.071820735],
        "label": "Nýřany → Staňkov",
    },
    "stankov:domazlice": {
        "start": [49.547593219, 13.071820735],
        "end": [49.43509, 12.9432],
        "label": "Staňkov → Domažlice",
    },
    "plzen:tremosna": {
        "start": [49.74354, 13.38803],
        "end": [49.81914, 13.39459],
        "label": "Plzeň hl.n. → Třemošná u Plzně",
    },
    "tremosna:plasy": {
        "start": [49.81914, 13.39459],
        "end": [49.93090, 13.37964],
        "label": "Třemošná u Plzně → Plasy",
    },
    # Trať Plzeň–Pňovany–Bezdružice: dvě samostatně ověřitelné části.
    "plzen:pnovany": {
        "start": [49.74354, 13.38803],
        "end": [49.78590, 13.14700],
        "label": "Plzeň hl.n. → Pňovany",
    },
    "pnovany:bezdruzice": {
        "start": [49.78590, 13.14700],
        "end": [49.90700, 12.97100],
        "label": "Pňovany → Bezdružice",
    },
    # Trať 176: rozdělení nové lokální linky Plzeň–Kyšice–Stupno–Radnice.
    "plzen:kysice": {
        "start": [49.74354, 13.38803],
        "end": [49.76780, 13.46500],
        "label": "Plzeň hl.n. → Kyšice",
    },
    "kysice:stupno": {
        "start": [49.76780, 13.46500],
        "end": [49.82633, 13.57684],
        "label": "Kyšice → Stupno",
    },
    "stupno:radnice": {
        "start": [49.82633, 13.57684],
        "end": [49.85600, 13.60500],
        "label": "Stupno → Radnice",
    },
    # Official station coordinates; snapped to the nearest connected railway nodes.
    "rokycany:horovice": {
        "start": [49.73969, 13.59422],
        "end": [49.84319, 13.89905],
        "label": "Rokycany → Hořovice",
    },
    "horovice:beroun": {
        "start": [49.84319, 13.89905],
        "end": [49.96390, 14.07240],
        "label": "Hořovice → Beroun",
    },
    "beroun:dobrichovice": {
        "start": [49.96390, 14.07240],
        "end": [49.92750, 14.27400],
        "label": "Beroun → Dobřichovice",
    },
    "dobrichovice:praha": {
        "start": [49.92750, 14.27400],
        "end": [50.08300, 14.43500],
        "label": "Dobřichovice → Praha hl.n.",
    },
}

def haversine(a, b):
    p = math.pi / 180
    dlat = (b[0]-a[0])*p
    dlon = (b[1]-a[1])*p
    q = math.sin(dlat/2)**2 + math.cos(a[0]*p)*math.cos(b[0]*p)*math.sin(dlon/2)**2
    return 6371000 * 2 * math.atan2(math.sqrt(q), math.sqrt(max(0, 1-q)))

def query_osm(start, end):
    pad = 0.06
    south, west = min(start[0], end[0])-pad, min(start[1], end[1])-pad
    north, east = max(start[0], end[0])+pad, max(start[1], end[1])+pad
    q = f'[out:json][timeout:90];(way["railway"~"^(rail|light_rail|narrow_gauge|tram)$"]({south},{west},{north},{east}););out body;>;out skel qt;'
    body = urllib.parse.urlencode({"data": q}).encode()
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    errors = []
    for endpoint in endpoints:
        for attempt in range(1, 4):
            try:
                req = urllib.request.Request(endpoint, data=body, headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "StationGameRouteBuilder/1.0 (GitHub Actions)"
                })
                with urllib.request.urlopen(req, timeout=110) as response:
                    data = json.loads(response.read().decode())
                if not isinstance(data.get("elements"), list):
                    raise RuntimeError("Overpass response did not contain elements")
                return data["elements"]
            except Exception as exc:
                errors.append(f"{endpoint} (attempt {attempt}/3): {exc}")
                if attempt < 3:
                    time.sleep(2 * attempt)
    raise RuntimeError("All Overpass endpoints failed: " + " | ".join(errors))

def encode_polyline(coords):
    last_lat = last_lon = 0
    out = []
    for lat, lon in coords:
        ilat, ilon = round(lat * 1e5), round(lon * 1e5)
        for value in (ilat-last_lat, ilon-last_lon):
            value = ~(value << 1) if value < 0 else value << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1f)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        last_lat, last_lon = ilat, ilon
    return base64.b64encode("".join(out).encode()).decode()

def route(elements, start, end):
    nodes = {}
    ways = []
    for e in elements:
        if e.get("type") == "node" and "lat" in e and "lon" in e:
            nodes[e["id"]] = (e["lat"], e["lon"])
        elif e.get("type") == "way" and len(e.get("nodes", [])) > 1:
            ways.append(e)
    graph = {nid: [] for nid in nodes}
    for way in ways:
        ids = way["nodes"]
        for a, b in zip(ids, ids[1:]):
            if a not in nodes or b not in nodes: continue
            d = haversine(nodes[a], nodes[b])
            if d <= 0: continue
            graph[a].append((b, d)); graph[b].append((a, d))
    usable = [nid for nid, edges in graph.items() if edges]
    def snap(point):
        nid, dist = min(((n, haversine(point, nodes[n])) for n in usable), key=lambda x:x[1])
        if dist > 3000:
            raise RuntimeError(f"Nearest railway node is {dist:.0f}m from station (limit 3000m)")
        return nid, dist
    s, sd = snap(start); t, td = snap(end)
    dist = {s: 0.0}; prev = {}; heap = [(0.0, s)]
    while heap:
        d, u = heapq.heappop(heap)
        if d != dist.get(u): continue
        if u == t: break
        for v, weight in graph[u]:
            nd = d + weight
            if nd < dist.get(v, float("inf")):
                dist[v] = nd; prev[v] = u; heapq.heappush(heap, (nd, v))
    if t not in dist: raise RuntimeError("No connected railway path between the station endpoints")
    ids = [t]
    while ids[-1] != s:
        ids.append(prev[ids[-1]])
    ids.reverse()
    coords = [list(nodes[n]) for n in ids]
    if len(coords) < 2: raise RuntimeError("Route has fewer than two points")
    # Guard against accidental routing to an unrelated nearby branch.
    direct = haversine(start, end)
    if dist[t] < direct * 0.95: raise RuntimeError("Route distance is implausibly short; refusing to publish")
    print(f"Route found: {len(coords)} nodes, {dist[t]/1000:.2f} km, station snaps {sd:.0f}m/{td:.0f}m")
    return coords

def main():
    if not BUNDLE.exists(): raise RuntimeError(f"Missing bundle: {BUNDLE}")
    source = BUNDLE.read_text()
    # Preserve existing payloads and build only missing route keys. This keeps
    # retries small and avoids re-querying routes that are already bundled.
    payloads = dict(re.findall(r'"([^"]+)": decodePolylineBase64\("([^"]+)"\)', source))
    for key, spec in ROUTES.items():
        if key in payloads:
            print("Already bundled; keeping", spec["label"])
            continue
        print("Building", spec["label"])
        coords = route(query_osm(spec["start"], spec["end"]), spec["start"], spec["end"])
        payloads[key] = encode_polyline(coords)
    entries = ",\n".join(f'    {json.dumps(k)}: decodePolylineBase64({json.dumps(v)})' for k, v in sorted(payloads.items()))
    replacement = '''// Předpřipravené skutečné kolejové trasy z OpenStreetMap.\n// Trasy generuje automatizace .github/workflows/build-railway-routes.yml; hra je nestahuje za běhu.\n(function () {\n  "use strict";\n  function decodePolylineBase64(base64) {\n    const encoded = atob(base64);\n    const coords = [];\n    let index = 0, lat = 0, lon = 0;\n    while (index < encoded.length) {\n      let result = 0, shift = 0, b;\n      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);\n      lat += (result & 1) ? ~(result >> 1) : (result >> 1);\n      result = 0; shift = 0;\n      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);\n      lon += (result & 1) ? ~(result >> 1) : (result >> 1);\n      coords.push([lat / 1e5, lon / 1e5]);\n    }\n    return coords;\n  }\n  window.STATION_PREPARED_ROUTES = {\n''' + entries + '''\n  };\n  window.STATION_BUNDLED_ROUTE_KEYS = new Set(Object.keys(window.STATION_PREPARED_ROUTES));\n})();\n'''
    BUNDLE.write_text(replacement)
    print(f"Updated {BUNDLE.relative_to(ROOT)} with {len(payloads)} bundled routes.")

if __name__ == "__main__":
    main()
