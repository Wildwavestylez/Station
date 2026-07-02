// 🌍 INICIALIZACE MAPY
const map = L.map('map').setView([49.7410, 13.3860], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// STAV HRY
let money = 0;
let selected = null;
let tracks = [null, null];

// 🚉 PŘIDĚLENÍ KOLEJE
function assign(train){
  for(let i=0; i<tracks.length; i++){
    if(!tracks[i]){
      tracks[i] = train.id;
      train.track = i+1;
      train.state = "ARRIVED";
      train.pendingAction = true;
      return;
    }
  }
}

// 📋 VYKRESLENÍ SEZNAMU VLAKŮ
function render(){
  let q = document.getElementById("queue");
  if (!q) return;
  q.innerHTML = "";

  trains.forEach(t => {
    let d = document.createElement("div");
    d.className = "train";

    let isSelected = selected && selected.id === t.id;
    let showDot = t.pendingAction && !isSelected;

    let statusText = t.state;
    if(t.state === "EN_ROUTE_THERE") statusText = "Jede do cíle ➔";
    if(t.state === "AT_DESTINATION") statusText = `V cíli (${t.stayTimer}s)`;
    if(t.state === "EN_ROUTE_BACK") statusText = "Vrací se zpět";
    if(t.state === "COMING") statusText = `Přijíždí (${t.travel}s)`;
    if(t.state === "ARRIVED") statusText = `Na stanici (Kolej ${t.track})`;

    d.innerHTML = `
      ${showDot ? '<div class="dot"></div>' : ''}
      <b>${t.name}</b><br>
      <small>${statusText}</small>
    `;

    d.onclick = () => { selected = t; updateDetail(); };
    q.appendChild(d);
  });

  updateDetail();
}

// 🎯 DETAIL VYBRANÉHO VLAKU
function updateDetail(){
  if(!selected) {
    document.getElementById("name").innerText = "Vyber vlak";
    document.getElementById("state").innerText = "---";
    document.getElementById("img").style.display = "none";
    document.getElementById("p1").style.width = "0%";
    document.getElementById("p2").style.width = "0%";
    document.getElementById("p3").style.width = "0%";
    document.getElementById("actions").innerHTML = "";
    return;
  }

  document.getElementById("name").innerText = selected.name;
  document.getElementById("state").innerText = selected.state;
  
  let img = document.getElementById("img");
  img.src = selected.image;
  img.style.display = "block";

  document.getElementById("p1").style.width = (selected.progress.exit || 0) + "%";
  document.getElementById("p2").style.width = (selected.progress.clean || 0) + "%";
  document.getElementById("p3").style.width = (selected.progress.board || 0) + "%";

  renderActions();
}

// ⚙️ TLAČÍTKA AKCÍ
function renderActions(){
  let a = document.getElementById("actions");
  a.innerHTML = "";

  if(!selected) return;

  if(selected.state === "ARRIVED") a.innerHTML += `<button class="g" onclick="startTimer('exit')">VYLOŽIT</button>`;
  if(selected.state === "WAIT_CLEAN") a.innerHTML += `<button class="y" onclick="startTimer('clean')">ÚKLID</button>`;
  if(selected.state === "WAIT_BOARD") a.innerHTML += `<button class="b" onclick="startTimer('board')">NÁSTUP</button>`;
  if(selected.state === "READY_DEPART") a.innerHTML += `<button class="r" onclick="depart()">ODJEZD</button>`;
}

// ▶️ SPUŠTĚNÍ ODBAVENÍ
function startTimer(type){
  if(!selected) return;

  const train = selected;

  if(type === "clean") train.state = "CLEANING";
  if(type === "board") train.state = "BOARDING";
  if(type === "exit") train.state = "AT_DESTINATION";

  train.timer = train.timers[type];
  train.pendingAction = false;
}

function prepareRoutes() {
  for (const key in routes) {

    const route = routes[key];

    route.segmentLengths = [];
    route.totalLength = 0;

    for (let i = 0; i < route.length - 1; i++) {

      const a = L.latLng(route[i]);
      const b = L.latLng(route[i + 1]);

      const len = a.distanceTo(b);

      route.segmentLengths.push(len);
      route.totalLength += len;
    }
  }
}

function getPositionOnRoute(route, distance){

  let passed = 0;

  for(let i = 0; i < route.segmentLengths.length; i++){

    const segment = route.segmentLengths[i];

    if(distance <= passed + segment){

      const t = (distance - passed) / segment;

      const lat =
        route[i][0] + (route[i+1][0] - route[i][0]) * t;

      const lng =
        route[i][1] + (route[i+1][1] - route[i][1]) * t;

      return [lat, lng];
    }

    passed += segment;
  }

  return route[route.length - 1];
}

// 🚂 ODJEZD Z PLZNĚ
function depart(){

  if(!selected || selected.state !== "READY_DEPART") return;

  money += 100;
  document.getElementById("money").innerText = money;

  const t = selected;

  tracks[t.track-1] = null;
  t.track = null;

  t.state = "EN_ROUTE_THERE";
  t.distance = 0;
  t.pendingAction = false;

  t.marker = L.marker(routes[t.routeKey][0], {
    icon: L.divIcon({
      html: '🚂',
      className: 'train-div-icon',
      iconSize: [24, 24]
    })
  }).addTo(map);

  t.progress = { exit:0, clean:0, board:0 };

  selected = null;
}

// 🔁 HERNÍ LOOP
let lastTime = performance.now();

function gameLoop(now){

  const dt = (now - lastTime) / 1000;
  lastTime = now;

  trains.forEach(t => {

    const route = routes[t.routeKey];

    // 🚂 JÍZDA TAM
    if(t.state === "EN_ROUTE_THERE"){

      t.distance += t.speed * dt;

      if(t.distance < route.totalLength){
        t.marker.setLatLng(
          getPositionOnRoute(route, t.distance)
        );
      } else {
        t.distance = route.totalLength;
        t.state = "AT_DESTINATION";
        t.stayTimer = t.stayTime;
      }
    }

    // 🏢 POBYT VE STANICI
    if(t.state === "AT_DESTINATION"){

      t.stayTimer -= dt;

      if(t.stayTimer <= 0){
        t.state = "WAIT_CLEAN";
        t.pendingAction = true;
      }
    }

    // 🧽 CLEAN TIMER (UI tlačítko)
    if(t.state === "CLEANING" && t.timer != null){
  t.timer -= dt;
  t.progress.clean = (1 - t.timer / t.timers.clean) * 100;

  if(t.timer <= 0){
    t.state = "WAIT_BOARD";
    t.pendingAction = true;
  }
}

    // 🚉 BOARD TIMER (UI tlačítko)
    if(t.state === "BOARDING" && t.timer != null){
      t.timer -= dt;
      t.progress.board = (1 - t.timer / t.timers.board) * 100;

      if(t.timer <= 0){
        t.state = "READY_DEPART";
        t.pendingAction = true;
      }
    }

    // 🚂 JÍZDA ZPĚT
    if(t.state === "EN_ROUTE_BACK"){

      t.distance -= t.speed * dt;

      if(t.distance > 0){
        t.marker.setLatLng(
          getPositionOnRoute(route, t.distance)
        );
      } else {
        map.removeLayer(t.marker);
        t.marker = null;

        t.distance = 0;
        t.state = "COMING";
        t.travel = 5;
      }
    }

    // ⏳ COMING BACK INTO SYSTEM
    if(t.state === "COMING"){
      t.travel -= dt;
      if(t.travel <= 0){
        t.state = "WAIT_ASSIGN";
      }
    }

  });

  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);