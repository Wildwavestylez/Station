/* Nákladní katalog: čerpá pouze kopie souřadnic z osobních tras.
   Osobní trasy se nikdy nemění. */
(function () {
  "use strict";
  const definitions = [
    { id: "zwiesel-plattling", label: "Nákladní vlak · Zwiesel–Plattling", keys: ["zwiesel:regen", "regen:deggendorf", "deggendorf:plattling"], tier: "medium", cooldownMs: 30 * 60 * 1000 },
    { id: "zwiesel-eisenstein", label: "Nákladní vlak · Zwiesel–Bayerisch Eisenstein", keys: ["alzbietin:zwiesel"], reverse: true, tier: "short", cooldownMs: 12 * 60 * 1000 },
    { id: "zwiesel-bodenmais", label: "Nákladní vlak · Zwiesel–Bodenmais", keys: ["zwiesel:bodenmais"], tier: "short", cooldownMs: 12 * 60 * 1000 },
    { id: "zwiesel-grafenau", label: "Nákladní vlak · Zwiesel–Grafenau", keys: ["zwiesel:grafenau"], tier: "short", cooldownMs: 12 * 60 * 1000 },
    { id: "zwiesel-klatovy", label: "Nákladní vlak · Zwiesel–Klatovy", keys: ["klatovy:nyrsko", "nyrsko:alzbietin", "alzbietin:zwiesel"], reverse: true, tier: "long", cooldownMs: 60 * 60 * 1000 },
    { id: "klatovy-eisenstein", label: "Nákladní vlak · Klatovy–Bayerisch Eisenstein", keys: ["klatovy:nyrsko", "nyrsko:alzbietin"], tier: "medium", cooldownMs: 30 * 60 * 1000 },
    { id: "plzen-klatovy", label: "Nákladní vlak · Plzeň–Klatovy", keys: ["plzen:prestice", "prestice:klatovy"], tier: "medium", cooldownMs: 30 * 60 * 1000 },
    { id: "plzen-praha", label: "Nákladní vlak · Plzeň–Praha", keys: ["plzen:rokycany", "rokycany:horovice", "horovice:beroun", "beroun:dobrichovice", "dobrichovice:praha"], tier: "long", cooldownMs: 60 * 60 * 1000 },
    { id: "plzen-cheb", label: "Nákladní vlak · Plzeň–Cheb", keys: ["plzen:pnovany", "pnovany:svojsin", "svojsin:plana", "plana:marianske_lazne", "marianske_lazne:cheb"], tier: "long", cooldownMs: 60 * 60 * 1000 },
    { id: "budejovice-veseli", label: "Nákladní vlak · České Budějovice–Veselí nad Lužnicí", keys: ["ceske_budejovice:veseli_nad_luznici"], tier: "medium", cooldownMs: 30 * 60 * 1000 },
    { id: "munich-approach", label: "Nákladní vlak · München Hbf–Neufahrn", keys: ["laim:muenchen", "moosach:laim", "feldmoching:moosach", "neufahrn_b_freising:feldmoching"], tier: "long", cooldownMs: 60 * 60 * 1000 }
  ];

  function build(definition) {
    const source = window.STATION_PREPARED_ROUTES || {};
    const points = [];
    for (const key of definition.keys) {
      const segment = source[key];
      if (!Array.isArray(segment) || segment.length < 2) return null;
      let copy = segment.map(p => [Number(p[0]), Number(p[1])]);
      if (points.length) {
        const end = points[points.length - 1];
        const startGap = distance(end, copy[0]);
        const reverseGap = distance(end, copy[copy.length - 1]);
        if (reverseGap < startGap) copy.reverse();
        if (Math.min(startGap, reverseGap) > 500) return null;
        points.push(...copy.slice(1));
      } else {
        points.push(...copy);
      }
    }
    if (definition.reverse) points.reverse();
    if (points.length < 2) return null;
    return { ...definition, points };
  }
  function distance(a, b) {
    const rad = Math.PI / 180, dLat = (b[0]-a[0])*rad, dLon = (b[1]-a[1])*rad;
    const q = Math.sin(dLat/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0,1-q)));
  }
  window.STATION_CARGO_ROUTES = definitions.map(build).filter(Boolean);
  console.info("Katalog nákladních tras připraven:", window.STATION_CARGO_ROUTES.length);
})();