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

  let train = selected;
  train.timer = train.timers[type];
  train.pendingAction = false;
  render();

  let interval = setInterval(()=>{
    train.timer--;
    train.progress[type] = ((train.timers[type] - train.timer) / train.timers[type]) * 100;

    if(train.timer <= 0){
      clearInterval(interval);
      train.progress[type] = 100;
      train.pendingAction = true;

      if(type==="exit")   train.state = "WAIT_CLEAN";
      if(type==="clean")  train.state = "WAIT_BOARD";
      if(type==="board")  train.state = "READY_DEPART";

      render();
    }
    if(selected?.id === train.id) updateDetail();
  }, 1000);
}

// 🚂 ODJEZD Z PLZNĚ
function depart(){
  if(!selected || selected.state !== "READY_DEPART") return;

  money += 100;
  document.getElementById("money").innerText = money;

  tracks[selected.track-1] = null;
  selected.track = null;
  selected.state = "EN_ROUTE_THERE";
  selected.currentStep = 0;
  selected.pendingAction = false;

  selected.marker = L.marker(routes[selected.routeKey][0], {
    icon: L.divIcon({ html: '🚂', className: 'train-div-icon', iconSize: [24, 24] })
  }).addTo(map);

  selected.progress = { exit:0, clean:0, board:0 };
  selected = null;
  render();
}

// 🔁 BULLETPROOF HERNÍ LOOP
setInterval(()=>{
  trains.forEach(t => {
    if(t.state === "WAIT_ASSIGN") assign(t);
    
    if(t.state === "COMING" && --t.travel <= 0) t.state = "WAIT_ASSIGN";

    if(t.state === "EN_ROUTE_THERE"){
      const route = routes[t.routeKey];
      t.currentStep++;
      if(t.currentStep < route.length) {
        t.marker.setLatLng(route[t.currentStep]);
      } else {
        t.state = "AT_DESTINATION";
        t.stayTimer = t.stayTime;
      }
    }

    if(t.state === "AT_DESTINATION" && --t.stayTimer <= 0){
      t.state = "EN_ROUTE_BACK";
      t.currentStep = routes[t.routeKey].length - 1;
    }

    if(t.state === "EN_ROUTE_BACK"){
      t.currentStep--;
      if(t.currentStep >= 0) {
        t.marker.setLatLng(routes[t.routeKey][t.currentStep]);
      } else {
        map.removeLayer(t.marker);
        t.marker = null;
        t.state = "COMING";
        t.travel = 5;
      }
    }
  });
  render();
}, 1000);

// Start hry
render();
