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
    praha: [
      [49.7414, 13.3866],
      [49.7420, 13.5950],
      [49.9630, 14.0720],
      [50.0830, 14.4350]
    ]
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
