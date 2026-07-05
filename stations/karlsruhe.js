// Inicializace globálního registru stanic, pokud neexistuje
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

// Uložení Karlsruhe do registru pod klíčem "karlsruhe"
window.STATIONS_REGISTRY["karlsruhe"] = {
  name: "Karlsruhe Hbf",
  flag: "🇩🇪",
  currency: "EUR",
  unlockCost: 50000,          // Stojí 50 000 Kč v globální kase
  requiredParentLevel: 3,     // Hráč musí mít v Plzni aspoň Level 3, aby mohl koupit
  mapCenter: [48.9935, 8.4022],
  mapZoom: 12,
  startingTracks: 1,
  moneyPerDepart: 3500,       // Vyšší odměna pro pokročilejší nádraží
  startingTrains:,       // Začíná s vlakem ID 101

  // 🛤️ Trasy vedoucí z Karlsruhe
  routes: {
    ettlingen: [
      [48.9935, 8.4022],
      [48.9710, 8.4044],
      [48.9400, 8.4070]
    ]
  },

  // 🏆 Kampaň a levely pro Karlsruhe
  levels: {
    0: { 
      xpNeeded: 4, 
      rewardText: "Získáváš federální dotaci 20 000 Kč do globální kasy!", 
      action: () => { globalMoney += 20000; } 
    }
  },

  // 🚂 Pool drah pro Karlsruhe (Zatím s naší 810 jako šablonou, než dodáš DB vlaky)
  trainsPool: {
    101: {
      name: "AVG S1 → Ettlingen",
      image: "https://imgur.com", 
      routeKey: "ettlingen",
      speed: 180,
      stayTime: 8,
      initialContract: 2,
      timers: { exit: 6, clean: 10, board: 6 },
      rewardMoney: 1800,
      rewardXP: 1
    }
  }
};
