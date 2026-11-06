/*
 * 2D cutaway of one jar, drawn straight from the model state: leaves and condensation above,
 * litter and soil in the middle (roots, anoxic zone, water table, charcoal), drainage layer below.
 * A stand-in for the future 3D view; both read the same `jar` object.
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});

  function rng(seed) {                       // tiny deterministic PRNG
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function mixNum(a, b, t) { return a + (b - a) * t; }
  function mixRgb(a, b, t) { return 'rgb(' + mix(a[0], b[0], t) + ',' + mix(a[1], b[1], t) + ',' + mix(a[2], b[2], t) + ')'; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function species(id) { return Terra.species[id] || Terra.species.generic; }

  // How yellow / unwell a plant looks: the sum of its recent stresses (shading is not a sickness).
  function yellowing(pl) {
    let v = 0;
    for (const k in pl.st) if (k !== 'shade') v += pl.st[k];
    return clamp(v * 40, 0, 1);
  }

  // ---- roots: a fixed random branching shape that grows longer with root biomass ----
  function drawRoots(ctx, pl, idx, jid, x0, y0, soilBottom, jx, jw) {
    if (pl.dead) return;
    if (species(pl.sp).moss) {                                                  // moss: a few short rhizoids, just anchors
      const rm = rng(jid * 77 + idx), rot = Math.max(1 - pl.h, pl.fR);
      ctx.lineCap = 'round'; ctx.lineWidth = 0.9;
      const ext = Math.min(jw * 0.45, 14 + 60 * Math.sqrt(pl.S / 8)) * 0.8;
      for (let i = 0; i < 14; i++) { const x = x0 + (rm() * 2 - 1) * ext; ctx.strokeStyle = 'rgba(205,190,150,0.8)'; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (rm() - 0.5) * 3, y0 + 3 + rm() * 4); ctx.stroke(); }
      return;
    }
    const reach = Math.min(soilBottom - y0 - 4, 6 + 34 * Math.sqrt(pl.R));
    if (pl.R <= 0.001) {                                                       // cutting: bare stem end only
      ctx.strokeStyle = pl.fR > 0.1 ? 'rgb(74,48,34)' : 'rgb(150,170,110)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + 9); ctx.stroke();
      return;
    }
    const r = rng(jid * 1000 + idx * 37 + 11);
    const nPrimary = 2 + Math.min(5, Math.floor(pl.R * 1.4));
    const rot = Math.max(1 - pl.h, pl.fR);
    function branch(x, y, ang, len, depth, width) {
      const x1 = clamp(x + Math.sin(ang) * len, jx + 4, jx + jw - 4);
      const y1 = Math.min(soilBottom - 3, y + Math.cos(ang) * len);
      ctx.strokeStyle = r() < rot ? 'rgb(74,48,34)' : 'rgb(236,226,196)';
      ctx.lineWidth = Math.max(0.7, width);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + x1) / 2 + (r() - 0.5) * 6, (y + y1) / 2, x1, y1); ctx.stroke();
      if (depth < 3) {
        const n = depth === 0 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const f = 0.35 + 0.55 * r();
          branch(x + (x1 - x) * f, y + (y1 - y) * f, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9), len * (0.5 + r() * 0.25), depth + 1, width * 0.6);
        }
      }
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < nPrimary; i++) {
      const ang = (i / (nPrimary - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.3;
      branch(x0, y0 + 1, ang, reach * (0.55 + r() * 0.35), 0, 2.2);
    }
  }

  function drawLeaf(ctx, x, y, ang, len, wid, col, vein, veinAlpha, mold, wet, rr) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.5, wid, 0, 0, 6.3); ctx.fill();
    if (vein) {
      ctx.strokeStyle = 'rgba(' + vein[0] + ',' + vein[1] + ',' + vein[2] + ',' + veinAlpha + ')'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(len * 0.05, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(len * 0.3, 0); ctx.lineTo(len * 0.55, -wid * 0.7); ctx.moveTo(len * 0.3, 0); ctx.lineTo(len * 0.55, wid * 0.7); ctx.stroke();
    }
    if (mold > 0 && rr() < Math.min(1, mold * 2.5)) {                 // grey fuzz
      const g = ctx.createRadialGradient(len * 0.5, 0, 0, len * 0.5, 0, len * 0.45);
      g.addColorStop(0, 'rgba(190,190,185,0.85)'); g.addColorStop(1, 'rgba(190,190,185,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.45, wid * 0.9, 0, 0, 6.3); ctx.fill();
    }
    if (wet > 0.5) {                                                   // dew
      ctx.fillStyle = 'rgba(235,248,255,' + (0.55 * (wet - 0.4)) + ')';
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(len * (0.25 + 0.4 * rr()), (rr() - 0.5) * wid, 1.3, 0, 6.3); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawShoot(ctx, pl, idx, jid, j, x0, soilTop, hMax, time, jw) {
    const sp = species(pl.sp), g = j.geo, K = Terra.model.K;
    if (pl.dead) {                                       // brown stub
      ctx.strokeStyle = 'rgb(95,70,45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, soilTop); ctx.lineTo(x0 + 3, soilTop - 7); ctx.stroke();
      return;
    }
    const rel = Math.min(1.1, sp.heightK * Math.sqrt(pl.S / (K.capPerArea * g.areaF)) * 1.2);
    const H = Math.max(10, hMax * rel);
    const yel = yellowing(pl);
    const health = Math.min(clamp(pl.w * 1.1, 0, 1) * clamp(pl.h * 1.2, 0, 1), 1 - 0.85 * yel);
    const wilt = 1 - clamp(pl.w, 0, 1);
    const sway = Math.sin(time / 1500 + idx) * 2;
    const leafCol = function () { return mixRgb([150, 120, 50], sp.leaf, health); };
    const r = rng(jid * 31 + idx * 7 + 3), rr = rng(jid * 53 + idx * 11 + 5);
    const n = Math.min(44, Math.round(3 + pl.S * (sp.style === 'rosette' ? 2.6 : 1.8)));
    const mold = pl.fF, wet = j.s.leafWet;
    ctx.lineCap = 'round';

    if (sp.style === 'moss') {                           // a lumpy green cushion hugging the soil
      const ext = Math.min(jw * 0.45, 14 + 60 * Math.sqrt(pl.S / 8));
      const nC = Math.min(80, Math.round(8 + pl.S * 7));
      const size = Math.min(1.5, Math.sqrt(pl.S / 4));
      const dormant = clamp((0.5 - pl.w) * 2, 0, 1);
      for (let i = 0; i < nC; i++) {
        const cx = x0 + (r() * 2 - 1) * ext * (0.4 + 0.6 * Math.sin(Math.PI * (i + 0.5) / nC));
        const rad = (4 + r() * 5) * size;
        const unwell = [176, 168, 62];                                            // pale yellow-green when unwell
        const m = [0, 1, 2].map(function (k) { return mixNum(mixNum(unwell[k], sp.leaf[k], health), [150, 125, 72][k], dormant * 0.8); });
        const v = (r() - 0.5) * 26;
        ctx.fillStyle = 'rgb(' + Math.round(clamp(m[0] + v, 0, 255)) + ',' + Math.round(clamp(m[1] + v, 0, 255)) + ',' + Math.round(clamp(m[2] + v * 0.5, 0, 255)) + ')';
        ctx.beginPath(); ctx.arc(cx, soilTop - rad * 0.35, rad, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(210,225,150,0.35)'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 3; k++) { const hx = cx + (r() - 0.5) * rad * 1.6; ctx.beginPath(); ctx.moveTo(hx, soilTop - rad * 0.4); ctx.lineTo(hx + (r() - 0.5) * 2, soilTop - rad * (0.9 + 0.4 * r())); ctx.stroke(); }
        if (mold > 0.05 && r() < mold * 2) { ctx.fillStyle = 'rgba(200,200,195,0.6)'; ctx.beginPath(); ctx.arc(cx, soilTop - rad * 0.6, rad * 0.5, 0, 6.3); ctx.fill(); }
        if (wet > 0.5 && r() < 0.5) { ctx.fillStyle = 'rgba(235,248,255,0.5)'; ctx.beginPath(); ctx.arc(cx + rad * 0.2, soilTop - rad * 0.9, 1, 0, 6.3); ctx.fill(); }
      }
      return;
    }
    if (sp.style === 'rosette') {                        // fittonia: low fan of veined leaves
      const spreadPx = 8 + 70 * Math.min(1, Math.sqrt(pl.S / 12));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const side = i % 2 ? 1 : -1;
        const len = (12 + 16 * Math.min(1, rel * 1.8)) * (0.75 + r() * 0.5);
        const lift = 3 + r() * H * 0.45 * (1 - f * 0.5);
        const droop = wilt * (0.9 + r() * 0.6);
        const up = 0.25 + r() * 0.55 - droop * 1.5;
        const gx = x0 + side * (3 + f * spreadPx * (0.6 + r() * 0.4));
        drawLeaf(ctx, gx, soilTop - lift, side > 0 ? -up : Math.PI + up, len, 5 + len * 0.22, leafCol(), sp.vein, 0.95 * health + 0.05, mold, wet, rr);
      }
      return;
    }
    const lean = (sp.style === 'vine' ? 14 : 6);
    ctx.strokeStyle = mixRgb([120, 95, 50], [80, 140, 60], health);
    ctx.lineWidth = 1.6 + Math.min(1, rel) * 2.4;
    ctx.beginPath(); ctx.moveTo(x0, soilTop);
    ctx.quadraticCurveTo(x0 + lean + sway, soilTop - H * 0.5, x0 + sway * 2 + (sp.style === 'vine' ? lean : 0), soilTop - H);
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n;
      const ly = soilTop - H * f;
      const side = i % 2 ? 1 : -1;
      const base = (sp.style === 'vine' ? 14 : 10) + (sp.style === 'vine' ? 24 : 26) * Math.min(1, rel);
      const len = base * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.1))) * (0.8 + r() * 0.4);
      const up = 0.5 + r() * 0.5 - wilt * 1.5;
      const gx = x0 + lean * (1 - f) + sway * 2 * f;
      const wid = sp.style === 'vine' ? 3.5 + len * 0.22 : 3 + len * 0.1;
      drawLeaf(ctx, gx, ly, side > 0 ? -up : Math.PI + up, len, wid, leafCol(), sp.vein, sp.style === 'vine' ? 0.5 * health : 0, mold, wet, rr);
    }
  }

  function draw(canvas, j, time) {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const s = j.s, d = j.d, g = j.geo, p = j.params;
    const daylight = d.lightNow > 0;
    const jw = Math.min(cw * 0.82, ch * 0.78), jh = ch * 0.88;
    const jx = (cw - jw) / 2, jy = ch * 0.08, r = 18;

    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    if (daylight) { bg.addColorStop(0, 'rgba(255,214,120,0.25)'); bg.addColorStop(1, 'rgba(255,214,120,0.02)'); }
    else { bg.addColorStop(0, 'rgba(40,60,120,0.30)'); bg.addColorStop(1, 'rgba(40,60,120,0.04)'); }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.beginPath(); ctx.roundRect(jx, jy, jw, jh, r); ctx.clip();

    const murk = Math.min(0.5, Math.max(0, (18 - d.o2pct) / 20) + Math.max(0, (d.co2ppm - 30000) / 300000));
    ctx.fillStyle = 'rgba(170,200,220,0.05)'; ctx.fillRect(jx, jy, jw, jh);
    if (murk > 0) { ctx.fillStyle = 'rgba(120,90,60,' + murk + ')'; ctx.fillRect(jx, jy, jw, jh); }

    // layers: drainage layer at the bottom, soil above it
    const layersFrac = Math.min(0.58, (g.soilMl + g.drainMl) / p.jarVolume * 1.35);
    const tot = g.soilMl + g.drainMl || 1;
    const drainH = jh * layersFrac * g.drainMl / tot, soilH = jh * layersFrac * g.soilMl / tot;
    const jBottom = jy + jh, drainTop = jBottom - drainH, soilTop = drainTop - soilH;

    // drainage layer: pebbles with water filling it from the bottom
    if (drainH > 2) {
      ctx.fillStyle = 'rgb(150,100,70)'; ctx.fillRect(jx, drainTop, jw, drainH);
      const pr = rng(j.id * 211);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = 'rgb(' + mix(165, 205, pr()) + ',' + mix(105, 135, pr()) + ',' + mix(70, 95, pr()) + ')';
        ctx.beginPath(); ctx.arc(jx + 4 + pr() * (jw - 8), drainTop + 3 + pr() * (drainH - 6), 3 + pr() * 3.5, 0, 6.3); ctx.fill();
      }
      const wh = drainH * clamp(d.drainFill, 0, 1);
      ctx.fillStyle = 'rgba(70,140,200,0.42)'; ctx.fillRect(jx, jBottom - wh, jw, wh);
      if (p.charcoal > 0.02) {                       // charcoal chunks at the top of the drainage layer
        const cr = rng(j.id * 313);
        for (let i = 0; i < Math.round(p.charcoal * 40); i++) {
          ctx.fillStyle = 'rgb(35,35,40)'; ctx.fillRect(jx + 4 + cr() * (jw - 12), drainTop - 2 + cr() * 6, 3 + cr() * 4, 3 + cr() * 3);
        }
      }
    }

    // soil, darker when wet
    const wet = Math.min(1, d.theta / 0.5);
    ctx.fillStyle = 'rgb(' + mix(150, 55, wet) + ',' + mix(115, 38, wet) + ',' + mix(75, 28, wet) + ')';
    ctx.fillRect(jx, soilTop, jw, soilH);
    const rnd = rng(j.id * 977);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.08 + rnd() * 0.12) + ')';
      ctx.fillRect(jx + rnd() * jw, soilTop + 3 + rnd() * (soilH - 3), 2, 2);
    }
    // anoxic zone: bluish-black from the bottom up; sulfide blackens it
    const anoxH = soilH * clamp(Math.max(d.wtf, d.anox), 0, 1);
    if (anoxH > 1) {
      const gr = ctx.createLinearGradient(0, soilTop + soilH - anoxH, 0, soilTop + soilH);
      gr.addColorStop(0, 'rgba(20,28,45,0)'); gr.addColorStop(1, 'rgba(15,22,40,0.65)');
      ctx.fillStyle = gr; ctx.fillRect(jx, soilTop + soilH - anoxH, jw, anoxH);
    }
    if (d.toxH2S > 0.2) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.5, d.toxH2S * 0.3) + ')'; ctx.fillRect(jx, soilTop, jw, soilH); }
    // water table line when it has risen into the soil
    if (d.wtf > 0.02) {
      const y = soilTop + soilH * (1 - d.wtf);
      ctx.fillStyle = 'rgba(70,140,200,0.28)'; ctx.fillRect(jx, y, jw, soilTop + soilH - y);
      ctx.strokeStyle = 'rgba(120,190,240,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(jx, y); ctx.lineTo(jx + jw, y); ctx.stroke();
    }

    // roots (pale = healthy, dark = rotted / infected)
    s.plants.forEach(function (pl, i) { drawRoots(ctx, pl, i, j.id, jx + jw * pl.x, soilTop + 1, soilTop + soilH, jx, jw); });

    if (d.pond > 0) {
      const wh = Math.min(soilH * 0.8, d.pond / g.soilMl * soilH * 2.2 + 3);
      ctx.fillStyle = 'rgba(70,140,200,0.42)'; ctx.fillRect(jx, soilTop - wh, jw, wh + 4);
    }

    // leaf litter and fungi on the surface
    const nLitter = Math.min(70, Math.round(s.L * 10));
    for (let i = 0; i < nLitter; i++) {
      ctx.fillStyle = 'rgba(' + mix(90, 140, rnd()) + ',60,25,0.9)';
      ctx.fillRect(jx + 4 + rnd() * (jw - 8), soilTop - 1 - rnd() * 4, 3 + rnd() * 3, 2);
    }
    const nMold = Math.min(34, Math.round(Math.max(0, s.F - 0.3) * 10));
    for (let i = 0; i < nMold; i++) {
      const mx = jx + 8 + rnd() * (jw - 16), rad = 3 + rnd() * 6;
      const gr = ctx.createRadialGradient(mx, soilTop, 0, mx, soilTop, rad);
      gr.addColorStop(0, 'rgba(235,240,220,0.75)'); gr.addColorStop(1, 'rgba(235,240,220,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(mx, soilTop - 1, rad, 0, 6.3); ctx.fill();
    }

    // shoots, tallest first so low plants sit in front
    const hMax = (soilTop - jy) * 0.9;
    const order = s.plants.map(function (pl, i) { return i; }).sort(function (a, b) {
      return species(s.plants[b].sp).heightK * Math.sqrt(s.plants[b].S) - species(s.plants[a].sp).heightK * Math.sqrt(s.plants[a].S);
    });
    order.forEach(function (i) { drawShoot(ctx, s.plants[i], i, j.id, j, jx + jw * s.plants[i].x, soilTop, hMax, time, jw); });

    // springtails (white) and predatory mites (red) crawling on the surface
    const nDots = Math.min(160, Math.round(d.count / 2));
    for (let i = 0; i < nDots; i++) {
      const a = rng(j.id * 7 + i)(), b = rng(j.id * 13 + i * 3)();
      const x = jx + 6 + ((a * jw + time * 0.012 * (0.4 + b) * (i % 2 ? 1 : -1)) % (jw - 12) + (jw - 12)) % (jw - 12);
      const y = soilTop - 2 - Math.abs(Math.sin(time / 400 + i)) * 2 - (d.wtf > 0.2 ? b * 28 : 0);
      ctx.fillStyle = 'rgba(245,245,255,0.95)'; ctx.fillRect(x, y, 2.4, 2);
    }
    const nMites = Math.min(30, Math.round(d.miteCount));
    for (let i = 0; i < nMites; i++) {
      const a = rng(j.id * 17 + i)();
      const x = jx + 6 + ((a * jw + time * 0.02 * (i % 2 ? 1 : -1)) % (jw - 12) + (jw - 12)) % (jw - 12);
      ctx.fillStyle = 'rgba(220,60,50,0.95)'; ctx.fillRect(x, soilTop - 2.5, 2.8, 2.5);
    }

    // condensation on the glass: fog and droplets
    const fog = Math.min(0.5, s.Wg * 6 + (d.rh > 0.97 && !daylight ? 0.06 : 0));
    if (fog > 0.02) {
      ctx.fillStyle = 'rgba(210,230,245,' + fog * 0.5 + ')'; ctx.fillRect(jx, jy, jw, soilTop - jy);
      const fr = rng(j.id * 5);
      for (let i = 0; i < Math.round(fog * 90); i++) {
        ctx.fillStyle = 'rgba(230,245,255,0.55)';
        ctx.beginPath(); ctx.arc(jx + fr() * jw, jy + fr() * (soilTop - jy), 1 + fr() * 1.6, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(200,225,245,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(jx, jy, jw, jh, r); ctx.stroke();
    ctx.fillStyle = p.leak > 0 ? 'rgba(160,170,180,0.9)' : 'rgba(120,130,140,0.95)';
    ctx.save(); ctx.translate(jx + jw / 2, jy - 4);
    ctx.rotate(p.leak > 0 ? -0.18 - p.leak * 0.2 : 0);
    ctx.fillRect(-jw * 0.32, -9, jw * 0.64, 9); ctx.restore();

    ctx.fillStyle = 'rgba(230,235,245,0.9)'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const hh = Math.floor(j.hours % 24);
    const dateStr = (p.seasonOn || p.lightSource) ? ' · ' + Terra.model.dateOf(s.doy) : '';
    ctx.fillText('Day ' + Math.floor(j.hours / 24) + dateStr + '  ' + (hh < 10 ? '0' : '') + hh + ':00  ' + (daylight ? '☀ light on' : '☾ dark') + (p.lightSource ? ' · ' + s.effPhoto.toFixed(1) + ' h days' : ''), 10, 8);
    ctx.fillText(s.Ta.toFixed(1) + ' °C · ' + (d.rh * 100).toFixed(0) + '% RH · CO₂ ' + d.co2ppm.toFixed(0) + ' ppm · pH ' + d.pH.toFixed(1), 10, 24);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(230,235,245,0.55)';
    ctx.fillText('roots: pale = healthy, dark = rotted · blue-black soil = no oxygen', cw - 10, ch - 18);
  }

  Terra.jarview = { draw };
})(window);
