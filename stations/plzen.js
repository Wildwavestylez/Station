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
function buildPlzenChebRoute() {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const keys = [
    "plzen:pnovany",
    "pnovany:svojsin",
    "svojsin:plana",
    "plana:marianske_lazne",
    "marianske_lazne:cheb"
  ];
  const segments = keys.map(key => prepared[key]);
  if (segments.some(segment => !Array.isArray(segment) || segment.length < 2)) {
    console.error("Plzeň–Cheb: chybí připravený OSM úsek.");
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
      console.error("Plzeň–Cheb: OSM úseky nenavazují.", { from: keys[i - 1], to: keys[i], gapMeters: Math.round(gap) });
      return [];
    }
    joined.push(...segments[i].map(point => [point[0], point[1]]));
  }
  console.info("Plzeň–Cheb spojena z pěti OSM úseků:", joined.length, "bodů.");
  return joined;
}

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

function buildPlzenDomazliceRoute() {
  return buildJoinedPlzenRoute(
    ["plzen:nyrany", "nyrany:stankov", "stankov:domazlice"],
    "Trasa Plzeň–Domažlice"
  );
}


// Bavorský expres: jedna souvislá linka Praha–Plzeň–Domažlice–Regensburg–München Hbf.
// Použije pražskou větev v opačném směru a naváže na ni již připravené bavorské úseky.
// Původní vlak Praha–Domažlice ani jeho trasu neměníme.
function buildBavariaExpressRoute() {
  // Bavorský expres začíná v Plzni. Použije hotovou větev Plzeň -> Domažlice,
  // ale pražskou část rychlíku záměrně nepřebírá.
  const plzenToDomazlice = buildPlzenDomazliceRoute();
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const bavarianParts = [
    "domazlice:furth_im_wald",
    "furth_im_wald:cham",
    "cham:roding",
    "roding:schwandorf",
    "schwandorf:maxhuette_haidhof",
    "maxhuette_haidhof:regenstauf",
    "regenstauf:regensburg",
    "regensburg:neufahrn_ndb",
    "neufahrn_ndb:landshut",
    "landshut:moosburg",
    "moosburg:freising",
    "freising:neufahrn_b_freising",
    "neufahrn_b_freising:feldmoching",
    "feldmoching:moosach",
    "moosach:laim",
    "laim:muenchen"
  ];
  if (!Array.isArray(plzenToDomazlice) || plzenToDomazlice.length < 2) {
    console.error("Bavorský expres: chybí existující trasa Plzeň–Domažlice.");
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

  const joined = plzenToDomazlice.map(point => [point[0], point[1]]);
  const joinChecked = (base, segment, label, maxGap = 350) => {
    if (!Array.isArray(segment) || segment.length < 2) {
      console.error("Bavorský expres: chybí připravený úsek.", label);
      return false;
    }
    const forwardGap = distanceMeters(base[base.length - 1], segment[0]);
    const reverseGap = distanceMeters(base[base.length - 1], segment[segment.length - 1]);
    const oriented = reverseGap < forwardGap ? segment.slice().reverse() : segment.slice();
    const gap = Math.min(forwardGap, reverseGap);
    if (gap > maxGap) {
      console.error("Bavorský expres: navazující úseky nesedí.", {
        section: label, gapMeters: Math.round(gap)
      });
      return false;
    }
    base.push(...oriented.slice(1).map(point => [point[0], point[1]]));
    return true;
  };

  for (const key of bavarianParts) {
    if (!joinChecked(joined, prepared[key], key)) return [];
  }

  console.info("Bavorský expres: trasa Plzeň–Domažlice–München Hbf (bez pražské větve)", {
    nodes: joined.length, start: joined[0], end: joined[joined.length - 1]
  });
  return joined;
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

// Rychlík Plzeň–Brno: spojení 20 ověřených OSM úseků přes jižní Čechy a Vysočinu.
function buildPlzenBrnoRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:nezvestice",
      "nezvestice:nepomuk",
      "nepomuk:horazdovice_predm",
      "horazdovice_predm:strakonice",
      "strakonice:protivin",
      "protivin:divcice",
      "divcice:ceske_budejovice",
      "ceske_budejovice:veseli_nad_luznici",
      "veseli_nad_luznici:kardasova_recice",
      "kardasova_recice:jindrichuv_hradec",
      "jindrichuv_hradec:popelin",
      "popelin:horni_cerekev",
      "horni_cerekev:kostelec_u_jihlavy",
      "kostelec_u_jihlavy:jihlava",
      "jihlava:luka_nad_jihlavou",
      "luka_nad_jihlavou:okrisky",
      "okrisky:trebic",
      "trebic:studenec",
      "studenec:rosice_u_brna",
      "rosice_u_brna:brno_hlavni_nadrazi"
    ],
    "Rychlík Plzeň–Brno hlavní nádraží",
    300
  );
}


// SuperCity Pendolino: souvislý koridor Plzeň–Praha–Ostrava z ověřených OSM úseků.
// Každý mezilehlý úsek je zachován v pořadí hlavní trati, včetně Olomouce a Přerova.
function buildPendolinoOstravaRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:rokycany",
      "rokycany:horovice",
      "horovice:beroun",
      "beroun:dobrichovice",
      "dobrichovice:praha",
      "praha:uvaly",
      "uvaly:pecky",
      "pecky:kolin",
      "kolin:chvaletice",
      "chvaletice:prelouc",
      "prelouc:pardubice",
      "pardubice:moravany",
      "moravany:chocen",
      "chocen:usti_nad_orlici",
      "usti_nad_orlici:ceska_trebova",
      "ceska_trebova:krasikov",
      "krasikov:zabreh_na_morave",
      "zabreh_na_morave:mohelnice",
      "mohelnice:cervenka",
      "cervenka:olomouc",
      "olomouc:prerov",
      "prerov:lipnik",
      "lipnik:hranice_na_morave",
      "hranice_na_morave:suchdol_nad_odrou",
      "suchdol_nad_odrou:studenka",
      "studenka:ostrava"
    ],
    "SuperCity Pendolino Plzeň–Praha–Ostrava",
    350
  );
}

// Druhá větev oběhu: Plzeň–Pňovany–Svojšín–Planá–Mariánské Lázně–Cheb.
function buildPendolinoChebRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:pnovany",
      "pnovany:svojsin",
      "svojsin:plana",
      "plana:marianske_lazne",
      "marianske_lazne:cheb"
    ],
    "SuperCity Pendolino Plzeň–Cheb",
    350
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

// Railjet: rychlíkový oběh z Plzně na Františkovy Lázně a do Bohumína.
// Každý úsek je převzatý z ověřené geometrie OpenStreetMap.
function buildRailjetFrantiskovyRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:pnovany",
      "pnovany:svojsin",
      "svojsin:plana",
      "plana:marianske_lazne",
      "marianske_lazne:cheb",
      "cheb:frantiskovy_lazne"
    ],
    "Railjet Plzeň–Pňovany–Svojšín–Planá–Mariánské Lázně–Cheb–Františkovy Lázně",
    350
  );
}

function buildRailjetBohuminRoute() {
  return buildJoinedPlzenRoute(
    [
      "plzen:rokycany",
      "rokycany:horovice",
      "horovice:beroun",
      "beroun:dobrichovice",
      "dobrichovice:praha",
      "praha:uvaly",
      "uvaly:pecky",
      "pecky:kolin",
      "kolin:chvaletice",
      "chvaletice:prelouc",
      "prelouc:pardubice",
      "pardubice:moravany",
      "moravany:chocen",
      "chocen:usti_nad_orlici",
      "usti_nad_orlici:ceska_trebova",
      "ceska_trebova:krasikov",
      "krasikov:zabreh_na_morave",
      "zabreh_na_morave:mohelnice",
      "mohelnice:cervenka",
      "cervenka:olomouc",
      "olomouc:prerov",
      "prerov:lipnik",
      "lipnik:hranice_na_morave",
      "hranice_na_morave:suchdol_nad_odrou",
      "suchdol_nad_odrou:studenka",
      "studenka:ostrava",
      "ostrava:bohumin"
    ],
    "Railjet Plzeň–Praha–Kolín–Pardubice–Česká Třebová–Zábřeh na Moravě–Olomouc–Přerov–Ostrava–Bohumín",
    350
  );
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
  trackPurchaseLevel: 4,
  cleaningTeamShopLevel: 6,
  cleaningTeamFreeLevel: 6,
  cateringTeamFreeLevel: 11,
  startingCleaningTeams: 1,
  trackPurchaseCosts: [0, 5000, 12000, 22000, 35000],
  startingTrains: [1, 2],

  routes: {
    pendolinoOstrava: buildPendolinoOstravaRoute(),
    pendolinoCheb: buildPendolinoChebRoute(),
    railjetFrantiskovy: buildRailjetFrantiskovyRoute(),
    railjetBohumin: buildRailjetBohuminRoute(),
    rokycany: window.STATION_PREPARED_ROUTES["plzen:rokycany"],
    prestice: window.STATION_PREPARED_ROUTES["plzen:prestice"],
    plasy: buildPlzenPlasyRoute(),
    r25: buildPlzenR25Route(),
    karlovyVary: buildPlzenKarlovyVaryRoute(),
    cheb: buildPlzenChebRoute(),
    prahaCheb: buildPrahaChebRoute(),
    praha: buildPlzenPrahaRoute(),
    domazlice: buildPlzenDomazliceRoute(),
    bavariaExpress: buildBavariaExpressRoute(),
    klatovy: buildPlzenKlatovyRoute(),
    horazdovicePredm: buildPlzenHorazdovicePredmRoute(),
    ceskeBudejovice: buildPlzenCeskeBudejoviceRoute(),
    brno: buildPlzenBrnoRoute(),
    zeleznaRuda: buildPlzenZeleznaRudaRoute(),
    radnice: buildPlzenRadniceRoute(),
    bezdruzice: buildPlzenBezdruziceRoute(),
    sumava: buildPlzenSumavaRoute()
  },

  // Level odemyká kategorie a možnosti. Konkrétní výkony se kupují v obchodě.
  // Každý level má vlastní požadavek XP; přebytek po level-upu se převádí dál.
  levels: {
    0: { xpNeeded: 1, rewardText: "Začínáš rozvoj nádraží.", action: () => {} },
    1: { xpNeeded: 5, rewardText: "Získáváš linku Plzeň–Plasy s vlakem Arriva Stadler.", action: () => {} },
    2: { xpNeeded: 10, rewardText: "Odemčena kategorie osobních vlaků v obchodě. Odteď můžeš nakupovat železniční výkony ve shopu.", action: () => {} },
    3: { xpNeeded: 20, unlocksTrack: 2, rewardText: "Odemčena druhá kolej.", action: () => {} },
    4: { xpNeeded: 35, rewardText: "V obchodě se odemyká možnost nakupovat další koleje a hrany nástupišť.", action: () => {} },
    5: { xpNeeded: 50, rewardText: "Státní/městská rozvojová dotace: získáváš 20 000 Kč.", action: () => { globalMoney += 20000; } },
    6: { xpNeeded: 70, unlocksCleaningTeams: 2, rewardText: "Druhá úklidová četa zdarma. V obchodě se odemyká najímání dalších úklidových čet.", action: () => {} },
    7: { xpNeeded: 90, rewardText: "Odemčen rychlík Praha–Plzeň. Konkrétní vlak přiřadíme později.", action: () => {} },
    8: { xpNeeded: 25, rewardText: "Odemčena kategorie rychlíků se začátkem v Plzni v obchodě.", action: () => {} },
    9: { xpNeeded: 30, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    10: { xpNeeded: 35, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    11: { xpNeeded: 40, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    12: { xpNeeded: 45, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    13: { xpNeeded: 50, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    14: { xpNeeded: 55, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} }
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
      name: "ČD rychlík · Plzeň–Cheb / Praha",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Pňovany–Svojšín–Planá–Mariánské Lázně–Cheb; následně Plzeň–Praha",
      boardDestination: "Cheb",
      cateringRequired: true,
      lineCode: "R Plzeň–Cheb / Praha",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/VectronCD1.png",
      routeKey: "cheb",
      routeSequence: ["cheb", "praha"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 3500,
      rewardXP: 2
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
    19: {
      name: "ČD Bavorský expres · Plzeň–Domažlice–Regensburg–München Hbf / Praha",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Domažlice–Furth im Wald–Cham–Schwandorf–Regensburg–Landshut–Freising–München Hbf; po návratu pokračuje do Prahy",
      boardDestination: "München Hbf",
      cateringRequired: true,
      lineCode: "R Bavorský expres",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/VectronCD1.png",
      routeKey: "bavariaExpress",
      routeSequence: ["bavariaExpress", "praha"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 4500,
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
    20: {
      name: "ČD rychlík · Brejlovec · Plzeň–Brno hlavní nádraží",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Nezvěstice–Nepomuk–Horažďovice předměstí–Strakonice–Protivín–Divčice–České Budějovice–Veselí nad Lužnicí–Kardašova Řečice–Jindřichův Hradec–Popelín–Horní Cerekev–Kostelec u Jihlavy–Jihlava–Luka nad Jihlavou–Okříšky–Třebíč–Studenec–Rosice u Brna–Brno hlavní nádraží",
      boardDestination: "Brno hlavní nádraží",
      lineCode: "R Plzeň–Brno",
      cateringRequired: true,
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/brejlovec1.png",
      routeKey: "brno",
      routeSequence: ["brno"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 5000,
      rewardXP: 2
    },
    21: {
      name: "ČD SuperCity Pendolino · Plzeň–Ostrava / Cheb",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Praha–Ostrava; po návratu Plzeň–Pňovany–Mariánské Lázně–Cheb",
      boardDestination: "Ostrava hl.n.",
      cateringRequired: true,
      lineCode: "SC",
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/Pendolino.png",
      routeKey: "pendolinoOstrava",
      routeSequence: ["pendolinoOstrava", "pendolinoCheb"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 5000,
      rewardXP: 2
    },
    22: {
      name: "ČD Railjet · Plzeň–Františkovy Lázně / Bohumín",
      operator: "České dráhy",
      category: "rapid",
      routeLabel: "Plzeň–Rokycany–Beroun–Praha–Kolín–Pardubice–Česká Třebová–Zábřeh na Moravě–Olomouc–Přerov–Ostrava–Bohumín; po návratu Plzeň–Pňovany–Mariánské Lázně–Cheb–Františkovy Lázně",
      boardDestination: "Františkovy Lázně",
      lineCode: "R Railjet",
      cateringRequired: true,
      purchaseCost: 0,
      requiredLevel: 1,
      image: "assets/trains/cd/VectronRJ.png",
      routeKey: "railjetFrantiskovy",
      routeSequence: ["railjetFrantiskovy", "railjetBohumin"],
      speed: 120,
      stayTime: 15,
      initialContract: 1,
      timers: { exit: 5, clean: 8, catering: 10, board: 5 },
      rewardMoney: 5500,
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
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.cheb.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:cheb");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.prahaCheb.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:prahaCheb");
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

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.bavariaExpress.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:bavariaExpress");
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

if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.brno.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:brno");
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

// Railjet se zveřejní pouze při dostupné geometrii obou kompletních tras.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.railjetFrantiskovy.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:railjetFrantiskovy");
}
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.railjetBohumin.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:railjetBohumin");
}

// Publish the two Pendolino routes only when all underlying OSM sections joined successfully.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.pendolinoOstrava.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:pendolinoOstrava");
}
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.pendolinoCheb.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:pendolinoCheb");
}
