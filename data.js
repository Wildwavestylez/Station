// 🗺️ TRASY (Plzeň -> Cíl)
const routes = {
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
};

// 🚂 STARTOVNÍ VLAKY
let trains = [
  {
    id: 1,
    name: "810 → Rokycany",
    image: "https://imgur.com",
    state: "WAIT_ASSIGN",
    track: null,
    routeKey: "rokycany",
    currentStep: 0,
    stayTime: 10,
    stayTimer: 0,
    marker: null,
    progress: { exit:0, clean:0, board:0 },
    timers: { exit:5, clean:8, board:5 },
    pendingAction: false
  },
  {
    id: 2,
    name: "810 → Přeštice",
    image: "https://imgur.com",
    state: "WAIT_ASSIGN",
    track: null,
    routeKey: "prestice",
    currentStep: 0,
    stayTime: 10,
    stayTimer: 0,
    marker: null,
    progress: { exit:0, clean:0, board:0 },
    timers: { exit:5, clean:8, board:5 },
    pendingAction: false
  },
  {
    id: 3,
    name: "Rychlík Praha",
    image: "https://imgur.com",
    state: "COMING",
    track: null,
    routeKey: "praha",
    currentStep: 0,
    stayTime: 15,
    stayTimer: 0,
    marker: null,
    progress: { exit:0, clean:0, board:0 },
    timers: { exit:8, clean:12, board:8 },
    travel: 5,
    travelMax: 5,
    pendingAction: false
  }
];
