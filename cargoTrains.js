/* Samostatný systém nákladních vlaků. Nemění osobní vlaky ani jejich trasy. */
(function () {
  "use strict";
  const STORAGE_KEY = "station-cargo-state-v1";
  const MAX_TRAINS = 2;
  let api = null, map = null, active = [], nextId = 1;
  let state = { claimed: {}, cooldowns: {} };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; } catch (_) {}
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
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
  function visibleRoutes() {
    const bounds=map.getBounds(), routes=window.STATION_CARGO_ROUTES||[];
    return routes.filter(r=>r.points.some(p=>bounds.contains(p)) && Date.now() >= (state.cooldowns[r.id]||0));
  }
  function spawn(preferredRouteId) {
    if(active.length>=MAX_TRAINS || !map || !api) return;
    const candidates=visibleRoutes().filter(r=>(!preferredRouteId || r.id===preferredRouteId) && !active.some(t=>t.route.id===r.id));
    if(!candidates.length) return;
    const route=candidates[Math.floor(Math.random()*candidates.length)];
    const bounds=map.getBounds();
    let first=route.points.findIndex(p=>bounds.contains(p));
    if(first<0) return;
    // Použijeme viditelný úsek skutečné trasy, aby vlak nebyl schovaný mimo obrazovku.
    let end=first+1;
    while(end<route.points.length && (bounds.contains(route.points[end]) || dist(route.points[end-1],route.points[end])<1200)) end++;
    const points=route.points.slice(Math.max(0,first-1),Math.max(first+2,end));
    if(points.length<2) return;
    const length=routeLength(points);
    const marker=L.marker(points[0],{interactive:true,keyboard:true,icon:L.divIcon({
      className:"cargo-train-div-icon",iconSize:[42,30],iconAnchor:[21,15],
      html:'<div class="cargo-train-marker" title="'+route.label.replace(/"/g,"&quot;")+'">🚂</div>'
    }),zIndexOffset:800}).addTo(map);
    const train={id:"cargo-"+(nextId++),route,points,length,distance:0,speed:Math.max(12,length/75),marker,claimed:false};
    marker.bindTooltip(route.label + " · Klepni pro bonus",{direction:"top",offset:[0,-10]});
    marker.on("click",e=>{if(e&&e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);claimTrainBonus(train);});
    active.push(train);
  }
  function claimTrainBonus(train) {
    if (!active.includes(train) || train.claimed) return;
    train.claimed = true;
    const roll = Math.random();
    let reward;
    if (roll < 0.70) { reward = { type: "money", label: "+500 Kč" }; api.addMoney(500); }
    else if (roll < 0.95) { reward = { type: "xp", label: "+1 XP" }; api.addXP(1); }
    else { reward = { type: "coin", label: "+1 premium coin" }; api.addCoin(1); }
    state.claimed[train.id] = Date.now();
    save();
    map.removeLayer(train.marker);
    active = active.filter(item => item !== train);
    if (api.notify) api.notify("🚂 Bonus z nákladního vlaku: " + reward.label);
  }
  function tick(now) {
    if(!map || !api) { requestAnimationFrame(tick); return; }
    const dt=Math.min(0.1,Math.max(0,(now-(tick.last||now))/1000)); tick.last=now;
    for(const t of [...active]){
      t.distance+=t.speed*dt;
      if(t.distance>=t.length){ map.removeLayer(t.marker); active=active.filter(x=>x!==t); continue; }
      t.marker.setLatLng(pointAt(t.points,t.distance));
    }
    requestAnimationFrame(tick);
  }
  window.spawnTutorialCargoTrain=function(){
    if(!api || !map) return false;
    const before=active.length;
    spawn("zwiesel-klatovy");
    return active.length>before;
  };
  window.initStationCargoTrains=function(options){
    if(api) return;
    api=options; map=options.map;
    if(!map || !window.STATION_CARGO_ROUTES) return;
    map.on("moveend zoomend",()=>{});
    requestAnimationFrame(tick);
  };
})();