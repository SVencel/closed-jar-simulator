// Sensitivity: constant 24 C vs an indoor seasonal cycle (winter ~22, summer ~26.5), optionally with a light swing.
require('../src/species.js'); require('../src/model.js'); require('../src/diagnostics.js'); require('../src/presets.js');
const T = Terra, M = T.model;
const P = (sp, start, cutting) => ({ sp, start, cutting: !!cutting });
const setups = {
  balanced: {},
  fittonia: { plants: [P('fittonia', 3)], light: 0.6 },
  moss: { plants: [P('moss', 4)], light: 0.4 },
  'fittonia+moss': { plants: [P('fittonia', 3), P('moss', 4)], light: 0.5 },
  cuttings: { plants: [P('pothos', 1.2, 1), P('pothos', 1, 1), P('pothos', 0.8, 1)], light: 0.8 },
};
function run(base, mode, years) {
  const j = M.createJar(Object.assign({}, base, { temperature: 24 }), 'x');
  const L0 = j.params.light;
  const log = { tmax: 0, dead: 0 };
  for (let d = 0; d < 365 * years; d++) {
    const phase = Math.sin(2 * Math.PI * (d - 105) / 365);         // -1 at mid-winter, +1 at mid-summer
    if (mode === 'season' || mode === 'season+light') j.params.temperature = 24.25 + 2.25 * phase;   // 22 .. 26.5 (room)
    if (mode === 'season+light') j.params.light = L0 * (1 + 0.5 * phase * 0.8);                       // +-40 % (window light)
    M.advance(j, 24);
    log.tmax = Math.max(log.tmax, j.s.Ta);
  }
  const act = T.diagnostics.activeRules(j).map(r => r.id).filter(i => !/^(stable|rooted)/.test(i));
  return { j, tmax: log.tmax, act };
}
for (const [name, base] of Object.entries(setups)) {
  const out = [];
  for (const mode of ['constant', 'season', 'season+light']) {
    const { j, tmax, act } = run(base, mode, 3);
    const o = M.observe(j);
    out.push(mode.padEnd(12) + ' ' + j.s.plants.map(q => q.dead ? 'DEAD(' + q.cause + ')' : q.S.toFixed(1)).join('/') + ' spr' + o.springtails.toFixed(0) + ' Tmax' + tmax.toFixed(1) + ' [' + (act.join(',') || '-') + ']');
  }
  console.log(name.padEnd(14), out.join(' | '));
}
