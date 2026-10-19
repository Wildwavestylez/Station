// Spojí pouze ověřené OSM segmenty do souvislé linky Plzeň → Praha.
function buildPlzenPlasyRoute() {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const keys = ["plzen:tremosna", "tremosna:plasy"];
  const segments = keys.map(key => prepared[key]);
  if (segments.some(segment => !Array.isArray(segment) || segment.length < 2)) {
    console.error("Linka do Plas není připravena: chybí skutečný železniční úsek.");
    return [];
  }
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };
  const joined = segments[0].map(point => [point[0], point[1]]);
  const gap = distanceMeters(joined[joined.length - 1], segments[1][0]);
  if (gap > 250) {
    console.error("Linka do Plas zastavena: mezi OSM úseky je mezera.", { gapMeters: Math.round(gap) });
    return [];
  }
  joined.push(...segments[1].map(point => [point[0], point[1]]));
  console.info("Linka Plzeň–Plasy spojena ze dvou OSM úseků:", joined.length, "bodů.");
  return joined;
}

function buildJoinedPlzenRoute(keys, label, maxGapMeters = 250) {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const segments = keys.map(key => prepared[key]);
  if (segments.some(segment => !Array.isArray(segment) || segment.length < 2)) {
    console.error(label + ": chybí některý připravený skutečný železniční úsek.");
    return [];
  }
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };
  const joined = segments[0].map(point => [point[0], point[1]]);
  for (let i = 1; i < segments.length; i++) {
    const previous = joined[joined.length - 1];
    const nextStart = segments[i][0];
    const gap = distanceMeters(previous, nextStart);
    if (gap > maxGapMeters) {
      console.error(label + ": segmenty na sebe nenavazují.", {
        from: keys[i - 1], to: keys[i], gapMeters: Math.round(gap)
      });
      return [];
    }
    joined.push(...segments[i].map(point => [point[0], point[1]]));
  }
  console.info(label + " spojena z " + segments.length + " OSM úseků:", joined.length, "bodů.");
  return joined;
}

// R25 GWTR: souvislá skutečná trasa Plzeň–Plasy–Žatec–Chomutov–Most.
function buildPlzenR25Route() {
  return buildJoinedPlzenRoute(
    [
      "plzen:tremosna",
      "tremosna:plasy",
      "plasy:blatno",
      "blatno:podborany",
      "podborany:zatec",
      "zatec:chomutov",
      "chomutov:jirkov_zastavka",
      "jirkov_zastavka:most"
    ],
    "Linka R25 GWTR Plzeň–Plasy–Žatec–Chomutov–Most",
    300
  );
}

// Expres Plzeň–Karlovy Vary přes Pňovany, Mariánské Lázně a Cheb.
// Rychlík Praha–Cheb: pražská trať přes Beroun a Rokycany,
 // pokračování z Plzně přes Pňovany, Mariánské Lázně a Cheb.
function buildPrahaChebRoute() {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const parts = [
    { key: "dobrichovice:praha", reverse: true },
    { key: "beroun:dobrichovice", reverse: true },
    { key: "horovice:beroun", reverse: true },
    { key: "rokycany:horovice", reverse: true },
    { key: "plzen:rokycany", reverse: true },
    { key: "plzen:pnovany", reverse: false },
    { key: "pnovany:svojsin", reverse: false },
    { key: "svojsin:plana", reverse: false },
    { key: "plana:marianske_lazne", reverse: false },
    { key: "marianske_lazne:cheb", reverse: false }
  ];
  const segments = parts.map(part => {
    const points = prepared[part.key];
    if (!Array.isArray(points) || points.length < 2) return null;
    const copy = points.map(point => [point[0], point[1]]);
    return part.reverse ? copy.reverse() : copy;
  });
  if (segments.some(segment => !segment)) {
    console.error("Rychlík Praha–Cheb: chybí připravený OSM úsek.");
    return [];
  }
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };
  const joined = segments[0].map(point => [point[0], point[1]]);
  for (let i = 1; i < segments.length; i++) {
    const gap = distanceMeters(joined[joined.length - 1], segments[i][0]);
    if (gap > 350) {
      console.error("Rychlík Praha–Cheb: úseky nenavazují.", {
        from: parts[i - 1].key, to: parts[i].key, gapMeters: Math.round(gap)
      });
      return [];
    }
    joined.push(...segments[i].map(point => [point[0], point[1]]));
  }
  console.info("Rychlík Praha–Cheb spojen z 10 OSM úseků:", joined.length, "bodů.");
  return joined;
}

function buildPlzenKarlovyVaryRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:pnovany",
      "pnovany:svojsin",
      "svojsin:plana",
      "plana:marianske_lazne",
      "marianske_lazne:cheb",
      "cheb:sokolov",
      "sokolov:karlovy_vary"
    ],
    "Expres Plzeň–Pňovany–Mariánské Lázně–Cheb–Karlovy Vary",
    350
  );
}

// SC Pendolino: Cheb–Plzeň–Praha–Pardubice–Olomouc–Ostrava.
// Používá hlavní trať přes Stříbro, nikoli odbočku přes Pňovany.
function buildPendolinoChebOstravaRoute() {
  const parts = [
    { key: "marianske_lazne:cheb", reverse: true },
    { key: "plana:marianske_lazne", reverse: true },
    { key: "stribro:plana", reverse: true },
    { key: "plzen:stribro", reverse: true },
    { key: "plzen:rokycany", reverse: false },
    { key: "rokycany:horovice", reverse: false },
    { key: "horovice:beroun", reverse: false },
    { key: "beroun:dobrichovice", reverse: false },
    { key: "dobrichovice:praha", reverse: false },
    { key: "praha:pardubice", reverse: false },
    { key: "pardubice:olomouc", reverse: false },
    { key: "olomouc:ostrava", reverse: false }
  ];
  return buildJoinedDirectedRoute(parts, "SC Pendolino Cheb–Ostrava", 500);
}

// Bavorský expres: Plzeň–Domažlice–Furth im Wald–Cham–Schwandorf–Regensburg–Landshut–Freising–München.
function buildBavarianExpressRoute() {
  const parts = [
    { key: "plzen:nyrany", reverse: false },
    { key: "nyrany:stankov", reverse: false },
    { key: "stankov:domazlice", reverse: false },
    { key: "domazlice:furth_im_wald", reverse: false },
    { key: "furth_im_wald:cham", reverse: false },
    { key: "cham:schwandorf", reverse: false },
    { key: "schwandorf:regensburg", reverse: false },
    { key: "regensburg:landshut", reverse: false },
    { key: "landshut:freising", reverse: false },
    { key: "freising:muenchen", reverse: false }
  ];
  return buildJoinedDirectedRoute(parts, "Bavorský expres Plzeň–München", 700);
}

// Spojuje připravené OSM úseky ve správném směru a odmítá nepropojené trasy.
function buildJoinedDirectedRoute(parts, label, maxGapMeters = 350) {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const segments = parts.map(part => {
    const points = prepared[part.key];
    if (!Array.isArray(points) || points.length < 2) return null;
    const copy = points.map(point => [point[0], point[1]]);
    return part.reverse ? copy.reverse() : copy;
  });
  if (segments.some(segment => !segment)) {
    console.error(label + ": chybí připravený OSM úsek.");
    return [];
  }
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };
  const joined = segments[0].map(point => [point[0], point[1]]);
  for (let i = 1; i < segments.length; i++) {
    const gap = distanceMeters(joined[joined.length - 1], segments[i][0]);
    if (gap > maxGapMeters) {
      console.error(label + ": OSM úseky nenavazují.", { from: parts[i - 1].key, to: parts[i].key, gapMeters: Math.round(gap) });
      return [];
    }
    joined.push(...segments[i].map(point => [point[0], point[1]]));
  }
  console.info(label + " spojena z " + segments.length + " OSM úseků:", joined.length, "bodů.");
  return joined;
}

function buildPlzenDomazliceRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:nyrany", "nyrany:stankov", "stankov:domazlice"],
    "Trasa Plzeň–Domažlice"
  );
}

function buildPlzenRadniceRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:kysice", "kysice:stupno", "stupno:radnice"],
    "Trasa Plzeň–Kyšice–Stupno–Radnice"
  );
}

function buildPlzenBezdruziceRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:pnovany", "pnovany:bezdruzice"],
    "Trasa Plzeň–Pňovany–Bezdružice"
  );
}

function buildPresticeZeleznaRudaRoute() {
  return buildJoinedPlzenRoute(
    ["prestice:klatovy", "klatovy:nyrsko", "nyrsko:alzbietin"],
    "Trasa Přeštice–Klatovy–Nýrsko–Železná Ruda-Alžbětín"
  );
}

function buildPlzenSumavaRoute() {
  return buildJoinedPlzenRoute(
    ["prestice:klatovy", "klatovy:nyrsko", "nyrsko:alzbietin"],
    "Trasa Přeštice–Klatovy–Nýrsko–Železná Ruda-Alžbětín"
  );
}

// Rychlík Praha–Plzeň–Klatovy–Železná Ruda používá pražskou větev
// a souvislou šumavskou větev od Plzně přes Přeštice.
function buildPlzenZeleznaRudaRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:prestice", "prestice:klatovy", "klatovy:nyrsko", "nyrsko:alzbietin"],
    "Trasa Plzeň–Přeštice–Klatovy–Nýrsko–Železná Ruda-Alžbětín"
  );
}

function buildPlzenKlatovyRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:prestice", "prestice:klatovy"],
    "Trasa Plzeň–Přeštice–Klatovy"
  );
}

function buildPlzenHorazdovicePredmRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:nezvestice", "nezvestice:nepomuk", "nepomuk:horazdovice_predm"],
    "Trasa Plzeň–Nezvěstice–Nepomuk–Horažďovice předměstí"
  );
}

function buildPlzenCeskeBudejoviceRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:nezvestice",
      "nezvestice:nepomuk",
      "nepomuk:horazdovice_predm",
      "horazdovice_predm:strakonice",
      "strakonice:protivin",
      "protivin:divcice",
      "divcice:ceske_budejovice"
    ],
    "Trasa Plzeň–České Budějovice"
  );
}

function buildPlzenPrahaRoute() {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const keys = [
    "plzen:rokycany",
    "rokycany:horovice",
    "horovice:beroun",
    "beroun:dobrichovice",
    "dobrichovice:praha"
  ];
  const segments = keys.map(key => prepared[key]);
  if (segments.some(segment => !Array.isArray(segment) || segment.length < 2)) {
    console.error("Pražská linka není připravena: chybí některý skutečný železniční úsek.");
    return [];
  }
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };
  const joined = segments[0].map(point => [point[0], point[1]]);
  for (let i = 1; i < segments.length; i++) {
    const previous = joined[joined.length - 1];
    const nextStart = segments[i][0];
    const gap = distanceMeters(previous, nextStart);
    if (gap > 250) {
      console.error("Pražská linka zastavena: mezera mezi OSM segmenty je příliš velká.", {
        from: keys[i - 1], to: keys[i], gapMeters: Math.round(gap)
      });
      return [];
    }
    joined.push(...segments[i].map(point => [point[0], point[1]]));
  }
  console.info("Pražská linka spojena z pěti OSM úseků:", joined.length, "bodů.");
  return joined;
}

// Inicializace globálního registru stanic, pokud neexistuje
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

window.STATIONS_REGISTRY["plzen"] = {
  name: "Plzeň hl.n.",
  flag: "🇨🇿",
  currency: "Kč",
  unlockCost: 0,
  requiredParentLevel: 0,
  mapCenter: [49.7410, 13.3860],
  mapZoom: 11,

  // Začátek: jedno bezplatné nástupiště a dva bezplatné místní výkony.
  startingTracks: 1,
  startingCleaningTeams: 1,
  trackPurchaseCosts: [0, 5000, 12000, 22000, 35000],
  startingTrains: [1, 2],

  routes: {
    rokycany: window.STATION_PREPARED_ROUTES["plzen:rokycany"],
    prestice: window.STATION_PREPARED_ROUTES["plzen:prestice"],
    plasy: buildPlzenPlasyRoute(),
    r25: buildPlzenR25Route(),
    karlovyVary: buildPlzenKarlovyVaryRoute(),
    prahaCheb: buildPrahaChebRoute(),
    pendolinoChebOstrava: buildPendolinoChebOstravaRoute(),
    bavarianExpress: buildBavarianExpressRoute(),
    praha: buildPlzenPrahaRoute(),
    domazlice: buildPlzenDomazliceRoute(),
    klatovy: buildPlzenKlatovyRoute(),
    horazdovicePredm: buildPlzenHorazdovicePredmRoute(),
    ceskeBudejovice: buildPlzenCeskeBudejoviceRoute(),
    zeleznaRuda: buildPlzenZeleznaRudaRoute(),
    radnice: buildPlzenRadniceRoute(),
    bezdruzice: buildPlzenBezdruziceRoute(),
    sumava: buildPlzenSumavaRoute()
  },

  // Level odemyká kategorie a možnosti. Konkrétní výkony se kupují v obchodě.
  // xpNeeded je počet XP potřebný k postupu z aktuálního levelu na další.
  levels: {
    0: { xpNeeded: 2, rewardText: "První krok v rozvoji nádraží.", action: () => {} },
    1: { xpNeeded: 5, rewardText: "Získáváš linku Plzeň–Plasy s vlakem Arriva Stadler.", action: () => {} },
    2: { xpNeeded: 10, unlocksTrack: 2, rewardText: "Automaticky odemčena druhá kolej.", action: () => {} },
    3: { xpNeeded: 15, rewardText: "Pokračuj v rozšiřování provozu a kapacity nádraží.", action: () => {} },
    4: { xpNeeded: 20, rewardText: "Odemčeny další investiční možnosti.", action: () => {} },
    5: { xpNeeded: 25, rewardText: "Odemčeny další možnosti rozvoje nádraží.", action: () => {} },
    6: { xpNeeded: 30, rewardText: "Odemčena kategorie rychlíků! Sleduj obchod a kup si konkrétní výkon.", action: () => {} },
    7: { xpNeeded: 35, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    8: { xpNeeded: 40, rewardText: "Další rozvoj nádraží.", action: () => {} },
    9: { xpNeeded: 45, rewardText: "Odemčeny nové možnosti pro rozšířený provoz.", action: () => {} },
    10: { xpNeeded: 50, rewardText: "Odemčeny další regionální a dálkové možnosti.", action: () => {} },
    11: { xpNeeded: 55, rewardText: "Odemčena kategorie expresních výkonů.", action: () => {} },
    12: { xpNeeded: 60, rewardText: "Rozvíjej služby a kapacitu nádraží.", action: () => {} },
    13: { xpNeeded: 65, rewardText: "Odemčeny další možnosti dálkové dopravy.", action: () => {} },
    14: { xpNeeded: 70, rewardText: "Odemčena kategorie mezinárodních výkonů.", action: () => {} },
    15: { xpNeeded: 75, rewardText: "Další krok v rozvoji plzeňského nádraží.", action: () => {} }
  },

  // Každá položka je konkrétní výkon: trasa + dopravce + typ soupravy.
  // Odměna je pevná částka za dokončenou otočku (tam i zpět), nikoli za odjezd.
  trainsPool: {
    1: {
      name: "ČD 810 → Rokycany",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Rokycany",
      purchaseCost: 0,
      requiredLevel: 0,
      image: "https://i.imgur.com/FApj7Eq.jpg",
      routeKey: "rokycany",
      speed: 180,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1200,
      rewardXP: 1
    },
    2: {
      name: "ČD 810 → Přeštice",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Přeštice",
      purchaseCost: 0,
      requiredLevel: 0,
      image: "https://i.imgur.com/neFFZgt.jpg",
      routeKey: "prestice",
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1500,
      rewardXP: 1
    },
    3: {
      name: "ČD rychlík · Brejlovec + 3 vozy → Praha",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Praha",
      purchaseCost: 18000,
      requiredLevel: 7,
      image: "https://i.imgur.com/tw5kV39.jpg",
      routeKey: "praha",
      speed: 120,
      stayTime: 15,
      initialContract: 3,
      timers: { exit: 8, clean: 12, board: 8 },
      rewardMoney: 6000,
      rewardXP: 3
    },
    4: {
      name: "ČD RegioFox → Praha",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Praha",
      purchaseCost: 26000,
      requiredLevel: 7,
      image: "https://i.imgur.com/tw5kV39.jpg",
      routeKey: "praha",
      speed: 150,
      stayTime: 15,
      initialContract: 3,
      timers: { exit: 8, clean: 12, board: 8 },
      rewardMoney: 7800,
      rewardXP: 3
    },
    5: {
      name: "Arriva · dálkový výkon → Praha",
      operator: "Arriva",
      category: "rapid",
      routeLabel: "Plzeň–Praha",
      purchaseCost: 23000,
      requiredLevel: 7,
      image: "https://i.imgur.com/neFFZgt.jpg",
      routeKey: "praha",
      speed: 130,
      stayTime: 15,
      initialContract: 3,
      timers: { exit: 8, clean: 12, board: 8 },
      rewardMoney: 6800,
      rewardXP: 3
    },
    8: {
      name: "ČD 810 · Plzeň–Kyšice–Stupno–Radnice",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Kyšice–Stupno–Radnice",
      boardDestination: "Radnice",
      lineCode: "L176",
      purchaseCost: 1000,
      requiredLevel: 0,
      image: "assets/trains/cd/810_2.png",
      routeKey: "radnice",
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1800,
      rewardXP: 1
    },
    9: {
      name: "ČD RegioPanter · Plzeň–Domažlice",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Domažlice",
      boardDestination: "Domažlice",
      lineCode: "Os Plzeň–Domažlice",
      purchaseCost: 1000,
      requiredLevel: 0,
      image: "assets/trains/cd/Regipanter_Plzen.png",
      routeKey: "domazlice",
      routeSequence: ["domazlice"],
      speed: 100,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 2200,
      rewardXP: 1
    },
    10: {
      name: "ČD RegioShark · Plzeň–Pňovany–Bezdružice",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Pňovany–Bezdružice",
      boardDestination: "Bezdružice",
      lineCode: "Os Plzeň–Bezdružice",
      purchaseCost: 1000,
      requiredLevel: 0,
      image: "assets/trains/cd/RegioShark_Najbrt1.png",
      routeKey: "bezdruzice",
      routeSequence: ["bezdruzice"],
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 2400,
      rewardXP: 1
    },
    12: {
      name: "ČD rychlík · Praha–Plzeň–Klatovy–Železná Ruda-Alžbětín",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Praha–Plzeň–Klatovy–Železná Ruda-Alžbětín",
      boardDestination: "Železná Ruda-Alžbětín",
      cateringRequired: true,
      lineCode: "R16",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Rychlik_1.png",
      routeKey: "zeleznaRuda",
      routeSequence: ["zeleznaRuda", "praha"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 1000,
      rewardXP: 1
    },
    14: {
      name: "ČD osobní vlak · Plzeň–Nezvěstice–Nepomuk–Horažďovice předměstí",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Nezvěstice–Nepomuk–Horažďovice předměstí",
      boardDestination: "Horažďovice předměstí",
      lineCode: "Os Plzeň–Horažďovice předměstí",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Regpa1.png",
      routeKey: "horazdovicePredm",
      routeSequence: ["horazdovicePredm"],
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1800,
      rewardXP: 1
    },
    13: {
      name: "ČD osobní vlak · Plzeň–Přeštice–Klatovy",
      operator: "České dráhy",
      category: "local",
      routeLabel: "Plzeň–Přeštice–Klatovy",
      boardDestination: "Klatovy",
      lineCode: "Os Plzeň–Klatovy",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Regpa1.png",
      routeKey: "klatovy",
      routeSequence: ["klatovy"],
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1200,
      rewardXP: 1
    },
    7: {
      name: "ČD rychlík · Praha–Plzeň–Domažlice",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Praha–Plzeň–Domažlice",
      boardDestination: "Domažlice",
      cateringRequired: true,
      lineCode: "R10",
      purchaseCost: 1000,
      requiredLevel: 0,
      image: "https://i.imgur.com/tw5kV39.jpg",
      routeKey: "domazlice",
      routeSequence: ["domazlice", "praha"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 1000,
      rewardXP: 1
    },
    6: {
      name: "Arriva · Stadler → Plasy",
      operator: "Arriva",
      category: "local",
      routeLabel: "Plzeň–Třemošná–Plasy",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "https://i.imgur.com/950q8oA.jpg",
      routeKey: "plasy",
      speed: 90,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 2200,
      rewardXP: 1
    },
    15: {
      name: "ČD rychlík · Plzeň–České Budějovice",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–České Budějovice",
      boardDestination: "České Budějovice",
      cateringRequired: true,
      lineCode: "R Plzeň–České Budějovice",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Rychlik_1.png",
      routeKey: "ceskeBudejovice",
      routeSequence: ["ceskeBudejovice"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 2500,
      rewardXP: 1
    },
    18: {
      name: "ČD rychlík · Praha–Cheb",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Praha–Beroun–Hořovice–Rokycany–Plzeň–Pňovany–Mariánské Lázně–Cheb",
      boardDestination: "Cheb",
      cateringRequired: true,
      lineCode: "R Praha–Cheb",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/VectronCD1.png",
      routeKey: "prahaCheb",
      routeSequence: ["prahaCheb"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 3500,
      rewardXP: 2
    },
    19: {
      name: "ČD SC Pendolino · Cheb–Ostrava",
      operator: "České dráhy",
      category: "express",
      routeLabel: "Cheb–Mariánské Lázně–Stříbro–Plzeň–Praha–Pardubice–Olomouc–Ostrava",
      boardDestination: "Ostrava hl.n.",
      cateringRequired: true,
      lineCode: "SC Cheb–Ostrava",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Rychlik_1.png",
      routeKey: "pendolinoChebOstrava",
      routeSequence: ["pendolinoChebOstrava"],
      speed: 160,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 5500,
      rewardXP: 3
    },
    20: {
      name: "ČD / alex · Bavorský expres Plzeň–München",
      operator: "České dráhy / alex",
      category: "express",
      routeLabel: "Plzeň–Domažlice–Furth im Wald–Cham–Schwandorf–Regensburg–Landshut–Freising–München",
      boardDestination: "München Hbf",
      cateringRequired: true,
      lineCode: "Ex Plzeň–München",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/VectronCD1.png",
      routeKey: "bavarianExpress",
      routeSequence: ["bavarianExpress"],
      speed: 160,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 6000,
      rewardXP: 3
    },
    17: {
      name: "ČD expres · Plzeň–Pňovany–Mariánské Lázně–Cheb–Karlovy Vary",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Pňovany–Mariánské Lázně–Cheb–Karlovy Vary",
      boardDestination: "Cheb",
      cateringRequired: true,
      lineCode: "Ex Plzeň–Karlovy Vary",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Regpa2.png",
      routeKey: "karlovyVary",
      routeSequence: ["karlovyVary"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 3200,
      rewardXP: 2
    },
    16: {
      name: "GW Train Regio · R25 Plzeň–Most",
      operator: "GW Train Regio",
      category: "rapid",
      routeLabel: "Plzeň–Plasy–Žatec–Chomutov–Most",
      boardDestination: "Most",
      lineCode: "R25",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/other/R25GW.png",
      routeKey: "r25",
      speed: 100,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 3000,
      rewardXP: 2
    },
  }
};

// Celá pražská linka je sestavena z předpřipravených OSM segmentů.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.praha.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:praha");
}

 
// Trasa Plzeň–Plasy je dostupná až po ověření spojení obou reálných OSM segmentů.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.plasy.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:plasy");
}


// R25 se zveřejní jen tehdy, když všech osm skutečných OSM úseků navazuje.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.prahaCheb.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:prahaCheb");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.pendolinoChebOstrava.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:pendolinoChebOstrava");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.bavarianExpress.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:bavarianExpress");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.karlovyVary.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:karlovyVary");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.r25.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:r25");
}

// Zveřejni pouze trasy, jejichž OSM segmenty existují a navazují.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.domazlice.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:domazlice");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.klatovy.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:klatovy");
}

// Horažďovice předměstí je složené ze tří předpřipravených OSM segmentů.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.horazdovicePredm.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:horazdovicePredm");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.ceskeBudejovice.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:ceskeBudejovice");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.zeleznaRuda.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:zeleznaRuda");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.radnice.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:radnice");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.bezdruzice.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:bezdruzice");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.sumava.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:sumava");
}
