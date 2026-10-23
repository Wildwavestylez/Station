// Zwiesel (Bayern) – Grundkonfiguration für den Stationsstart.
// Reale Gleisgeometrien werden später über stations/preparedRoutes.js ergänzt.
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

window.STATIONS_REGISTRY["zwiesel"] = {
  name: "Zwiesel (Bayern)",
  flag: "🇩🇪",
  currency: "EUR",
  unlockCost: 0,
  requiredParentLevel: 0,
  mapCenter: [49.0167, 13.2370],
  mapZoom: 13,
  startingTracks: 1,
  moneyPerDepart: 20,
  startingTrains: [],
  routes: {},
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
  trainsPool: {}
};
