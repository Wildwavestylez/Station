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
let unlockedTracksCount = 1;    // Počet aktuálně odemčených kolejí v daném městě
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
      div.onclick = () => { loadStation(key); toggleSidebar(); };
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

  // Přesun kamery a zoomu mapy na zvolené souřadnice
  map.setView(currentStationData.mapCenter, currentStationData.mapZoom);

  // Inicializace paměti levelů pro nové město, pokud ji ještě nemá
  if (!stationLevels[stationKey]) {
    stationLevels[stationKey] = { lvl: 0, xp: 0 };
  }

  // Zjištění počtu kolejí podle aktuálního levelu nádraží
  unlockedTracksCount = currentStationData.startingTracks;
  const myLvl = stationLevels[stationKey].lvl;
  for (let l = 0; l <= myLvl; l++) {
    if (currentStationData.levels[l] && currentStationData.levels[l].unlocksTrack) {
      unlockedTracksCount = currentStationData.levels[l].unlocksTrack;
    }
  }

  // Vytvoření čistého kolejového pole a reset výběru
  tracks = Array(unlockedTracksCount).fill(null);
  selected = null;

  // Spuštění matematických výpočtů délek tras
  prepareRoutes();

  // Vyčištění seznamu a nahrání vlaků (Uložených z paměti VS Startovních z data.js)
  trains = [];

  if (window.loadedTrainsCache && window.loadedTrainsCache.length > 0) {
    // NAČÍTÁME VLAKY Z ULOŽENÉHO STAVU
    window.loadedTrainsCache.forEach(saved => {
      const template = currentStationData.trainsPool[saved.id];
      if (template) {
        trains.push({
          id: saved.id,
          name: template.name,
          image: template.image,
          state: saved.state || "WAIT_ASSIGN",
          track: null,
          routeKey: template.routeKey,
          distance: 0,
          speed: template.speed,
          stayTime: template.stayTime,
          stayTimer: 0,
          marker: null,
          progress: { exit: 0, clean: 0, board: 0 },
          timers: template.timers,
          pendingAction: saved.pendingAction ?? false,
          current_turnaround: saved.current_turnaround ?? 0,
          required_turnaround: saved.required_turnaround ?? template.initialContract,
          rewardMoney: template.rewardMoney || 1000,
          rewardXP: template.rewardXP || 1
        });
      }
    });
    window.loadedTrainsCache = null;
  } else {
    // ŽÁDNÝ SAVE NEEXISTUJE -> NAČTEME POUZE STARTOVNÍ VLAKY Z DATA.JS
    if (currentStationData.startingTrains) {
      currentStationData.startingTrains.forEach(id => {
        addNewTrainFromPool(id);
      });
    }
  }

  renderSidebar();
  render();
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
    distance: 0,
    speed: template.speed,
    stayTime: template.stayTime,
    stayTimer: 0,
    marker: null,
    progress: { exit: 0, clean: 0, board: 0 },
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

  if (type === "exit") selected.state = "UNLOADING";
  if (type === "clean") selected.state = "CLEANING";
  if (type === "board") selected.state = "BOARDING";

  selected.timer = selected.timers[type];
  selected.pendingAction = false;
  render();
}

// 🚂 12. ODJEZD VLAKU Z NÁDRAŽÍ NA TRAŤ
function depart() {
  if (!selected || selected.state !== "READY_DEPART") return;

  const t = selected;

  // 🟢 TADY BEREME PENÍZE DYNAMICKY PODLE KONKRÉTNÍHO VLAKU:
  globalMoney += t.rewardMoney || 1000; 
  document.getElementById("money").innerText = globalMoney;

  if (t.track) {
    tracks[t.track - 1] = null;
    t.track = null;
  }
  const route = currentStationData.routes[t.routeKey];
  t.state = "EN_ROUTE_THERE";
  t.distance = 0;
  t.pendingAction = false;

  // Vytvoření markeru s oříznutým průhledným obrázkem vlaku
  if (!t.marker) {
    t.marker = L.marker(route[0], {
      icon: L.divIcon({
        html: `<img src="${t.image}" class="train-map-image">`,
        className: 'train-div-icon',
        iconSize: [100, 100],
        iconAnchor: [100, 100] // Vycentrování na střed, aby jel přesně po čáře
      })
    }).addTo(map);
  } else {
    t.marker.setLatLng(route[0]);
  }

  t.progress = { exit: 0, clean: 0, board: 0 };
  selected = null;
  render();
  saveGameState();
}

// ==========================================
// 🧱 KUS 6: KONTROLA KONTRAKTŮ A LEVEL UP
// ==========================================

// 🏆 13. ZPRACOVÁNÍ NÁVRATU VLAKU (WoA KONTRAKT)
function processTrainReturn(t) {
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

  t.state = "WAIT_ASSIGN";
  t.pendingAction = true;
  render();
  saveGameState();
}

  

// 📈 14. KONTROLA ZVÝŠENÍ LEVELU NÁDRAŽÍ
function checkLevelUp() {
  let myData = stationLevels[currentStationKey];
  let config = currentStationData.levels[myData.lvl];

  if (!config) return;

  // Pokud máme dostatek XP, postoupíme o úroveň výš
  if (myData.xp >= config.xpNeeded) {
    myData.xp -= config.xpNeeded;
    myData.lvl += 1;

    // Pokud má tento level v konfiguráku nadefinovanou speciální funkci, spustíme ji
    if (config.action) {
      config.action();
    }

    alert(`⭐️ LEVEL UP! Nádraží ${currentStationData.name} postoupilo na Level ${myData.lvl}!\nOdměna: ${config.rewardText}`);
    
    // Přepočítáme kapacitu kolejí, pokud nová úroveň nějaké odemkla
    let nextTracks = currentStationData.startingTracks;
    for (let l = 0; l <= myData.lvl; l++) {
      if (currentStationData.levels[l] && currentStationData.levels[l].unlocksTrack) {
        nextTracks = currentStationData.levels[l].unlocksTrack;
      }
    }
    
    // Rozšíříme pole kolejí, pokud se kapacita zvětšila
    if (nextTracks > unlockedTracksCount) {
      unlockedTracksCount = nextTracks;
      while (tracks.length < unlockedTracksCount) tracks.push(null);
    }

    // Aktualizujeme menu a celé UI
    renderSidebar();
    saveGameState();
  }
}
// ==========================================
// 🧱 KUS 7: RENDEROVÁNÍ UI (SEZNAMY, DETAILY A AKCE)
// ==========================================

// 📋 15. HLAVNÍ VYKRESLENÍ STATISTIK A SEZNAMU VLAKŮ
function render() {
  if (!currentStationData || !stationLevels[currentStationKey]) return;

  const myData = stationLevels[currentStationKey];
  const currentLvlConfig = currentStationData.levels[myData.lvl] || { xpNeeded: "Max" };

  document.getElementById("money").innerText = globalMoney;
  document.getElementById("station-name").innerText = currentStationData.name;
  document.getElementById("tracks-count").innerText = `${tracks.filter(x => x).length}/${unlockedTracksCount}`;
  document.getElementById("level-info").innerText = `LVL ${myData.lvl} (${myData.xp}/${currentLvlConfig.xpNeeded} XP)`;

  let q = document.getElementById("queue");
  if (!q) return;
  q.innerHTML = "";

  trains.forEach(t => {
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
    if (t.state === "CLEANING") statusText = `${lang().cleaning} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_BOARD") statusText = lang().waitBoard;
    if (t.state === "BOARDING") statusText = `${lang().boarding} (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "READY_DEPART") statusText = lang().readyDepart;
    if (t.state === "EN_ROUTE_THERE") statusText = lang().enRouteThere;
    if (t.state === "AT_DESTINATION") statusText = `${lang().atDestination} (${Math.max(0, Math.ceil(t.stayTimer))}s)`;
    if (t.state === "EN_ROUTE_BACK") statusText = lang().enRouteBack;

    d.innerHTML = `
      ${showDot ? '<div class="dot"></div>' : ''}
      <b>${t.name}</b><br>
      <small>${statusText}</small>
    `;

    d.onclick = () => { selected = t; updateDetail(); render(); };
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
  let p3Width = (selected.progress && selected.progress.board) ? selected.progress.board : 0;

  document.getElementById("p1").style.width = p1Width + "%";
  document.getElementById("p2").style.width = p2Width + "%";
  document.getElementById("p3").style.width = p3Width + "%";

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
  } else if (selected.state === "UNLOADING" || selected.state === "CLEANING" || selected.state === "BOARDING") {
    a.innerHTML = `<em>${lang().working}</em>`;
  } else if (selected.state === "WAIT_CLEAN") {
    a.innerHTML = `<button class="y" onclick="startTimer('clean')">${lang().btnClean}</button>`;
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
function saveGameState() {
  const saveContainer = {
    globalMoney: globalMoney,
    unlockedStations: GLOBAL_PLAYER_DATA.unlockedStations,
    stationLevels: stationLevels,
    // 🟢 Tady uložíme i přesný stav vlaků, abychom o ně nepřišli
    savedTrains: trains.map(t => ({
      id: t.id,
      state: t.state,
      current_turnaround: t.current_turnaround,
      required_turnaround: t.required_turnaround,
      pendingAction: t.pendingAction
    }))
  };
  
  localStorage.setItem('trainOps_save', JSON.stringify(saveContainer));
  console.log("💾 Hra a stav vlaků byly úspěšně uloženy!");
}

// 2. Vylepšená funkce pro načtení hry při startu
function loadGameState() {
  const savedData = localStorage.getItem('trainOps_save');
  
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      
      globalMoney = parsed.globalMoney ?? 100;
      GLOBAL_PLAYER_DATA.unlockedStations = parsed.unlockedStations ?? ["plzen"];
      stationLevels = parsed.stationLevels ?? {};
      
      // Dočasně si schováme načtené vlaky, které pak dosadíme ve funkci loadStation
      window.loadedTrainsCache = parsed.savedTrains ?? null;
      
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
        t.marker.setLatLng(getPositionOnRoute(route, t.distance));
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
      t.progress.clean = (1 - t.timer / t.timers.clean) * 100;
      if (t.timer <= 0) {
        t.state = "WAIT_BOARD";
        t.pendingAction = true;
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
        t.marker.setLatLng(getPositionOnRoute(route, t.distance));
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

// 🚀 19. SPOUŠTĚČ SMYČKY
// Oficiální nastartování celého herního loopu
requestAnimationFrame(gameLoop);

// 🟢 TADY PŘIDÁME FUNKCI PRO NAČTENÍ:
loadGameState(); 

// Spuštění první stanice (Plzeň si teď vezme data z načteného savu)
loadStation("plzen");


