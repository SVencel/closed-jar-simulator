// node test/window.js [years] : windowsill presets through the seasons, with daily peak air temperature
require('../src/species.js'); require('../src/model.js'); require('../src/diagnostics.js'); require('../src/presets.js');
const T = Terra, M = T.model;
const years = +process.argv[2] || 3;
for (const id of ['win_generic', 'win_fittonia', 'win_moss', 'win_mossfit']) {
  const p = T.presets.find(x => x.id === id); const j = M.createJar(p.params, p.name);
  console.log('== ' + p.name);
  let tmaxQ = 0, tminQ = 99, n = 0;
  for (let d = 1; d <= 365 * years; d++) {
    for (let h = 0; h < 24; h++) { M.advance(j, 1); tmaxQ = Math.max(tmaxQ, j.s.Ta); tminQ = Math.min(tminQ, j.s.Ta); }
    if (d % 91 === 0) {
      const o = M.observe(j);
      console.log('  ' + M.dateOf(j.s.doy).padEnd(7), 'room', j.s.effTemp.toFixed(1), 'air', tminQ.toFixed(1) + '–' + tmaxQ.toFixed(1), 'light', j.s.effLight.toFixed(2), 'day', j.s.effPhoto.toFixed(1) + 'h',
        '| plants', j.s.plants.map(q => q.dead ? 'DEAD(' + q.cause + ')' : q.S.toFixed(1)).join('/'), 'spr', o.springtails.toFixed(0), '|', T.diagnostics.status(j).label, T.diagnostics.activeRules(j).map(r => r.id).filter(i => i !== 'stable').join(','));
      tmaxQ = 0; tminQ = 99;
    }
  }
}
