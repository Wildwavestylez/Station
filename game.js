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

let globalMoney = 100;          // Pokladna právě aktivního nádraží
let premiumCoins = 1;            // Globální premium coiny sdílené mezi všemi nádražími
let speedUpTutorialBubbleShown = false;
let stationMoneyByStation = {}; // Samostatná kasa každého nádraží
let currentStationKey = null;   // ID aktuálního nádraží (např. "plzen")
let currentStationData = null;  // Celý objekt dat aktivního nádraží
let stationLevels = {};         // Úrovně jednotlivých měst, např: { plzen: { lvl: 0, xp: 0 } }
// Jednotné ovládání tlačítek myší i dotykem. Po pointerup potlačíme
// navazující syntetický click, aby se akce na iOS nespustila dvakrát.
function bindTap(element, handler) {
  if (!element || element.dataset.tapBound === "1") return;
  element.dataset.tapBound = "1";
  let lastPointerActivation = 0;
  element.addEventListener("pointerup", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    lastPointerActivation = Date.now();
    if (event.pointerType !== "mouse") event.preventDefault();
    handler(event);
  });
  element.addEventListener("click", event => {
    if (Date.now() - lastPointerActivation < 800) return;
    handler(event);
  });
}

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
  return window.LANGUAGES[currentLanguage] || window.LANGUAGES.cs;
}

function setLanguage(language) {
  if (!window.LANGUAGES[language] || language === currentLanguage) return;
  currentLanguage = language;
  localStorage.setItem("trainOps_lang", language);
  document.documentElement.lang = language;
  renderLanguageControls();
  renderWelcomePopupText();
  renderDepartureBoardStaticLabels();
  renderSidebar();
  render();
  if (departureBoardOpen) renderDepartureBoard();
  if (shopOpen && typeof renderStationShop === "function") renderStationShop();
}

function renderLanguageControls() {
  document.querySelectorAll("[data-language]").forEach(button => {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const setText = (id, key) => { const el = document.getElementById(id); if (el && lang()[key]) el.textContent = lang()[key]; };
  setText("sidebar-title", "sidebarTitle");
  setText("station-shop-label", "stationShop");
  setText("station-shop-description", "stationShopDescription");
  setText("my-stations-label", "myStations");
  setText("reset-game-label", "resetGame");
  setText("speed-up-tutorial-title", "speedUpTutorialTitle");
  setText("speed-up-tutorial-body", "speedUpTutorialBody");
  setText("speed-up-tutorial-button", "speedUpTutorialButton");
  setText("first-contract-tutorial-title", "firstContractTutorialTitle");
  setText("first-contract-tutorial-body", "firstContractTutorialBody");
  setText("first-contract-tutorial-button", "firstContractTutorialButton");
  renderTwoLinesTutorialText();
  const premiumCoinsLabel = document.getElementById("premium-coins-label");
  if (premiumCoinsLabel) premiumCoinsLabel.textContent = lang().premiumCoinsLabel || "Coins";
  const tracksLabel = document.getElementById("tracks-label");
  if (tracksLabel) tracksLabel.textContent = lang().tracksLabel + ":";
}

function initLanguageControls() {
  document.querySelectorAll("[data-language]").forEach(button => {
    bindTap(button, () => setLanguage(button.dataset.language));
  });
  document.documentElement.lang = currentLanguage;
  renderLanguageControls();
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
  if (totalMinutes < 1) return lang().etaLessThan + " 1 " + lang().etaMinute;
  return lang().etaPrefix + " " + totalMinutes + " " + lang().etaMinute;
}

function escapeBoardText(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderDepartureBoardStaticLabels() {
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };
  setText(".departure-board-button-label", lang().departureBoard);
  setText(".departure-board-kicker", lang().departureBoardKicker);
  setText(".departure-board-clock-label", lang().localTime);
  setText(".departure-board-legend-label", lang().liveServices);
  setText(".departure-board-time-header", lang().boardTime);
  setText(".departure-board-destination-header", lang().boardDestination);
  setText(".departure-board-operator-header", lang().boardOperator);
  setText(".departure-board-empty", lang().boardLoading);
  setText(".departure-board-footer-label", lang().boardFooter);
}
function renderDepartureBoard() {
  if (!departureBoardOpen) return;
  const rows = document.getElementById("departure-board-rows");
  const title = document.getElementById("departure-board-title");
  const clock = document.getElementById("departure-board-clock");
  const count = document.getElementById("departure-board-count");
  if (!rows || !currentStationData) return;

  if (title) title.textContent = lang().departureTitle + " · " + currentStationData.name;
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
  if (count) count.textContent = activeTrains.length + (activeTrains.length === 1 ? " " + lang().trainCountOne : " " + (activeTrains.length >= 2 && activeTrains.length <= 4 ? lang().trainCountFew : lang().trainCountMany));

  if (!activeTrains.length) {
    rows.innerHTML = '<tr><td colspan="3" class="departure-board-empty">' + escapeBoardText(lang().noActiveTrains) + '</td></tr>';
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
      bezdruzice: "Bezdružice",
      horazdovicePredm: "Horažďovice předměstí",
      klatovy: "Klatovy",
      zeleznaRuda: "Železná Ruda-Alžbětín",
      ceskeBudejovice: "České Budějovice",
      cheb: "Cheb",
      karlovyVary: "Karlovy Vary",
      bavariaExpress: "München Hbf",
      brno: "Brno hlavní nádraží",
      pendolinoOstrava: "Ostrava hl.n.",
      pendolinoCheb: "Cheb",
      railjetFrantiskovy: "Františkovy Lázně",
      railjetBohumin: "Bohumín",
      plattling: "Plattling",
      bayerischEisenstein: "Bayerisch Eisenstein"
    };
    const boardRouteKey = isDepartureBoardTrain(t) && t.nextRouteKey ? t.nextRouteKey : t.routeKey;
    const destination = template.routeSequence
      ? (destinations[boardRouteKey] || lang().unknownDestination)
      : (template.boardDestination || destinations[t.routeKey] || template.destination || lang().unknownDestination);
    const lineCode = String(template.lineCode || "").trim();
    const displayDestination = (lineCode ? lineCode + " " : "") + destination;
    const operator = template.operator || lang().unknownOperator;
    return '<tr class="' + (selected && selected.id === t.id ? "is-selected" : "") + '">' +
      '<td class="departure-time-cell">' + escapeBoardText(departureTimeLabel(t)) + '</td>' +
      '<td><strong>' + escapeBoardText(displayDestination) + '</strong></td>' +
      '<td>' + escapeBoardText(operator) + '</td>' +
      '</tr>';
  }).join("");

  rows.querySelectorAll("[data-train-id]").forEach(button => {
    bindTap(button, () => {
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
  renderDepartureBoardStaticLabels();
  const button = document.getElementById("departure-board-button");
  const close = document.getElementById("departure-board-close");
  const modal = document.getElementById("departure-board-modal");
  if (button) bindTap(button, () => {
    if (trainCardTutorialActive && trainCardTutorialStep === "departureBoardButton") {
      openDepartureBoard();
      trainCardTutorialStep = "departureBoard";
      renderTrainCardTutorialText();
      const tutorial = document.getElementById("train-card-tutorial");
      if (tutorial) { tutorial.classList.add("open"); tutorial.setAttribute("aria-hidden", "false"); }
      return;
    }
    openDepartureBoard();
  });
  if (close) bindTap(close, closeDepartureBoard);
  if (modal) {
    modal.querySelectorAll("[data-close-departures]").forEach(el => bindTap(el, closeDepartureBoard));
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && departureBoardOpen) closeDepartureBoard();
  });
}

// 👋 Úvodní popup: jazyk vždy vychází z aktuálního nastavení hry.
const WELCOME_SEEN_KEY = "station_zwiesel_welcome_seen_v1";
const FIRST_CONTRACT_TUTORIAL_KEY = "station_zwiesel_first_contract_tutorial_v2";
function renderFirstContractTutorialText() {
  const copy = lang();
  const title = document.getElementById("first-contract-tutorial-title");
  const body = document.getElementById("first-contract-tutorial-body");
  const button = document.getElementById("first-contract-tutorial-button");
  if (title) title.textContent = copy.firstContractTutorialTitle || "";
  if (body) body.textContent = copy.firstContractTutorialBody || "";
  if (button) button.textContent = copy.firstContractTutorialButton || "";
}
function showFirstContractTutorial() {
  if (currentStationKey !== "zwiesel" || localStorage.getItem(FIRST_CONTRACT_TUTORIAL_KEY) === "1") return;
  const modal = document.getElementById("first-contract-tutorial");
  if (!modal) return;
  renderFirstContractTutorialText();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
function closeFirstContractTutorial() {
  const modal = document.getElementById("first-contract-tutorial");
  if (!modal) return;
  localStorage.setItem(FIRST_CONTRACT_TUTORIAL_KEY, "1");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.add("open");
  const shopButton = document.getElementById("station-shop-button");
  if (shopButton) shopButton.classList.add("tutorial-highlight");
}
function initFirstContractTutorial() {
  const button = document.getElementById("first-contract-tutorial-button");
  if (button) bindTap(button, closeFirstContractTutorial);
}
function renderWelcomePopupText() {
  const title = document.getElementById("welcome-title");
  const body = document.getElementById("welcome-body");
  const start = document.getElementById("welcome-start");
  if (title) title.textContent = lang().welcomeTitle || "";
  if (body) body.textContent = lang().welcomeBody || "";
  if (start) start.textContent = lang().welcomeStart || "";
}
function showWelcomePopup() {
  const modal = document.getElementById("welcome-modal");
  if (!modal || currentStationKey !== "zwiesel" || localStorage.getItem(WELCOME_SEEN_KEY) === "1") return;
  renderWelcomePopupText();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
function closeWelcomePopup() {
  const modal = document.getElementById("welcome-modal");
  if (!modal || !modal.classList.contains("open")) return;
  localStorage.setItem(WELCOME_SEEN_KEY, "1");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  // Další krok spustíme až po zavření úvodního okna.
  requestAnimationFrame(() => showTrainCardTutorial());
}
function initWelcomePopup() {
  renderWelcomePopupText();
  const start = document.getElementById("welcome-start");
  if (start && !start.dataset.bound) {
    start.dataset.bound = "1";
    // Pointer událost funguje spolehlivěji na dotykových Safari než samotný click.
    bindTap(start, closeWelcomePopup);
  }
  document.addEventListener("keydown", event => {
    const modal = document.getElementById("welcome-modal");
    if (event.key === "Escape" && modal && modal.classList.contains("open")) closeWelcomePopup();
  });
}

const TRAIN_CARD_TUTORIAL_KEY = "station_zwiesel_train_card_tutorial_v1";
let trainCardTutorialActive = false;
let trainCardTutorialStep = "card";
function renderTrainCardTutorialText() {
  const title = document.getElementById("train-card-tutorial-title");
  const body = document.getElementById("train-card-tutorial-body");
  const modal = document.getElementById("train-card-tutorial");
  const isTrackStep = trainCardTutorialStep === "track";
  const isComingStep = trainCardTutorialStep === "coming";
  const isUnloadStep = trainCardTutorialStep === "unload";
  const isCleanStep = trainCardTutorialStep === "clean";
  const isBoardStep = trainCardTutorialStep === "board";
  const isDepartStep = trainCardTutorialStep === "depart";
  const isMapStep = trainCardTutorialStep === "map";
  const isTrainInfoStep = trainCardTutorialStep === "trainInfo";
  const isDepartureBoardStep = trainCardTutorialStep === "departureBoard";
  const isDepartureBoardButtonStep = trainCardTutorialStep === "departureBoardButton";
  const isMenuButtonStep = trainCardTutorialStep === "menuButton";
  const isMenuOpenStep = trainCardTutorialStep === "menuOpen";
  if (modal) {
    modal.classList.toggle("track-step", isTrackStep);
    modal.classList.toggle("coming-step", isComingStep);
    modal.classList.toggle("unload-step", isUnloadStep);
    modal.classList.toggle("clean-step", isCleanStep);
    modal.classList.toggle("board-step", isBoardStep);
    modal.classList.toggle("depart-step", isDepartStep);
    modal.classList.toggle("map-step", isMapStep);
    modal.classList.toggle("train-info-step", isTrainInfoStep);
    modal.classList.toggle("departure-board-step", isDepartureBoardStep);
    modal.classList.toggle("departure-board-button-step", isDepartureBoardButtonStep);
    modal.classList.toggle("menu-button-step", isMenuButtonStep);
    modal.classList.toggle("menu-open-step", isMenuOpenStep);
    const boardButton = document.getElementById("departure-board-button");
    if (boardButton) boardButton.classList.toggle("departure-board-tutorial-target", isDepartureBoardButtonStep);
    const menuButton = document.getElementById("menu-btn");
    if (menuButton) menuButton.classList.toggle("menu-tutorial-target", isMenuButtonStep);
  }
  if (title) title.textContent = isTrackStep
    ? (lang().trackTutorialTitle || "")
    : isComingStep ? (lang().comingTutorialTitle || "")
    : isUnloadStep ? (lang().unloadTutorialTitle || "")
    : isCleanStep ? (lang().cleanTutorialTitle || "")
    : isBoardStep ? (lang().boardTutorialTitle || "")
    : isDepartStep ? (lang().departTutorialTitle || "")
    : isMapStep ? (lang().mapTutorialTitle || "")
    : isTrainInfoStep ? (lang().trainInfoTutorialTitle || "")
    : (isDepartureBoardStep || isDepartureBoardButtonStep) ? (lang().departureBoardTutorialTitle || "")
    : (isMenuButtonStep || isMenuOpenStep) ? (lang().menuTutorialTitle || "Hlavní menu")
    : (lang().trainCardTutorialTitle || "");
  if (body) body.textContent = isTrackStep
    ? (lang().trackTutorialBody || "")
    : isComingStep ? (lang().comingTutorialBody || "")
    : isUnloadStep ? (lang().unloadTutorialBody || "")
    : isCleanStep ? (lang().cleanTutorialBody || "")
    : isBoardStep ? (lang().boardTutorialBody || "")
    : isDepartStep ? (lang().departTutorialBody || "")
    : isMapStep ? (lang().mapTutorialBody || "")
    : isTrainInfoStep ? (lang().trainInfoTutorialBody || "")
    : isDepartureBoardButtonStep ? (lang().departureBoardButtonTutorialBody || "")
    : isDepartureBoardStep ? (lang().departureBoardTutorialBody || "")
    : isMenuButtonStep ? (lang().menuButtonTutorialBody || "")
    : isMenuOpenStep ? (lang().menuOpenTutorialBody || "")
    : (lang().trainCardTutorialBody || "");
  const nextButton = document.getElementById("train-card-tutorial-next");
  if (nextButton) {
    nextButton.textContent = isTrainInfoStep ? (lang().tutorialNext || "Rozumím, jdeme dál") : (lang().tutorialFinish || "Fajn, díky!");
    nextButton.hidden = !(isTrainInfoStep || isDepartureBoardStep || isMenuOpenStep);
  }
}
function showTrainCardTutorial() {
  const modal = document.getElementById("train-card-tutorial");
  if (!modal || currentStationKey !== "zwiesel") return;
  if (localStorage.getItem(TRAIN_CARD_TUTORIAL_KEY) === "1") return;
  const welcome = document.getElementById("welcome-modal");
  if (welcome && welcome.classList.contains("open")) return;
  if (!trains.some(train => train.state === "WAIT_ASSIGN")) return;
  trainCardTutorialActive = true;
  renderTrainCardTutorialText();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  render();
}
function showSpeedUpTutorialBubble() {
  if (currentStationKey !== "zwiesel" || speedUpTutorialBubbleShown || premiumCoins < 1) return;
  const bubble = document.getElementById("speed-up-tutorial-bubble");
  if (!bubble) return;
  bubble.classList.add("open");
  bubble.setAttribute("aria-hidden", "false");
  speedUpTutorialBubbleShown = true;
  saveGameState();
}
function closeSpeedUpTutorialBubble() {
  const bubble = document.getElementById("speed-up-tutorial-bubble");
  if (!bubble) return;
  bubble.classList.remove("open");
  bubble.setAttribute("aria-hidden", "true");
}
function activateZwieselBodenmaisSpeedBoost() {
  if (currentStationKey !== "zwiesel") return false;
  if (premiumCoins < 1) {
    alert("Nemáš žádný coin. Tenhle bonus už teď aktivovat nejde.");
    return false;
  }
  const train = trains.find(t => Number(t.id) === 1 && t.routeKey === "bodenmais");
  if (!train || !["EN_ROUTE_THERE", "AT_DESTINATION", "EN_ROUTE_BACK"].includes(train.state)) {
    alert("Bonus je určený pro první vlak Waldbahn na lince Zwiesel–Bodenmais. Počkej, až bude na této lince na cestě.");
    return false;
  }
  if (train.speedUpBonusActive) {
    closeSpeedUpTutorialBubble();
    return false;
  }
  premiumCoins -= 1;
  train.speedUpOriginalSpeed = Number(train.speed) || 80;
  train.speed = 300;
  train.speedUpBonusActive = true;
  const route = currentStationData.routes.bodenmais;
  const routeLength = Number(route && route.totalLength);
  if (Number.isFinite(routeLength) && routeLength > 0) {
    const outbound = train.state === "EN_ROUTE_THERE" ? Math.max(0, routeLength - (Number(train.distance) || 0)) / train.speed : 0;
    const destinationStay = train.state === "AT_DESTINATION" ? Math.max(0, Number(train.stayTimer) || 0) : 0;
    const returnDistance = train.state === "EN_ROUTE_BACK" ? Math.max(0, Number(train.distance) || 0) : routeLength;
    train.returnCountdownSeconds = outbound + destinationStay + returnDistance / train.speed;
  }
  closeSpeedUpTutorialBubble();
  saveGameState();
  render();
  return true;
}
function initSpeedUpTutorialBubble() {
  const button = document.getElementById("speed-up-tutorial-button");
  if (button && !button.dataset.bound) {
    button.dataset.bound = "1";
    bindTap(button, activateZwieselBodenmaisSpeedBoost);
  }
}
function finishTrainCardTutorial() {
  const modal = document.getElementById("train-card-tutorial");
  trainCardTutorialActive = false;
  trainCardTutorialStep = "card";
  localStorage.setItem(TRAIN_CARD_TUTORIAL_KEY, "1");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  render();
  showSpeedUpTutorialBubble();
}
function initTrainCardTutorial() {
  const nextButton = document.getElementById("train-card-tutorial-next");
  if (nextButton && !nextButton.dataset.bound) {
    nextButton.dataset.bound = "1";
    bindTap(nextButton, () => {
      if (!trainCardTutorialActive) return;
      if (trainCardTutorialStep === "trainInfo") {
        if (typeof map !== "undefined" && map && typeof map.closePopup === "function") map.closePopup();
        trainCardTutorialStep = "departureBoardButton";
        renderTrainCardTutorialText();
        const modal = document.getElementById("train-card-tutorial");
        if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
      } else if (trainCardTutorialStep === "departureBoard") {
        closeDepartureBoard();
        trainCardTutorialStep = "menuButton";
        renderTrainCardTutorialText();
        const modal = document.getElementById("train-card-tutorial");
        if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
      } else if (trainCardTutorialStep === "menuOpen") {
        toggleSidebar();
        finishTrainCardTutorial();
      }
    });
  }
  renderTrainCardTutorialText();
  const welcome = document.getElementById("welcome-modal");
  if (!welcome || !welcome.classList.contains("open")) showTrainCardTutorial();
}

// 🍔 3. FUNKCE PRO VYSUNUTÍ / ZASUNUTÍ BOČNÍHO MENU
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("open");
  if (trainCardTutorialActive && trainCardTutorialStep === "menuButton" && sidebar.classList.contains("open")) {
    trainCardTutorialStep = "menuOpen";
    renderTrainCardTutorialText();
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) { tutorial.classList.add("open"); tutorial.setAttribute("aria-hidden", "false"); }
  }
}

// Hlavní navigační tlačítka používají stejnou pointer/click obsluhu jako odjezdová tabule.
function initPrimaryNavigationControls() {
  const menuButton = document.getElementById("menu-btn");
  const closeButton = document.querySelector("#sidebar .close-btn");
  const resetButton = document.getElementById("reset-btn");
  if (menuButton) bindTap(menuButton, toggleSidebar);
  if (closeButton) bindTap(closeButton, toggleSidebar);
  if (resetButton) bindTap(resetButton, resetGameState);
}

// Karty vlaků se během herní smyčky překreslují. Výběr proto obsluhujeme
// stabilně na documentu a cílovou kartu ověřujeme podle ID a místa dotyku.
let trainCardPointerStart = null;
let lastTrainCardPointerActivation = 0;

function selectTrainCardById(trainId) {
  const train = trains.find(item => String(item.id) === String(trainId));
  if (!train) return;
  selected = train;
  train.queuePriority = ++trainQueuePriority;
  updateDetail();
  if (trainCardTutorialActive && trainCardTutorialStep === "card" && train.state === "WAIT_ASSIGN") {
    trainCardTutorialStep = "track";
    renderTrainCardTutorialText();
  }
  render();
}

function initTrainCardControls() {
  document.addEventListener("pointerdown", event => {
    const card = event.target && event.target.closest
      ? event.target.closest("#queue .train")
      : null;
    trainCardPointerStart = card ? {
      trainId: card.dataset.trainId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    } : null;
    // Capture the pointer on the persistent queue container, because render()
    // replaces individual card nodes while the game loop is running.
    if (card) {
      const queue = document.getElementById("queue");
      if (queue && queue.setPointerCapture) {
        try { queue.setPointerCapture(event.pointerId); } catch (_) {}
      }
    }
  }, true);

  document.addEventListener("pointercancel", () => {
    trainCardPointerStart = null;
  }, true);

  document.addEventListener("pointerup", event => {
    const start = trainCardPointerStart;
    trainCardPointerStart = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12) return;

    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const card = hit && hit.closest ? hit.closest("#queue .train") : null;
    if (!card || card.dataset.trainId !== start.trainId) return;

    lastTrainCardPointerActivation = Date.now();
    event.preventDefault();
    selectTrainCardById(start.trainId);
  }, true);

  // Záloha pro klávesnici a prohlížeče bez Pointer Events.
  document.addEventListener("click", event => {
    if (Date.now() - lastTrainCardPointerActivation < 800) return;
    const card = event.target && event.target.closest
      ? event.target.closest("#queue .train")
      : null;
    if (card) selectTrainCardById(card.dataset.trainId);
  }, true);
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

  // Zwiesel je první hratelná stanice, proto musí být vždy první i v menu.
  const stationKeys = Object.keys(window.STATIONS_REGISTRY).sort((a, b) => {
    if (a === "zwiesel") return -1;
    if (b === "zwiesel") return 1;
    return 0;
  });
  for (const key of stationKeys) {
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
    alert(`${lang().notEnoughPlzenLevel} ${st.requiredParentLevel}.`);
    return;
  }
  // Odemčení nové stanice se platí z pokladny jejího rodičovského nádraží (zatím Plzeň).
  const parentKey = "plzen";
  const parentMoney = parentKey === currentStationKey ? globalMoney : (Number(stationMoneyByStation[parentKey]) || 0);
  if (parentMoney < st.unlockCost) {
    alert(`${lang().notEnoughGlobalMoney} ${st.unlockCost} Kč.`);
    return;
  }

  // Stržení peněz pouze z pokladny rodičovské stanice.
  const updatedParentMoney = parentMoney - st.unlockCost;
  stationMoneyByStation[parentKey] = updatedParentMoney;
  if (parentKey === currentStationKey) globalMoney = updatedParentMoney;
  GLOBAL_PLAYER_DATA.unlockedStations.push(key);
  stationLevels[key] = { lvl: 0, xp: 0 };
  
  alert(`${lang().stationUnlocked} ${st.name}! ${lang().canEnter}`);
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

  // Před přepnutím uložíme aktuální kasu a načteme vlastní kasu cílové stanice.
  if (currentStationKey) stationMoneyByStation[currentStationKey] = Math.max(0, Number(globalMoney) || 0);
  currentStationKey = stationKey;
  currentStationData = window.STATIONS_REGISTRY[stationKey];
  if (!Object.prototype.hasOwnProperty.call(stationMoneyByStation, stationKey)) {
    stationMoneyByStation[stationKey] = stationKey === "zwiesel" ? 200 : 100;
  }
  globalMoney = Math.max(0, Number(stationMoneyByStation[stationKey]) || 0);

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
  const currentLevel = stationLevels[stationKey].lvl;
  let savedTrackCount = Number(unlockedTracksByStation[stationKey]);
  // Staré save mohly mít ve Zwieselu druhou kolej zdarma už od levelu 1.
  // Dokud hráč nedosáhne levelu 2, ponecháme jen výchozí kolej.
  if (stationKey === "zwiesel" && currentLevel < 2) savedTrackCount = baseTracks;
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

  // Úklidové týmy: jedna četa od startu, druhá zdarma na levelu 6,
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
  const cleaningTeamFreeLevel = Number(currentStationData.cleaningTeamFreeLevel);
  if (Number.isFinite(cleaningTeamFreeLevel) && cleaningTeamFreeLevel > 0 && myLvl >= cleaningTeamFreeLevel) {
    levelUnlockedTeams = Math.max(levelUnlockedTeams, 2);
  }
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
  const cateringTeamFreeLevel = Number(currentStationData.cateringTeamFreeLevel);
  if (Number.isFinite(cateringTeamFreeLevel) && cateringTeamFreeLevel > 0 && myLvl >= cateringTeamFreeLevel) {
    levelUnlockedCateringTeams = Math.max(levelUnlockedCateringTeams, 2);
  }
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
      speed: saved.speedUpBonusActive && Number.isFinite(Number(saved.speed)) ? Number(saved.speed) : (Number.isFinite(Number(template.speed)) ? Number(template.speed) : 0),
      speedUpBonusActive: saved.speedUpBonusActive === true,
      speedUpOriginalSpeed: Number(saved.speedUpOriginalSpeed) || Number(template.speed) || 80,
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
    alert(lang().trackOccupied);
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

  // Po přidělení koleje přejdeme do krátkého informačního kroku během příjezdu.
  if (trainCardTutorialActive && trainCardTutorialStep === "track") {
    trainCardTutorialStep = "coming";
    renderTrainCardTutorialText();
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) {
      tutorial.classList.add("open");
      tutorial.setAttribute("aria-hidden", "false");
    }
  }
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
    if (trainCardTutorialActive && trainCardTutorialStep === "clean") {
      trainCardTutorialStep = "cleaning";
      const tutorial = document.getElementById("train-card-tutorial");
      if (tutorial) {
        tutorial.classList.remove("open");
        tutorial.setAttribute("aria-hidden", "true");
      }
    }
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
  if (type === "exit" && trainCardTutorialActive && trainCardTutorialStep === "unload") {
    trainCardTutorialStep = "unloading";
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) { tutorial.classList.remove("open"); tutorial.setAttribute("aria-hidden", "true"); }
  }
  if (type === "clean" && trainCardTutorialActive && trainCardTutorialStep === "clean") {
    trainCardTutorialStep = "cleaning";
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) { tutorial.classList.remove("open"); tutorial.setAttribute("aria-hidden", "true"); }
  }
  if (type === "board" && trainCardTutorialActive && trainCardTutorialStep === "board") {
    trainCardTutorialStep = "boarding";
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) { tutorial.classList.remove("open"); tutorial.setAttribute("aria-hidden", "true"); }
  }
}

// 🚂 12. ODJEZD VLAKU Z NÁDRAŽÍ NA TRAŤ
async function depart() {
  if (!selected || selected.state !== "READY_DEPART") return;

  const t = selected;
  const tutorialTrainId = trainCardTutorialActive && trainCardTutorialStep === "depart" ? t.id : null;
  if (tutorialTrainId !== null) window.__tutorialTrainId = tutorialTrainId;
  // Společný plánovač: každou linku zkusíme naplánovat nejvýše jednou za herní session.
  // Úspěšná geometrie se sdílí mezi všemi vlaky stejné linky; chyba neblokuje odjezd
  // a nevyvolává opakované dotazy na Overpass při každém dalším odjezdu.
  if (!window.__stationRouteAttempts) window.__stationRouteAttempts = new Set();
  const routeCacheKey = currentStationKey + ":" + t.routeKey;
  if (window.RailwayNetwork && !window.__stationRouteAttempts.has(routeCacheKey) && !(window.STATION_BUNDLED_ROUTE_KEYS && window.STATION_BUNDLED_ROUTE_KEYS.has(routeCacheKey))) {
    const route = currentStationData.routes[t.routeKey];
    if (Array.isArray(route) && route.length >= 2) {
      const button = document.querySelector('#actions button');
      if (button) { button.disabled = true; button.textContent = lang().searchingTracks; }
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
        const reason = error && error.message ? error.message : lang().invalidRoute;
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
    alert(`${lang().departStopped}: ${lang().invalidRouteForTrain} ${t.name} ${lang().noValidTrackRoute}`);
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
      if (trainCardTutorialActive && trainCardTutorialStep === "map" && Number(t.id) === Number(window.__tutorialTrainId)) {
        trainCardTutorialStep = "trainInfo";
        renderTrainCardTutorialText();
        const modal = document.getElementById("train-card-tutorial");
        if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
        if (t.marker._icon) t.marker._icon.classList.remove("tutorial-train-highlight");
      }
      updateDetail();
      render();
    });
  } else {
    t.marker.setLatLng(route[0]);
  }

  t.progress = { exit: 0, clean: 0, catering: 0, board: 0 };
  selected = null;
  if (tutorialTrainId !== null) {
    trainCardTutorialStep = "mapWait";
    const tutorial = document.getElementById("train-card-tutorial");
    if (tutorial) { tutorial.classList.remove("open"); tutorial.setAttribute("aria-hidden", "true"); }
    window.setTimeout(() => {
      if (!trainCardTutorialActive || trainCardTutorialStep !== "mapWait") return;
      const activeTrain = trains.find(item => Number(item.id) === Number(tutorialTrainId));
      if (!activeTrain || activeTrain.state !== "EN_ROUTE_THERE" || !activeTrain.marker) return;
      trainCardTutorialStep = "map";
      // Posuň pouze pohled mapy k aktuální pozici vlaku; zoom ani poloha vlaku se nemění.
      map.panTo(activeTrain.marker.getLatLng(), { animate: true, duration: 0.6 });
      renderTrainCardTutorialText();
      if (activeTrain.marker._icon) activeTrain.marker._icon.classList.add("tutorial-train-highlight");
      const modal = document.getElementById("train-card-tutorial");
      if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
    }, 5000);
  }
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
    local: lang().trainCategoryLocal,
    regional: lang().trainCategoryRegional,
    rapid: "Rychlík",
    express: "Expres",
    international: lang().trainCategoryInternational
  };
  const category = categoryNames[(template && template.category) || ""] || lang().train;
  const stateNames = {
    WAIT_ASSIGN: lang().waitAssign,
    COMING: lang().coming,
    ARRIVED: "Ve stanici – čeká na výstup cestujících",
    UNLOADING: "Vystupují cestující",
    WAIT_CLEAN: "Čeká na úklid",
    WAIT_CLEAN_TEAM: lang().waitCleanTeam,
    CLEANING: "Probíhá úklid",
    CATERING: "Doplňuje se catering",
    WAIT_CATERING: "Čeká na zahájení cateringu",
    WAIT_BOARD: "Čeká na nástup cestujících",
    BOARDING: "Nastupují cestující",
    READY_DEPART: "Připraven k odjezdu",
    EN_ROUTE_THERE: lang().enRouteThereStatus,
    AT_DESTINATION: "Na konečné stanici",
    EN_ROUTE_BACK: "Na cestě zpět do výchozí stanice"
  };
  const turnsDone = Math.max(0, Number(t.current_turnaround) || 0);
  const turnsRequired = Math.max(1, Number(t.required_turnaround) || 1);
  return `
    <div class="train-popup-card">
      <strong class="train-popup-name">${t.name || lang().train}</strong>
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
  // Výukový speed boost platí jen pro jednu otočku Zwiesel–Bodenmais tam i zpět.
  // Po návratu do Zwieselu se původní rychlost obnoví.
  if (t.speedUpBonusActive === true) {
    t.speed = Number(t.speedUpOriginalSpeed) || Number((currentStationData.trainsPool || {})[t.id]?.speed) || 80;
    t.speedUpBonusActive = false;
    t.speedUpOriginalSpeed = null;
  }
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
    alert(`${lang().contractComplete} ${t.name} ${lang().earnedXp} ${earnedPoints} ${lang().xpForStation} ${currentStationData.name}.`);

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
  if (!myData || !currentStationData || !currentStationData.levels) return;

  const levelUpMessages = [];
  let reachedZwieselLevel1 = false;

  // Zpracuj všechny levely, na které hráč získanými XP dosáhl.
  // XPNeeded je cena postupu z aktuálního levelu na následující.
  while (true) {
    const currentLevelConfig = currentStationData.levels[myData.lvl];
    if (!currentLevelConfig) break;

    const requiredXp = Number(currentLevelConfig.xpNeeded);
    if (!Number.isFinite(requiredXp) || requiredXp <= 0 || myData.xp < requiredXp) break;

    myData.xp -= requiredXp;
    myData.lvl += 1;
    const reachedLevel = myData.lvl;
    if (currentStationKey === "zwiesel" && reachedLevel === 1) reachedZwieselLevel1 = true;
    const reachedConfig = currentStationData.levels[reachedLevel] || {};
    const rewards = [];

    // Zwiesel Level 4 beendet das Tutorial und schaltet Plzeň frei.
    if (currentStationKey === "zwiesel" && reachedLevel === 4) {
      if (!GLOBAL_PLAYER_DATA.unlockedStations.includes("plzen")) {
        GLOBAL_PLAYER_DATA.unlockedStations.push("plzen");
      }
      if (!stationLevels.plzen) stationLevels.plzen = { lvl: 0, xp: 0 };
    }

    if (typeof reachedConfig.action === "function") reachedConfig.action();

    // Level 1: automaticky přiděl bezplatný výkon Arriva Stadler do Plas.
    if (currentStationKey === "plzen" && reachedLevel === 1) {
      const id = 6;
      const owned = ownedPerformancesByStation[currentStationKey] || [];
      if (!owned.map(Number).includes(id)) {
        ownedPerformancesByStation[currentStationKey] = [...owned, id];
      }
      if (!trains.some(train => Number(train.id) === id)) addNewTrainFromPool(id);
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
    }

    let nextTeams = Number(currentStationData.startingCleaningTeams);
    if (!Number.isFinite(nextTeams) || nextTeams < 1) nextTeams = 1;
    for (let level = 0; level <= reachedLevel; level++) {
      const teamsAtLevel = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksCleaningTeams);
      if (Number.isFinite(teamsAtLevel) && teamsAtLevel >= 1) nextTeams = Math.max(nextTeams, Math.floor(teamsAtLevel));
    }
    const cleaningTeamFreeLevel = Number(currentStationData.cleaningTeamFreeLevel);
    if (Number.isFinite(cleaningTeamFreeLevel) && cleaningTeamFreeLevel > 0 && reachedLevel >= cleaningTeamFreeLevel) {
      nextTeams = Math.max(nextTeams, 2);
      if (reachedLevel === cleaningTeamFreeLevel) rewards.push(lang().cleaningTeamFree);
    }
    unlockedCleaningTeamsCount = Math.min(4, Math.max(unlockedCleaningTeamsCount, Math.floor(nextTeams)));

    let nextCateringTeams = Number(currentStationData.startingCateringTeams);
    if (!Number.isFinite(nextCateringTeams) || nextCateringTeams < 1) nextCateringTeams = 1;
    for (let level = 0; level <= reachedLevel; level++) {
      const count = Number(currentStationData.levels[level] && currentStationData.levels[level].unlocksCateringTeams);
      if (Number.isFinite(count) && count >= 1) nextCateringTeams = Math.max(nextCateringTeams, Math.floor(count));
    }
    const cateringTeamFreeLevel = Number(currentStationData.cateringTeamFreeLevel);
    if (Number.isFinite(cateringTeamFreeLevel) && cateringTeamFreeLevel > 0 && reachedLevel >= cateringTeamFreeLevel) {
      nextCateringTeams = Math.max(nextCateringTeams, 2);
      if (reachedLevel === cateringTeamFreeLevel) rewards.push(lang().cateringTeamFree);
    }
    unlockedCateringTeamsCount = Math.min(3, Math.max(unlockedCateringTeamsCount, Math.floor(nextCateringTeams)));

    const configuredRewardText = reachedConfig.rewardTextKey
      ? (lang()[reachedConfig.rewardTextKey] || reachedConfig.rewardText || "")
      : (reachedConfig.rewardText || "");
    const rewardText = [configuredRewardText, ...rewards].filter(Boolean).join("\n• ");
    levelUpMessages.push(`${lang().levelUp} ${currentStationData.name} ${lang().stationAdvanced} ${reachedLevel}!\n\n${lang().reward}\n• ${rewardText || lang().continueDevelop}`);
  }

  if (!levelUpMessages.length) return;

  // Upozornění po jednom souhrnném alertu; žádný level ani odměna se nepřeskočí.
  alert(levelUpMessages.join("\n\n"));

  renderSidebar();
  saveGameState();
  render();
  if (shopOpen) renderShop();

  // Show the first-contract tutorial after the level-up flow and train-return render finish.
  // Deferring avoids the level-up UI/render cycle covering the tutorial modal.
  if (reachedZwieselLevel1) {
    window.setTimeout(() => {
      if (currentStationKey === "zwiesel") showFirstContractTutorial();
    }, 250);
  }
}

// ==========================================
// 🛒 OBCHOD: VÝKONY A KAPACITA NÁSTUPIŠŤ
// ==========================================
function ensureShopUI() {
  // Tlačítko obchodu je součástí HTML menu; zde jen bezpečně navážeme akci.
  const button = document.getElementById("station-shop-button");
  if (button) bindTap(button, () => toggleShop());

  if (!document.getElementById("station-shop-modal")) {
    const overlay = document.createElement("div");
    overlay.id = "station-shop-modal";
    overlay.style.cssText = "display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.78);padding:16px;box-sizing:border-box;overflow:auto;";
    overlay.innerHTML = `
      <div style="max-width:760px;margin:5vh auto;background:#151515;color:#fff;border:1px solid #444;border-radius:14px;padding:16px;max-height:85vh;overflow:auto;box-shadow:0 10px 35px rgba(0,0,0,.6)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <h2 id="station-shop-title" style="margin:0;color:#4caf50">Obchod nádraží</h2>
          <button class="r" id="station-shop-close">✕ ${lang().shopClose}</button>
        </div>
        <p id="station-shop-summary" style="color:#bbb"></p>
        <div id="station-shop-content"></div>
      </div>`;
    bindTap(overlay, event => {
      if (event.target === overlay) toggleShop(false);
    });
    document.body.appendChild(overlay);
    bindTap(document.getElementById("station-shop-close"), () => toggleShop(false));
  }
}

function toggleShop(forceOpen) {
  ensureShopUI();
  shopOpen = typeof forceOpen === "boolean" ? forceOpen : !shopOpen;
  const modal = document.getElementById("station-shop-modal");
  if (modal) modal.style.display = shopOpen ? "block" : "none";
  if (shopOpen) renderShop();
  else setTimeout(showTwoLinesTutorialIfReady, 120);
}

const TWO_LINES_TUTORIAL_KEY = "station_zwiesel_two_lines_tutorial_v1";
function renderTwoLinesTutorialText() {
  const title = document.getElementById("two-lines-tutorial-title");
  const body = document.getElementById("two-lines-tutorial-body");
  const button = document.getElementById("two-lines-tutorial-button");
  if (title) title.textContent = lang().twoLinesTutorialTitle || "Your turn now!";
  if (body) body.textContent = lang().twoLinesTutorialBody || "Now handle both trains independently.";
  if (button) button.textContent = lang().twoLinesTutorialButton || "Continue";
}
function showTwoLinesTutorialIfReady() {
  if (shopOpen || currentStationKey !== "zwiesel") return;
  if (localStorage.getItem(TWO_LINES_TUTORIAL_KEY) === "1") return;
  const owned = ownedPerformancesByStation.zwiesel || [];
  if (!owned.map(Number).includes(2)) return;
  const modal = document.getElementById("two-lines-tutorial");
  if (!modal) return;
  renderTwoLinesTutorialText();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
const ZWIESEL_DEPARTURES_KEY = "station_zwiesel_tutorial_departures_v1";
const ZWIESEL_CARGO_TUTORIAL_KEY = "station_zwiesel_cargo_tutorial_v1";
function showCargoTutorialPopup() {
  const modal = document.getElementById("cargo-tutorial");
  if (!modal || localStorage.getItem("station_zwiesel_cargo_bonus_claimed_v1") === "1") return;
  const copy = {
    cs: ["Pozor, nákladní vlak!", "Na mapě se objevil zvláštní nákladní vlak. 👀 Kdo ví, jaké poklady veze? Klepni na něj a zjisti, jaký bonus se pro tebe skrývá! 🎁", "Klepnu a zjistím to!"],
    en: ["Freight train on the move!", "A mysterious freight train has appeared on the map. 👀 What kind of treasure could it be carrying? Tap it to discover the bonus waiting for you! 🎁", "Tap to find out!"],
    de: ["Achtung, Güterzug!", "Ein geheimnisvoller Güterzug ist auf der Karte aufgetaucht. 👀 Welche Schätze er wohl geladen hat? Tippe auf ihn und entdecke deinen Bonus! 🎁", "Tippen und herausfinden!"]
  }[currentLanguage] || ["Freight train on the move!", "A mysterious freight train has appeared. Tap it to discover your bonus! 🎁", "Tap to find out!"];
  document.getElementById("cargo-tutorial-title").textContent = copy[0];
  document.getElementById("cargo-tutorial-body").textContent = copy[1];
  document.getElementById("cargo-tutorial-button").textContent = copy[2];
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
function showCargoBonusClaimedPopup() {
  const modal = document.getElementById("cargo-tutorial");
  if (!modal) return;
  const copy = {
    cs: ["Paráda! Získal jsi 1 prémiový coin! 🪙", "Nákladní vlaky mohou přivážet různé odměny: 500 Kč, XP nebo prémiový coin. Každý bonus má svou chvíli, takže se za pár minut zastav znovu a zkus štěstí!", "Mezitím můžeš prozkoumat obchod, naplánovat další rozšíření nádraží nebo sledovat, jak se tvé železniční impérium rozrůstá. A pokud se rozhodneš vrátit později, žádný strach — vlaky mezitím nezastaví. Jejich jízda pokračuje i během tvé nepřítomnosti a po návratu je najdeš přesně tam, kde mají být: buď na trase, nebo zpátky na nádraží, připravené na další akci! 🚂", "Jdeme na to!"],
    en: ["Great! You received 1 premium coin! 🪙", "Freight trains can bring different rewards: 500 Kč, XP or a premium coin. Each bonus needs a little time to recharge, so come back in a few minutes and try your luck again!", "In the meantime, explore the shop, plan your station's next expansion or watch your railway empire grow. And if you decide to come back later, don't worry — your trains won't stop. Their journeys continue while you're away, and when you return, you'll find them right where they should be: either along their routes or back at the station, ready for your next action! 🚂", "Let's go!"],
    de: ["Super! Du hast 1 Premium-Münze erhalten! 🪙", "Güterzüge können verschiedene Belohnungen bringen: 500 Kč, XP oder eine Premium-Münze. Jeder Bonus braucht etwas Zeit zum Aufladen — schau in ein paar Minuten wieder vorbei und versuche dein Glück erneut!", "In der Zwischenzeit kannst du den Shop erkunden, die nächste Erweiterung deines Bahnhofs planen oder zusehen, wie dein Eisenbahn-Imperium wächst. Und wenn du später zurückkommst, keine Sorge — deine Züge bleiben nicht stehen. Sie fahren auch während deiner Abwesenheit weiter. Bei deiner Rückkehr findest du sie genau dort, wo sie sein sollen: unterwegs auf ihrer Strecke oder zurück am Bahnhof und bereit für deine nächste Aktion! 🚂", "Los geht's!"]
  }[currentLanguage] || ["Great! You received 1 premium coin! 🪙", "The next freight train bonus will be available after a short cooldown.", "Your trains will keep moving while you are away. When you return, they will be further along their route or back at the station, waiting for your next action.", "Got it!"];
  document.getElementById("cargo-tutorial-title").textContent = copy[0];
  document.getElementById("cargo-tutorial-body").textContent = copy[1];
  const extra = document.getElementById("cargo-tutorial-extra");
  if (extra) extra.textContent = copy[2];
  document.getElementById("cargo-tutorial-button").textContent = copy[3];
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
window.showCargoBonusClaimedPopup = showCargoBonusClaimedPopup;
function closeCargoTutorialPopup() {
  const modal = document.getElementById("cargo-tutorial");
  if (modal) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
  localStorage.setItem(ZWIESEL_CARGO_TUTORIAL_KEY, "1");
}
function registerZwieselSecondTrainServiced(trainId) {
  // Nákladní vlak je odměnou za dokončené odbavení druhého vlaku v levelu 1.
  if (currentStationKey !== "zwiesel" || Number(trainId) !== 2 ||
      !stationLevels.zwiesel || Number(stationLevels.zwiesel.lvl) < 1 ||
      localStorage.getItem("station_zwiesel_cargo_bonus_claimed_v1") === "1" ||
      sessionStorage.getItem("station_zwiesel_cargo_spawned_v1") === "1") return;

  localStorage.setItem("station_zwiesel_cargo_trigger_v2", "1");
  sessionStorage.setItem("station_zwiesel_cargo_spawned_v1", "1");
  showCargoTutorialPopup();

  let attempts = 0;
  const trySpawn = () => {
    if (currentStationKey !== "zwiesel") {
      sessionStorage.removeItem("station_zwiesel_cargo_spawned_v1");
      return;
    }
    if (typeof window.spawnTutorialCargoTrain === "function" && window.spawnTutorialCargoTrain()) {
      console.info("🚂 Tutorialový nákladní vlak Zwiesel–Klatovy byl vytvořen po odbavení druhého vlaku.");
      return;
    }
    attempts++;
    console.error("🚂 Nákladní vlak se nepodařilo vytvořit. Kontrola:", {
      cargoRoutesLoaded: Array.isArray(window.STATION_CARGO_ROUTES),
      routeIds: (window.STATION_CARGO_ROUTES || []).map(route => route.id)
    });
    if (attempts < 20) window.setTimeout(trySpawn, 2000);
    else sessionStorage.removeItem("station_zwiesel_cargo_spawned_v1");
  };
  window.setTimeout(trySpawn, 500);
}function closeTwoLinesTutorial() {
  const modal = document.getElementById("two-lines-tutorial");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  localStorage.setItem(TWO_LINES_TUTORIAL_KEY, "1");
}
function initTwoLinesTutorial() {
  const cargoButton = document.getElementById("cargo-tutorial-button");
  if (cargoButton) bindTap(cargoButton, closeCargoTutorialPopup);
  const button = document.getElementById("two-lines-tutorial-button");
  if (button) bindTap(button, closeTwoLinesTutorial);
  renderTwoLinesTutorialText();
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
  if (title) title.textContent = `${currentStationData.name} — ${lang().stationShopTitle}`;
  if (summary) summary.textContent = `${currentStationData.name} · Level ${level} · ${lang().shopSummaryCash}: ${globalMoney.toLocaleString("cs-CZ")} Kč`;

  const categoryNames = {
    local: lang().shopCategoryLocal,
    rapid: lang().shopCategoryRapid,
    express: lang().shopCategoryExpress,
    longDistance: lang().shopCategoryLongDistance,
    international: lang().shopCategoryInternational
  };
  const groupedCards = {};
  Object.entries(catalog).forEach(([idText, item]) => {
    const id = Number(idText);
    // Již zakoupené výkony se v obchodě vůbec nezobrazují.
    if (owned.has(id)) return;
    const category = categoryNames[item.category] ? item.category : "other";
    if (!groupedCards[category]) groupedCards[category] = [];
    const requiredLevel = item.shopRequiredLevelOverride ? (Number(item.requiredLevel) || 0) : Math.max(Number(item.requiredLevel) || 0, item.category === "local" ? 2 : item.category === "rapid" ? 8 : 0);
    const locked = level < requiredLevel;
    const cost = Math.max(0, Number(item.purchaseCost) || 0);
    const detail = `${categoryNames[category] || lang().shopOtherCategory} · ${cost === 0 ? lang().free : cost.toLocaleString("cs-CZ") + " Kč"} · ${(Number(item.rewardMoney) || 0).toLocaleString("cs-CZ")} Kč ${lang().shopRoundTripReward}`;
    const label = locked ? `${lang().unlockAt} ${requiredLevel}` :
      globalMoney < cost ? lang().notEnoughMoney : lang().buy;
    const action = locked || globalMoney < cost ? "" : `buyPerformance(${id})`;
    groupedCards[category].push(shopCard(
      item.name || `${lang().shopServiceFallback} ${id}`,
      `${item.operator || lang().carrier} · ${item.routeLabel || item.routeKey || lang().configuredRoute}`,
      detail, label, action, locked || globalMoney < cost
    ));
  });

  const categoryOrder = ["local", "rapid", "express", "longDistance", "international", "other"];
  const categoryUnlockLevels = { local: Math.min(2, ...Object.values(catalog).filter(item => item.category === "local" && item.shopRequiredLevelOverride).map(item => Number(item.requiredLevel) || 0)), rapid: 8 };
  const performanceSections = categoryOrder
    .filter(category => groupedCards[category] && groupedCards[category].length)
    .map(category => {
      const requiredLevel = categoryUnlockLevels[category] || 0;
      if (level < requiredLevel) {
        return shopSection(categoryNames[category] || lang().shopOtherCategory,
          shopCard(categoryNames[category] || lang().shopServiceFallback,
            `${lang().unlockAt} ${requiredLevel}`,
            `${lang().shopCategoryUnlockMessage} ${requiredLevel}.`,
            lang().locked, "", true));
      }
      return shopSection(categoryNames[category] || lang().shopOtherCategory, groupedCards[category].join(""));
    })
    .join("");
  const performances = performanceSections || `<p style="color:#999">${lang().shopNoConfiguredServices}</p>`;

  const trackCosts = Array.isArray(currentStationData.trackPurchaseCosts) ? currentStationData.trackPurchaseCosts : [];
  const nextTrackCost = Number(trackCosts[unlockedTracksCount]);
  let trackDetail;
  let trackLabel;
  let trackAction = "";
  let trackDisabled = false;
  if (Number.isFinite(nextTrackCost) && unlockedTracksCount < trackCosts.length) {
    trackDetail = `${lang().platformEdges}: ${unlockedTracksCount} · ${lang().nextExpansion} ${nextTrackCost.toLocaleString("cs-CZ")} Kč`;
    trackLabel = globalMoney >= nextTrackCost ? lang().buyExpansion : lang().notEnoughMoney;
    trackAction = globalMoney >= nextTrackCost ? "buyTrack()" : "";
    trackDisabled = globalMoney < nextTrackCost;
  } else {
    trackDetail = `${lang().currentCapacity}: ${unlockedTracksCount} · ${lang().noFurtherUpgrades}`;
    trackLabel = lang().maximum;
    trackDisabled = true;
  }
  const trackPurchaseLevel = Number(currentStationData.trackPurchaseLevel ?? 4);
  const trackCard = level >= trackPurchaseLevel
    ? shopCard(lang().tracksPlatforms, lang().stationInfrastructure, trackDetail, trackLabel, trackAction, trackDisabled)
    : shopCard(
        lang().tracksPlatforms,
        String(lang().unlockLevel4 || "").replace("4", String(trackPurchaseLevel)),
        String(lang().unlockTracksAt4 || "").replaceAll("4", String(trackPurchaseLevel)),
        lang().locked, "", true
      );

  const cleaningPurchased = Math.max(0, Math.min(2, Math.floor(Number(hiredCleaningTeamsByStation[stationKey]) || 0)));
  const cleaningCount = unlockedCleaningTeamsCount;
  const cleaningCost = cleaningPurchased === 0 ? 30000 : 50000;
  const cleaningMax = cleaningCount >= 4 || cleaningPurchased >= 2;
  const cleaningAvailable = level >= 6;
  const cleaningLabel = !cleaningAvailable ? lang().shopLocked : cleaningMax ? lang().maxTeamsReached :
    globalMoney >= cleaningCost ? lang().hireTeam : lang().shopInsufficientFunds;
  const cleaningDetail = !cleaningAvailable ? lang().cleaningTeamsUnlock6 :
    cleaningMax ? `${lang().currentState}: ${cleaningCount}/4 ${lang().teams}. ${lang().cleaningLimitReached}` :
    `${lang().currentState}: ${cleaningCount}/4 ${lang().teams} · ${lang().nextTeamCosts} ${cleaningCost.toLocaleString("cs-CZ")} Kč.`;
  const cleaningCard = shopCard(lang().cleaningTeam, lang().stationStaff, cleaningDetail,
    cleaningLabel, cleaningAvailable && !cleaningMax && globalMoney >= cleaningCost ? "buyCleaningTeam()" : "",
    !cleaningAvailable || cleaningMax || globalMoney < cleaningCost);

  const cateringPurchased = Math.max(0, Math.min(1, Math.floor(Number(hiredCateringTeamsByStation[stationKey]) || 0)));
  const cateringCount = unlockedCateringTeamsCount;
  const cateringCost = 70000;
  const cateringMax = cateringCount >= 3 || cateringPurchased >= 1;
  const cateringAvailable = level >= 11;
  const cateringLabel = !cateringAvailable ? lang().shopLocked : cateringMax ? lang().shopTeamLimitReached :
    globalMoney >= cateringCost ? lang().shopHireCatering : lang().shopInsufficientFunds;
  const cateringDetail = !cateringAvailable ? lang().cateringTeamsUnlock11 :
    cateringMax ? `${lang().shopCurrentStatus}: ${cateringCount}/3 ${lang().teams}. ${lang().shopTeamLimitDetail}` :
    `${lang().shopCurrentStatus}: ${cateringCount}/3 ${lang().teams} · ${lang().nextTeamCosts} ${cateringCost.toLocaleString("cs-CZ")} Kč.`;
  const cateringCard = shopCard(lang().cateringTeam, lang().stationStaff, cateringDetail,
    cateringLabel, cateringAvailable && !cateringMax && globalMoney >= cateringCost ? "buyCateringTeam()" : "",
    !cateringAvailable || cateringMax || globalMoney < cateringCost);

  content.innerHTML =
    shopSection(lang().trainServices, performances) +
    shopSection(lang().infrastructure, trackCard) +
    shopSection(lang().cleaningStaff, cleaningCard) +
    shopSection(lang().cateringStaff, cateringCard) +
    `<p style="color:#999;font-size:12px">${lang().shopDisclaimerFull}</p>`;
}

function buyPerformance(id) {
  if (!currentStationData || !currentStationKey) return;
  const item = currentStationData.trainsPool[id];
  if (!item) return;
  const owned = ownedPerformancesByStation[currentStationKey] || [];
  if (owned.map(Number).includes(Number(id))) return;

  const level = Number((stationLevels[currentStationKey] || {}).lvl) || 0;
  const requiredLevel = item.shopRequiredLevelOverride ? (Number(item.requiredLevel) || 0) : Math.max(Number(item.requiredLevel) || 0, item.category === "local" ? 2 : item.category === "rapid" ? 8 : 0);
  if (level < requiredLevel) {
    alert(`${lang().serviceUnlocksAt} ${requiredLevel}.`);
    return;
  }

  const cost = Math.max(0, Number(item.purchaseCost) || 0);
  if (globalMoney < cost) {
    alert(lang().shopNotEnough);
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
  const cleaningShopLevel = Number(currentStationData.cleaningTeamShopLevel ?? 6);
  if (level < cleaningShopLevel) {
    alert(String(lang().unlockCleaningLevel).replace("6", String(cleaningShopLevel)));
    return;
  }

  const purchased = Math.max(0, Math.min(2, Math.floor(Number(hiredCleaningTeamsByStation[currentStationKey]) || 0)));
  if (unlockedCleaningTeamsCount >= 4 || purchased >= 2) {
    alert(lang().maxCleaningTeams);
    return;
  }

  const cost = purchased === 0 ? 30000 : 50000;
  if (globalMoney < cost) {
    alert(`${lang().hireCleaningCost} ${cost.toLocaleString("cs-CZ")} Kč.`);
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
    alert(lang().unlockCateringLevel);
    return;
  }

  const purchased = Math.max(0, Math.min(1, Math.floor(Number(hiredCateringTeamsByStation[currentStationKey]) || 0)));
  if (unlockedCateringTeamsCount >= 3 || purchased >= 1) {
    alert(lang().maxCateringTeams);
    return;
  }

  const cost = 70000;
  if (globalMoney < cost) {
    alert(lang().hireCateringCost);
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
  const trackPurchaseLevel = Number(currentStationData.trackPurchaseLevel ?? 4);
  if (level < trackPurchaseLevel) {
    alert(String(lang().unlockTrackLevel).replace("4", String(trackPurchaseLevel)));
    return;
  }
  const costs = currentStationData.trackPurchaseCosts || [];
  const cost = Number(costs[unlockedTracksCount]);
  if (!Number.isFinite(cost) || unlockedTracksCount >= costs.length) {
    alert(lang().noPlatformAvailable);
    return;
  }
  if (globalMoney < cost) {
    alert(lang().platformNotEnough);
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
  const premiumCoinsEl = document.getElementById("premium-coins");
  if (premiumCoinsEl) premiumCoinsEl.innerText = premiumCoins;

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
    q.innerHTML = `<div class="train-list-empty">${lang().noWaitingTrains}</div>`;
    updateDetail();
    return;
  }

  orderedTrains.forEach(t => {
    let d = document.createElement("div");
    d.className = "train";
    if (selected && selected.id === t.id) d.className += " selected";
    const tutorialTrain = orderedTrains.find(train => train.state === "WAIT_ASSIGN");
    const tutorialTarget = trainCardTutorialActive && trainCardTutorialStep === "card" && tutorialTrain && t.id === tutorialTrain.id;
    if (tutorialTarget) d.className += " train-tutorial-target";
    if (trainCardTutorialActive && trainCardTutorialStep === "track" && selected && selected.id === t.id) {
      d.classList.add("train-tutorial-selected");
    }

    let isSelected = selected && selected.id === t.id;
    let showDot = t.pendingAction && !isSelected;

    let statusText = t.state;
    if (t.state === "WAIT_ASSIGN") statusText = `${lang().waitAssign} [${t.current_turnaround}/${t.required_turnaround}] ⏳`;
    if (t.state === "COMING") statusText = `${lang().incoming} ${t.track} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "ARRIVED") statusText = lang().arrived;
    if (t.state === "UNLOADING") statusText = `${lang().unloading} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_CLEAN") statusText = lang().waitClean;
    if (t.state === "WAIT_CLEAN_TEAM") statusText = lang().waitCleanTeam;
    if (t.state === "CLEANING") statusText = `${lang().cleaning} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "CATERING") statusText = `${lang().cateringStatus} (${Math.max(0, Math.ceil(t.timer))}s)`;
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

    d.dataset.trainId = String(t.id);
    q.appendChild(d);
  });

  updateDetail();
}


// 🎯 16. DETAIL VYBRANÉHO VLAKU A PROGRESS BARY
function updateDetail() {
  if (!selected) {
    document.getElementById("name").innerText = lang().selectTrainPrompt;
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
        htmlButtons += `<button class="r" style="opacity: 0.4; cursor: not-allowed;" disabled>${lang().platform} ${i+1} (${lang().occupied})</button>`;
      } else {
        htmlButtons += `<button class="g${trainCardTutorialActive && trainCardTutorialStep === "track" ? " track-tutorial-target" : ""}" onclick="assignTrack(${i})">${lang().platform} ${i+1}</button>`;
      }
    }
    a.innerHTML = htmlButtons;
  } 
  else if (selected.state === "COMING") {
    a.innerHTML = `<em>${lang().incoming} ${selected.track}... (${Math.max(0, Math.ceil(selected.timer))}s)</em>`;
  } else if (selected.state === "ARRIVED") {
    a.innerHTML = `<button class="g${trainCardTutorialActive && trainCardTutorialStep === "unload" ? " track-tutorial-target" : ""}" onclick="startTimer('exit')">${lang().btnUnload}</button>`;
  } else if (selected.state === "UNLOADING" || selected.state === "CLEANING" || selected.state === "CATERING" || selected.state === "BOARDING") {
    a.innerHTML = `<em>${lang().working}</em>`;
  } else if (selected.state === "WAIT_CATERING") {
    a.innerHTML = `<p>${lang().cateringTeams}: ${cateringTeamsInUse}/${unlockedCateringTeamsCount} ${lang().teamsOccupied}</p>` +
      (selected.hasCateringTeam
        ? `<em>${lang().cateringAlreadyRunning}</em>`
        : cateringTeamsInUse < unlockedCateringTeamsCount
          ? `<button class="y" onclick="startTimer('catering')">${lang().startCatering}</button>`
          : `<em>${lang().allCateringBusy}</em>`);
  } else if (selected.state === "WAIT_CLEAN") {
    a.innerHTML = `<p>${lang().cleaningTeams}: ${cleaningTeamsInUse}/${unlockedCleaningTeamsCount} ${lang().teamsOccupied}</p><button class="y${trainCardTutorialActive && trainCardTutorialStep === "clean" ? " track-tutorial-target" : ""}" onclick="startTimer('clean')">${lang().btnClean}</button>`;
  } else if (selected.state === "WAIT_CLEAN_TEAM") {
    a.innerHTML = `<p>${lang().cleaningTeams}: ${cleaningTeamsInUse}/${unlockedCleaningTeamsCount} ${lang().teamsOccupied}</p>` +
      (cleaningTeamsInUse < unlockedCleaningTeamsCount
        ? `<button class="y" onclick="startTimer('clean')">${lang().startCleaning}</button>`
        : `<em>${lang().waitFreeTeam}</em>`);
  } else if (selected.state === "WAIT_BOARD") {
    a.innerHTML = `<button class="b${trainCardTutorialActive && trainCardTutorialStep === "board" ? " track-tutorial-target" : ""}" onclick="startTimer('board')">${lang().btnBoard}</button>`;
  } else if (selected.state === "READY_DEPART") {
    a.innerHTML = `<button class="r${trainCardTutorialActive && trainCardTutorialStep === "depart" ? " track-tutorial-target" : ""}" onclick="depart()">${lang().btnDepart}</button>`;
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
    speedUpBonusActive: t.speedUpBonusActive === true,
    speedUpOriginalSpeed: Number(t.speedUpOriginalSpeed) || null,
    speed: Number(t.speed) || null,
    pendingAction: false
  }));
}

function saveGameState() {
  // Aktuální vlaky ukládáme jen pod klíčem aktuálního nádraží.
  if (currentStationKey) savedTrainsByStation[currentStationKey] = serializeCurrentStationTrains();

  if (currentStationKey) stationMoneyByStation[currentStationKey] = Math.max(0, Number(globalMoney) || 0);
  const saveContainer = {
    saveVersion: 7,
    premiumCoins: Math.max(0, Math.floor(Number(premiumCoins) || 0)),
    speedUpTutorialBubbleShown: speedUpTutorialBubbleShown === true,
    globalMoney: globalMoney, // zpětná kompatibilita se staršími savy
    stationMoneyByStation: stationMoneyByStation,
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
      const legacyMoney = Number.isFinite(savedMoney) && savedMoney >= 0 ? savedMoney : 100;
      stationMoneyByStation = parsed.stationMoneyByStation && typeof parsed.stationMoneyByStation === "object" && !Array.isArray(parsed.stationMoneyByStation)
        ? parsed.stationMoneyByStation
        : {};
      // Převod starého globálního zůstatku: zachováme ho v Plzni, ostatní stanice začnou vlastní startovní kasou.
      if (!Object.prototype.hasOwnProperty.call(stationMoneyByStation, "plzen")) stationMoneyByStation.plzen = legacyMoney;
      if (!Object.prototype.hasOwnProperty.call(stationMoneyByStation, "zwiesel")) stationMoneyByStation.zwiesel = 200;
      for (const [key, value] of Object.entries(stationMoneyByStation)) {
        const amount = Number(value);
        stationMoneyByStation[key] = Number.isFinite(amount) && amount >= 0 ? amount : 100;
      }
      globalMoney = legacyMoney;
      const savedCoins = Number(parsed.premiumCoins);
      premiumCoins = Number.isFinite(savedCoins) && savedCoins >= 0 ? Math.floor(savedCoins) : 1;
      speedUpTutorialBubbleShown = parsed.speedUpTutorialBubbleShown === true;
      GLOBAL_PLAYER_DATA.unlockedStations = Array.isArray(parsed.unlockedStations)
         ? parsed.unlockedStations.filter(key => typeof key === "string")
         : ["zwiesel"];
      // Zwiesel je výchozí hratelná stanice i pro existující savy; ostatní odemčení zachováme.
      if (!GLOBAL_PLAYER_DATA.unlockedStations.includes("zwiesel")) {
        GLOBAL_PLAYER_DATA.unlockedStations.unshift("zwiesel");
      }

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
  if (confirm(lang().deleteSaveConfirm)) {
    // 1. Vymažeme komplet data z paměti prohlížeče
    localStorage.removeItem('trainOps_save');
    // Reset tutoriálu: při novém začátku se welcome popup ve Zwieselu ukáže znovu.
    localStorage.removeItem('station_zwiesel_welcome_seen_v1');
    localStorage.removeItem('station_zwiesel_train_card_tutorial_v1');
    localStorage.removeItem('station_zwiesel_first_contract_tutorial_v1');
    localStorage.removeItem('station_zwiesel_first_contract_tutorial_v2');
    localStorage.removeItem("station_zwiesel_two_lines_tutorial_v1");
    localStorage.removeItem("station_zwiesel_tutorial_departures_v1");
    localStorage.removeItem("station_zwiesel_cargo_tutorial_v1");
    // Vývojářský reset musí umožnit opakovat celý cargo tutorial od začátku.
    localStorage.removeItem("station_zwiesel_cargo_trigger_v2");
    localStorage.removeItem("station_zwiesel_cargo_bonus_claimed_v1");
    localStorage.removeItem("station-cargo-state-v1");
    sessionStorage.removeItem("station_zwiesel_cargo_spawned_v1");
    
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
        if (trainCardTutorialActive && trainCardTutorialStep === "coming" && selected && selected.id === t.id) {
          trainCardTutorialStep = "unload";
          renderTrainCardTutorialText();
        }
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
        if (trainCardTutorialActive && trainCardTutorialStep === "unloading" && selected && selected.id === t.id) {
          trainCardTutorialStep = "clean";
          renderTrainCardTutorialText();
          const tutorial = document.getElementById("train-card-tutorial");
          if (tutorial) { tutorial.classList.add("open"); tutorial.setAttribute("aria-hidden", "false"); }
        }
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
        if (trainCardTutorialActive && trainCardTutorialStep === "cleaning" && selected && selected.id === t.id) {
          if (t.state === "WAIT_BOARD") {
            trainCardTutorialStep = "board";
            renderTrainCardTutorialText();
            const tutorial = document.getElementById("train-card-tutorial");
            if (tutorial) { tutorial.classList.add("open"); tutorial.setAttribute("aria-hidden", "false"); }
          } else {
            // If this train requires catering, end the first-train tutorial cleanly here.
            finishTrainCardTutorial();
          }
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
        // Spouštěč nákladního vlaku: až po dokončení nástupu druhého vlaku v levelu 1.
        if (currentStationKey === "zwiesel" && Number(t.id) === 2) {
          registerZwieselSecondTrainServiced(Number(t.id));
        }
        if (trainCardTutorialActive && trainCardTutorialStep === "boarding" && selected && selected.id === t.id) {
          trainCardTutorialStep = "depart";
          renderTrainCardTutorialText();
          const tutorial = document.getElementById("train-card-tutorial");
          if (tutorial) { tutorial.classList.add("open"); tutorial.setAttribute("aria-hidden", "false"); }
        }
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

initLanguageControls();
initPrimaryNavigationControls();
initTrainCardControls();
initDepartureBoard();

// 🚀 19. SPOUŠTĚČ SMYČKY
// Oficiální nastartování celého herního loopu
requestAnimationFrame(gameLoop);

// 🟢 TADY PŘIDÁME FUNKCI PRO NAČTENÍ:
loadGameState(); 

// Spuštění první stanice (Plzeň si teď vezme data z načteného savu)
loadStation("zwiesel");

// Most pro nezávislý systém nákladních vlaků; tutorial a osobní vlaky zůstávají beze změny.
if (typeof window.initStationCargoTrains === "function") {
  window.initStationCargoTrains({
    map,
    addMoney(amount) {
      globalMoney += Math.max(0, Number(amount) || 0);
      if (currentStationKey) stationMoneyByStation[currentStationKey] = globalMoney;
      saveGameState();
      render();
    },
    addXP(amount) {
      if (!currentStationKey) return;
      if (!stationLevels[currentStationKey]) stationLevels[currentStationKey] = { lvl: 0, xp: 0 };
      stationLevels[currentStationKey].xp = (Number(stationLevels[currentStationKey].xp) || 0) + Math.max(0, Number(amount) || 0);
      checkLevelUp();
      saveGameState();
      render();
    },
    addCoin(amount) {
      premiumCoins += Math.max(0, Number(amount) || 0);
      saveGameState();
      render();
    },
    notify(message) {
      const toast = document.createElement("div");
      toast.textContent = message;
      toast.style.cssText = "position:fixed;z-index:3000;top:58px;left:50%;transform:translateX(-50%);background:#17251a;color:#fff;border:1px solid #4caf50;border-radius:10px;padding:10px 14px;font-weight:bold;box-shadow:0 4px 16px #0008;pointer-events:none;";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2800);
    }
  });
}
// Obnova nákladního vlaku po obnovení stránky, pouze pokud už byl splněn správný tutorialový krok.
if (currentStationKey === "zwiesel" &&
    localStorage.getItem("station_zwiesel_cargo_trigger_v2") === "1" &&
    localStorage.getItem("station_zwiesel_cargo_bonus_claimed_v1") !== "1") {
  sessionStorage.removeItem("station_zwiesel_cargo_spawned_v1");
  registerZwieselSecondTrainServiced(2);
}
initWelcomePopup();
initFirstContractTutorial();
initTwoLinesTutorial();
showWelcomePopup();
initTrainCardTutorial();
initSpeedUpTutorialBubble();


