// node test/scen.js [days]  -- runs a list of scenarios and prints a one-line summary each
require('../src/species.js'); require('../src/model.js');
const M = Terra.model;
const days = +process.argv[2] || 365;
const P = (sp, start, cutting) => ({ sp, start, cutting: !!cutting });
const S = {
  balanced: {},
  fittonia: { plants: [P('fittonia', 3)], light: 0.6 },
  cuttings: { plants: [P('pothos', 1.2, 1), P('pothos', 1, 1), P('pothos', 0.8, 1)], light: 0.8 },
  'cuttings wet': { plants: [P('pothos', 1.2, 1), P('pothos', 1, 1), P('pothos', 0.8, 1)], light: 0.8, water: 330, drainWater: 90 },
  'vine+fittonia': { plants: [P('pothos', 6), P('fittonia', 3)], plantGrowth: 2.5 },
  overgrown: { plants: [P('generic', 25)], plantGrowth: 5, nitrogen: 2, litter: 20 },
  'flood (no drainage)': { drainVolume: 0, water: 400 },
  'flood (drainage full)': { water: 330, drainWater: 90 },
  drought: { water: 40, drainWater: 0 },
  'no springtails': { springtails: 0 },
  hot: { light: 2.5, temperature: 27 },
  dark: { light: 0.15 },
  'lid half open': { leak: 0.5 },
  'cold fittonia': { plants: [P('fittonia', 3)], temperature: 10, light: 0.6 },
  'acid peat': { ph0: 4.3, buffer: 0.4 },
  'low P': { phosphorus: 0.05 },
  'low K': { potassium: 0.05 },
  'no charcoal flood': { charcoal: 0, water: 330, drainWater: 90, litter: 15 },
};
for (const [name, p] of Object.entries(S)) {
  const j = M.createJar(p, name);
  const t0 = M.totals(j);
  let minO2 = 99, maxCO2 = 0, maxH2S = 0, maxDis = 0, minRH = 1;
  for (let d = 0; d < days; d++) {
    M.advance(j, 24, { diag: false });
    minO2 = Math.min(minO2, j.d.o2pct); maxCO2 = Math.max(maxCO2, j.d.co2ppm); maxH2S = Math.max(maxH2S, j.d.h2sConc * 1000); maxDis = Math.max(maxDis, j.d.leafDisease * 100); minRH = Math.min(minRH, j.d.rh);
  }
  const o = M.observe(j), t1 = M.totals(j);
  console.log(name.padEnd(22), 'fail=' + String(M.failure(j)).padEnd(11),
    'plants', j.s.plants.map(q => q.dead ? 'DEAD(' + q.cause + ')' : q.S.toFixed(1) + '/' + q.R.toFixed(1) + (q.fF > 0.1 ? '!F' : '') + (q.fR > 0.1 ? '!R' : '')).join(' '),
    '| O2', o.o2pct.toFixed(1), '(min ' + minO2.toFixed(1) + ') CO2max', maxCO2.toFixed(0), 'pH', o.ph.toFixed(1), 'H2Smax', maxH2S.toFixed(1), 'CH4', o.ch4ppm.toFixed(0),
    'spring', o.springtails.toFixed(0), 'F', o.fungi.toFixed(2), 'RHmin', minRH.toFixed(2), 'dis%max', maxDis.toFixed(0),
    '| dC', (t1.C - t0.C).toExponential(0), 'dW', (t1.water - t0.water).toExponential(0), 'dS', (t1.S - t0.S).toExponential(0), t1.debtN > 1e-6 || t1.debtP > 1e-6 ? 'NUTRIENT DEBT' : '');
}
