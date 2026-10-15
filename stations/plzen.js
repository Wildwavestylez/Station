// Spojí pouze ověřené OSM segmenty do souvislé linky Plzeň → Praha.
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

  // Začátek: jedno bezplatné nástupiště a jeden bezplatný výkon.
  startingTracks: 1,
  startingCleaningTeams: 1,
  trackPurchaseCosts: [0, 5000, 12000, 22000, 35000],
  startingTrains: [1],

  routes: {
    rokycany: window.STATION_PREPARED_ROUTES["plzen:rokycany"],
    prestice: window.STATION_PREPARED_ROUTES["plzen:prestice"],
    praha: buildPlzenPrahaRoute()
  },

  // Level odemyká kategorie a možnosti. Konkrétní výkony se kupují v obchodě.
  // xpNeeded je počet XP potřebný k postupu z aktuálního levelu na další.
  levels: {
    0: { xpNeeded: 2, rewardText: "Získáváš zkušenosti za provoz vlaků.", action: () => {} },
    1: { xpNeeded: 4, rewardText: "Odemčeny další možnosti rozvoje nádraží.", action: () => {} },
    2: { xpNeeded: 6, rewardText: "Odemčeny další regionální výkony v obchodě.", action: () => {} },
    3: { xpNeeded: 8, rewardText: "Pokračuj v rozšiřování provozu a kapacity nádraží.", action: () => {} },
    4: { xpNeeded: 10, rewardText: "Odemčeny další investiční možnosti.", action: () => {} },
    5: { xpNeeded: 12, rewardText: "Připrav se na rozšíření služeb nádraží.", action: () => {} },
    6: { xpNeeded: 14, rewardText: "Odemčena kategorie rychlíků! Sleduj obchod a kup si konkrétní výkon.", action: () => {} },
    7: { xpNeeded: 16, rewardText: "Další možnosti rozvoje nádraží.", action: () => {} },
    8: { xpNeeded: 18, rewardText: "Další rozvoj nádraží.", action: () => {} },
    9: { xpNeeded: 20, rewardText: "Odemčeny nové možnosti pro rozšířený provoz.", action: () => {} },
    10: { xpNeeded: 22, rewardText: "Odemčeny další regionální a dálkové možnosti.", action: () => {} },
    11: { xpNeeded: 24, rewardText: "Odemčena kategorie expresních výkonů.", action: () => {} },
    12: { xpNeeded: 26, rewardText: "Rozvíjej služby a kapacitu pro náročnější provoz.", action: () => {} },
    13: { xpNeeded: 28, rewardText: "Odemčeny další možnosti dálkové dopravy.", action: () => {} },
    14: { xpNeeded: 30, rewardText: "Odemčena kategorie mezinárodních výkonů.", action: () => {} },
    15: { xpNeeded: 32, rewardText: "Další krok v rozvoji plzeňského nádraží.", action: () => {} }
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
      purchaseCost: 4500,
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
    }
  }
};

// Celá pražská linka je sestavena z předpřipravených OSM segmentů.
if (window.STATION_BUNDLED_ROUTE_KEYS && window.STATIONS_REGISTRY.plzen.routes.praha.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("plzen:praha");
}
