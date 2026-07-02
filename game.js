// ==========================================
// 🧭 KROK 1: INICIALIZACE A PROMĚNNÉ
// ==========================================

// 🌍 1. Spuštění mapy a načtení dlaždic
const map = L.map('map').setView([49.7410, 13.3860], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 💰 2. Základní stav herní session
let money = 0;
let selected = null;
let tracks = [null, null]; // 2 volné kolejové pozice na nádraží

// ==========================================
// 🧱 KUS 2: BOČNÍ MENU A NAKUPOVÁNÍ NÁDRAŽÍ
// ==========================================

// 📂 4. GENEROVÁNÍ SEZNAMU NÁDRAŽÍ DO MENU
function renderSidebar() {
  const list = document.getElementById("station-list");
  if (!list) return;
  list.innerHTML = "";

  // Projdeme všechna nádraží zaregistrovaná v data.js
  for (const key in STATIONS_REGISTRY) {
    const st = STATIONS_REGISTRY[key];
    const isUnlocked = GLOBAL_PLAYER_DATA.unlockedStations.includes(key);
    const isActive = currentStationKey === key;

    const div = document.createElement("div");
    div.className = `station-item ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;

    if (isUnlocked) {
      const lvlInfo = stationLevels[key] || { lvl: 0, xp: 0 };
      div.innerHTML = `
        <h4>${st.name} ${st.flag}</h4>
        <p>⭐️ Level ${lvlInfo.lvl} | Měna: ${st.currency}</p>
      `;
      div.onclick = () => { loadStation(key); toggleSidebar(); };
    } else {
      div.innerHTML = `
        <h4>${st.name} ${st.flag} 🔒</h4>
        <p>Cena odemčení: <b>${st.unlockCost} Kč</b><br>Vyžaduje: Plzeň Level ${st.requiredParentLevel}</p>
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
}

// ==========================================
// 🧱 KUS 3: ZAVÁDĚNÍ NÁDRAŽÍ A VLAKŮ DO HRY
// ==========================================

// 🚉 6. NAČTENÍ A PŘEPNUTÍ KOMPLETNÍHO NÁDRAŽÍ
function loadStation(stationKey) {
  // Smazání starých jedoucích vlaků z mapy, aby nezůstaly v jiném městě
  trains.forEach(t => { 
    if (t.marker) { 
      map.removeLayer(t.marker); 
      t.marker = null; 
    } 
  });

  currentStationKey = stationKey;
  currentStationData = STATIONS_REGISTRY[stationKey];

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

  // Vyčištění seznamu a nahrání startovních vlaků z poolu nádraží
  trains = [];
  currentStationData.startingTrains.forEach(id => {
    addNewTrainFromPool(id);
  });

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
    required_turnaround: template.initialContract
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

// 🚉 10. PŘIDĚLENÍ VOLNÉ KOLEJE VLAKU
function assignTrack() {
  if (!selected || selected.state !== "WAIT_ASSIGN") return;

  // Procházíme pouze koleje, které má stanice momentálně odemčené
  for (let i = 0; i < tracks.length; i++) {
    if (!tracks[i]) {
      tracks[i] = selected.id;
      selected.track = i + 1;
      selected.state = "ARRIVED";
      selected.pendingAction = true;
      render();
      return;
    }
  }
  alert("Všechny odemčené koleje jsou obsazené!");
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

  // Odměna za vypravení se přičte do globální kasy
  globalMoney += currentStationData.moneyPerDepart || 100;

  const t = selected;
  
  // Uvolnění kolejového stání v poli
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
        iconSize:, 
        iconAnchor: [50, 37.5] // Vycentrování na střed, aby jel přesně po čáře
      })
    }).addTo(map);
  } else {
    t.marker.setLatLng(route[0]);
  }

  t.progress = { exit: 0, clean: 0, board: 0 };
  selected = null;
  render();
}

// ==========================================
// 🧱 KUS 6: KONTROLA KONTRAKTŮ A LEVEL UP
// ==========================================

// 🏆 13. ZPRACOVÁNÍ NÁVRATU VLAKU (WoA KONTRAKT)
function processTrainReturn(t) {
  t.current_turnaround += 1;

  // Pokud vlak dokončil požadovaný počet otoček (např. 2/2, 3/3)
  if (t.current_turnaround === t.required_turnaround) {
    let earnedPoints = t.required_turnaround;
    
    // Přičteme XP body konkrétnímu městu, kde vlak zrovna jezdí
    stationLevels[currentStationKey].xp += earnedPoints;
    alert(`🎉 Kontrakt kompletní! Vlak ${t.name} přinesl ${earnedPoints} XP bodů pro nádraží ${currentStationData.name}.`);

    // Zvýšíme obtížnost a hodnotu kontraktu pro příště
    t.required_turnaround += 1;
    t.current_turnaround = 0;

    // Spustíme kontrolu, zda nádraží nepostoupilo na nový level
    checkLevelUp();
  }

  // Vlak se vrátí do fronty před stanici a rozsvítí se u něj upozornění
  t.state = "WAIT_ASSIGN";
  t.pendingAction = true;
  render();
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
  }
}
// ==========================================
// 🧱 KUS 7: RENDEROVÁNÍ UI (SEZNAMY, DETAILY A AKCE)
// ==========================================

// 📋 15. HLAVNÍ VYKRESLENÍ STATISTIK A SEZNAMU VLAKŮ
function render() {
  if (!currentStationData) return;

  // 1. Aktualizace horní lišty podle aktivního balíčku měst
  const myData = stationLevels[currentStationKey] || { lvl: 0, xp: 0 };
  const currentLvlConfig = currentStationData.levels[myData.lvl] || { xpNeeded: "Max" };

  document.getElementById("money").innerText = globalMoney;
  document.getElementById("station-name").innerText = currentStationData.name;
  document.getElementById("tracks-count").innerText = `${tracks.filter(x => x).length}/${unlockedTracksCount}`;
  document.getElementById("level-info").innerText = `LVL ${myData.lvl} (${myData.xp}/${currentLvlConfig.xpNeeded} XP)`;

  // 2. Vykreslení seznamu vlaků v levém panelu (frontě)
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
    if (t.state === "WAIT_ASSIGN") statusText = `Čeká před stanicí [${t.current_turnaround}/${t.required_turnaround}] ⏳`;
    if (t.state === "ARRIVED") statusText = `Na stanici (Kolej ${t.track})`;
    if (t.state === "UNLOADING") statusText = `Vykládání (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_CLEAN") statusText = "Čeká na úklid 🧽";
    if (t.state === "CLEANING") statusText = `Úklid (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "WAIT_BOARD") statusText = "Čeká na nástup 👥";
    if (t.state === "BOARDING") statusText = `Nástup (${Math.max(0, Math.ceil(t.timer))}s)`;
    if (t.state === "READY_DEPART") statusText = "PŘIPRAVEN K ODJEZDU 🟢";
    if (t.state === "EN_ROUTE_THERE") statusText = "Jede do cíle ➔";
    if (t.state === "AT_DESTINATION") statusText = `V cílové stanici (${Math.max(0, Math.ceil(t.stayTimer))}s)`;

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
  a.innerHTML = "";
  if (!selected) return;

  if (selected.state === "WAIT_ASSIGN") {
    a.innerHTML = `<button class="g" onclick="assignTrack()">PŘIDĚLIT KOLEJ</button>`;
  } else if (selected.state === "ARRIVED") {
    a.innerHTML = `<button class="g" onclick="startTimer('exit')">VYLOŽIT</button>`;
  } else if (selected.state === "WAIT_CLEAN") {
    a.innerHTML = `<button class="y" onclick="startTimer('clean')">ÚKLID</button>`;
  } else if (selected.state === "WAIT_BOARD") {
    a.innerHTML = `<button class="b" onclick="startTimer('board')">NÁSTUP</button>`;
  } else if (selected.state === "READY_DEPART") {
    a.innerHTML = `<button class="r" onclick="depart()">ODJEZD</button>`;
  } else {
    a.innerHTML = `<em>Vlak momentálně pracuje...</em>`;
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
requestAnimationFrame(gameLoop);




