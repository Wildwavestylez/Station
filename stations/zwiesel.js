// Zwiesel (Bayern) – Startstation mit echter Waldbahn-Strecke nach Bodenmais.
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

window.STATIONS_REGISTRY["zwiesel"] = {
  name: "Zwiesel (Bayern)",
  flag: "🇩🇪",
  currency: "EUR",
  unlockCost: 0,
  requiredParentLevel: 0,
  mapCenter: [49.020937, 13.2266275],
  mapZoom: 13,
  startingTracks: 1,
  moneyPerDepart: 20,
  startingTrains: [1],
  routes: {
    bodenmais: window.STATION_PREPARED_ROUTES["zwiesel:bodenmais"] || [],
    grafenau: window.STATION_PREPARED_ROUTES["zwiesel:grafenau"] || []
  },
  levels: {
    0: {
      xpNeeded: 1,
      rewardText: "Willkommen in Zwiesel!",
      action: () => {}
    },
    1: {
      xpNeeded: 5,
      rewardText: "Zwiesel: Level 2 erreicht!",
      action: () => {}
    }
  },
  trainsPool: {
    1: {
      name: "Waldbahn Regio-Shuttle RS1 → Bodenmais",
      operator: "Die Länderbahn / Waldbahn",
      category: "local",
      routeLabel: "Zwiesel–Bodenmais",
      boardDestination: "Bodenmais",
      lineCode: "RB 38",
      purchaseCost: 0,
      requiredLevel: 0,
      image: "assets/trains/germany/waldbahn/WB3.png",
      routeKey: "bodenmais",
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 800,
      rewardXP: 1
    },
    2: {
      name: "Waldbahn Regio-Shuttle RS1 → Grafenau",
      operator: "Die Länderbahn / Waldbahn",
      category: "local",
      routeLabel: "Zwiesel–Grafenau",
      boardDestination: "Grafenau",
      lineCode: "RB 36",
      purchaseCost: 1000,
      requiredLevel: 1,
      shopRequiredLevelOverride: true,
      image: "assets/trains/germany/waldbahn/WB2.png",
      routeKey: "grafenau",
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 800,
      rewardXP: 1
    }
  }
};

// Trasu zpřístupni pouze tehdy, pokud je v připraveném OSM balíku skutečná geometrie.
if (
  window.STATION_BUNDLED_ROUTE_KEYS &&
  Array.isArray(window.STATIONS_REGISTRY.zwiesel.routes.bodenmais) &&
  window.STATIONS_REGISTRY.zwiesel.routes.bodenmais.length >= 2
) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("zwiesel:bodenmais");
}

if (window.STATION_BUNDLED_ROUTE_KEYS && Array.isArray(window.STATIONS_REGISTRY.zwiesel.routes.grafenau) && window.STATIONS_REGISTRY.zwiesel.routes.grafenau.length >= 2) {
  window.STATION_BUNDLED_ROUTE_KEYS.add("zwiesel:grafenau");
}
