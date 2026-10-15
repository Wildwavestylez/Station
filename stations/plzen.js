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
    if (gap > 75) {
      console.error("Pražská linka zastavena: mezera mezi OSM segmenty je příliš velká.", {
        from: keys[i - 1], to: keys[i], gapMeters: Math.round(gap)
      });
      return [];
    }
    joined.push(...segments[i].slice(1).map(point => [point[0], point[1]]));
  }
  console.info("Pražská linka spojena z pěti OSM úseků:", joined.length, "bodů.");
  return joined;
}

// Inicializace globálního registru stanic, pokud neexistuje
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

// Uložení Plzně do registru pod klíčem "plzen"
window.STATIONS_REGISTRY["plzen"] = {
  name: "Plzeň hl.n.",
  flag: "🇨🇿",
  currency: "Kč",
  unlockCost: 0,
  requiredParentLevel: 0,
  mapCenter: [49.7410, 13.3860],
  mapZoom: 11,
  startingTracks: 1,
  moneyPerDepart: 2500,
  startingTrains: [1, 2],

  routes: {
    // Předpřipravené skutečné OSM trasy; načítají se z stations/preparedRoutes.js.
    rokycany: window.STATION_PREPARED_ROUTES["plzen:rokycany"],
    prestice: window.STATION_PREPARED_ROUTES["plzen:prestice"],
    praha: buildPlzenPrahaRoute()
  },

  levels: {
    0: { 
      xpNeeded: 2, 
      rewardText: "Získáváš zkušenosti za provoz vlaků.", 
      action: () => {}  
    },
    1: { 
      xpNeeded: 4, 
      rewardText: "Odemčen Rychlík do Prahy a dostáváš bonus 15 000 Kč!", 
      action: () => { globalMoney += 15000; addNewTrainFromPool(3); } 
    },
    2: { 
      xpNeeded: 6, 
      rewardText: "Správa železnic dostavěla 2. kolej! Můžeš odbavovat dva vlaky naráz.", 
      unlocksTrack: 2,
      action: () => {} 
    },
    3: { 
      xpNeeded: 12, 
      rewardText: "Kampaň Plzně dokončena! V menu si nyní můžeš odemknout německé Karlsruhe!", 
      action: () => {} 
    }
  },

  trainsPool: {
    1: {
      name: "810 → Rokycany",
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
      name: "810 → Přeštice",
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
      name: "Rychlík Praha",
      image: "https://i.imgur.com/tw5kV39.jpg",
      routeKey: "praha",
      speed: 120,
      stayTime: 15,
      initialContract: 3,
      timers: { exit: 8, clean: 12, board: 8 },
      rewardMoney: 6000,
      rewardXP: 3
    }
  }
};
