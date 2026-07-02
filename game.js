// 🌍 INICIALIZACE MAPY
const map = L.map('map').setView([49.7410, 13.3860], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// STAV HRY
let money = 0;
let selected = null;
let tracks = [null, null]; // 2 volné koleje (null = volno)

// 🚉 PŘIDĚLENÍ KOLEJE (Spouští se tlačítkem v UI)
function assignTrack() {
  if (!selected || selected.state !== "WAIT_ASSIGN") return;

  for (let i = 0; i < tracks.length; i++) {
    if (!tracks[i]) {
      tracks[i] = selected.id;
      selected.track = i + 1;
      selected.state = "ARRIVED"; // Vlak úspěšně vjel na kolej
      selected.pendingAction = true;
      render();
      return;
    }
  }
  alert("Všechny koleje jsou obsazené!");
}

// 📋 VYKRESLENÍ SEZNAMU VLAKŮ
function render() {
  let q = document.getElementById("queue");
  if (!q) return;
  q.innerHTML = "";

  trains.forEach(t => {
    let d = document.createElement("div");
    d.className = "train";
    if (selected && selected.id === t.id) d.className += " selected"; // zvýraznění vybraného

    let isSelected = selected && selected.id === t.id;
    let showDot = t.pendingAction && !isSelected;

    let statusText = t.state;
    if (t.state === "WAIT_ASSIGN") statusText = "Čeká před stanicí ⏳";
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
      ${showDot ? '<div class="dot" style="display:inline-block; width:10px; height:10px; background:red; border-radius:50%; margin-right:5px;"></div>' : ''}
      <b>${t.name}</b><br>
      <small>${statusText}</small>
    `;

    d.onclick = () => { selected = t; updateDetail(); render(); };
    q.appendChild(d);
  });

  updateDetail();
}

// 🎯 DETAIL VYBRANÉHO VLAKU
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
    img.style.width = "100px"; // menší náhled, ať to nerozbije UI
  }

  // Výpočet procent pro Progress Bary
  let p1Width = (selected.progress && selected.progress.exit) ? selected.progress.exit : 0;
  let p2Width = (selected.progress && selected.progress.clean) ? selected.progress.clean : 0;
  let p3Width = (selected.progress && selected.progress.board) ? selected.progress.board : 0;

  document.getElementById("p1").style.width = p1Width + "%";
  document.getElementById("p2").style.width = p2Width + "%";
  document.getElementById("p3").style.width = p3Width + "%";

  renderActions();
}

// ⚙️ TLAČÍTKA AKCÍ podle aktuálního stavu vlaku
function renderActions() {
  let a = document.getElementById("actions");
  a.innerHTML = "";

  if (!selected) return;

  // Podle stavu vlaku nabídneme správné tlačítko
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
    a.innerHTML = `<em>Vlak momentálně pracuje nebo jede...</em>`;
  }
}

// ▶️ SPUŠTĚNÍ ODBAVENÍ (ČASOVAČE)
function startTimer(type) {
  if (!selected) return;

  const train = selected;

  if (type === "exit") train.state = "UNLOADING";
  if (type === "clean") train.state = "CLEANING";
  if (type === "board") train.state = "BOARDING";

  train.timer = train.timers[type];
  train.pendingAction = false;
  render();
}

// 🗺️ PŘÍPRAVA TRAS (Výpočet délek úseků)
function prepareRoutes() {
  for (const key in routes) {
    const route = routes[key];
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

// Výpočet přesné GPS pozice vlaku na trase na základě ujetých metrů
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

// 🚂 ODJEZD VLAKU ZE STANICE
function depart(){
  if(!selected || selected.state !== "READY_DEPART") return;

  money += 100; // Případně uprav částku
  document.getElementById("money").innerText = money;

  const t = selected;

  if (t.track) {
    tracks[t.track-1] = null;
    t.track = null;
  }

  t.state = "EN_ROUTE_THERE";
  t.distance = 0;
  t.pendingAction = false;

  // 🖼️ Vytvoření markeru s reálnou fotkou vlaku z data.js
  if(!t.marker) {
    t.marker = L.marker(routes[t.routeKey][0], {
      icon: L.divIcon({
        html: `<img src="${t.image}" class="train-map-image">`,
        className: 'train-div-icon',
        iconSize: [100, 75],      // Velikost kontejneru pro ikonu na mapě
        iconAnchor: [20, 12]     // Střed ikony (polovina šířky a výšky), aby jel přesně po čáře
      })
    }).addTo(map);
  } else {
    t.marker.setLatLng(routes[t.routeKey][0]);
  }

  t.progress = { exit:0, clean:0, board:0 };
  selected = null;
  render();
}


// 🔁 HERNÍ LOOP
let lastTime = performance.now();

function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  trains.forEach(t => {
    const route = routes[t.routeKey];

    // 🚂 JÍZDA TAM
    if (t.state === "EN_ROUTE_THERE") {
      t.distance += t.speed * dt;
      if (t.distance < route.totalLength) {
        t.marker.setLatLng(getPositionOnRoute(route, t.distance));
      } else {
        // Vlak dojel do cíle (např. do Prahy)
        t.distance = route.totalLength;
        t.state = "AT_DESTINATION";
        t.stayTimer = t.stayTime;
      }
    }

    //     // 🏢 POBYT VE STANICI (V CÍLI)
    if(t.state === "AT_DESTINATION"){
      t.stayTimer -= dt;

      if(t.stayTimer <= 0){
        // Čas vypršel -> otáčíme vlak a posíláme ho zpět
        t.state = "EN_ROUTE_BACK";
        // Vzdálenost na cestu zpět začíná na maximu (v cíli)
        t.distance = route.totalLength; 
      }
    }

    // 🚂 JÍZDA ZPĚT (Obrácené pořadí, bod po bodu)
    if(t.state === "EN_ROUTE_BACK"){
      // Rychlost odečítáme, jedeme pozpátku k nule
      t.distance -= t.speed * dt;

      if(t.distance > 0){
        t.marker.setLatLng(
          getPositionOnRoute(route, t.distance)
        );
      } else {
        // Vlak dorazil zpět na konečnou do Plzně!
        if(t.marker) {
          map.removeLayer(t.marker);
          t.marker = null;
        }

        t.distance = 0;
        t.state = "WAIT_ASSIGN"; // Hlásí se o přidělení koleje
        t.pendingAction = true;  // Rozsvítí se červená tečka u vlaku
      }
    }


    // ⏳ PROGRESS: VYKLÁDÁNÍ
    if (t.state === "UNLOADING" && t.timer != null) {
      t.timer -= dt;
      t.progress.exit = (1 - t.timer / t.timers.exit) * 100;
      if (t.timer <= 0) {
        t.state = "WAIT_CLEAN";
        t.pendingAction = true;
      }
    }

    // 🧽 PROGRESS: ÚKLID
    if (t.state === "CLEANING" && t.timer != null) {
      t.timer -= dt;
      t.progress.clean = (1 - t.timer / t.timers.clean) * 100;
      if (t.timer <= 0) {
        t.state = "WAIT_BOARD";
        t.pendingAction = true;
      }
    }

    // 🚉 PROGRESS: NÁSTUP
    if (t.state === "BOARDING" && t.timer != null) {
      t.timer -= dt;
      t.progress.board = (1 - t.timer / t.timers.board) * 100;
      if (t.timer <= 0) {
        t.state = "READY_DEPART";
        t.pendingAction = true;
      }
    }
  });

  render();
  requestAnimationFrame(gameLoop);
}

// 🚀 SPUŠTĚNÍ HRY
prepareRoutes();
render();
requestAnimationFrame(gameLoop);
