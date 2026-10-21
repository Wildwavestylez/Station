#!/usr/bin/env python3
"""Build bundled real railway geometry from OpenStreetMap for Station.

Missing route segments are added to the prepared bundle after OSM connectivity checks.
"""
import base64, heapq, json, math, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "stations" / "preparedRoutes.js"
# Tyto existující segmenty při změně souřadnic vždy znovu sestavíme z OSM.
# Only rebuild route keys explicitly selected by the workflow.
FORCE_REBUILD = set(filter(None, os.environ.get("ROUTE_KEYS", "").split(",")))

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
    # Šumavská linka: Přeštice–Klatovy–Nýrsko–Železná Ruda-Alžbětín.
    # Západní Šumava: Přeštice–Klatovy–Nýrsko–Železná Ruda-Alžbětín.
    "prestice:klatovy": {
        "start": [49.57220, 13.33300],
        # Ověřená poloha železniční stanice Klatovy, ne centrum města.
        "end": [49.40147, 13.27416],
        "label": "Přeštice → Klatovy",
    },
    "klatovy:nyrsko": {
        # Stejný bod stanice Klatovy jako konec předchozího segmentu.
        "start": [49.40147, 13.27416],
        "end": [49.29300, 13.14300],
        "label": "Klatovy → Nýrsko",
    },
    "nyrsko:alzbietin": {
        "start": [49.29300, 13.14300],
        # Konec musí být v železniční stanici Železná Ruda-Alžbětín.
        "end": [49.12192, 13.21018],
        "label": "Nýrsko → Železná Ruda-Alžbětín",
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
    # Trať 191/190: jižní větev Plzeň–Strakonice, směrem na České Budějovice.
    "plzen:nezvestice": {
        "start": [49.74354, 13.38803],
        "end": [49.64248, 13.51661],
        "label": "Plzeň hl.n. → Nezvěstice",
    },
    "nezvestice:nepomuk": {
        "start": [49.64248, 13.51661],
        "end": [49.49751, 13.60870],
        "label": "Nezvěstice → Nepomuk",
    },
    "nepomuk:horazdovice_predm": {
        "start": [49.49751, 13.60870],
        "end": [49.33132, 13.73892],
        "label": "Nepomuk → Horažďovice předměstí",
    },
    "horazdovice_predm:strakonice": {
        "start": [49.33132, 13.73892],
        "end": [49.25504, 13.91558],
        "label": "Horažďovice předměstí → Strakonice",
    },
    "strakonice:protivin": {
        "start": [49.25504, 13.91558],
        "end": [49.21253, 14.21183],
        "label": "Strakonice → Protivín",
    },
    "protivin:divcice": {
        "start": [49.21253, 14.21183],
        "end": [49.10611, 14.30081],
        "label": "Protivín → Dívčice",
    },
    "divcice:ceske_budejovice": {
        "start": [49.10611, 14.30081],
        "end": [48.97434, 14.48811],
        "label": "Dívčice → České Budějovice",
    },
    # Rychlík Plzeň–České Budějovice–Jihlava–Brno: pokračování z Budějovic přes Veselí a Jindřichův Hradec.
    "ceske_budejovice:veseli_nad_luznici": {
        "start": [48.97434, 14.48811],  # České Budějovice hl.n.
        "end": [49.18840, 14.69730],   # Veselí nad Lužnicí, železniční stanice
        "label": "České Budějovice → Veselí nad Lužnicí",
    },
    "veseli_nad_luznici:kardasova_recice": {
        "start": [49.18840, 14.69730],  # Veselí nad Lužnicí
        "end": [49.18470, 14.85150],   # Kardašova Řečice, železniční stanice
        "label": "Veselí nad Lužnicí → Kardašova Řečice",
    },
    "kardasova_recice:jindrichuv_hradec": {
        "start": [49.18470, 14.85150],  # Kardašova Řečice
        "end": [49.14500, 15.00320],   # Jindřichův Hradec, železniční stanice
        "label": "Kardašova Řečice → Jindřichův Hradec",
    },
    # Rychlík Plzeň–České Budějovice–Jihlava–Brno: pokračování přes trať 225.
    "jindrichuv_hradec:popelin": {
        "start": [49.14500, 15.00320],  # Jindřichův Hradec, železniční stanice
        "end": [49.22033, 15.17856],   # Popelín, železniční stanice (ověřená poloha); snap na OSM koleje
        "label": "Jindřichův Hradec → Popelín",
    },
    "popelin:horni_cerekev": {
        "start": [49.22033, 15.17856],  # Popelín, železniční stanice (ověřená poloha)
        "end": [49.31114, 15.32469],    # Horní Cerekev, železniční stanice
        "label": "Popelín → Horní Cerekev",
    },
    "horni_cerekev:kostelec_u_jihlavy": {
        "start": [49.31114, 15.32469],  # Horní Cerekev
        "end": [49.35719, 15.48183],    # Kostelec u Jihlavy, železniční stanice
        "label": "Horní Cerekev → Kostelec u Jihlavy",
    },
    "kostelec_u_jihlavy:jihlava": {
        "start": [49.35719, 15.48183],  # Kostelec u Jihlavy
        "end": [49.41450, 15.59939],    # Jihlava, hlavní železniční stanice (ověřené souřadnice OSM)
        "label": "Kostelec u Jihlavy → Jihlava",
    },
    # Northern continuation of railway line 160 toward Zatec.
    "plasy:blatno": {
        "start": [49.93090, 13.37964],
        "end": [50.09982, 13.39014],
        "label": "Plasy - Blatno u Jesenice",
    },
    "blatno:podborany": {
        "start": [50.09982, 13.39014],
        "end": [50.22350, 13.40437],
        "label": "Blatno u Jesenice - Podborany",
    },
    "podborany:zatec": {
        "start": [50.22350, 13.40437],
        "end": [50.33656, 13.55521],
        "label": "Podborany - Zatec hlavni nadrazi",
    },
    "zatec:chomutov": {
        # Station coordinates verified against OpenStreetMap station nodes.
        "start": [50.33656, 13.55521],
        "end": [50.45679, 13.39938],
        "label": "Zatec nadrazi - Chomutov nadrazi",
    },
    # Route continues via Jirkov zastavka on line 130, not Jirkov station on line 124.
    "chomutov:jirkov_zastavka": {
        "start": [50.45679, 13.39938],
        "end": [50.48560, 13.44776],
        "label": "Chomutov nadrazi - Jirkov zastavka",
    },
    "jirkov_zastavka:most": {
        "start": [50.48560, 13.44776],
        "end": [50.51114, 13.65871],
        "label": "Jirkov zastavka - Most nadrazi",
    },
    # Hlavní trať 178: pokračování Plzeň–Cheb rozdělené v přestupních stanicích.
    "pnovany:svojsin": {
        "start": [49.78590, 13.14700],
        "end": [49.75110, 12.90230],
        "label": "Pňovany → Svojšín",
    },
    "svojsin:plana": {
        "start": [49.75110, 12.90230],
        "end": [49.861114249, 12.730324566],
        "label": "Svojšín → Planá u Mariánských Lázní",
    },
    "plana:marianske_lazne": {
        "start": [49.861114249, 12.730324566],
        "end": [49.95709, 12.69381],
        "label": "Planá u Mariánských Lázní → Mariánské Lázně",
    },
    "marianske_lazne:cheb": {
        "start": [49.95709, 12.69381],
        "end": [50.073835, 12.380674],
        "label": "Mariánské Lázně → Cheb",
    },
    "cheb:sokolov": {
        "start": [50.073835, 12.380674],
        "end": [50.18110, 12.63990],
        "label": "Cheb → Sokolov",
    },
    "sokolov:karlovy_vary": {
        "start": [50.18110, 12.63990],
        "end": [50.22880, 12.87140],
        "label": "Sokolov → Karlovy Vary",
    },
    # Hlavní koridor Pendolina: Plzeň–Stříbro–Planá a dále přes Prahu na Ostravu.
    "plzen:stribro": {"start": [49.74354, 13.38803], "end": [49.75420, 13.00410], "label": "Plzeň hl.n. → Stříbro"},
    "stribro:plana": {"start": [49.75420, 13.00410], "end": [49.86800, 12.74300], "label": "Stříbro → Planá u Mariánských Lázní"},
    # Pendolino: pokračování z Prahy po hlavním koridoru směrem na Kolín.
    # Souřadnice odpovídají železničním stanicím; geometrie se stáhne a ověří proti OSM.
    "praha:uvaly": {
        "start": [50.08300, 14.43500],  # Praha hlavní nádraží (sdílený anchor s existujícími trasami)
        "end": [50.07509, 14.72246],   # Úvaly, železniční stanice (ČD)
        "label": "Praha hl.n. → Úvaly",
    },
    "uvaly:pecky": {
        "start": [50.07509, 14.72246],  # Úvaly, železniční stanice
        "end": [50.08975, 15.02766],    # Pečky, železniční stanice (OSM)
        "label": "Úvaly → Pečky",
    },
    "pecky:kolin": {
        "start": [50.08975, 15.02766],  # Pečky, železniční stanice
        "end": [50.02583, 15.21270],    # Kolín, hlavní železniční stanice (ČD)
        "label": "Pečky → Kolín",
    },
    "kolin:chvaletice": {
        "start": [50.02528, 15.21361],  # Kolín hlavní nádraží
        "end": [50.03745, 15.41863],   # Chvaletice, železniční stanice (ČD)
        "label": "Kolín → Chvaletice",
    },
    "chvaletice:prelouc": {
        "start": [50.03745, 15.41863],  # Chvaletice, železniční stanice (ČD)
        "end": [50.03981, 15.57390],   # Přelouč, železniční stanice (ČD)
        "label": "Chvaletice → Přelouč",
    },
    "prelouc:pardubice": {
        "start": [50.03981, 15.57390],  # Přelouč, železniční stanice (ČD)
        "end": [50.03167, 15.75756],    # Pardubice hl.n. — souřadnice stanice ČD
        "label": "Přelouč → Pardubice hl.n.",
    },
    "praha:pardubice": {"start": [50.08300, 14.43500], "end": [50.03430, 15.75650], "label": "Praha hl.n. → Pardubice hl.n."},
    "pardubice:olomouc": {"start": [50.03430, 15.75650], "end": [49.59380, 17.25090], "label": "Pardubice hl.n. → Olomouc hl.n."},
    # Pendolino: pokračování hlavním koridorem z Pardubic do České Třebové.
    # Kotvy ověřeny podle stránek ČD / OSM; body jsou železniční stanice, ne centra obcí.
    "pardubice:moravany": {
        "start": [50.03167, 15.75756],  # Pardubice hl.n. (ČD)
        "end": [50.00220, 15.94646],   # Moravany (ČD)
        "label": "Pardubice hl.n. → Moravany",
    },
    "moravany:chocen": {
        "start": [50.00220, 15.94646],  # Moravany (ČD)
        "end": [49.99372, 16.22316],    # Choceň railway station (OSM public_transport=station)
        "label": "Moravany → Choceň",
    },
    "chocen:usti_nad_orlici": {
        "start": [49.99372, 16.22316], # Choceň railway station (OSM)
        "end": [49.97106, 16.37827],   # Ústí nad Orlicí (ČD)
        "label": "Choceň → Ústí nad Orlicí",
    },
    "usti_nad_orlici:ceska_trebova": {
        "start": [49.97106, 16.37827], # Ústí nad Orlicí (ČD)
        "end": [49.89683, 16.44712],   # Česká Třebová (ČD)
        "label": "Ústí nad Orlicí → Česká Třebová",
    },
    "olomouc:ostrava": {"start": [49.59380, 17.25090], "end": [49.85090, 18.28570], "label": "Olomouc hl.n. → Ostrava hl.n."},
    # Mezinárodní pokračování přes přesné souřadnice železničních stanic (OSM/DB).
    "domazlice:furth_im_wald": {
        "start": [49.43509, 12.94320],  # Domažlice, ČD
        "end": [49.30996, 12.83949],    # Bahnhof Furth im Wald
        "label": "Domažlice → Furth im Wald",
    },
    "furth_im_wald:cham": {
        "start": [49.30996, 12.83949],
        "end": [49.22184, 12.65681],    # Bahnhof Cham (Oberpf)
        "label": "Furth im Wald → Cham (Oberpf)",
    },
    "cham:roding": {
        "start": [49.22184, 12.65681],
        "end": [49.21385, 12.51357],    # Bahnhof Roding
        "label": "Cham (Oberpf) → Roding",
    },
    "roding:schwandorf": {
        "start": [49.21385, 12.51357],
        "end": [49.32632, 12.10381],    # Bahnhof Schwandorf
        "label": "Roding → Schwandorf",
    },
    "schwandorf:maxhuette_haidhof": {
        "start": [49.32632, 12.10381],  # Bahnhof Schwandorf
        "end": [49.198019, 12.107818],  # Bahnhof Maxhütte-Haidhof
        "label": "Schwandorf → Maxhütte-Haidhof",
    },
    "maxhuette_haidhof:regenstauf": {
        "start": [49.198019, 12.107818],
        "end": [49.12206, 12.12514],    # Bahnhof Regenstauf
        "label": "Maxhütte-Haidhof → Regenstauf",
    },
    "regenstauf:regensburg": {
        "start": [49.12206, 12.12514],
        "end": [49.01340, 12.10160],    # Regensburg Hbf
        "label": "Regenstauf → Regensburg Hbf",
    },
    # Starší přímý segment Cham–Schwandorf ponechán kvůli kompatibilitě starých tras.
    "cham:schwandorf": {"start": [49.22184, 12.65681], "end": [49.32632, 12.10381], "label": "Cham → Schwandorf"},
    "schwandorf:regensburg": {"start": [49.32600, 12.10900], "end": [49.01340, 12.10160], "label": "Schwandorf → Regensburg Hbf"},
    "regensburg:landshut": {"start": [49.01340, 12.10160], "end": [48.54420, 12.14680], "label": "Regensburg Hbf → Landshut(Bay)Hbf"},
    "landshut:moosburg": {
        "start": [48.54736, 12.13550],  # Landshut (Bay) Hbf
        "end": [48.47080, 11.93290],    # Bahnhof Moosburg
        "label": "Landshut Hbf → Moosburg",
    },
    "moosburg:freising": {
        "start": [48.47080, 11.93290],
        "end": [48.40290, 11.74870],    # Bahnhof Freising
        "label": "Moosburg → Freising",
    },
    "freising:neufahrn_b_freising": {
        "start": [48.40290, 11.74870],
        "end": [48.32131, 11.66068],   # Neufahrn bei Freising
        "label": "Freising → Neufahrn bei Freising",
    },
    # Munich surface approach: rebuild only the station-to-station segments below.
    "neufahrn_b_freising:feldmoching": {
        "start": [48.32131, 11.66068],
        "end": [48.21280, 11.53380],  # Bahnhof Feldmoching
        "label": "Neufahrn bei Freising → Feldmoching",
    },
    "feldmoching:moosach": {
        "start": [48.21280, 11.53380],
        "end": [48.18170, 11.50770],  # Bahnhof München-Moosach
        "label": "Feldmoching → München-Moosach",
    },
    "moosach:laim": {
        "start": [48.18170, 11.50770],
        "end": [48.14550, 11.50250],  # München-Laim
        "label": "München-Moosach → München-Laim",
    },
    "laim:muenchen": {
        "start": [48.14550, 11.50250],
        "end": [48.14020, 11.55800],  # München Hbf
        "label": "München-Laim → München Hbf",
    },
    "regensburg:neufahrn_ndb": {
        "start": [49.01340, 12.10160],  # Regensburg Hbf
        "end": [48.72987492, 12.19046519],  # Neufahrn (Niederbay), not Neufahrn bei Freising
        "label": "Regensburg Hbf → Neufahrn (Niederbay)",
    },
    "neufahrn_ndb:landshut": {
        "start": [48.72987492, 12.19046519],
        "end": [48.54736, 12.13550],  # Landshut (Bay) Hbf
        "label": "Neufahrn (Niederbay) → Landshut Hbf",
    },
    "freising:muenchen": {"start": [48.40290, 11.74870], "end": [48.14020, 11.55800], "label": "Freising → München Hbf"},
    # Rychlík Jihlava–Brno: pokračování po trati 240; všechny body jsou hlavní železniční stanice.
    "jihlava:luka_nad_jihlavou": {
        "start": [49.41450, 15.59939],  # Jihlava, hlavní železniční stanice
        "end": [49.36917, 15.71092],    # Luka nad Jihlavou, železniční stanice (ČD)
        "label": "Jihlava → Luka nad Jihlavou",
    },
    "luka_nad_jihlavou:okrisky": {
        "start": [49.36917, 15.71092],  # Luka nad Jihlavou
        "end": [49.24792, 15.77007],    # Okříšky, železniční stanice (ČD)
        "label": "Luka nad Jihlavou → Okříšky",
    },
    "okrisky:trebic": {
        "start": [49.24792, 15.77007],  # Okříšky
        "end": [49.21143, 15.88570],    # Třebíč, hlavní železniční stanice (ČD)
        "label": "Okříšky → Třebíč",
    },
    "trebic:studenec": {
        "start": [49.21143, 15.88570],  # Třebíč
        "end": [49.22257, 16.06905],    # Studenec, železniční stanice
        "label": "Třebíč → Studenec",
    },
    "studenec:rosice_u_brna": {
        "start": [49.22257, 16.06905],  # Studenec
        "end": [49.17893, 16.38334],    # Rosice u Brna, železniční stanice (ČD)
        "label": "Studenec → Rosice u Brna",
    },
    "rosice_u_brna:brno_hlavni_nadrazi": {
        "start": [49.17893, 16.38334],  # Rosice u Brna
        "end": [49.18999, 16.61105],    # Brno hlavní nádraží (ČD)
        "label": "Rosice u Brna → Brno hlavní nádraží",
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
    selected = FORCE_REBUILD
    if not selected:
        raise RuntimeError("ROUTE_KEYS is required; refusing to rebuild or add routes implicitly.")
    unknown = selected - ROUTES.keys()
    if unknown:
        raise RuntimeError("Unknown ROUTE_KEYS: " + ", ".join(sorted(unknown)))
    # Process ONLY explicitly selected route keys. All other bundled routes are
    # preserved byte-for-byte and no unrelated missing route is generated.
    for key in sorted(selected):
        spec = ROUTES[key]
        payloads.pop(key, None)
        print("Building", spec["label"])
        coords = route(query_osm(spec["start"], spec["end"]), spec["start"], spec["end"])
        payloads[key] = encode_polyline(coords)
    entries = ",\n".join(f'    {json.dumps(k)}: decodePolylineBase64({json.dumps(v)})' for k, v in sorted(payloads.items()))
    replacement = '''// Předpřipravené skutečné kolejové trasy z OpenStreetMap.\n// Trasy generuje automatizace .github/workflows/build-railway-routes.yml; hra je nestahuje za běhu.\n(function () {\n  "use strict";\n  function decodePolylineBase64(base64) {\n    const encoded = atob(base64);\n    const coords = [];\n    let index = 0, lat = 0, lon = 0;\n    while (index < encoded.length) {\n      let result = 0, shift = 0, b;\n      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);\n      lat += (result & 1) ? ~(result >> 1) : (result >> 1);\n      result = 0; shift = 0;\n      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);\n      lon += (result & 1) ? ~(result >> 1) : (result >> 1);\n      coords.push([lat / 1e5, lon / 1e5]);\n    }\n    return coords;\n  }\n  window.STATION_PREPARED_ROUTES = {\n''' + entries + '''\n  };\n  window.STATION_BUNDLED_ROUTE_KEYS = new Set(Object.keys(window.STATION_PREPARED_ROUTES));\n})();\n'''
    BUNDLE.write_text(replacement)
    print(f"Updated {BUNDLE.relative_to(ROOT)} with {len(payloads)} bundled routes.")

if __name__ == "__main__":
    main()
