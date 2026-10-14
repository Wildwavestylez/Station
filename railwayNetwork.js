/* Shared railway network for Station.
 * Downloads OSM railway ways once per area, caches the raw network in IndexedDB,
 * then routes trains over connected rail segments with Dijkstra.
 */
(function () {
  "use strict";

  const DB_NAME = "station-railway-cache";
  const STORE_NAME = "networks";
  const CACHE_VERSION = 3;
  // Public Overpass servers can be overloaded; try several independent instances.
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://api.openstreetmap.fr/oapi/interpreter",
    "https://overpass.osm.vi-di.fr/api/interpreter"
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function cacheGet(key) {
    const db = await openDb().catch(() => null);
    if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function cacheSet(key, value) {
    const db = await openDb().catch(() => null);
    if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  function areaKey(bounds) {
    return "v" + CACHE_VERSION + ":" + bounds.map(n => Number(n).toFixed(3)).join(",");
  }

  function makeQuery(bounds) {
    const [south, west, north, east] = bounds;
    return '[out:json][timeout:60];(way["railway"~"^(rail|light_rail|narrow_gauge|tram)$"](' +
      south + "," + west + "," + north + "," + east + '););out body;>;out skel qt;';
  }

  async function downloadNetwork(bounds) {
    const query = makeQuery(bounds);
    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), 25000) : null;
        let response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: "data=" + encodeURIComponent(query),
            signal: controller ? controller.signal : undefined
          });
        } finally {
          if (timeout !== null) clearTimeout(timeout);
        }
        if (!response.ok) throw new Error("Overpass HTTP " + response.status + " (" + new URL(endpoint).host + ")");
        const data = await response.json();
        if (!data || !Array.isArray(data.elements)) throw new Error("Neplatná data z Overpass API.");
        const network = { version: CACHE_VERSION, fetchedAt: Date.now(), elements: data.elements };
        await cacheSet(areaKey(bounds), network);
        return network;
      } catch (error) {
        lastError = error && error.name === "AbortError"
          ? new Error("Časový limit při načítání " + new URL(endpoint).host)
          : error;
        console.warn("Načtení OSM sítě selhalo přes " + endpoint, lastError);
      }
    }
    throw lastError || new Error("Železniční síť se nepodařila načíst.");
  }

  async function load(bounds, options) {
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
        bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
      throw new Error("Neplatné hranice oblasti železniční sítě.");
    }
    const key = areaKey(bounds);
    if (!(options && options.refresh)) {
      const cached = await cacheGet(key);
      if (cached && cached.version === CACHE_VERSION && Array.isArray(cached.elements)) {
        return buildGraph(cached.elements, { source: "cache", fetchedAt: cached.fetchedAt });
      }
    }
    const raw = await downloadNetwork(bounds);
    return buildGraph(raw.elements, { source: "overpass", fetchedAt: raw.fetchedAt });
  }

  function haversine(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const lat1 = a.lat * rad, lat2 = b.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function buildGraph(elements, metadata) {
    const nodes = new Map();
    const ways = [];
    for (const element of elements) {
      if (element.type === "node" && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
        nodes.set(element.id, { id: element.id, lat: element.lat, lon: element.lon, edges: [] });
      } else if (element.type === "way" && Array.isArray(element.nodes) && element.nodes.length > 1) {
        ways.push(element);
      }
    }

    for (const way of ways) {
      for (let i = 1; i < way.nodes.length; i++) {
        const a = nodes.get(way.nodes[i - 1]);
        const b = nodes.get(way.nodes[i]);
        if (!a || !b) continue;
        const distance = haversine(a, b);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        a.edges.push({ to: b.id, distance, wayId: way.id });
        b.edges.push({ to: a.id, distance, wayId: way.id });
      }
    }
    // Label connected components once so start/end snapping selects nodes on the
    // same connected railway component instead of two individually-nearest sidings.
    const componentByNode = new Map();
    let componentId = 0;
    for (const node of nodes.values()) {
      if (!node.edges.length || componentByNode.has(node.id)) continue;
      componentId++;
      const stack = [node.id];
      componentByNode.set(node.id, componentId);
      while (stack.length) {
        const id = stack.pop();
        const current = nodes.get(id);
        for (const edge of current.edges) {
          if (!componentByNode.has(edge.to)) {
            componentByNode.set(edge.to, componentId);
            stack.push(edge.to);
          }
        }
      }
    }

    return {
      nodes, ways, metadata: Object.assign({ nodeCount: nodes.size, wayCount: ways.length, componentCount: componentId }, metadata || {}),
      nearestNode(point, maxDistance) {
        let best = null, bestDistance = Infinity;
        for (const node of nodes.values()) {
          if (!node.edges.length) continue;
          const distance = haversine(node, { lat: point[0], lon: point[1] });
          if (distance < bestDistance) { best = node; bestDistance = distance; }
        }
        return best && bestDistance <= (maxDistance || 3000) ? { node: best, distance: bestDistance } : null;
      },
      findRoute(start, end, options) {
        const maxSnap = (options && options.maxSnapDistance) || 3000;
        const candidates = point => {
          const found = [];
          for (const node of nodes.values()) {
            const component = componentByNode.get(node.id);
            if (!component) continue;
            const distance = haversine(node, { lat: point[0], lon: point[1] });
            if (distance <= maxSnap) found.push({ node, distance, component });
          }
          return found.sort((a, b) => a.distance - b.distance).slice(0, 80);
        };
        const starts = candidates(start), ends = candidates(end);
        let pair = null, bestCost = Infinity;
        for (const a of starts) for (const b of ends) {
          if (a.component !== b.component) continue;
          const cost = a.distance + b.distance;
          if (cost < bestCost) { pair = { startMatch: a, endMatch: b }; bestCost = cost; }
        }
        if (!pair) throw new Error("Začátek a cíl nebylo možné přichytit ke stejné souvislé kolejové síti (komponenty: " + componentId + ").");
        const startMatch = pair.startMatch, endMatch = pair.endMatch;
        const startId = startMatch.node.id, endId = endMatch.node.id;
        const distances = new Map([[startId, 0]]);
        const previous = new Map();
        const visited = new Set();
        // Min-heap keeps route search fast on real OSM networks with thousands of nodes.
        const heap = [{ id: startId, distance: 0 }];
        const push = item => {
          heap.push(item);
          let i = heap.length - 1;
          while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (heap[p].distance <= heap[i].distance) break;
            [heap[p], heap[i]] = [heap[i], heap[p]];
            i = p;
          }
        };
        const pop = () => {
          const first = heap[0], last = heap.pop();
          if (heap.length) {
            heap[0] = last;
            let i = 0;
            while (true) {
              let smallest = i, left = i * 2 + 1, right = left + 1;
              if (left < heap.length && heap[left].distance < heap[smallest].distance) smallest = left;
              if (right < heap.length && heap[right].distance < heap[smallest].distance) smallest = right;
              if (smallest === i) break;
              [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
              i = smallest;
            }
          }
          return first;
        };
        while (heap.length) {
          const item = pop(), currentId = item.id, currentDistance = item.distance;
          if (visited.has(currentId) || currentDistance !== distances.get(currentId)) continue;
          if (currentId === endId) break;
          visited.add(currentId);
          const current = nodes.get(currentId);
          for (const edge of current.edges) {
            if (visited.has(edge.to)) continue;
            const candidate = currentDistance + edge.distance;
            if (candidate < (distances.get(edge.to) ?? Infinity)) {
              distances.set(edge.to, candidate);
              previous.set(edge.to, { from: currentId, wayId: edge.wayId });
              push({ id: edge.to, distance: candidate });
            }
          }
        }
        if (!distances.has(endId)) {
          throw new Error("OSM síť je přerušená mezi přichycenými kolejemi (uzly " +
            startId + " → " + endId + "; načteno " + nodes.size + " uzlů a " + ways.length + " úseků).");
        }
        const ids = [endId], wayIds = [];
        let cursor = endId;
        while (cursor !== startId) {
          const step = previous.get(cursor);
          if (!step) throw new Error("Trasu se nepodařilo sestavit.");
          wayIds.push(step.wayId);
          cursor = step.from;
          ids.push(cursor);
        }
        ids.reverse(); wayIds.reverse();
        return {
          coordinates: ids.map(id => [nodes.get(id).lat, nodes.get(id).lon]),
          nodeIds: ids,
          wayIds: Array.from(new Set(wayIds)),
          distanceMeters: distances.get(endId),
          snapDistances: { start: startMatch.distance, end: endMatch.distance }
        };
      }
    };
  }

  window.RailwayNetwork = { load, buildGraph, cacheVersion: CACHE_VERSION };
})();