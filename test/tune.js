// node test/tune.js key=value ... [days=N] [every=N] [plants=...] -- sets K constants (uppercase prefix K.) or params
require('../src/species.js'); require('../src/model.js'); require('../src/diagnostics.js');
const { model } = globalThis.Terra, K = model.K;
const params = {}; let days = 720, every = 60;
process.argv.slice(2).forEach(a => {
  const [k, v] = a.split('=');
  if (k === 'days') days = +v; else if (k === 'every') every = +v;
  else if (k === 'plants') params.plants = v.split(',').map(t => { const m = t.match(/^(\w+)(?::([\d.]+))?(c)?$/); return { sp: m[1], start: m[2] ? +m[2] : undefined, cutting: !!m[3] }; });
  else if (k.startsWith('K.')) { const path = k.slice(2).split('.'); let o = K; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = +v; }
  else params[k] = +v;
});
const j = model.createJar(params);
const keys = ['co2ppm', 'o2pct', 'shoot', 'rootmass', 'reserve', 'litter', 'humus', 'bacteria', 'fungi', 'nematodes', 'springtails', 'mites', 'ph', 'nitrogen', 'phosphorus', 'potassium', 'leafdis'];
console.log('day ' + keys.map(k => k.slice(0, 8).padStart(8)).join(' '));
for (let day = 0; day <= days; day += every) {
  const o = model.observe(j);
  console.log(String(day).padStart(3), keys.map(k => (Math.abs(o[k]) >= 100 ? o[k].toFixed(0) : Math.abs(o[k]) >= 1 ? o[k].toFixed(2) : o[k].toFixed(3)).padStart(8)).join(' '));
  model.advance(j, every * 24, { diag: false });
}
