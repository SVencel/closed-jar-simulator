// Quick probe: node test/probe.js [days=N every=N] [key=value ...] [plants=generic,fittonia:3,pothos:4c] [show=key,key]
require('../src/species.js'); require('../src/model.js'); require('../src/diagnostics.js');
const { model } = globalThis.Terra;
const params = {}; let days = 360, every = 30, show = null;
process.argv.slice(2).forEach(a => {
  const [k, v] = a.split('=');
  if (k === 'days') days = +v; else if (k === 'every') every = +v; else if (k === 'show') show = v.split(',');
  else if (k === 'plants') params.plants = v.split(',').map(t => { const m = t.match(/^(\w+)(?::([\d.]+))?(c)?$/); return { sp: m[1], start: m[2] ? +m[2] : undefined, cutting: !!m[3] }; });
  else params[k] = +v;
});
const j = model.createJar(params);
const keys = show || ['co2ppm', 'o2pct', 'shoot', 'rootmass', 'reserve', 'moisture', 'ph', 'nitrogen', 'phosphorus', 'litter', 'bacteria', 'fungi', 'nematodes', 'springtails', 'mites', 'humidity'];
const t0 = model.totals(j);
console.log('day ' + keys.map(k => k.slice(0, 9).padStart(9)).join(' ') + ' | plants S/R/A/h');
for (let day = 0; day <= days; day += every) {
  const o = model.observe(j);
  console.log(String(day).padStart(3), keys.map(k => (Math.abs(o[k]) >= 100 ? o[k].toFixed(0) : Math.abs(o[k]) >= 1 ? o[k].toFixed(2) : o[k].toFixed(3)).padStart(9)).join(' '), '|',
    j.s.plants.map(p => p.dead ? 'dead(' + p.cause + ')' : p.S.toFixed(1) + '/' + p.R.toFixed(1) + '/' + p.A.toFixed(2) + '/' + p.h.toFixed(2)).join('  '));
  model.advance(j, every * 24, { diag: false });
}
const t1 = model.totals(j);
console.log('drift C', (t1.C - t0.C).toExponential(2), ' S', (t1.S - t0.S).toExponential(2), ' water', (t1.water - t0.water).toExponential(2), ' debts N/P/K', t1.debtN.toExponential(1), t1.debtP.toExponential(1), t1.debtK.toExponential(1));
