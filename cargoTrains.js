/* Samostatný systém nákladních vlaků. Nemění osobní vlaky ani jejich trasy. */
(function () {
  "use strict";
  const STORAGE_KEY = "station-cargo-state-v1";
  const MAX_TRAINS = 2;
  let api = null, map = null, active = [], nextId = 1, nextCargoId = 1, cargoDrops = [];
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
    const train={id:"cargo-"+(nextId++),route,points,length,distance:0,speed:Math.max(12,length/75),marker,claimed:false,nextDropAt:Math.min(180,Math.max(80,length*0.22))};
    marker.bindTooltip(route.label,{direction:"top",offset:[0,-10]});
    active.push(train);
  }
  function dropCargo(train) {
    const position=pointAt(train.points,train.distance);
    const marker=L.marker(position,{interactive:true,keyboard:true,icon:L.divIcon({
      className:"cargo-drop-div-icon",iconSize:[30,30],iconAnchor:[15,15],
      html:'<div class="cargo-drop-marker" title="Ztracený náklad">📦</div>'
    }),zIndexOffset:1200}).addTo(map);
    const drop={id:"cargo-drop-"+(nextCargoId++),marker,routeId:train.route.id};
    marker.bindTooltip("Ztracený náklad · Klepni pro sebrání",{direction:"top",offset:[0,-8]});
    marker.on("click",e=>{if(e&&e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);claimCargo(drop);});
    cargoDrops.push(drop);
  }
  function claimCargo(drop) {
    if(!cargoDrops.includes(drop)) return;
    cargoDrops=cargoDrops.filter(item=>item!==drop);
    map.removeLayer(drop.marker);
    const roll=Math.random();
    let reward;
    if(roll<0.70){ reward={type:"money",amount:500}; api.addMoney(500); }
    else if(roll<0.95){ reward={type:"xp",amount:1}; api.addXP(1); }
    else { reward={type:"coin",amount:1}; api.addCoin(1); }
    save();
    map.removeLayer(train.marker);
    active=active.filter(t=>t!==train);
    const labels={money:"+500 Kč",xp:"+1 XP",coin:"+1 premium coin"};
    if(api.notify) api.notify("📦 Sebral jsi ztracený náklad: "+labels[reward.type]);
  }
  function tick(now) {
    if(!map || !api) { requestAnimationFrame(tick); return; }
    const dt=Math.min(0.1,Math.max(0,(now-(tick.last||now))/1000)); tick.last=now;
    for(const t of [...active]){
      t.distance+=t.speed*dt;
      if(t.distance>=t.length){ map.removeLayer(t.marker); active=active.filter(x=>x!==t); continue; }
      t.marker.setLatLng(pointAt(t.points,t.distance));
      if(t.distance>=t.nextDropAt){ dropCargo(t); t.nextDropAt+=Math.max(120,Math.min(260,t.length*0.28)); }
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