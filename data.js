// ==========================================
// 📊 GLOBÁLNÍ DATA HRÁČE
// ==========================================
const GLOBAL_PLAYER_DATA = {
  unlockedStations: ["plzen"] // Na začátku hry má hráč odemčenou pouze Plzeň
};

// ==========================================
// 🗺️ REGISTR VŠECH NÁDRAŽÍ VE HRY (STATIONS REGISTRY)
// ==========================================
const STATIONS_REGISTRY = {
  
  // 🚉 NÁDRAŽÍ 1: PLZEŇ HLAVNÍ NÁDRAŽÍ
  plzen: {
    name: "Plzeň hl.n.",
    flag: "🇨🇿",
    currency: "Kč",
    unlockCost: 0,              // Plzeň je zdarma od startu
    requiredParentLevel: 0,     // Netřeba žádný předchozí level
    mapCenter: [49.7410, 13.3860],
    mapZoom: 11,
    startingTracks: 1,          // Start s 1 kolejí (další se odemknou levelem)
    moneyPerDepart: 2500,       // Kolik Kč dostaneš za odjezd vlaku
    startingTrains: [1],        // Hra začne pouze s vlakem ID 1 (810 Rokycany)

    // 🛤️ Trasy vedoucí specificky z Plzně
    routes: {
      rokycany: [
        [49.7414, 13.3866],
        [49.7540, 13.4350],
        [49.7470, 13.5150],
        [49.7420, 13.5950]
      ],
      prestice: [
        [49.7414, 13.3866],
        [49.6640, 13.3610],
        [49.5710, 13.3320]
      ],
      praha: [
        [49.7414, 13.3866],
        [49.7420, 13.5950],
        [49.9630, 14.0720],
        [50.0830, 14.4350]
      ]
    },

    // 🏆 Systém levelů nádraží a odměn (WoA kampaň pro Plzeň)
    levels: {
      0: { 
        xpNeeded: 2, 
        rewardText: "Odemčen nový vlak: 810 → Přeštice!", 
        action: () => { addNewTrainFromPool(2); } 
      },
      1: { 
        xpNeeded: 4, 
        rewardText: "Odemčen Rychlík do Prahy a dostáváš bonus 15 000 Kč!", 
        action: () => { globalMoney += 15000; addNewTrainFromPool(3); } 
      },
      2: { 
        xpNeeded: 6, 
        rewardText: "Správa železnic dostavěla 2. kolej! Můžeš odbavovat dva vlaky naráz.", 
        unlocksTrack: 2, // Zvýší počet kolejí na 2
        action: () => {} 
      },
      3: { 
        xpNeeded: 12, 
        rewardText: "Kampaň Plzně dokončena! V menu si nyní můžeš odemknout německé Karlsruhe!", 
        action: () => {} 
      }
    },

    // 🚂 Katalog všech vlaků, které lze na tomto nádraží získat
    trainsPool: {
      1: {
        name: "810 → Rokycany",
        image: "https://i.imgur.com/5upJC9h.jpg",
        routeKey: "rokycany",
        speed: 180,
        stayTime: 10,
        initialContract: 1, // Musí udělat 2 otočky pro splnění kontraktu
        timers: { exit: 5, clean: 8, board: 5 }
      },

rewardMoney: 1200,   // 💰 Menší lokálka vydělá míň peněz
    rewardXP: 1

      2: {
        name: "810 → Přeštice",
        image: "https://i.imgur.com/KuMw5ko.jpg",
        routeKey: "prestice",
        speed: 80,
        stayTime: 10,
        initialContract: 1,
        timers: { exit: 30, clean: 120, board: 35 },
rewardMoney: 1500,   // 💰 Menší lokálka vydělá míň peněz
    rewardXP: 2
      },
      3: {
        name: "Rychlík Praha",
        image: "https://i.imgur.com/rwsmlyg.jpg",
        routeKey: "praha",
        speed: 120, // Rychlík pojede o něco rychleji
        stayTime: 15,
        initialContract: 1, // Rychlík má těžší kontrakt na 3 otočky
        timers: { exit: 108, clean: 182, board: 108 },
rewardMoney: 1800,   // 💰 Menší lokálka vydělá míň peněz
    rewardXP: 3
      }
    }
  },

  // 🚉 NÁDRAŽÍ 2: KARLSRUHE HAUPTBAHNHOF (Předpřipravené Německo)
  karlsruhe: {
    name: "Karlsruhe Hbf",
    flag: "🇩🇪",
    currency: "EUR",
    unlockCost: 50000,          // Stojí 50 000 Kč v globální kase
    requiredParentLevel: 3,     // Hráč musí mít v Plzni aspoň Level 3, aby mohl koupit
    mapCenter: [48.9935, 8.4022],
    mapZoom: 12,
    startingTracks: 1,
    moneyPerDepart: 150,        // Eura naskakují jinak
    startingTrains: [101],

    routes: {
      ettlingen: [
        [48.9935, 8.4022],
        [48.9710, 8.4044],
        [48.9400, 8.4070]
      ]
    },

    levels: {
      0: { 
        xpNeeded: 4, 
        rewardText: "Získáváš federální dotaci 1 000 €!", 
        action: () => { globalMoney += 1000; } 
      }
    },

    trainsPool: {
      101: {
        name: "AVG S1 → Ettlingen",
        image: "https://i.imgur.com/5upJC9h.jpg", // Sem pak dáte německý vlak
        routeKey: "ettlingen",
        speed: 90,
        stayTime: 8,
        initialContract: 2,
        timers: { exit: 4, clean: 6, board: 4 }
      }
    }
  }

};

