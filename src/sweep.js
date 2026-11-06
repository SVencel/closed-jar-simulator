/*
 * Headless parameter sweeps: run many jars with no UI and map which
 * combinations survive.
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});
  const M = function () { return Terra.model; };

  // Run one jar for up to `days`. Stops early at the first failure.
  function runOne(params, days) {
    const m = M();
    const j = m.createJar(params);
    let failDay = null, failWhat = null;
    for (let day = 1; day <= days; day++) {
      m.advance(j, 24, { diag: false });
      const f = m.failure(j);
      if (f) { failDay = day; failWhat = f; break; }
    }
    return {
      survived: failDay === null,
      failDay: failDay === null ? days : failDay,
      failWhat: failWhat,
      plant: j.d.shoot, springtails: j.d.count, co2ppm: j.d.co2ppm, o2pct: j.d.o2pct,
      moisture: j.d.theta * 100, fungi: j.s.F,
    };
  }

  function axisValue(min, max, n, i) { return n <= 1 ? min : min + (max - min) * i / (n - 1); }

  // cfg: { base, xKey, xMin, xMax, xN, yKey, yMin, yMax, yN, days }
  // Returns the cells of row iy (one per x value).
  function sweepRow(cfg, iy) {
    const row = [];
    for (let ix = 0; ix < cfg.xN; ix++) {
      const p = Object.assign({}, cfg.base);
      p[cfg.xKey] = axisValue(cfg.xMin, cfg.xMax, cfg.xN, ix);
      p[cfg.yKey] = axisValue(cfg.yMin, cfg.yMax, cfg.yN, iy);
      const r = runOne(p, cfg.days);
      r.params = p;
      row.push(r);
    }
    return row;
  }

  Terra.sweep = { runOne, sweepRow, axisValue };
})(typeof globalThis !== 'undefined' ? globalThis : this);
