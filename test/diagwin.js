require('./../src/species.js'); require('./../src/model.js'); require('./../src/diagnostics.js');
const M = Terra.model, K = M.K;
function trial(label, mod, params, years) {
  const saved = Object.assign({}, K); mod && mod(K);
  const j = M.createJar(Object.assign({ seasonOn: 1, lightSource: 1, windowShare: 0.25 }, params));
  let firstSpringGone = null, firstDeadPlant = null;
  for (let d = 0; d < 365 * years; d++) { M.advance(j, 24, { diag: false }); if (firstSpringGone === null && j.d.count < 1) firstSpringGone = d; if (firstDeadPlant === null && j.d.alive === 0) firstDeadPlant = d; }
  Object.assign(K, saved);
  console.log(label.padEnd(46), 'plants', j.s.plants.map(q => q.dead ? 'DEAD(' + q.cause + ')' : q.S.toFixed(1)).join('/'), 'springtails', j.d.count.toFixed(0), '| springtails gone day', firstSpringGone, ' plants gone day', firstDeadPlant);
}
const gen = {}, fit = { plants: [{ sp: 'fittonia', start: 3 }] }, moss = { plants: [{ sp: 'moss', start: 4 }] };
for (const [n, b] of [['generic', gen], ['fittonia', fit], ['moss', moss]]) {
  console.log('--- ' + n + ' (window share 0.25, 3 years)');
  trial('as is', null, b, 3);
  trial('sun heating x0.5', k => { k.sunHeat = 0.5; }, b, 3);
  trial('springtail heat limit 28 -> 33 C', k => { k.sHeatT = 33; }, b, 3);
  trial('grey mold infection rate halved', k => { k.dis0 = 0.06; }, b, 3);
  trial('all three together', k => { k.sunHeat = 0.5; k.sHeatT = 33; k.dis0 = 0.06; }, b, 3);
  trial('no seasons, constant 24 C + lamp 0.5', null, Object.assign({}, b, { seasonOn: 0, lightSource: 0, light: 0.5, temperature: 24 }), 3);
}
