// Zwiesel (Bayern) – Startstation mit Waldbahn-Linien und echter OSM-Geometrie.
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

function buildZwieselJoinedRoute(parts, label, maxGapMeters = 300) {
  const prepared = window.STATION_PREPARED_ROUTES || {};
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  };

  const segments = parts.map(part => {
    const points = prepared[part.key];
    if (!Array.isArray(points) || points.length < 2) return null;
    const copy = points.map(point => [point[0], point[1]]);
    return part.reverse ? copy.reverse() : copy;
  });
  if (segments.some(segment => !segment)) {
    console.error(label + ": chybí připravený OSM úsek.", parts.map(part => part.key));
    return [];
  }

  const joined = segments[0].map(point => [point[0], point[1]]);
  for (let i = 1; i < segments.length; i++) {
    const gap = distanceMeters(joined[joined.length - 1], segments[i][0]);
    if (gap > maxGapMeters) {
      console.error(label + ": OSM úseky na sebe nenavazují.", {
        from: parts[i - 1].key, to: parts[i].key, gapMeters: Math.round(gap)
      });
      return [];
    }
    joined.push(...segments[i].slice(1).map(point => [point[0], point[1]]));
  }
  console.info(label + ": spojeno " + segments.length + " OSM úseků, " + joined.length + " bodů.");
  return joined;
}

// Z Zwieselu přes Regen a Deggendorf do Plattlingu.
function buildZwieselPlattlingRoute() {
  return buildZwieselJoinedRoute([
    { key: "zwiesel:regen" },
    { key: "regen:deggendorf" },
    { key: "deggendorf:plattling" }
  ], "Waldbahn Zwiesel–Regen–Deggendorf–Plattling");
}

// Ze Zwieselu přes společné pohraniční nádraží do Bayerisch Eisenstein.
function buildZwieselBayerischEisensteinRoute() {
  return buildZwieselJoinedRoute([
    { key: "alzbietin:zwiesel", reverse: true }
  ], "Waldbahn Zwiesel–Bayerisch Eisenstein");
}

window.STATIONS_REGISTRY["zwiesel"] = {
  name: "Zwiesel (Bayern)",
  flag: "🇩🇪",
  currency: "EUR",
  unlockCost: 0,
  requiredParentLevel: 0,
  mapCenter: [49.020937, 13.2266275],
  mapZoom: 13,
  startingTracks: 1,
  trackPurchaseLevel: 2,
  cleaningTeamShopLevel: 3,
  moneyPerDepart: 20,
  startingTrains: [1],
  routes: {
    bodenmais: window.STATION_PREPARED_ROUTES["zwiesel:bodenmais"] || [],
    grafenau: window.STATION_PREPARED_ROUTES["zwiesel:grafenau"] || [],
    plattling: buildZwieselPlattlingRoute(),
    bayerischEisenstein: buildZwieselBayerischEisensteinRoute()
  },
  levels: {
    0: {
      xpNeeded: 1,
      rewardText: "Willkommen in Zwiesel!",
      action: () => {}
    },
    1: {
      xpNeeded: 5,
      rewardTextKey: "zwieselLevel2Reward",
      unlocksTrack: 2,
      action: () => {}
    },
    2: {
      xpNeeded: 10,
      rewardText: "Level 3: Möglichkeit zum Kauf einer zweiten Reinigungsmannschaft wird freigeschaltet.",
      action: () => {}
    },
    3: {
      xpNeeded: 20,
      rewardText: "Level 4: Plzeň wird als nächster Bahnhof freigeschaltet.",
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
    },
    3: {
      name: "Waldbahn Regio-Shuttle RS1 · Plattling–Zwiesel–Bayerisch Eisenstein",
      operator: "Die Länderbahn / Waldbahn",
      category: "local",
      routeLabel: "Plattling–Deggendorf–Regen–Zwiesel–Bayerisch Eisenstein",
      boardDestination: "Plattling",
      lineCode: "RB 35",
      purchaseCost: 5000,
      requiredLevel: 0,
      shopRequiredLevelOverride: true,
      image: "assets/trains/germany/waldbahn/WB3.png",
      routeKey: "plattling",
      routeSequence: ["plattling", "bayerischEisenstein"],
      speed: 80,
      stayTime: 10,
      initialContract: 1,
      timers: { exit: 5, clean: 8, board: 5 },
      rewardMoney: 1800,
      rewardXP: 1
    }
  }
};

// Zpřístupnit jen trasy, pro které existuje skutečná připravená geometrie.
for (const key of ["bodenmais", "grafenau", "plattling", "bayerischEisenstein"]) {
  const route = window.STATIONS_REGISTRY.zwiesel.routes[key];
  if (window.STATION_BUNDLED_ROUTE_KEYS && Array.isArray(route) && route.length >= 2) {
    window.STATION_BUNDLED_ROUTE_KEYS.add("zwiesel:" + key);
  }
}
