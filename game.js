// Export úspěšně vypočítaných skutečných tras pro zabalení do herních dat.
const PREPARED_ROUTE_STORAGE_KEY = "station-prepared-railway-routes-v1";
function rememberPreparedRailwayRoute(stationKey, routeKey, coordinates, metadata) {
  try {
    const saved = JSON.parse(localStorage.getItem(PREPARED_ROUTE_STORAGE_KEY) || "{}");
    saved[stationKey + ":" + routeKey] = {
      station: stationKey,
      routeKey,
      coordinates,
      distanceMeters: metadata.distanceMeters,
      nodes: coordinates.length,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(PREPARED_ROUTE_STORAGE_KEY, JSON.stringify(saved));
    window.__stationPreparedRoutes = saved;
  } catch (error) {
    console.warn("Nepodařilo se uložit trasu pro export.", error);
  }
}
window.downloadPreparedRailwayRoutes = function () {
  const saved = JSON.parse(localStorage.getItem(PREPARED_ROUTE_STORAGE_KEY) || "{}");
  const entries = Object.values(saved);
  if (!entries.length) {
    console.warn("Zatím není uložená žádná trasa. Nejdřív úspěšně naplánuj Rokycany nebo Přeštice.");
    return false;
  }
  const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "station-prepared-railway-routes.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.info("Exportováno připravených tras:", entries.map(x => x.station + ":" + x.routeKey + " (" + x.nodes + " uzlů)"));
  return true;
};

// ==========================================
// 🧭 KROK 1: INICIALIZACE A PROMĚNNÉ
// ==========================================


// 🌍 1. Spuštění mapy a načtení dlaždic
const map = L.map('map').setView([49.7410, 13.3860], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 💰 2. Základní stav herní session
// Zkontroluj začátek game.js a přidej tam tento řádek pod inicializaci mapy:
if (!window.STATIONS_REGISTRY) window.STATIONS_REGISTRY = {};

let globalMoney = 100;          // Globální kasa pro nákup nových měst (World of Airports styl)
let currentStationKey = null;   // ID aktuálního nádraží (např. "plzen")
let currentStationData = null;  // Celý objekt dat aktivního nádraží
let stationLevels = {};         // Úrovně jednotlivých měst, např: { plzen: { lvl: 0, xp: 0 } }
let selected = null;            // Právě vybraný vlak hráčem
let tracks = [null, null];      // Pole kolejí aktivního nádraží
let trains = [];                // Seznam vlaků aktivního nádraží
let trainQueuePriority = 0;       // Pořadí ručně vyvolaných / právě vrácených vlaků
let unlockedTracksCount = 1;    // Počet aktuálně odemčených kolejí v daném městě
let unlockedCleaningTeamsCount = 1; // Počet úklidových týmů odemčených na nádraží
let cleaningTeamsInUse = 0;          // Počet týmů právě uklízejících vlak
let unlockedCateringTeamsCount = 1;   // Počet odemčených cateringových čet na nádraží
let cateringTeamsInUse = 0;           // Počet cateringových čet právě obsluhujících vlaky
let hiredCateringTeamsByStation = {}; // Počet dodatečně koupených cateringových čet pro jednotlivá nádraží
let ownedPerformancesByStation = {}; // Zakoupené výkony pro jednotlivá nádraží
let savedTrainsByStation = {}; // Provozní stav vlaků odděleně pro každé nádraží
let unlockedTracksByStation = {};    // Trvale zakoupená kapacita nástupišť
let hiredCleaningTeamsByStation = {}; // Počet dodatečně koupených úklidových čet pro jednotlivá nádraží
let shopOpen = false;
// 🟢 PŘIDAT DO GLOBÁLNÍCH PROMĚNNÝCH V GAME.JS:
let currentLanguage = localStorage.getItem('trainOps_lang') || navigator.language.slice(0, 2) || 'cs';

// Pojistka: pokud zjištěný jazyk v tabulce nemáme, přepneme na češtinu
if (!window.LANGUAGES[currentLanguage]) {
  currentLanguage = 'cs'; 
}

// Pomocná zkratka, abychom nemuseli pokaždé psát dlouhý řetězec
function lang() {
  return window.LANGUAGES[currentLanguage];
}



let departureBoardOpen = false;
let departureBoardClockInterval = null;

function openDepartureBoard() {
  const modal = document.getElementById("departure-board-modal");
  if (!modal) return;
  departureBoardOpen = true;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  renderDepartureBoard();
  if (departureBoardClockInterval) clearInterval(departureBoardClockInterval);
  departureBoardClockInterval = setInterval(() => {
    const clock = document.getElementById("departure-board-clock");
    if (clock) clock.textContent = new Date().toLocaleTimeString(currentLanguage || "cs", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    renderDepartureBoard();
  }, 1000);
}

function closeDepartureBoard() {
  const modal = document.getElementById("departure-board-modal");
  if (!modal) return;
  departureBoardOpen = false;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  if (departureBoardClockInterval) {
    clearInterval(departureBoardClockInterval);
    departureBoardClockInterval = null;
  }
}

// Odjezdová tabule zobrazuje pouze vlaky, které jsou fyzicky ve výchozí stanici.
function isDepartureBoardTrain(t) {
  return ["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(t.state);
}

// Na tabuli ukazujeme odjeté spoje a odpočet do jejich návratu.
function departureTimeLabel(t) {
  return formatReturnEta(getReturnEtaSeconds(t));
}

// Odhad do návratu na aktuální nádraží podle herní vzdálenosti, rychlosti a pobytu v cíli.
function getReturnEtaSeconds(t) {
  if (Number.isFinite(Number(t.returnCountdownSeconds))) {
    return Math.max(0, Number(t.returnCountdownSeconds));
  }

  // Zpětná kompatibilita pro vlak, který byl na trati uložen před zavedením odpočtu.
  const route = currentStationData && currentStationData.routes
    ? currentStationData.routes[t.routeKey]
    : null;
  const speed = Number(t.speed);
  const length = route && Number(route.totalLength);
  if (!route || !Number.isFinite(length) || length <= 0 || !Number.isFinite(speed) || speed <= 0) return null;
  if (t.state === "EN_ROUTE_THERE") {
    return Math.max(0, length - (Number(t.distance) || 0)) / speed
      + Math.max(0, Number(t.stayTime) || 0) + length / speed;
  }
  if (t.state === "AT_DESTINATION") {
    return Math.max(0, Number(t.stayTimer) || 0) + length / speed;
  }
  if (t.state === "EN_ROUTE_BACK") return Math.max(0, Number(t.distance) || 0) / speed;
  return null;
}

function formatReturnEta(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const totalMinutes = Math.max(0, Math.ceil(seconds / 60));
  if (totalMinutes < 1) return "za méně než 1 min";
  if (totalMinutes === 1) return "za 1 min";
  return "za " + totalMinutes + " min";
}

function escapeBoardText(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderDepartureBoard() {
  if (!departureBoardOpen) return;
  const rows = document.getElementById("departure-board-rows");
  const title = document.getElementById("departure-board-title");
  const clock = document.getElementById("departure-board-clock");
  const count = document.getElementById("departure-board-count");
  if (!rows || !currentStationData) return;

  if (title) title.textContent = "Odjezdy · " + currentStationData.name;
  if (clock) clock.textContent = new Date().toLocaleTimeString(currentLanguage || "cs", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const activeTrains = [...trains]
    .filter(isDepartureBoardTrain)
    .sort((a, b) => {
      const etaA = getReturnEtaSeconds(a);
      const etaB = getReturnEtaSeconds(b);
      if (Number.isFinite(etaA) && Number.isFinite(etaB)) return etaA - etaB;
      if (Number.isFinite(etaA)) return -1;
      if (Number.isFinite(etaB)) return 1;
      return String(a.name).localeCompare(String(b.name), "cs");
    });
  if (count) count.textContent = activeTrains.length + (activeTrains.length === 1 ? " vlak" : activeTrains.length >= 2 && activeTrains.length <= 4 ? " vlaky" : " vlaků");

  if (!activeTrains.length) {
    rows.innerHTML = '<tr><td colspan="3" class="departure-board-empty">Momentálně nejsou v provozu žádné vlaky.</td></tr>';
    return;
  }

  rows.innerHTML = activeTrains.map(t => {
    const template = currentStationData.trainsPool && currentStationData.trainsPool[t.id] || {};
    const destinations = {
      rokycany: "Rokycany",
      prestice: "Přeštice",
      plasy: "Plasy",
      praha: "Praha",
      domazlice: "Domažlice",
      klatovy: "Klatovy",
      zeleznaRuda: "Železná Ruda-Alžbětín",
      pendolinoOstrava: "Ostrava hl.n.",
      pendolinoCheb: "Cheb",
      railjetFrantiskovy: "Františkovy Lázně",
      railjetBohumin: "Bohumín"
    };
    const boardRouteKey = isDepartureBoardTrain(t) && t.nextRouteKey ? t.nextRouteKey : t.routeKey;
    const destination = template.routeSequence
      ? (destinations[boardRouteKey] || "Neurčený cíl")
      : (template.boardDestination || destinations[t.routeKey] || template.destination || "Neurčený cíl");
    const lineCode = String(template.lineCode || "").trim();
    const displayDestination = (lineCode ? lineCode + " " : "") + destination;
    const operator = template.operator || "Neurčený dopravce";
    return '<tr class="' + (selected && selected.id === t.id ? "is-selected" : "") + '">' +
      '<td class="departure-time-cell">' + escapeBoardText(departureTimeLabel(t)) + '</td>' +
      '<td><strong>' + escapeBoardText(displayDestination) + '</strong></td>' +
      '<td>' + escapeBoardText(operator) + '</td>' +
      '</tr>';
  }).join("");

  rows.querySelectorAll("[data-train-id]").forEach(button => {
    button.addEventListener("click", () => {
      const train = trains.find(item => String(item.id) === button.getAttribute("data-train-id"));
      if (!train) return;
      selected = train;
      updateDetail();
      render();
      if (train.marker && map.hasLayer(train.marker)) {
        map.panTo(train.marker.getLatLng());
        train.marker.openPopup();
      }
      closeDepartureBoard();
    });
  });
}

function initDepartureBoard() {
  const button = document.getElementById("departure-board-button");
  const close = document.getElementById("departure-board-close");
  const modal = document.getElementById("departure-board-modal");
  if (button) button.addEventListener("click", openDepartureBoard);
  if (close) close.addEventListener("click", closeDepartureBoard);
  if (modal) {
    modal.querySelectorAll("[data-close-departures]").forEach(el => el.addEventListener("click", closeDepartureBoard));
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && departureBoardOpen) closeDepartureBoard();
  });
}

// 🍔 3. FUNKCE PRO VYSUNUTÍ / ZASUNUTÍ BOČNÍHO MENU
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.toggle("open");
  }
}


// ==========================================
// 🧱 KUS 2: BOČNÍ MENU A NAKUPOVÁNÍ NÁDRAŽÍ
// ==========================================

// 📂 4. GENEROVÁNÍ SEZNAMU NÁDRAŽÍ DO MENU (CELÁ FUNKCE)
function renderSidebar() {
  const list = document.getElementById("station-list");
  if (!list) return;
  list.innerHTML = "";

  if (!window.STATIONS_REGISTRY) return;

  // Lokalizace nadpisu sidebaru
  const headerTitle = document.querySelector(".sidebar-header h3");
  if (headerTitle) headerTitle.innerText = lang().sidebarTitle;

  for (const key in window.STATIONS_REGISTRY) {
    const st = window.STATIONS_REGISTRY[key];
    const isUnlocked = GLOBAL_PLAYER_DATA.unlockedStations.includes(key);
    const isActive = currentStationKey === key;

    const div = document.createElement("div");
    div.className = `station-item ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;

    if (isUnlocked) {
      const lvlInfo = stationLevels[key] || { lvl: 0, xp: 0 };
      div.innerHTML = `
        <h4>${st.name} ${st.flag}</h4>
        <p>⭐️ Level ${lvlInfo.lvl} | ${st.currency}</p>
      `;
      div.onclick = () => { if (currentStationKey) saveGameState(); loadStation(key); toggleSidebar(); };
    } else {
      div.innerHTML = `
        <h4>${st.name} ${st.flag} 🔒</h4>
        <p>${lang().unlockCostText}: <b>${st.unlockCost} ${st.currency}</b><br>${lang().requiresLvlText}: Plzeň Level ${st.requiredParentLevel}</p>
      `;
      div.onclick = () => { tryUnlockStation(key, st); };
    }
    list.appendChild(div);
  }
}



// 💰 5. POKUS O ZAKOUPENÍ UZAMČENÉHO NÁDRAŽÍ
function tryUnlockStation(key, st) {
  const plzenLvl = (stationLevels["plzen"] && stationLevels["plzen"].lvl) || 0;
  
  // Kontrola podmínek pro nákup
  if (plzenLvl < st.requiredParentLevel) {
    alert(`Nemáš dostatečný level v Plzni! Potřebuješ aspoň Level ${st.requiredParentLevel}.`);
    return;
  }
  if (globalMoney < st.unlockCost) {
    alert(`Nemáš dost peněz v globální kase! Potřebuješ ${st.unlockCost} Kč.`);
    return;
  }

  // Stržení peněz a přidání mezi odemčená nádraží
  globalMoney -= st.unlockCost;
  GLOBAL_PLAYER_DATA.unlockedStations.push(key);
  stationLevels[key] = { lvl: 0, xp: 0 };
  
  alert(`🎉 Odemkl jsi nádraží ${st.name}! Můžeš do něj rovnou vstoupit.`);
  renderSidebar();
  render();
  saveGameState();
}

// ==========================================
// 🧱 KUS 3: ZAVÁDĚNÍ NÁDRAŽÍ A VLAKŮ DO HRY
// ==========================================

// 🚉 6. NAČTENÍ A PŘEPNUTÍ KOMPLETNÍHO NÁDRAŽÍ
// ==========================================
// 🚉 NAČÍTÁNÍ A PŘEPNÁNÍ NÁDRAŽÍ (KOMPLETNÍ)
// ==========================================
// ==========================================
// 🚉 NAČÍTÁNÍ A PŘEPNÁNÍ NÁDRAŽÍ (CELÁ FUNKCE)
// ==========================================
function loadStation(stationKey) {
  // Smazání starých jedoucích vlaků z mapy, aby nezůstaly v jiném městě
  if (trains && trains.length > 0) {
    trains.forEach(t => { 
      if (t.marker) { 
        map.removeLayer(t.marker); 
        t.marker = null; 
      } 
    });
  }

  // Bezpečnostní kontrola, zda máme data v globálním okně
  if (!window.STATIONS_REGISTRY || !window.STATIONS_REGISTRY[stationKey]) {
    console.error(`❌ Stanice ${stationKey} nebyla nalezena v globálním registru!`);
    return;
  }

  currentStationKey = stationKey;
  currentStationData = window.STATIONS_REGISTRY[stationKey];

  // Použij připravené kolejové trasy zabalené přímo ve hře, pokud jsou dostupné.
  // Nezapisujeme je do savu hráče a neměníme ostatní data stanice.
  const bundledRoutes = window.PREPARED_RAILWAY_ROUTES || {};
  for (const [key, coordinates] of Object.entries(bundledRoutes)) {
    const prefix = stationKey + ":";
    if (!key.startsWith(prefix) || !Array.isArray(coordinates) || coordinates.length < 2) continue;
    const routeKey = key.slice(prefix.length);
    if (currentStationData.routes && Object.prototype.hasOwnProperty.call(currentStationData.routes, routeKey)) {
      currentStationData.routes[routeKey] = coordinates.map(point => [Number(point[0]), Number(point[1])]);
      console.info("Načtena zabalená železniční trasa:", key, currentStationData.routes[routeKey].length, "bodů");
    }
  }

  // Přesun kamery a zoomu mapy na zvolené souřadnice
  map.setView(currentStationData.mapCenter, currentStationData.mapZoom);

  // Inicializace a oprava uložených levelů (starý/poškozený save nesmí šířit NaN)
  if (!stationLevels[stationKey] || typeof stationLevels[stationKey] !== "object") {
    stationLevels[stationKey] = { lvl: 0, xp: 0 };
  }
  const savedLvl = Number(stationLevels[stationKey].lvl);
  const savedXp = Number(stationLevels[stationKey].xp);
  stationLevels[stationKey].lvl = Number.isFinite(savedLvl) && savedLvl >= 0 ? Math.floor(savedLvl) : 0;
  stationLevels[stationKey].xp = Number.isFinite(savedXp) && savedXp >= 0 ? savedXp : 0;

  // Kapacita nástupišť se kupuje a ukládá samostatně.
  const configuredTracks = Number(currentStationData.startingTracks);
  const baseTracks = Number.isFinite(configuredTracks) && configuredTracks >= 1
    ? Math.floor(configuredTracks)
    : 1;
  const savedTrackCount = Number(unlockedTracksByStation[stationKey]);
  const currentLevel = stationLevels[stationKey].lvl;
  let levelTrackCount = baseTracks;
  for (let level = 0; level <= currentLevel; level++) {
    const count = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksTrack);
    if (Number.isFinite(count) && count >= 1) levelTrackCount = Math.max(levelTrackCount, Math.floor(count));
  }
  // Zachovej koupené koleje a zároveň přiznej odměny odemčené levelem i ve starších savech.
  unlockedTracksCount = Math.max(
    baseTracks,
    levelTrackCount,
    Number.isFinite(savedTrackCount) ? Math.floor(savedTrackCount) : baseTracks
  );
  unlockedTracksByStation[stationKey] = unlockedTracksCount;
  const myLvl = stationLevels[stationKey].lvl;

  // Úklidové týmy: jedna četa od startu, druhá zdarma na levelu 5,
  // další dvě se kupují v obchodě. Počet nákupů se ukládá samostatně pro každé nádraží.
  const configuredTeams = Number(currentStationData.startingCleaningTeams);
  let levelUnlockedTeams = Number.isFinite(configuredTeams) && configuredTeams >= 1
    ? Math.floor(configuredTeams)
    : 1;
  for (let l = 0; l <= myLvl; l++) {
    const teamsAtLevel = Number(currentStationData.levels[l] && currentStationData.levels[l].unlocksCleaningTeams);
    if (Number.isFinite(teamsAtLevel) && teamsAtLevel >= 1) {
      levelUnlockedTeams = Math.max(levelUnlockedTeams, Math.floor(teamsAtLevel));
    }
  }
  // Druhá četa je základní odměna levelu 5 nezávisle na konfiguraci konkrétní stanice.
  if (myLvl >= 5) levelUnlockedTeams = Math.max(levelUnlockedTeams, 2);
  const savedHiredTeams = Number(hiredCleaningTeamsByStation[stationKey]);
  const hiredTeams = Number.isFinite(savedHiredTeams) && savedHiredTeams >= 0
    ? Math.min(2, Math.floor(savedHiredTeams))
    : 0;
  hiredCleaningTeamsByStation[stationKey] = hiredTeams;
  unlockedCleaningTeamsCount = Math.min(4, levelUnlockedTeams + hiredTeams);
  cleaningTeamsInUse = 0;

  // Catering: jedna četa od začátku, druhá zdarma na levelu 11, třetí za 70 000 Kč.
  const configuredCateringTeams = Number(currentStationData.startingCateringTeams);
  let levelUnlockedCateringTeams = Number.isFinite(configuredCateringTeams) && configuredCateringTeams >= 1
    ? Math.floor(configuredCateringTeams)
    : 1;
  for (let l = 0; l <= myLvl; l++) {
    const teamsAtLevel = Number(currentStationData.levels[l] && currentStationData.levels[l].unlocksCateringTeams);
    if (Number.isFinite(teamsAtLevel) && teamsAtLevel >= 1) {
      levelUnlockedCateringTeams = Math.max(levelUnlockedCateringTeams, Math.floor(teamsAtLevel));
    }
  }
  if (myLvl >= 11) levelUnlockedCateringTeams = Math.max(levelUnlockedCateringTeams, 2);
  const savedHiredCateringTeams = Number(hiredCateringTeamsByStation[stationKey]);
  const hiredCateringTeams = Number.isFinite(savedHiredCateringTeams) && savedHiredCateringTeams >= 0
    ? Math.min(1, Math.floor(savedHiredCateringTeams))
    : 0;
  hiredCateringTeamsByStation[stationKey] = hiredCateringTeams;
  unlockedCateringTeamsCount = Math.min(3, levelUnlockedCateringTeams + hiredCateringTeams);
  cateringTeamsInUse = 0;

  // Vlastnictví výkonů se nikdy nemigruje z globálního seznamu vlaků:
  // ID se mohou mezi nádražími opakovat a nesmějí se přenášet mezi obchody.
  const savedOwnedIds = Array.isArray(ownedPerformancesByStation[stationKey])
    ? ownedPerformancesByStation[stationKey].map(Number).filter(Number.isFinite)
    : [];
  // Oprava starších savů: startovní výkony se vždy doplní, i když save už
  // obsahuje seznam vlastněných výkonů. Jinak může bezplatná Přeštická linka zmizet.
  const automaticLevelRewards = stationKey === "plzen" && stationLevels[stationKey].lvl >= 1 ? [6] : [];
  ownedPerformancesByStation[stationKey] = [...new Set([
    ...(currentStationData.startingTrains || []).map(Number),
    ...savedOwnedIds,
    ...automaticLevelRewards
  ])];

  // Vytvoření čistého kolejového pole a reset výběru
  tracks = Array(unlockedTracksCount).fill(null);
  selected = null;

  // Spuštění matematických výpočtů délek tras
  prepareRoutes();

  // Načítáme pouze stav vlaků uložený pod klíčem tohoto nádraží.
  // Staré savy bez mapy savedTrainsByStation obnovíme z místního seznamu vlastněných výkonů,
  // nikoli z původního globálního savedTrains, jehož nádraží nebylo ve starém formátu označeno.
  trains = [];
  const stationSavedTrains = Array.isArray(savedTrainsByStation[stationKey])
    ? savedTrainsByStation[stationKey]
    : [];

  stationSavedTrains.forEach(saved => {
    const template = (currentStationData.trainsPool || {})[saved.id];
    if (!template) return;
    trains.push({
      id: saved.id,
      name: template.name,
      image: template.image,
      state: ["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(saved.state) ? saved.state : "WAIT_ASSIGN",
      tripStartedAt: Number.isFinite(Number(saved.tripStartedAt)) ? Number(saved.tripStartedAt) : null,
      track: null,
      routeKey: Array.isArray(template.routeSequence) && Array.isArray(saved.routeSequence) && template.routeSequence.includes(saved.routeKey) ? saved.routeKey : template.routeKey,
      routeSequence: Array.isArray(template.routeSequence) ? template.routeSequence.slice() : null,
      routeSequenceIndex: Array.isArray(template.routeSequence) && template.routeSequence.includes(saved.routeKey) ? template.routeSequence.indexOf(saved.routeKey) : 0,
      nextRouteKey: saved.nextRouteKey || null,
      distance: Number.isFinite(Number(saved.distance)) ? Math.max(0, Number(saved.distance)) : 0,
      speed: Number.isFinite(Number(template.speed)) ? Number(template.speed) : 0,
      stayTime: Number.isFinite(Number(template.stayTime)) ? Number(template.stayTime) : 0,
      stayTimer: Number.isFinite(Number(saved.stayTimer)) ? Math.max(0, Number(saved.stayTimer)) : 0,
      returnCountdownSeconds: Number.isFinite(Number(saved.returnCountdownSeconds)) ? Math.max(0, Number(saved.returnCountdownSeconds)) : null,
      timer: 0,
      marker: null,
      progress: { exit: 0, clean: 0, catering: 0, board: 0 },
      timers: template.timers || { exit: 5, clean: 8, board: 5 },
      pendingAction: false,
      current_turnaround: Number.isFinite(Number(saved.current_turnaround)) && Number(saved.current_turnaround) >= 0
        ? Math.floor(Number(saved.current_turnaround))
        : 0,
      required_turnaround: Number.isFinite(Number(saved.required_turnaround)) && Number(saved.required_turnaround) >= 1
        ? Math.floor(Number(saved.required_turnaround))
        : (Number.isFinite(Number(template.initialContract)) && Number(template.initialContract) >= 1
            ? Math.floor(Number(template.initialContract))
            : 1),
      rewardMoney: Number.isFinite(Number(template.rewardMoney)) && Number(template.rewardMoney) > 0 ? Number(template.rewardMoney) : 1000,
      rewardXP: template.rewardXP || 1
    });
  });

  // Doplň výkony, které jsou vlastněné na tomto nádraží, ale chybí v uloženém provozním stavu.
  (ownedPerformancesByStation[stationKey] || []).forEach(id => {
    if (!trains.some(train => Number(train.id) === Number(id))) addNewTrainFromPool(id);
  });
  // Nejprve obnovíme polohu/čas aktivní otočky; případná odměna se zapíše právě jednou.
  restoreOfflineTrips(stationKey);
  renderSidebar();
  render();
  if (shopOpen) renderShop();
  saveGameState();
}


// 🚂 7. VYTAŽENÍ VLAKU Z KATALOGU NÁDRAŽÍ DO AKTIVNÍ FRONTY
function addNewTrainFromPool(id) {
  const template = currentStationData.trainsPool[id];
  if (!template) return;

  trains.push({
    id: id,
    name: template.name,
    image: template.image,
    state: "WAIT_ASSIGN",
    track: null,
    routeKey: template.routeKey,
    routeSequence: Array.isArray(template.routeSequence) ? template.routeSequence.slice() : null,
    routeSequenceIndex: Array.isArray(template.routeSequence) ? Math.max(0, template.routeSequence.indexOf(template.routeKey)) : 0,
    nextRouteKey: null,
    distance: 0,
    speed: template.speed,
    stayTime: template.stayTime,
    stayTimer: 0,
    marker: null,
    progress: { exit: 0, clean: 0, catering: 0, board: 0 },
    timers: template.timers,
    pendingAction: false,
    current_turnaround: 0,
    required_turnaround: template.initialContract,
    
    // 🟢 TADY PŘIDÁME PŘENOS ODMĚN Z ŠABLONY DO VLAKU:
    rewardMoney: template.rewardMoney || 1000, // pokud zapomeneš zapsat, dá jako pojistku 1000
    rewardXP: template.rewardXP || 1          // pojistka 1 XP
  });
}


// ==========================================
// 🧱 KUS 4: GEOMETRIE TRAS A VÝPOČET POZIC
// ==========================================

// 🗺️ 8. PŘÍPRAVA TRAS (Spočítá délky všech úseků a zatáček)
function prepareRoutes() {
  if (!currentStationData) return;
  
  for (const key in currentStationData.routes) {
    const route = currentStationData.routes[key];
    route.segmentLengths = [];
    route.totalLength = 0;

    for (let i = 0; i < route.length - 1; i++) {
      const a = L.latLng(route[i][0], route[i][1]);
      const b = L.latLng(route[i + 1][0], route[i + 1][1]);
      const len = a.distanceTo(b);
      
      route.segmentLengths.push(len);
      route.totalLength += len;
    }
  }
}

// 📐 9. VÝPOČET GPS POZICE (Vrátí [lat, lng] podle ujetých metrů)
function getPositionOnRoute(route, distance) {
  let passed = 0;
  
  for (let i = 0; i < route.segmentLengths.length; i++) {
    const segment = route.segmentLengths[i];
    
    if (distance <= passed + segment) {
      const t = (distance - passed) / segment;
      
      const lat = route[i][0] + (route[i + 1][0] - route[i][0]) * t;
      const lng = route[i][1] + (route[i + 1][1] - route[i][1]) * t;
      
      return [lat, lng];
    }
    passed += segment;
  }
  
  return route[route.length - 1];
}

// Pohybujeme pouze značkou po trase. Obrázek vlaku necháváme v původní orientaci,
// protože automatické otáčení způsobovalo nesprávné natočení a převracení soupravy.
function updateTrainMarker(t, route, distance) {
  if (!t.marker || !route) return;
  t.marker.setLatLng(getPositionOnRoute(route, distance));
}


// ==========================================
// 🧱 KUS 5: LOGIKA ODBAVENÍ A ODJEZD VLAKU
// ==========================================

// 🚉 10. PŘIDĚLENÍ KONKRÉTNÍ KOLEJE (Hráčem vybrané z UI)
function assignTrack(trackIndex) {
  if (!selected || selected.state !== "WAIT_ASSIGN") return;

  // Kontrola, zda vybraná kolej není obsazená nebo zarezervovaná
  if (tracks[trackIndex] !== null) {
    alert("Tato kolej je již obsazená jiným vlakem!");
    return;
  }

  // Zarezervujeme kolej pro tento vlak (uložíme jeho ID)
  tracks[trackIndex] = selected.id;
  
  // Koleje v UI číslujeme od 1, indexy v poli jedou od 0
  selected.track = trackIndex + 1; 
  
  // Přepneme vlak do příjezdové fáze na 15 sekund
  selected.state = "COMING";
  selected.timer = 15; // ⏳ 15 sekund odstup před fyzickým příjezdem
  selected.pendingAction = false;

  render();
  saveGameState(); // Uložíme zarezervovanou kolej do paměti
}


// ⏳ 11. SPUŠTĚNÍ ČASOVAČŮ ODBAVENÍ
function startTimer(type) {
  if (!selected) return;

  if (type === "clean") {
    const train = selected;

    // Hráč si sám vybírá, který vlak začne uklízet jako další.
    if (cleaningTeamsInUse >= unlockedCleaningTeamsCount) {
      train.state = "WAIT_CLEAN_TEAM";
      train.timer = 0;
      train.pendingAction = true;
      render();
      return;
    }

    cleaningTeamsInUse++;
    train.hasCleaningTeam = true;
    train.state = "CLEANING";
    train.timer = Number(train.timers && train.timers.clean) || 0;
    train.pendingAction = false;
    render();
    return;
  }

  if (type === "exit") selected.state = "UNLOADING";
  if (type === "catering") {
    const train = selected;
    const template = currentStationData && currentStationData.trainsPool && currentStationData.trainsPool[train.id];
    if (!template || !template.cateringRequired) return;

    if (train.hasCateringTeam) return;
    if (cateringTeamsInUse >= unlockedCateringTeamsCount) {
      // Vlak zůstane ve frontě; tlačítko se znovu zpřístupní po uvolnění čety.
      train.state = "WAIT_CATERING";
      train.timer = 0;
      train.pendingAction = true;
      render();
      return;
    }

    cateringTeamsInUse++;
    train.hasCateringTeam = true;
    train.state = "CATERING";
    train.timer = Math.max(1, Number(train.timers && train.timers.catering) || 10);
    train.progress.catering = 0;
    train.pendingAction = false;
    render();
    return;
  }
  if (type === "board") selected.state = "BOARDING";
  selected.timer = selected.timers[type];
  selected.pendingAction = false;
  render();
}

// 🚂 12. ODJEZD VLAKU Z NÁDRAŽÍ NA TRAŤ
async function depart() {
  if (!selected || selected.state !== "READY_DEPART") return;

  const t = selected;
  // Společný plánovač: každou linku zkusíme naplánovat nejvýše jednou za herní session.
  // Úspěšná geometrie se sdílí mezi všemi vlaky stejné linky; chyba neblokuje odjezd
  // a nevyvolává opakované dotazy na Overpass při každém dalším odjezdu.
  if (!window.__stationRouteAttempts) window.__stationRouteAttempts = new Set();
  const routeCacheKey = currentStationKey + ":" + t.routeKey;
  if (window.RailwayNetwork && !window.__stationRouteAttempts.has(routeCacheKey) && !(window.STATION_BUNDLED_ROUTE_KEYS && window.STATION_BUNDLED_ROUTE_KEYS.has(routeCacheKey))) {
    const route = currentStationData.routes[t.routeKey];
    if (Array.isArray(route) && route.length >= 2) {
      const button = document.querySelector('#actions button');
      if (button) { button.disabled = true; button.textContent = "Hledám skutečné koleje…"; }
      try {
        const start = route[0];
        const end = route[route.length - 1];
        const padding = 0.08;
        const bounds = [
          Math.min(start[0], end[0]) - padding,
          Math.min(start[1], end[1]) - padding,
          Math.max(start[0], end[0]) + padding,
          Math.max(start[1], end[1]) + padding
        ];
        const network = await window.RailwayNetwork.load(bounds);
        const result = network.findRoute(start, end, { maxSnapDistance: 3000 });
        if (!Array.isArray(result.coordinates) || result.coordinates.length < 2) {
          throw new Error("Nalezená trasa nemá dostatek bodů.");
        }

        currentStationData.routes[t.routeKey] = result.coordinates;
        rememberPreparedRailwayRoute(currentStationKey, t.routeKey, result.coordinates, result);
        window.__stationRouteAttempts.add(routeCacheKey);
        prepareRoutes();
        console.info("🛤️ Skutečná OSM trasa připravena", {
          station: currentStationKey,
          train: t.name,
          routeKey: t.routeKey,
          source: network.metadata.source,
          nodes: result.coordinates.length,
          distanceKm: (result.distanceMeters / 1000).toFixed(2),
          snapStartMeters: Math.round(result.snapDistances.start),
          snapEndMeters: Math.round(result.snapDistances.end)
        });
      } catch (error) {
        // Skutečná trasa je povinná: nikdy potichu neposílat vlak po testovací geometrii.
        // Neúspěšný pokus se neukládá do Setu, takže hráč může zkusit plánování znovu.
        console.error("Skutečnou OSM trasu se nepodařilo sestavit pro " + routeCacheKey, error);
        const reason = error && error.message ? error.message : "neznámá chyba";
        alert("Odjezd zastaven: nepodařilo se připravit skutečnou kolejovou trasu pro " + t.name +
          ". Vlak zůstává na nádraží. Důvod: " + reason +
          ". Zkus odjezd znovu později; testovací trasa se nepoužije.");
        return;
      } finally {
        render();
      }
      if (t.state !== "READY_DEPART") return;
    }
  }

  // Odměna za výkon se připíše až po dokončení celé otočky (tam i zpět).
  // Samotný odjezd z nádraží peníze nepřidává.

  if (t.track) {
    tracks[t.track - 1] = null;
    t.track = null;
  }
  const route = currentStationData.routes[t.routeKey];
  const routeLength = Number(route && route.totalLength);
  // Nikdy nespouštěj ani neodměňuj jízdu bez platné, připravené geometrie.
  // Jinak prázdná trasa projde herní smyčkou rovnou do cíle a zpět.
  if (!Array.isArray(route) || route.length < 2 ||
      !Number.isFinite(routeLength) || routeLength <= 0 ||
      !Array.isArray(route.segmentLengths) || route.segmentLengths.length < 1) {
    console.error("Odjezd zastaven: neplatná nebo prázdná trasa.", {
      train: t.name, routeKey: t.routeKey,
      points: Array.isArray(route) ? route.length : 0,
      routeLength
    });
    alert("Odjezd zastaven: pro vlak " + t.name +
      " není připravená platná kolejová trasa. Vlak zůstává na nádraží a odměna se nepřipíše.");
    return;
  }
  if (Array.isArray(t.routeSequence) && t.routeSequence.length > 1) {
    const currentIndex = Math.max(0, t.routeSequence.indexOf(t.routeKey));
    t.routeSequenceIndex = currentIndex;
    t.nextRouteKey = t.routeSequence[(currentIndex + 1) % t.routeSequence.length];
  } else {
    t.nextRouteKey = null;
  }
  const trainSpeed = Number(t.speed);
  // Při kliknutí na ODJEZD se založí odpočet celé otočky: cesta tam + pobyt + cesta zpět.
  t.returnCountdownSeconds = Number.isFinite(routeLength) && routeLength > 0 &&
    Number.isFinite(trainSpeed) && trainSpeed > 0
      ? (routeLength / trainSpeed) * 2 + Math.max(0, Number(t.stayTime) || 0)
      : null;
  t.state = "EN_ROUTE_THERE";
  t.distance = 0;
  t.tripStartedAt = Date.now();
  t.pendingAction = false;

  // Vytvoření markeru vlaku; kliknutí otevře provozní informace.
  if (!t.marker) {
    t.marker = L.marker(route[0], {
      icon: L.divIcon({
        html: `<img src="${t.image}" class="train-map-image">`,
        className: 'train-div-icon',
        iconSize: [80, 80],
        iconAnchor: [40, 40]
      })
    }).addTo(map);

    t.marker.bindPopup(() => getTrainPopupHtml(t), { className: "train-info-popup" });
    t.marker.on("click", () => {
      selected = t;
      updateDetail();
      render();
    });
  } else {
    t.marker.setLatLng(route[0]);
  }

  t.progress = { exit: 0, clean: 0, catering: 0, board: 0 };
  selected = null;
  render();
  saveGameState();
}


// Informace zobrazované po kliknutí na vlak na mapě.
function getTrainPopupHtml(t) {
  const template = currentStationData && currentStationData.trainsPool
    ? currentStationData.trainsPool[t.id]
    : null;
  const destination = template && template.routeLabel
    ? template.routeLabel
    : (template && template.routeKey ? template.routeKey : "Neznámá trasa");
  const categoryNames = {
    local: "Místní osobní vlak",
    regional: "Regionální vlak",
    rapid: "Rychlík",
    express: "Expres",
    international: "Mezinárodní vlak"
  };
  const category = categoryNames[(template && template.category) || ""] || "Osobní vlak";
  const stateNames = {
    WAIT_ASSIGN: "Čeká na přidělení koleje",
    COMING: "Přijíždí na nástupiště",
    ARRIVED: "Ve stanici – čeká na výstup cestujících",
    UNLOADING: "Vystupují cestující",
    WAIT_CLEAN: "Čeká na úklid",
    WAIT_CLEAN_TEAM: "Čeká na volný úklidový tým",
    CLEANING: "Probíhá úklid",
    CATERING: "Doplňuje se catering",
    WAIT_CATERING: "Čeká na zahájení cateringu",
    WAIT_BOARD: "Čeká na nástup cestujících",
    BOARDING: "Nastupují cestující",
    READY_DEPART: "Připraven k odjezdu",
    EN_ROUTE_THERE: "Na cestě do cíle",
    AT_DESTINATION: "Na konečné stanici",
    EN_ROUTE_BACK: "Na cestě zpět do výchozí stanice"
  };
  const turnsDone = Math.max(0, Number(t.current_turnaround) || 0);
  const turnsRequired = Math.max(1, Number(t.required_turnaround) || 1);
  return `
    <div class="train-popup-card">
      <strong class="train-popup-name">${t.name || "Osobní vlak"}</strong>
      <div class="train-popup-type">${category}</div>
      <div class="train-popup-row"><span>Linka</span><b>${destination}</b></div>
      <div class="train-popup-row"><span>Otočky</span><b>${turnsDone}/${turnsRequired}</b></div>
      <div class="train-popup-state">${stateNames[t.state] || t.state}</div>
    </div>
  `;
}

// ==========================================
// 🧱 KUS 6: KONTROLA KONTRAKTŮ A LEVEL UP
// ==========================================

// 🏆 13. ZPRACOVÁNÍ NÁVRATU VLAKU (WoA KONTRAKT)
function processTrainReturn(t) {
  // Pevná odměna za každou dokončenou otočku, bez složitého provozního výpočtu.
  globalMoney += Number(t.rewardMoney) || 0;
  const moneyElement = document.getElementById("money");
  if (moneyElement) moneyElement.innerText = globalMoney;
  if (shopOpen) renderShop();

  t.current_turnaround += 1;

  if (t.current_turnaround === t.required_turnaround) {
    // 🟢 Místo fixních bodů vynásobíme obtížnost kontraktu základním XP bonusem vlaku:
    let earnedPoints = t.required_turnaround * (t.rewardXP || 1);
    
    stationLevels[currentStationKey].xp += earnedPoints;
    alert(`🎉 Kontrakt kompletní! Vlak ${t.name} přinesl ${earnedPoints} XP bodů pro nádraží ${currentStationData.name}.`);

    t.required_turnaround += 1;
    t.current_turnaround = 0;

    checkLevelUp();
  }

  // Po dokončené otočce zvol další výkon podle trasy, kterou vlak právě dokončil.
  // Nezávisíme pouze na nextRouteKey: starší uložený stav ho může mít prázdný.
  if (Array.isArray(t.routeSequence) && t.routeSequence.length > 1) {
    const currentIndex = t.routeSequence.indexOf(t.routeKey);
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % t.routeSequence.length
      : 0;
    t.routeSequenceIndex = nextIndex;
    t.routeKey = t.routeSequence[nextIndex];
    t.nextRouteKey = null;
  }
  t.state = "WAIT_ASSIGN";
  t.tripStartedAt = null;
  t.returnCountdownSeconds = null;
  t.returnedAt = Date.now();
  t.queuePriority = ++trainQueuePriority;
  t.pendingAction = true;
  render();
  saveGameState();
}

  

// 📈 14. KONTROLA ZVÝŠENÍ LEVELU NÁDRAŽÍ
function checkLevelUp() {
  const myData = stationLevels[currentStationKey];
  const currentLevelConfig = currentStationData.levels[myData.lvl];
  if (!currentLevelConfig) return;

  if (myData.xp < Number(currentLevelConfig.xpNeeded)) return;

  // Každý level má vlastní cíl; odečteme dosažený cíl a přebytečné XP se přenesou dál.
  myData.xp -= Number(currentLevelConfig.xpNeeded);
  myData.lvl += 1;
  const reachedLevel = myData.lvl;
  const reachedConfig = currentStationData.levels[reachedLevel] || {};
  const rewards = [];

  if (typeof reachedConfig.action === "function") reachedConfig.action();

  // Level 1: automaticky přiděl bezplatný výkon Arriva Stadler do Plas.
  if (currentStationKey === "plzen" && reachedLevel === 1) {
    const id = 6;
    const owned = ownedPerformancesByStation[currentStationKey] || [];
    if (!owned.map(Number).includes(id)) {
      ownedPerformancesByStation[currentStationKey] = [...owned, id];
    }
    if (!trains.some(train => Number(train.id) === id)) addNewTrainFromPool(id);
    // Konkrétní odměny jsou vypsané v textu dosaženého levelu níže.
  }

  // Kapacita nástupišť se automaticky přepočítá podle dosaženého levelu.
  let nextTracks = Number(currentStationData.startingTracks) || 1;
  for (let level = 0; level <= reachedLevel; level++) {
    const count = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksTrack);
    if (Number.isFinite(count) && count >= 1) nextTracks = Math.max(nextTracks, Math.floor(count));
  }
  if (nextTracks > unlockedTracksCount) {
    unlockedTracksCount = nextTracks;
    while (tracks.length < unlockedTracksCount) tracks.push(null);
    unlockedTracksByStation[currentStationKey] = unlockedTracksCount;
    // Druhá kolej je oznámená v textu odměny levelu 2.
  }

  let nextTeams = Number(currentStationData.startingCleaningTeams);
  if (!Number.isFinite(nextTeams) || nextTeams < 1) nextTeams = 1;
  for (let level = 0; level <= reachedLevel; level++) {
    const teamsAtLevel = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksCleaningTeams);
    if (Number.isFinite(teamsAtLevel) && teamsAtLevel >= 1) nextTeams = Math.max(nextTeams, Math.floor(teamsAtLevel));
  }
  // Na levelu 5 se automaticky odemkne druhá bezplatná úklidová četa i nákup dalších čet.
  if (reachedLevel >= 5) {
    nextTeams = Math.max(nextTeams, 2);
    if (reachedLevel === 5) {
      rewards.push("Druhá úklidová četa zdarma; v obchodě můžeš najmout až dvě další.");
    }
  }
  unlockedCleaningTeamsCount = Math.min(4, Math.max(unlockedCleaningTeamsCount, Math.floor(nextTeams)));

  // Na levelu 11 se automaticky odemkne druhá cateringová četa.
  let nextCateringTeams = Number(currentStationData.startingCateringTeams);
  if (!Number.isFinite(nextCateringTeams) || nextCateringTeams < 1) nextCateringTeams = 1;
  for (let level = 0; level <= reachedLevel; level++) {
    const count = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksCateringTeams);
    if (Number.isFinite(count) && count >= 1) nextCateringTeams = Math.max(nextCateringTeams, Math.floor(count));
  }
  if (reachedLevel >= 11) {
    nextCateringTeams = Math.max(nextCateringTeams, 2);
    if (reachedLevel === 11) rewards.push("Druhá cateringová četa zdarma; v obchodě se odemyká možnost najmout třetí za 70 000 Kč.");
  }
  unlockedCateringTeamsCount = Math.min(3, Math.max(unlockedCateringTeamsCount, Math.floor(nextCateringTeams)));

  const rewardText = [reachedConfig.rewardText, ...rewards].filter(Boolean).join("\n• ");
  alert(`⭐️ LEVEL UP! ${currentStationData.name} postoupilo na Level ${reachedLevel}!\n\nOdměna:\n• ${rewardText || "Pokračuj v rozvoji nádraží."}`);

  renderSidebar();
  saveGameState();
  render();
  if (shopOpen) renderShop();
}
// ==========================================
// 🛒 OBCHOD: VÝKONY A KAPACITA NÁSTUPIŠŤ
// ==========================================
function ensureShopUI() {
  // Tlačítko obchodu je součástí HTML menu; zde jen bezpečně navážeme akci.
  const button = document.getElementById("station-shop-button");
  if (button) button.onclick = () => toggleShop();

  if (!document.getElementById("station-shop-modal")) {
    const overlay = document.createElement("div");
    overlay.id = "station-shop-modal";
    overlay.style.cssText = "display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.78);padding:16px;box-sizing:border-box;overflow:auto;";
    overlay.innerHTML = `
      <div style="max-width:760px;margin:5vh auto;background:#151515;color:#fff;border:1px solid #444;border-radius:14px;padding:16px;max-height:85vh;overflow:auto;box-shadow:0 10px 35px rgba(0,0,0,.6)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <h2 id="station-shop-title" style="margin:0;color:#4caf50">Obchod nádraží</h2>
          <button class="r" id="station-shop-close">✕ Zavřít</button>
        </div>
        <p id="station-shop-summary" style="color:#bbb"></p>
        <div id="station-shop-content"></div>
      </div>`;
    overlay.addEventListener("click", event => {
      if (event.target === overlay) toggleShop(false);
    });
    document.body.appendChild(overlay);
    document.getElementById("station-shop-close").onclick = () => toggleShop(false);
  }
}

function toggleShop(forceOpen) {
  ensureShopUI();
  shopOpen = typeof forceOpen === "boolean" ? forceOpen : !shopOpen;
  const modal = document.getElementById("station-shop-modal");
  if (modal) modal.style.display = shopOpen ? "block" : "none";
  if (shopOpen) renderShop();
}

function shopSection(title, body) {
  return `<section style="margin:16px 0"><h3 style="margin:0 0 8px;color:#ddd">${title}</h3>${body}</section>`;
}

function shopCard(title, subtitle, detail, actionLabel, action, disabled = false) {
  const button = disabled
    ? `<button disabled style="opacity:.45;cursor:not-allowed">${actionLabel}</button>`
    : `<button class="g" onclick="${action}">${actionLabel}</button>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#222;border:1px solid #383838;border-radius:10px;padding:12px;margin:8px 0">
    <div style="min-width:0"><b>${title}</b><div style="color:#aaa;font-size:13px;margin-top:3px">${subtitle}</div><div style="font-size:13px;margin-top:5px">${detail}</div></div>
    <div style="flex-shrink:0">${button}</div>
  </div>`;
}

function renderShop() {
  const content = document.getElementById("station-shop-content");
  const summary = document.getElementById("station-shop-summary");
  const title = document.getElementById("station-shop-title");
  if (!content || !currentStationData || !currentStationKey) return;

  const stationKey = currentStationKey;
  const level = Number((stationLevels[stationKey] || {}).lvl) || 0;
  const catalog = currentStationData.trainsPool || {};
  const owned = new Set((ownedPerformancesByStation[stationKey] || []).map(Number));
  if (title) title.textContent = `${currentStationData.name} — obchod nádraží`;
  if (summary) summary.textContent = `${currentStationData.name} · Level ${level} · Pokladna: ${globalMoney.toLocaleString("cs-CZ")} Kč`;

  const categoryNames = {
    local: "Místní osobní vlaky",
    rapid: "Rychlíky",
    express: "Expresní vlaky",
    longDistance: "Dálkové vlaky",
    international: "Mezinárodní vlaky"
  };
  const groupedCards = {};
  Object.entries(catalog).forEach(([idText, item]) => {
    const id = Number(idText);
    const category = categoryNames[item.category] ? item.category : "other";
    if (!groupedCards[category]) groupedCards[category] = [];
    const isOwned = owned.has(id);
    const requiredLevel = Math.max(Number(item.requiredLevel) || 0, item.category === "local" ? 1 : 0);
    const locked = level < requiredLevel;
    const cost = Math.max(0, Number(item.purchaseCost) || 0);
    const detail = `${categoryNames[category] || "Ostatní železniční výkony"} · ${cost === 0 ? "Zdarma" : cost.toLocaleString("cs-CZ") + " Kč"} · ${(Number(item.rewardMoney) || 0).toLocaleString("cs-CZ")} Kč za dokončenou otočku`;
    const label = isOwned ? "Zakoupeno na tomto nádraží" :
      locked ? `Odemkne se na levelu ${requiredLevel}` :
      globalMoney < cost ? "Nedostatek peněz" : "Koupit";
    const action = isOwned || locked || globalMoney < cost ? "" : `buyPerformance(${id})`;
    groupedCards[category].push(shopCard(
      item.name || `Železniční výkon ${id}`,
      `${item.operator || "Dopravce"} · ${item.routeLabel || item.routeKey || "Trasa podle konfigurace nádraží"}`,
      detail, label, action, isOwned || locked || globalMoney < cost
    ));
  });

  const categoryOrder = ["local", "rapid", "express", "longDistance", "international", "other"];
  const performanceSections = categoryOrder
    .filter(category => groupedCards[category] && groupedCards[category].length)
    .map(category => shopSection(categoryNames[category] || "Ostatní výkony", groupedCards[category].join("")))
    .join("");
  const performances = performanceSections || '<p style="color:#999">Pro toto nádraží zatím nejsou nakonfigurované žádné železniční výkony.</p>';

  const trackCosts = Array.isArray(currentStationData.trackPurchaseCosts) ? currentStationData.trackPurchaseCosts : [];
  const nextTrackCost = Number(trackCosts[unlockedTracksCount]);
  let trackDetail;
  let trackLabel;
  let trackAction = "";
  let trackDisabled = false;
  if (Number.isFinite(nextTrackCost) && unlockedTracksCount < trackCosts.length) {
    trackDetail = `Nástupiště / hrany: ${unlockedTracksCount} · Další rozšíření stojí ${nextTrackCost.toLocaleString("cs-CZ")} Kč`;
    trackLabel = globalMoney >= nextTrackCost ? "Koupit rozšíření" : "Nedostatek peněz";
    trackAction = globalMoney >= nextTrackCost ? "buyTrack()" : "";
    trackDisabled = globalMoney < nextTrackCost;
  } else {
    trackDetail = `Aktuální kapacita: ${unlockedTracksCount} · Pro toto nádraží není nastaven další nákupní stupeň.`;
    trackLabel = "Maximum";
    trackDisabled = true;
  }
  const trackCard = level >= 2
    ? shopCard("Koleje / hrany nástupišť", "Infrastruktura tohoto nádraží", trackDetail, trackLabel, trackAction, trackDisabled)
    : shopCard("Koleje / hrany nástupišť", "Odemkne se na levelu 2", "Kapacita a ceny se načítají z konfigurace tohoto nádraží.", "Zamčeno", "", true);

  const cleaningPurchased = Math.max(0, Math.min(2, Math.floor(Number(hiredCleaningTeamsByStation[stationKey]) || 0)));
  const cleaningCount = unlockedCleaningTeamsCount;
  const cleaningCost = cleaningPurchased === 0 ? 30000 : 50000;
  const cleaningMax = cleaningCount >= 4 || cleaningPurchased >= 2;
  const cleaningAvailable = level >= 5;
  const cleaningLabel = !cleaningAvailable ? "Zamčeno" : cleaningMax ? "Maximum čet dosaženo" :
    globalMoney >= cleaningCost ? "Najmout četu" : "Nedostatek peněz";
  const cleaningDetail = !cleaningAvailable ? "Další úklidové čety se odemknou na levelu 5." :
    cleaningMax ? `Aktuální stav: ${cleaningCount}/4 čet. Limit tohoto nádraží dosažen.` :
    `Aktuální stav: ${cleaningCount}/4 čet · Další četa stojí ${cleaningCost.toLocaleString("cs-CZ")} Kč.`;
  const cleaningCard = shopCard("Úklidová četa", "Personál · pouze toto nádraží", cleaningDetail,
    cleaningLabel, cleaningAvailable && !cleaningMax && globalMoney >= cleaningCost ? "buyCleaningTeam()" : "",
    !cleaningAvailable || cleaningMax || globalMoney < cleaningCost);

  const cateringPurchased = Math.max(0, Math.min(1, Math.floor(Number(hiredCateringTeamsByStation[stationKey]) || 0)));
  const cateringCount = unlockedCateringTeamsCount;
  const cateringCost = 70000;
  const cateringMax = cateringCount >= 3 || cateringPurchased >= 1;
  const cateringAvailable = level >= 11;
  const cateringLabel = !cateringAvailable ? "Zamčeno" : cateringMax ? "Maximum čet dosaženo" :
    globalMoney >= cateringCost ? "Najmout četu" : "Nedostatek peněz";
  const cateringDetail = !cateringAvailable ? "Další cateringové čety se odemknou na levelu 11." :
    cateringMax ? `Aktuální stav: ${cateringCount}/3 čet. Limit tohoto nádraží dosažen.` :
    `Aktuální stav: ${cateringCount}/3 čet · Další četa stojí ${cateringCost.toLocaleString("cs-CZ")} Kč.`;
  const cateringCard = shopCard("Cateringová četa", "Personál · pouze toto nádraží", cateringDetail,
    cateringLabel, cateringAvailable && !cateringMax && globalMoney >= cateringCost ? "buyCateringTeam()" : "",
    !cateringAvailable || cateringMax || globalMoney < cateringCost);

  content.innerHTML =
    shopSection("Vlaky a železniční výkony", performances) +
    shopSection("Infrastruktura", trackCard) +
    shopSection("Personál — úklid", cleaningCard) +
    shopSection("Personál — catering", cateringCard) +
    `<p style="color:#999;font-size:12px">Nabídka a vlastnictví se řídí konfigurací a postupem nádraží „${currentStationData.name}“. Zakoupené výkony, koleje a čety se evidují samostatně pro každé nádraží.</p>`;
}

function buyPerformance(id) {
  if (!currentStationData || !currentStationKey) return;
  const item = currentStationData.trainsPool[id];
  if (!item) return;
  const owned = ownedPerformancesByStation[currentStationKey] || [];
  if (owned.map(Number).includes(Number(id))) return;

  const level = Number((stationLevels[currentStationKey] || {}).lvl) || 0;
  const requiredLevel = Math.max(Number(item.requiredLevel) || 0, item.category === "local" ? 1 : 0);
  if (level < requiredLevel) {
    alert(`Tento výkon se odemkne na levelu ${requiredLevel}.`);
    return;
  }

  const cost = Math.max(0, Number(item.purchaseCost) || 0);
  if (globalMoney < cost) {
    alert("Na tento výkon nemáš dost peněz.");
    return;
  }

  globalMoney -= cost;
  ownedPerformancesByStation[currentStationKey] = [...owned, Number(id)];
  if (!trains.some(train => Number(train.id) === Number(id))) addNewTrainFromPool(Number(id));
  saveGameState();
  render();
  renderShop();
}

function buyCleaningTeam() {
  if (!currentStationData || !currentStationKey) return;

  const level = Number((stationLevels[currentStationKey] || {}).lvl) || 0;
  if (level < 5) {
    alert("Najímání dalších úklidových čet se odemkne na levelu 5.");
    return;
  }

  const purchased = Math.max(0, Math.min(2, Math.floor(Number(hiredCleaningTeamsByStation[currentStationKey]) || 0)));
  if (unlockedCleaningTeamsCount >= 4 || purchased >= 2) {
    alert("Nádraží už má maximální počet 4 úklidových čet.");
    return;
  }

  const cost = purchased === 0 ? 30000 : 50000;
  if (globalMoney < cost) {
    alert(`Na najmutí úklidové čety potřebuješ ${cost.toLocaleString("cs-CZ")} Kč.`);
    return;
  }

  globalMoney -= cost;
  hiredCleaningTeamsByStation[currentStationKey] = purchased + 1;
  unlockedCleaningTeamsCount = Math.min(4, unlockedCleaningTeamsCount + 1);
  saveGameState();
  render();
  renderShop();
}

function buyCateringTeam() {
  if (!currentStationData || !currentStationKey) return;

  const level = Number((stationLevels[currentStationKey] || {}).lvl) || 0;
  if (level < 11) {
    alert("Najímání další cateringové čety se odemkne na levelu 11.");
    return;
  }

  const purchased = Math.max(0, Math.min(1, Math.floor(Number(hiredCateringTeamsByStation[currentStationKey]) || 0)));
  if (unlockedCateringTeamsCount >= 3 || purchased >= 1) {
    alert("Nádraží už má maximální počet 3 cateringových čet.");
    return;
  }

  const cost = 70000;
  if (globalMoney < cost) {
    alert("Na najmutí cateringové čety potřebuješ 70 000 Kč.");
    return;
  }

  globalMoney -= cost;
  hiredCateringTeamsByStation[currentStationKey] = 1;
  unlockedCateringTeamsCount = Math.min(3, unlockedCateringTeamsCount + 1);
  saveGameState();
  render();
  renderShop();
}

function buyTrack() {
  if (!currentStationData || !currentStationKey) return;
  const level = Number((stationLevels[currentStationKey] || {}).lvl) || 0;
  if (level < 2) {
    alert("Další nástupiště se odemkne po dosažení Levelu 2.");
    return;
  }
  const costs = currentStationData.trackPurchaseCosts || [];
  const cost = Number(costs[unlockedTracksCount]);
  if (!Number.isFinite(cost) || unlockedTracksCount >= costs.length) {
    alert("Další nástupiště pro toto nádraží není v obchodě dostupné.");
    return;
  }
  if (globalMoney < cost) {
    alert("Na další nástupiště nemáš dost peněz.");
    return;
  }

  globalMoney -= cost;
  unlockedTracksCount += 1;
  unlockedTracksByStation[currentStationKey] = unlockedTracksCount;
  tracks.push(null);
  saveGameState();
  render();
  renderShop();
}

// ==========================================
// 🧱 KUS 7: RENDEROVÁNÍ UI (SEZNAMY, DETAILY A AKCE)
// ==========================================

// 📋 15. HLAVNÍ VYKRESLENÍ STATISTIK A SEZNAMU VLAKŮ
function render() {
  if (!currentStationData || !stationLevels[currentStationKey]) return;

  const myData = stationLevels[currentStationKey];
  const currentLvlConfig = currentStationData.levels[myData.lvl] || { xpNeeded: "Max" };

  ensureShopUI();
  document.getElementById("money").innerText = globalMoney;
  document.getElementById("station-name").innerText = currentStationData.name;
  const safeTrackCapacity = Number.isFinite(Number(unlockedTracksCount)) && Number(unlockedTracksCount) >= 1
    ? Math.floor(Number(unlockedTracksCount))
    : 1;
  const occupiedTracks = Array.isArray(tracks) ? tracks.filter(x => x !== null && x !== undefined).length : 0;
  document.getElementById("tracks-count").innerText = `${occupiedTracks}/${safeTrackCapacity}`;
  document.getElementById("level-info").innerText = `LVL ${myData.lvl} (${myData.xp}/${currentLvlConfig.xpNeeded} XP)`;

  let q = document.getElementById("queue");
  if (!q) return;
  q.innerHTML = "";

  // Levý sloupec je pracovní panel nádraží: zobrazujeme jen vlaky,
  // které právě čekají na vjezd/přidělení koleje nebo se fyzicky odbavují ve stanici.
  // Vlaky na cestě k cíli, u cíle a na cestě zpět se z panelu skryjí.
  const stationStates = new Set([
    "WAIT_ASSIGN",
    "COMING",
    "ARRIVED",
    "UNLOADING",
    "WAIT_CLEAN",
    "WAIT_CLEAN_TEAM",
    "CLEANING",
    "CATERING",
    "WAIT_CATERING",
    "WAIT_BOARD",
    "BOARDING",
    "READY_DEPART"
  ]);
  const visibleTrains = trains.filter(train => stationStates.has(train.state));
  if (selected && !visibleTrains.some(train => train.id === selected.id)) {
    selected = null;
  }
  const orderedTrains = visibleTrains
    .map((train, originalIndex) => ({ train, originalIndex }))
    .sort((a, b) => {
      const priorityDifference = (Number(b.train.queuePriority) || 0) - (Number(a.train.queuePriority) || 0);
      return priorityDifference || a.originalIndex - b.originalIndex;
    })
    .map(item => item.train);

  if (!orderedTrains.length) {
    q.innerHTML = '<div class="train-list-empty">Žádné vlaky aktuálně nečekají ani se neodbavují ve stanici.</div>';
    updateDetail();
    return;
  }

  orderedTrains.forEach(t => {
    let d = document.createElement("div");
    d.className = "train";
    if (selected && selected.id === t.id) d.className += " selected";

    let isSelected = selected && selected.id === t.id;
    let showDot = t.pendingAction && !isSelected;

    let statusText = t.state;
    if (t.state === "WAIT_ASSIGN") statusText = `${lang().waitClean.split(" ")[0]} [${t.current_turnaround}/${t.required_turnaround}] ⏳`; // Čeká [0/2]
    if (t.state === "COMING") statusText = `${lang().incoming} ${t.track} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "ARRIVED") statusText = lang().arrived;
    if (t.state === "UNLOADING") statusText = `${lang().unloading} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_CLEAN") statusText = lang().waitClean;
    if (t.state === "WAIT_CLEAN_TEAM") statusText = "Čeká na volný úklidový tým";
    if (t.state === "CLEANING") statusText = `${lang().cleaning} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "CATERING") statusText = `Doplňování cateringu (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_BOARD") statusText = lang().waitBoard;
    if (t.state === "BOARDING") statusText = `${lang().boarding} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "READY_DEPART") statusText = lang().readyDepart;
    if (t.state === "EN_ROUTE_THERE") statusText = lang().enRouteThere;
    if (t.state === "AT_DESTINATION") statusText = `${lang().atDestination} (${Math.max(0, Math.ceil(t.stayTimer))}s)`;
    if (t.state === "EN_ROUTE_BACK") statusText = lang().enRouteBack;

    const showLocalShopNotice = currentStationKey === "plzen"
      && (stationLevels.plzen?.lvl || 0) >= 1
      && Number(t.id) === 6;
    d.innerHTML = `
      ${showDot ? '<div class="dot"></div>' : ''}
      <b>${t.name}</b><br>
      <small>${statusText}</small>
    `;

    d.onclick = () => {
      selected = t;
      t.queuePriority = ++trainQueuePriority;
      updateDetail();
      render();
    };
    q.appendChild(d);
  });

  updateDetail();
}


// 🎯 16. DETAIL VYBRANÉHO VLAKU A PROGRESS BARY
function updateDetail() {
  if (!selected) {
    document.getElementById("name").innerText = "Vyber vlak";
    document.getElementById("state").innerText = "---";
    let img = document.getElementById("img");
    if (img) img.style.display = "none";
    document.getElementById("p1").style.width = "0%";
    document.getElementById("p2").style.width = "0%";
    document.getElementById("p3").style.width = "0%";
    document.getElementById("p4").style.width = "0%";
    document.getElementById("actions").innerHTML = "";
    return;
  }

  document.getElementById("name").innerText = selected.name;
  document.getElementById("state").innerText = selected.state;

  let img = document.getElementById("img");
  if (img && selected.image) {
    img.src = selected.image;
    img.style.display = "block";
    img.style.width = "100px";
  }

  // Výpočet procent pro animované progress bary
  let p1Width = (selected.progress && selected.progress.exit) ? selected.progress.exit : 0;
  let p2Width = (selected.progress && selected.progress.clean) ? selected.progress.clean : 0;
  let p3Width = (selected.progress && selected.progress.catering) ? selected.progress.catering : 0;
  let p4Width = (selected.progress && selected.progress.board) ? selected.progress.board : 0;

  document.getElementById("p1").style.width = p1Width + "%";
  document.getElementById("p2").style.width = p2Width + "%";
  document.getElementById("p3").style.width = p3Width + "%";
  document.getElementById("p4").style.width = p4Width + "%";

  renderActions();
}

// ⚙️ 17. GENERATOR TLAČÍTEK AKCÍ PODLE STAVU VLAKU
function renderActions() {
  let a = document.getElementById("actions");
  if (!a) return;
  a.innerHTML = "";
  if (!selected) return;

  if (selected.state === "WAIT_ASSIGN") {
    let htmlButtons = `<h5>${lang().assignTrack}</h5>`;
    for (let i = 0; i < unlockedTracksCount; i++) {
      if (tracks[i] !== null) {
        htmlButtons += `<button class="r" style="opacity: 0.4; cursor: not-allowed;" disabled>Kolej ${i+1} (${lang().occupied})</button>`;
      } else {
        htmlButtons += `<button class="g" onclick="assignTrack(${i})">Kolej ${i+1}</button>`;
      }
    }
    a.innerHTML = htmlButtons;
  } 
  else if (selected.state === "COMING") {
    a.innerHTML = `<em>${lang().incoming} ${selected.track}... (${Math.max(0, Math.ceil(selected.timer))}s)</em>`;
  } else if (selected.state === "ARRIVED") {
    a.innerHTML = `<button class="g" onclick="startTimer('exit')">${lang().btnUnload}</button>`;
  } else if (selected.state === "UNLOADING" || selected.state === "CLEANING" || selected.state === "CATERING" || selected.state === "BOARDING") {
    a.innerHTML = `<em>${lang().working}</em>`;
  } else if (selected.state === "WAIT_CATERING") {
    a.innerHTML = `<p>Cateringové čety: ${cateringTeamsInUse}/${unlockedCateringTeamsCount} obsazeno</p>` +
      (selected.hasCateringTeam
        ? `<em>Catering už probíhá.</em>`
        : cateringTeamsInUse < unlockedCateringTeamsCount
          ? `<button class="y" onclick="startTimer('catering')">Zahájit catering</button>`
          : `<em>Všechny cateringové čety jsou obsazené. Počkej na uvolnění čety.</em>`);
  } else if (selected.state === "WAIT_CLEAN") {
    a.innerHTML = `<p>Úklidové týmy: ${cleaningTeamsInUse}/${unlockedCleaningTeamsCount} obsazeno</p><button class="y" onclick="startTimer('clean')">${lang().btnClean}</button>`;
  } else if (selected.state === "WAIT_CLEAN_TEAM") {
    a.innerHTML = `<p>Úklidové týmy: ${cleaningTeamsInUse}/${unlockedCleaningTeamsCount} obsazeno</p>` +
      (cleaningTeamsInUse < unlockedCleaningTeamsCount
        ? `<button class="y" onclick="startTimer('clean')">Zahájit úklid</button>`
        : `<em>Čeká na uvolnění týmu. Potom si vybereš vlak sám.</em>`);
  } else if (selected.state === "WAIT_BOARD") {
    a.innerHTML = `<button class="b" onclick="startTimer('board')">${lang().btnBoard}</button>`;
  } else if (selected.state === "READY_DEPART") {
    a.innerHTML = `<button class="r" onclick="depart()">${lang().btnDepart}</button>`;
  } else {
    a.innerHTML = `<em>${lang().onRoute}</em>`;
  }
}


// ==========================================
// 💾 KUS 1: POKROČILÉ UKLÁDÁNÍ A NAČÍTÁNÍ
// ==========================================

// 1. Vylepšená funkce pro uložení hry (Pamatuje si i vlaky a jejich kontrakty)
function serializeCurrentStationTrains() {
  return trains.map(t => ({
    id: t.id,
    state: ["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(t.state) ? t.state : "WAIT_ASSIGN",
    tripStartedAt: t.tripStartedAt || null,
    current_turnaround: t.current_turnaround,
    required_turnaround: t.required_turnaround,
    routeKey: t.routeKey,
    routeSequence: Array.isArray(t.routeSequence) ? t.routeSequence.slice() : null,
    routeSequenceIndex: t.routeSequenceIndex || 0,
    nextRouteKey: t.nextRouteKey || null,
    distance: Number(t.distance) || 0,
    stayTimer: Number(t.stayTimer) || 0,
    returnCountdownSeconds: Number.isFinite(Number(t.returnCountdownSeconds)) ? Number(t.returnCountdownSeconds) : null,
    pendingAction: false
  }));
}

function saveGameState() {
  // Aktuální vlaky ukládáme jen pod klíčem aktuálního nádraží.
  if (currentStationKey) savedTrainsByStation[currentStationKey] = serializeCurrentStationTrains();

  const saveContainer = {
    saveVersion: 5,
    globalMoney: globalMoney,
    unlockedStations: GLOBAL_PLAYER_DATA.unlockedStations,
    stationLevels: stationLevels,
    ownedPerformancesByStation: ownedPerformancesByStation,
    unlockedTracksByStation: unlockedTracksByStation,
    hiredCleaningTeamsByStation: hiredCleaningTeamsByStation,
    hiredCateringTeamsByStation: hiredCateringTeamsByStation,
    savedTrainsByStation: savedTrainsByStation,
    savedAt: Date.now()
  };

  localStorage.setItem('trainOps_save', JSON.stringify(saveContainer));
  console.log("💾 Hra a oddělený stav jednotlivých nádraží byly uloženy!");
}

// 2. Vylepšená funkce pro načtení hry při startu
function loadGameState() {
  const savedData = localStorage.getItem('trainOps_save');
  
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      
      const savedMoney = Number(parsed.globalMoney);
      globalMoney = Number.isFinite(savedMoney) && savedMoney >= 0 ? savedMoney : 100;
      GLOBAL_PLAYER_DATA.unlockedStations = Array.isArray(parsed.unlockedStations)
        ? parsed.unlockedStations.filter(key => typeof key === "string")
        : ["plzen"];

      // Ověříme uložené levely; neplatné hodnoty opravíme při načtení konkrétní stanice.
      stationLevels = parsed.stationLevels && typeof parsed.stationLevels === "object" && !Array.isArray(parsed.stationLevels)
        ? parsed.stationLevels
        : {};
      ownedPerformancesByStation = parsed.ownedPerformancesByStation &&
        typeof parsed.ownedPerformancesByStation === "object" && !Array.isArray(parsed.ownedPerformancesByStation)
        ? parsed.ownedPerformancesByStation
        : {};
      unlockedTracksByStation = parsed.unlockedTracksByStation &&
        typeof parsed.unlockedTracksByStation === "object" && !Array.isArray(parsed.unlockedTracksByStation)
        ? parsed.unlockedTracksByStation
        : {};
      hiredCleaningTeamsByStation = parsed.hiredCleaningTeamsByStation &&
        typeof parsed.hiredCleaningTeamsByStation === "object" && !Array.isArray(parsed.hiredCleaningTeamsByStation)
        ? parsed.hiredCleaningTeamsByStation
        : {};
      hiredCateringTeamsByStation = parsed.hiredCateringTeamsByStation &&
        typeof parsed.hiredCateringTeamsByStation === "object" && !Array.isArray(parsed.hiredCateringTeamsByStation)
        ? parsed.hiredCateringTeamsByStation
        : {};

      savedTrainsByStation = parsed.savedTrainsByStation &&
        typeof parsed.savedTrainsByStation === "object" && !Array.isArray(parsed.savedTrainsByStation)
        ? parsed.savedTrainsByStation
        : {};
      // Starší save měl jen parsed.savedTrains bez identifikace nádraží.
      // Záměrně je nepřiřazujeme automaticky, aby se vlak nedostal do cizího shopu.
      
      console.log("📂 Uložená data kompletně načtena z paměti!");
    } catch (e) {
      console.error("❌ Chyba při čtení uložené hry:", e);
    }
  }
}


// Funkce pro kompletní smazání postupu a restart hry
function resetGameState() {
  if (confirm("⚠️ POZOR! Opravdu chceš smazat veškerý postup, peníze, levely i vlaky a začít úplně od nuly?")) {
    // 1. Vymažeme komplet data z paměti prohlížeče
    localStorage.removeItem('trainOps_save');
    
    // 2. Smažeme markery jedoucích vlaků, aby nezůstaly viset na mapě
    trains.forEach(t => { if (t.marker) map.removeLayer(t.marker); });
    
    // 3. Tvrdý reload celé stránky do čistého stavu
    window.location.reload();
  }
}


// Obnoví pouze jednu hráčem spuštěnou otočku. Nikdy nedopočítává další jízdy.
function restoreOfflineTrips(stationKey) {
  const now = Date.now();
  let changed = false;
  for (const t of trains) {
    if (!["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(t.state)) continue;
    const route = currentStationData && currentStationData.routes && currentStationData.routes[t.routeKey];
    const speed = Number(t.speed);
    const length = Number(route && route.totalLength);
    const startedAt = Number(t.tripStartedAt);
    if (!route || !Number.isFinite(length) || length <= 0 || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(startedAt) || startedAt <= 0) {
      // Starý/neúplný save: bezpečně vrátit do fronty bez odměny.
      t.state = "WAIT_ASSIGN";
      t.distance = 0;
      t.returnCountdownSeconds = null;
      t.tripStartedAt = null;
      t.nextRouteKey = null;
      changed = true;
      continue;
    }

    const elapsed = Math.max(0, Math.min((now - startedAt) / 1000, 7 * 24 * 60 * 60));
    const oneTurnDuration = (length / speed) * 2 + Math.max(0, Number(t.stayTime) || 0);
    if (elapsed >= oneTurnDuration) {
      // Označit před vyplacením, aby opakované načtení nemohlo vyplatit tutéž otočku znovu.
      t.state = "WAIT_ASSIGN";
      t.distance = 0;
      t.returnCountdownSeconds = null;
      t.tripStartedAt = null;
      t.stayTimer = 0;
      t.pendingAction = true;
      if (t.marker) { map.removeLayer(t.marker); t.marker = null; }
      processTrainReturn(t); // přesně jedna dokončená otočka, bez automatického dalšího odjezdu
      changed = true;
      continue;
    }

    const outboundSeconds = length / speed;
    const staySeconds = Math.max(0, Number(t.stayTime) || 0);
    if (elapsed < outboundSeconds) {
      t.state = "EN_ROUTE_THERE";
      t.distance = Math.min(length, elapsed * speed);
    } else if (elapsed < outboundSeconds + staySeconds) {
      t.state = "AT_DESTINATION";
      t.distance = length;
      t.stayTimer = Math.max(0, staySeconds - (elapsed - outboundSeconds));
    } else {
      t.state = "EN_ROUTE_BACK";
      t.distance = Math.max(0, length - (elapsed - outboundSeconds - staySeconds) * speed);
    }
    t.returnCountdownSeconds = Math.max(0, oneTurnDuration - elapsed);
    if (!t.marker) {
      t.marker = L.marker(route[0], {
        icon: L.divIcon({
          html: `<img src="${t.image}" class="train-map-image">`,
          className: "train-div-icon",
          iconSize: [80, 80],
          iconAnchor: [40, 40]
        })
      }).addTo(map);
      t.marker.bindPopup(() => getTrainPopupHtml(t), { className: "train-info-popup" });
      t.marker.on("click", () => { selected = t; updateDetail(); render(); });
    }
    updateTrainMarker(t, route, t.distance, t.state === "EN_ROUTE_BACK");
    changed = true;
  }
  if (changed) {
    console.info("Offline jízdy obnoveny; nejvýše jedna otočka na každý vlak.");
    saveGameState();
  }
}

// ==========================================
// 🧱 KUS 8: HERNÍ LOOP A FINÁLNÍ SPUŠTĚNÍ
// ==========================================

// 🔁 18. SPOLEČNÝ REÁLNÝ HERNÍ LOOP (Srdce enginu)
let lastTime = performance.now();

function gameLoop(now) {
  // Pokud ještě není načtené žádné nádraží, loop jen čeká a neběží naprázdno
  if (!currentStationData) {
    requestAnimationFrame(gameLoop);
    return;
  }

  const dt = (now - lastTime) / 1000;
  lastTime = now;

  trains.forEach(t => {
    const route = currentStationData.routes[t.routeKey];

    // Odpočet otočky běží od okamžiku stisku ODJEZD až do návratu do výchozí stanice.
    if (["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(t.state) &&
        Number.isFinite(Number(t.returnCountdownSeconds))) {
      t.returnCountdownSeconds = Math.max(0, Number(t.returnCountdownSeconds) - dt);
    }

// 🟢 TUTO PODMÍNKU SEM VLOŽ JAKO PRVNÍ:
    // ⏳ PROGRESS: PŘÍJEZD VLAKU NA URČENOU KOLEJ
    if (t.state === "COMING" && t.timer != null) {
      t.timer -= dt;
      if (t.timer <= 0) {
        t.state = "ARRIVED";    // Vlak fyzicky dorazil k nástupišti
        t.pendingAction = true;  // Rozsvítí se upozornění pro Vyložení
      }
    }

    // 🚂 JÍZDA TAM (Z Plzně do cíle)
    if (t.state === "EN_ROUTE_THERE") {
      t.distance += t.speed * dt;
      if (t.distance < route.totalLength) {
        updateTrainMarker(t, route, t.distance, false);
      } else {
        t.distance = route.totalLength;
        t.state = "AT_DESTINATION";
        t.stayTimer = t.stayTime;
      }
    }

    // 🏢 POBYT VE STANICI (Otočka na konečné v cíli)
    if (t.state === "AT_DESTINATION") {
      t.stayTimer -= dt;
      if (t.stayTimer <= 0) {
        t.state = "EN_ROUTE_BACK";
        t.distance = route.totalLength; 
      }
    }

    // ⏳ PROGRESS BAR: VYKLÁDÁNÍ NA NÁDRAŽÍ
    if (t.state === "UNLOADING" && t.timer != null) {
      t.timer -= dt;
      t.progress.exit = (1 - t.timer / t.timers.exit) * 100;
      if (t.timer <= 0) {
        t.state = "WAIT_CLEAN";
        t.pendingAction = true;
      }
    }

    // 🧽 PROGRESS BAR: ÚKLID SOUPRAVY
    if (t.state === "CLEANING" && t.timer != null) {
      t.timer -= dt;
      const cleanDuration = Math.max(1, Number(t.timers && t.timers.clean) || 1);
      t.progress.clean = Math.max(0, Math.min(100, (1 - t.timer / cleanDuration) * 100));
      if (t.timer <= 0) {
        t.timer = 0;
        const template = currentStationData.trainsPool && currentStationData.trainsPool[t.id];
        if (template && template.cateringRequired) {
          // Catering spouští hráč ručně tlačítkem, stejně jako ostatní odbavovací kroky.
          t.state = "WAIT_CATERING";
          t.timer = 0;
          t.progress.catering = 0;
          t.pendingAction = true;
        } else {
          t.state = "WAIT_BOARD";
          t.pendingAction = true;
        }
        if (t.hasCleaningTeam) {
          t.hasCleaningTeam = false;
          cleaningTeamsInUse = Math.max(0, cleaningTeamsInUse - 1);
        }
        // Další vlak se nikdy nespouští automaticky; hráč musí kliknout.
        render();
      }
    }

    // 🥪 PROGRESS BAR: DOPLNĚNÍ CATERINGU (mezi úklidem a nástupem)
    if (t.state === "CATERING" && t.timer != null) {
      t.timer -= dt;
      const cateringDuration = Math.max(1, Number(t.timers && t.timers.catering) || 10);
      t.progress.catering = Math.max(0, Math.min(100, (1 - t.timer / cateringDuration) * 100));
      if (t.timer <= 0) {
        t.timer = 0;
        t.progress.catering = 100;
        t.state = "WAIT_BOARD";
        t.pendingAction = true;
        if (t.hasCateringTeam) {
          t.hasCateringTeam = false;
          cateringTeamsInUse = Math.max(0, cateringTeamsInUse - 1);
        }
        render();
      }
    }

    // 🚉 PROGRESS BAR: NÁSTUP CESTUJÍCÍCH
    if (t.state === "BOARDING" && t.timer != null) {
      t.timer -= dt;
      t.progress.board = (1 - t.timer / t.timers.board) * 100;
      if (t.timer <= 0) {
        t.state = "READY_DEPART";
        t.pendingAction = true;
      }
    }

    // 🚂 JÍZDA ZPĚT (Obrácené pořadí, bod po bodu na hlavní nádraží)
    if (t.state === "EN_ROUTE_BACK") {
      t.distance -= t.speed * dt;
      if (t.distance > 0) {
        updateTrainMarker(t, route, t.distance, true);
      } else {
        // Vlak úspěšně dorazil zpět na výchozí nádraží
        if (t.marker) {
          map.removeLayer(t.marker);
          t.marker = null;
        }
        t.distance = 0;
        processTrainReturn(t); // Spustí WoA kontrolu kontraktu a otoček
      }
    }
  });

  render();
  requestAnimationFrame(gameLoop);
}

initDepartureBoard();

// 🚀 19. SPOUŠTĚČ SMYČKY
// Oficiální nastartování celého herního loopu
requestAnimationFrame(gameLoop);

// 🟢 TADY PŘIDÁME FUNKCI PRO NAČTENÍ:
loadGameState(); 

// Spuštění první stanice (Plzeň si teď vezme data z načteného savu)
loadStation("plzen");


