/* Samostatný systém nákladních vlaků. Nemění osobní vlaky ani jejich trasy. */
(function () {
  "use strict";
  const STORAGE_KEY = "station-cargo-state-v1";
  const MAX_TRAINS = 2;
  const TRAIN_SPEED_MPS = 18; // přibližně 65 km/h
  const BONUS_COOLDOWN_MS = 5 * 60 * 1000;
  const TUTORIAL_BONUS_CLAIMED_KEY = "station_zwiesel_cargo_bonus_claimed_v1";
  const SAVE_INTERVAL_MS = 5000;
  let api = null, map = null, active = [], nextId = 1, lastFrameAt = null, lastSaveAt = 0;
  let state = { claimed: {}, cooldowns: {}, trains: [], savedAt: 0 };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; } catch (_) {}
  const dist = (a,b) => {
    const r=Math.PI/180, dl=(b[0]-a[0])*r, dn=(b[1]-a[1])*r;
    const q=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
  };
  function routeLength(points) { let n=0; for(let i=1;i<points.length;i++) n+=dist(points[i-1],points[i]); return n; }
  function pointAt(points, wanted) {
    let left=wanted;
    for(let i=1;i<points.length;i++){ const d=dist(points[i-1],points[i]); if(left<=d){ const f=d?left/d:0; return [points[i-1][0]+(points[i][0]-points[i-1][0])*f, points[i-1][1]+(points[i][1]-points[i-1][1])*f]; } left-=d; }
    return points[points.length-1];
  }
  function save() {
    try {
      state.trains = active.map(t => ({
        id: t.id, routeId: t.route.id, distance: t.distance,
        speed: t.speed, claimed: t.claimed, isTutorial: t.isTutorial,
        finished: t.finished === true
      }));
      state.savedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastSaveAt = state.savedAt;
    } catch (error) { console.warn("Nepodařilo se uložit stav nákladních vlaků.", error); }
  }
  function visibleRoutes() {
    const bounds=map.getBounds(), routes=window.STATION_CARGO_ROUTES||[];
    return routes.filter(r=>r.points.some(p=>bounds.contains(p)) && Date.now() >= (state.cooldowns[r.id]||0));
  }
  function createMarker(train) {
    const marker=L.marker(pointAt(train.points, train.distance),{interactive:true,keyboard:true,icon:L.divIcon({
      className:"cargo-train-div-icon",iconSize:[42,30],iconAnchor:[21,15],
      html:'<div class="cargo-train-marker" title="'+train.route.label.replace(/"/g,"&quot;")+'"><img src="assets/trains/cd/810_2.png" alt="ČD řada 810" onerror="this.style.display=\'none\';this.parentNode.textContent=\'🚂\'"></div>'
    }),zIndexOffset:800}).addTo(map);
    train.marker=marker;
    marker.bindTooltip(train.route.label + " · Klepni pro bonus",{direction:"top",offset:[0,-10]});
    if (train.claimed) marker.setOpacity(0.65);
    marker.on("click",e=>{if(e&&e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);claimTrainBonus(train);});
  }
  function spawn(preferredRouteId, isTutorial = false) {
    if(active.length>=MAX_TRAINS || !map || !api) return;
    const allRoutes = window.STATION_CARGO_ROUTES || [];
    const sourceRoutes = isTutorial ? allRoutes : visibleRoutes();
    const candidates=sourceRoutes.filter(r=>(!preferredRouteId || r.id===preferredRouteId) && !active.some(t=>t.route.id===r.id) && (isTutorial || Date.now() >= (state.cooldowns[r.id]||0)));
    if(!candidates.length) return;
    const route=candidates[Math.floor(Math.random()*candidates.length)];
    let first=0;
    if (!isTutorial) {
      const bounds=map.getBounds();
      first=route.points.findIndex(p=>bounds.contains(p));
      if(first<0) return;
    }
    // Tutorialový vlak začíná na skutečném začátku uložené trasy Zwiesel–Klatovy (u Zwieselu).
    const points=isTutorial ? route.points : route.points.slice(Math.max(0,first-1),Math.max(first+2,first+80));
    if(points.length<2) return;
    const train={id:"cargo-"+(nextId++),route,points,length:routeLength(points),distance:0,speed:TRAIN_SPEED_MPS,marker:null,claimed:false,isTutorial,finished:false};
    createMarker(train);
    active.push(train);
    save();
  }
  function claimTrainBonus(train) {
    if (!active.includes(train) || train.claimed) return;
    train.claimed = true;
    let reward;
    if (train.isTutorial) {
      reward = { type: "coin", label: "+1 prémiová mince" };
      api.addCoin(1);
      localStorage.setItem(TUTORIAL_BONUS_CLAIMED_KEY, "1");
    } else {
      const roll = Math.random();
      if (roll < 0.70) { reward = { type: "money", label: "+500 Kč" }; api.addMoney(500); }
      else if (roll < 0.95) { reward = { type: "xp", label: "+1 XP" }; api.addXP(1); }
      else { reward = { type: "coin", label: "+1 premium coin" }; api.addCoin(1); }
    }
    state.claimed[train.id] = Date.now();
    state.cooldowns[train.route.id] = Date.now() + BONUS_COOLDOWN_MS;
    // Tutorialová odměna zůstává jednorázová i po zavření a opětovném otevření hry.
    save();
    train.marker.closeTooltip();
    train.marker.setOpacity(0.65);
    if (train.isTutorial && typeof window.showCargoBonusClaimedPopup === "function") {
      window.showCargoBonusClaimedPopup();
    } else if (api.notify) {
      api.notify("🚂 Bonus z nákladního vlaku: " + reward.label);
    }
  }
  function restore() {
    const routes=window.STATION_CARGO_ROUTES||[];
    const elapsed=Math.max(0,(Date.now()-(Number(state.savedAt)||Date.now()))/1000);
    const saved=Array.isArray(state.trains)?state.trains:[];
    active=[];
    for(const item of saved) {
      const route=routes.find(r=>r.id===item.routeId);
      if(!route || !Array.isArray(route.points) || route.points.length<2 || active.length>=MAX_TRAINS) continue;
      const points=item.isTutorial ? route.points : route.points;
      const length=routeLength(points);
      if(!Number.isFinite(length) || length<=0) continue;
      const speed=Math.max(1,Number(item.speed)||TRAIN_SPEED_MPS);
      const distance=Math.max(0,Number(item.distance)||0)+elapsed*speed;
      const finished=distance>=length;
      // První tutorialový vlak se na konci trasy zachová, aby hráč nepřišel o garantovaný coin.
      if(finished && !item.isTutorial) continue;
      const train={
        id:String(item.id||("cargo-"+(nextId++))),route,points,length,
        distance:Math.min(length,distance),speed,marker:null,
        claimed:item.claimed===true, isTutorial:item.isTutorial===true,
        finished:finished || item.finished===true
      };
      const numericId=Number(train.id.replace("cargo-",""));
      if(Number.isFinite(numericId)) nextId=Math.max(nextId,numericId+1);
      createMarker(train);
      active.push(train);
    }
    if(saved.length) save();
  }
  function tick(now) {
    if(!map || !api) { requestAnimationFrame(tick); return; }
    const dt=lastFrameAt==null?0:Math.max(0,(now-lastFrameAt)/1000);
    lastFrameAt=now;
    let changed=false;
    for(const t of [...active]){
      if(t.finished) continue;
      t.distance+=t.speed*dt;
      if(t.distance>=t.length){
        t.distance=t.length;
        t.finished=true;
        if(t.marker) t.marker.setLatLng(t.points[t.points.length-1]);
        changed=true;
        if(!t.isTutorial || t.claimed){
          if(t.marker) map.removeLayer(t.marker);
          active=active.filter(x=>x!==t);
        }
        continue;
      }
      t.marker.setLatLng(pointAt(t.points,t.distance));
    }
    if(changed || Date.now()-lastSaveAt>=SAVE_INTERVAL_MS) save();
    requestAnimationFrame(tick);
  }
  window.spawnTutorialCargoTrain=function(){
    if(!api || !map || localStorage.getItem(TUTORIAL_BONUS_CLAIMED_KEY) === "1") return false;
    const before=active.length;
    spawn("zwiesel-klatovy", true);
    return active.length>before;
  };
  window.initStationCargoTrains=function(options){
    if(api) return;
    api=options; map=options.map;
    if(!map || !window.STATION_CARGO_ROUTES) return;
    restore();
    map.on("moveend zoomend",()=>{});
    window.addEventListener("pagehide",save);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden") save();});
    requestAnimationFrame(tick);
  };
})();