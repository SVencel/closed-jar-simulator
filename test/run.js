// Headless checks: node test/run.js
require('../src/species.js');
require('../src/model.js');
require('../src/diagnostics.js');
require('../src/presets.js');
require('../src/sweep.js');
require('../src/store.js');
const T = globalThis.Terra;
const m = T.model;
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!ok) failures++;
}
function jarOf(id, days) {
  const p = T.presets.find(x => x.id === id);
  const j = m.createJar(p.params, p.name);
  m.advance(j, 24 * days);
  return j;
}
const ids = j => new Set(j.log.map(e => e.id));
const finite = j => Object.values(j.s).every(v => typeof v !== 'number' || isFinite(v)) && j.s.plants.every(p => isFinite(p.S + p.R + p.A + p.h + p.w));

// 1. conservation of carbon, sulfur and water; nutrients never over-spent; nothing negative or NaN
['balanced', 'cuttings', 'aggressive', 'flooded', 'nocharcoal', 'nodrain', 'drought', 'moss', 'mossfit'].forEach(id => {
  const p = T.presets.find(x => x.id === id);
  const j = m.createJar(p.params);
  const t0 = m.totals(j);
  m.advance(j, 24 * 400);
  const t1 = m.totals(j);
  check('C, S, water conserved: ' + id,
    Math.abs(t1.C - t0.C) < 1e-8 && Math.abs(t1.S - t0.S) < 1e-9 && Math.abs(t1.water - t0.water) < 1e-7,
    'dC ' + (t1.C - t0.C).toExponential(1) + ' dS ' + (t1.S - t0.S).toExponential(1) + ' dW ' + (t1.water - t0.water).toExponential(1));
  check('N, P, K never over-spent: ' + id, t1.debtN < 1e-6 && t1.debtP < 1e-6 && t1.debtK < 1e-6, [t1.debtN, t1.debtP, t1.debtK].map(x => x.toExponential(0)).join(' '));
  const neg = [j.s.Ch, j.s.O, j.s.L, j.s.Rc, j.s.B, j.s.F, j.s.Sp, j.s.W, j.s.Wd, j.s.Wg, j.s.V].some(v => v < 0);
  check('finite, non-negative pools: ' + id, finite(j) && !neg);
});

// 2. balanced jar and fittonia survive 5 years and are reported stable
['balanced', 'fittonia'].forEach(id => {
  const j = jarOf(id, 365 * 5);
  check(id + ' survives 5 years', m.failure(j) === null);
  check(id + ' flagged stable', T.diagnostics.status(j).label === 'Stable', T.diagnostics.status(j).label);
});
{
  const j = jarOf('balanced', 365 * 5);
  check('history is bounded and per-plant series stay aligned', j.hist.t.length <= 2600 && j.hist.pl[0].shoot.length === j.hist.t.length, j.hist.t.length + ' pts');
}

// 3. physics: humidity, day/night CO2, condensation, venting
{
  const j = jarOf('balanced', 200);
  let cmin = 1e9, cmax = 0, rhmin = 1, wgmax = 0, tmin = 99, tmax = 0;
  for (let h = 0; h < 48; h++) { m.advance(j, 1, { diag: false }); cmin = Math.min(cmin, j.d.co2ppm); cmax = Math.max(cmax, j.d.co2ppm); rhmin = Math.min(rhmin, j.d.rh); wgmax = Math.max(wgmax, j.s.Wg); tmin = Math.min(tmin, j.s.Ta); tmax = Math.max(tmax, j.s.Ta); }
  check('sealed jar stays humid', rhmin > 0.9, 'RH min ' + rhmin.toFixed(2));
  check('CO2 swings between day and night', cmin < 300 && cmax > 800, cmin.toFixed(0) + '–' + cmax.toFixed(0) + ' ppm');
  check('condensation forms on the glass', wgmax > 0.005, wgmax.toFixed(3) + ' ml');
  check('air temperature follows the lamp with a lag', tmax - tmin > 2, tmin.toFixed(1) + '–' + tmax.toFixed(1) + ' °C');
  const o = jarOf('open', 60);
  check('open lid drops the humidity', o.d.rh < 0.85, 'RH ' + o.d.rh.toFixed(2));
}

// 4. water: the drainage layer buys protection
{
  const a = m.createJar({ drainVolume: 200, drainWater: 0, water: 270 });   // the layer has room for the 60 ml the soil can't hold
  const b = m.createJar({ drainVolume: 0, water: 270 });
  m.advance(a, 24 * 150); m.advance(b, 24 * 150);
  check('a drainage layer absorbs overwatering the plain soil cannot', m.failure(a) === null && (m.failure(b) !== null || b.d.anox > 0.3), 'with: ' + (m.failure(a) || 'ok') + ', without: ' + (m.failure(b) || 'alive, anoxic ' + b.d.anox.toFixed(2)));
  const f = jarOf('flooded', 150);
  check('overflowing drainage layer: water table, anoxia, H2S, methane, drowned plant', ['waterlogged', 'anoxic', 'h2s', 'dead:0'].every(id => ids(f).has(id)) && f.s.plants[0].cause === 'hypoxia' || f.s.plants[0].cause === 'toxin', f.s.plants[0].cause);
  const nc = jarOf('nocharcoal', 120), wc = jarOf('flooded', 120);
  let hMaxNc = 0, hMaxWc = 0;
  const a1 = m.createJar(T.presets.find(x => x.id === 'nocharcoal').params), b1 = m.createJar(T.presets.find(x => x.id === 'flooded').params);
  for (let d = 0; d < 100; d++) { m.advance(a1, 24, { diag: false }); m.advance(b1, 24, { diag: false }); hMaxNc = Math.max(hMaxNc, a1.d.h2sConc); hMaxWc = Math.max(hMaxWc, b1.d.h2sConc); }
  check('charcoal reduces peak hydrogen sulfide', hMaxNc > 3 * hMaxWc, (hMaxNc * 1000).toFixed(0) + ' vs ' + (hMaxWc * 1000).toFixed(0) + ' µmol/L');
}
{
  // airing vs draining: the quick 'refresh' never changes water; an open lid takes weeks to empty a full drainage layer; a syringe is immediate
  const mk = () => { const j = m.createJar({ drainWater: 90 }); m.advance(j, 24 * 5, { diag: false }); return j; };
  const a = mk(), v = mk(), w = mk(), sy = mk();
  const w0 = a.s.W + a.s.Wd;
  for (let i = 0; i < 3; i++) m.act(a, 'airJar');
  m.advance(a, 24 * 7, { diag: false });
  check('refreshing the air removes no water', Math.abs(a.s.W + a.s.Wd - w0) < 0.5);
  m.act(v, 'ventWeek'); m.advance(v, 24 * 7, { diag: false });
  const lost = w0 - (v.s.W + v.s.Wd);
  check('a week with the lid off loses a few ml per day, not the whole layer', lost > 15 && lost < 80 && v.d.drainFill > 0.9, lost.toFixed(0) + ' ml, layer ' + (v.d.drainFill * 100).toFixed(0) + '%');
  w.params.leak = 1; m.advance(w, 24 * 35, { diag: false });
  check('about a month with the lid open empties the layer', w.d.drainFill < 0.3, (w.d.drainFill * 100).toFixed(0) + '%');
  m.act(sy, 'drainSome'); m.act(sy, 'drainSome');
  check('a syringe empties it at once', sy.s.Wd < 35);
  check('a full drainage layer saturates the bottom of the soil', a.d.wtf > 0.1 && mk().d.wtf > 0.1, 'water table ' + a.d.wtf.toFixed(2));
}
check('drought kills the plant of drought', (j => j.s.plants[0].dead && j.s.plants[0].cause === 'drought')(jarOf('drought', 200)));

// 5. soil life: springtails, mold, spores, mites
{
  const b = jarOf('balanced', 365), n = jarOf('nospring', 365);
  check('without springtails fungi grow substantially more', n.s.F > 1.8 * b.s.F, n.s.F.toFixed(2) + ' vs ' + b.s.F.toFixed(2));
  check('without springtails grey mold gets worse', n.d.leafDisease > 1.5 * b.d.leafDisease, (n.d.leafDisease * 100).toFixed(1) + '% vs ' + (b.d.leafDisease * 100).toFixed(1) + '%');
  const o = jarOf('open', 400);
  check('open lid wipes out the springtails (dry air)', o.d.count < 1 && ids(o).has('dryair'));
}

// 6. chemistry: pH, nutrients
{
  const a = jarOf('acid', 400);
  check('acid weakly-buffered soil acidifies and is flagged', a.d.pH < 5 && ids(a).has('phlow'), 'pH ' + a.d.pH.toFixed(2));
  const n = jarOf('lowN', 400), k = jarOf('lowK', 400);
  check('low nitrogen is the limiting nutrient and is reported', n.d.limiting === 'nitrogen' && ids(n).has('nutrient'));
  check('low potassium is the limiting nutrient and is reported', k.d.limiting === 'potassium' && ids(k).has('nutrient'));
  const ph = m.createJar({ phosphorus: 0.3, ph0: 8.3, buffer: 3 });
  check('high pH locks phosphorus up', ph.d.availP < m.createJar({}).d.availP * 0.6, ph.d.availP.toFixed(2) + ' vs ' + m.createJar({}).d.availP.toFixed(2));
}

// 7. plants: cuttings, species, competition, disease, adding a plant
check('fittonia dies in the cold', (j => j.s.plants[0].dead && j.s.plants[0].cause === 'cold')(jarOf('cold', 250)));
{
  const j = m.createJar(T.presets.find(x => x.id === 'cuttings').params);
  check('cuttings start with no roots', j.s.plants.every(p => p.R === 0 && p.cutting));
  m.advance(j, 24 * 40);
  check('cuttings root within about a month', j.s.plants.filter(p => !p.dead).every(p => !p.cutting && p.R > 0.1), j.s.plants.map(p => p.R.toFixed(2)).join('/'));
  const w = jarOf('wetcuttings', 250);
  check('cuttings in an overflowing jar rot and die', w.s.plants.every(p => p.dead));
  check('their death is blamed on drowned roots or toxins, not drought', w.s.plants.every(p => p.cause === 'hypoxia' || p.cause === 'toxin' || p.cause === 'rot'), w.s.plants.map(p => p.cause).join(','));
}
{
  const j = jarOf('aggressive', 365);
  const pothos = j.s.plants[0], fit = j.s.plants[1];
  check('vine outcompetes fittonia', fit.dead || pothos.S > 5 * fit.S, pothos.S.toFixed(1) + ' vs ' + fit.S.toFixed(1));
  check('shading is reported', ids(j).has('shade:1'));
  const o = jarOf('overgrown', 200);
  check('overgrown jar reports crowding and mold', ['crowded', 'bloom'].every(id => ids(o).has(id)));
}
{
  const j = m.createJar({});
  m.advance(j, 24 * 100);
  const c0 = m.totals(j).C;
  m.plantNow(j, { sp: 'fittonia', start: 1, cutting: true });
  check('planting adds a plant and its carbon', j.s.plants.length === 2 && Math.abs(m.totals(j).C - c0 - (1 + 0.3)) < 1e-9);
  m.advance(j, 24 * 30);
  check('history backfilled for the new plant', j.hist.pl.length === 2 && j.hist.pl[1].shoot.length === j.hist.t.length);
  const c = m.clone(j);
  m.advance(c, 24 * 5);
  check('a clone evolves independently', j.hours !== c.hours && c.id !== j.id);
}


// 9. moss: no roots, drinks from the air, shade/cool lover, dormant when dry, heat/light/flood sensitive
{
  const m0 = jarOf('moss', 730), mp = m0.s.plants[0];
  check('moss patch survives two years and grows slowly', !mp.dead && mp.S > 4 * 1.2 && mp.S < 4 * 4, mp.S.toFixed(1) + ' mmol C from 4');
  check('moss patch jar is stable', m.failure(m0) === null && T.diagnostics.status(m0).label === 'Stable', T.diagnostics.status(m0).label);
  check('moss keeps almost no roots (rhizoids)', mp.R < 0.15 * mp.S, 'roots ' + mp.R.toFixed(2));
  const dry = jarOf('mossopen', 120), dp = dry.s.plants[0];
  check('with the lid open the moss dries out and goes dormant, not dead', !dp.dead && dp.w < 0.3 && ids(dry).has('dormant:0'), 'hydration ' + dp.w.toFixed(2));
  const b = jarOf('mossbright', 365), bp = b.s.plants[0];
  check('moss in strong light and warmth declines and is flagged', bp.S < mp.S * 0.4 && (ids(b).has('scorch:0') || ids(b).has('thirst:0') || ids(b).has('cold:0') || bp.st.scorch + bp.st.heat > 0.005), bp.S.toFixed(1) + ' vs ' + mp.S.toFixed(1));
  const fl = m.createJar({ plants: [{ sp: 'moss', start: 4 }], light: 0.4, temperature: 19, drainVolume: 0, water: 380 });
  m.advance(fl, 24 * 365, { diag: false });
  check('a flooded surface drowns the moss', fl.s.plants[0].dead && fl.s.plants[0].cause === 'hypoxia', String(fl.s.plants[0].cause));
  const mf = jarOf('mossfit', 730);
  check('moss and fittonia coexist', mf.s.plants.every(p => !p.dead), mf.s.plants.map(p => p.S.toFixed(1)).join(' / '));
}


// 10. seasons and window light (Hungary, 47.5 N)
{
  const dec = m.solar(47.5, 355), jun = m.solar(47.5, 172);
  check('Budapest day length: ~8 h in December, ~16 h in June', dec.daylen > 7.8 && dec.daylen < 8.6 && jun.daylen > 15.4 && jun.daylen < 16.6, dec.daylen.toFixed(1) + ' h / ' + jun.daylen.toFixed(1) + ' h');
  check('Budapest sunshine: ~0.8 kWh/m2/day in December, ~6 in June', dec.kWh > 0.6 && dec.kWh < 1.0 && jun.kWh > 5 && jun.kWh < 6.8, dec.kWh.toFixed(2) + ' / ' + jun.kWh.toFixed(2));
  const j = m.createJar({ seasonOn: 1, lightSource: 1 });
  m.advance(j, 24 * 19, { diag: false });
  check('indoor winter temperature follows the setting', Math.abs(j.s.effTemp - j.params.tempWinter) < 0.3, j.s.effTemp.toFixed(1) + ' C');
  m.advance(j, 24 * 182, { diag: false });
  check('indoor summer temperature follows the setting', Math.abs(j.s.effTemp - j.params.tempSummer) < 0.3, j.s.effTemp.toFixed(1) + ' C');
  let peak = 0; for (let h = 0; h < 48; h++) { m.advance(j, 1, { diag: false }); peak = Math.max(peak, j.s.Ta); }
  check('a sunlit sealed jar peaks well above room temperature in summer', peak > j.s.effTemp + 3, 'air peak ' + peak.toFixed(1) + ' vs room ' + j.s.effTemp.toFixed(1));
  const w = m.createJar({ seasonOn: 1, lightSource: 1 }), t0 = m.totals(w);
  m.advance(w, 24 * 400);
  const t1 = m.totals(w);
  check('seasonal jar still conserves C, S and water', Math.abs(t1.C - t0.C) < 1e-8 && Math.abs(t1.S - t0.S) < 1e-9 && Math.abs(t1.water - t0.water) < 1e-7);
  const mw = m.createJar({ plants: [{ sp: 'moss', start: 4 }], seasonOn: 1, lightSource: 1, windowShare: 0.25 });
  m.advance(mw, 24 * 250, { diag: false });
  check('moss on a hot sunny sill takes heat damage', mw.s.plants[0].st.heat > 0.001 || mw.s.plants[0].dead, 'heat stress ' + mw.s.plants[0].st.heat.toFixed(4));
}

// 8. sweep and speed
{
  const t0 = Date.now();
  const cfg = { base: {}, xKey: 'water', xMin: 20, xMax: 450, xN: 8, yKey: 'light', yMin: 0.2, yMax: 3, yN: 8, days: 365 };
  const grid = [];
  for (let iy = 0; iy < cfg.yN; iy++) grid.push(T.sweep.sweepRow(cfg, iy));
  const surv = grid.flat().filter(c => c.survived).length;
  console.log('INFO sweep 8x8 over 365d in ' + (Date.now() - t0) + ' ms; survivors ' + surv + '/64');
  check('sweep has both survivors and failures', surv > 0 && surv < 64);
  grid.slice().reverse().forEach(row => console.log('  ' + row.map(c => c.survived ? '#' : (c.failDay < 60 ? '.' : 'o')).join(' ')));
  const j = m.createJar({}); const t1 = Date.now(); m.advance(j, 24 * 365, { diag: false });
  console.log('INFO one simulated year (no UI): ' + (Date.now() - t1) + ' ms');
}


// 11. saving and restoring jars
(async function () {
  const st = T.store;
  const a = m.createJar(T.presets.find(x => x.id === 'cuttings').params, 'Test cuttings');
  m.advance(a, 24 * 200); m.act(a, 'addWater'); m.advance(a, 24 * 30);
  const text = JSON.stringify(st.pack([a], { speed: 3 }, 400));
  const back = st.unpack(JSON.parse(text)).jars[0];
  check('a restored jar has the same state', back.hours === a.hours && back.name === a.name && JSON.stringify(back.s) === JSON.stringify(a.s));
  m.advance(a, 24 * 120); m.advance(back, 24 * 120);
  const oa = m.observe(a), ob = m.observe(back);
  check('a restored jar then evolves exactly like the original', Object.keys(oa).every(k => oa[k] === ob[k]) && a.s.plants.every((p, i) => p.S === back.s.plants[i].S && p.dead === back.s.plants[i].dead));
  check('restored jars get their own ids', back.id !== a.id);
  const big = m.createJar({}, 'big'); m.advance(big, 24 * 365 * 3);
  const packed = JSON.stringify(st.pack([big], {}, 400));
  check('three simulated years fit in a few hundred KB, with the history thinned', packed.length < 600 * 1024 && JSON.parse(packed).jars[0].hist.t.length <= 400, (packed.length / 1024).toFixed(0) + ' KB, ' + JSON.parse(packed).jars[0].hist.t.length + ' points');
  const thin = st.unpack(JSON.parse(packed)).jars[0];
  check('thinned history stays aligned for every chart', Object.values(thin.hist.series).every(arr => arr.length === thin.hist.t.length) && thin.hist.pl[0].shoot.length === thin.hist.t.length);
  const nBefore = thin.hist.t.length;
  m.advance(thin, 24 * 10);
  check('history keeps recording after a restore', thin.hist.t.length > nBefore - 1 && Object.values(thin.hist.series).every(arr => arr.length === thin.hist.t.length));
  // the model changed since the save: rebuild from the starting setup and fast-forward
  const old = JSON.parse(text); old.model = 'ancient';
  const rb = st.unpack(old);
  check('an old save is rebuilt from its starting setup (with a notice)', rb.jars[0].hours === a.hours - 24 * 120 && rb.notes.length === 1, rb.notes[0] || '');
  // text backup round trip, compressed and plain
  const t1 = await st.toText([a, big], { focus: 1 });
  const r1 = st.unpack(await st.fromText(t1));
  check('a text backup restores both jars', r1.jars.length === 2 && r1.jars[1].hours === big.hours && r1.app.focus === 1, t1.slice(0, 8) + ' ' + (t1.length / 1024).toFixed(0) + ' KB');
  const r2 = st.unpack(await st.fromText('JARSIM0:' + JSON.stringify(st.pack([a], {}, 100))));
  check('a plain backup works too', r2.jars.length === 1);
  let bad = false; try { await st.fromText('hello'); } catch (e) { bad = true; }
  check('garbage is refused with a clear error', bad);
  // a broken jar in a save must not take the others down
  const mixed = st.pack([a, big], {}, 100); mixed.jars[0].s.Ch = 'oops';
  const mu = st.unpack(mixed);
  check('an unreadable jar is rebuilt or skipped without losing the others', mu.jars.length >= 1 && mu.jars.some(j => j.name === 'big'));
  // a variable added since the save gets a blank history instead of crashing the charts
  const nv = JSON.parse(text); delete nv.jars[0].hist.series.vpd;
  const nvj = st.unpack(nv).jars[0];
  check('a chart variable missing from an old save is filled in', nvj.hist.series.vpd.length === nvj.hist.t.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
