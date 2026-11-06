/* Small dependency-free canvas charts: time-series line chart and sweep heatmap. */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function fmt(v, digits) {
    if (!isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000).toFixed(1) + 'k';
    return v.toFixed(a >= 100 ? 0 : digits);
  }

  // series: [{name, color, xs:[], ys:[]}]
  function LineChart(canvas, opts) {
    this.canvas = canvas; this.opts = opts || {}; this.series = []; this.hoverX = null;
    const self = this;
    canvas.style.touchAction = 'pan-y';          // vertical swipes still scroll the page; a horizontal touch reads values
    canvas.addEventListener('pointermove', function (e) {
      const r = canvas.getBoundingClientRect(); self.hoverX = e.clientX - r.left; self.draw();
    });
    canvas.addEventListener('pointerdown', function (e) {
      const r = canvas.getBoundingClientRect(); self.hoverX = e.clientX - r.left; self.draw();
    });
    canvas.addEventListener('pointerleave', function () { self.hoverX = null; self.draw(); });
    canvas.addEventListener('pointercancel', function () { self.hoverX = null; self.draw(); });
  }
  LineChart.prototype.setData = function (series, xMin, xMax) { this.series = series; this.xMin = xMin; this.xMax = xMax; this.draw(); };
  LineChart.prototype.draw = function () {
    const c = setupCanvas(this.canvas), ctx = c.ctx, W = c.w, H = c.h;
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 44, r: 8, t: 8, b: 20 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const x0 = this.xMin, x1 = Math.max(this.xMax, x0 + 1e-6);

    // y range from visible data
    let lo = Infinity, hi = -Infinity;
    this.series.forEach(function (s) {
      for (let i = 0; i < s.xs.length; i++) {
        if (s.xs[i] < x0) continue;
        const v = s.ys[i]; if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (this.opts.zero !== false) lo = Math.min(lo, 0);
    if (this.opts.min !== undefined) lo = this.opts.min;
    if (hi - lo < 1e-9) hi = lo + 1;
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = function (x) { return pad.l + (x - x0) / (x1 - x0) * pw; };
    const Y = function (y) { return pad.t + (1 - (y - lo) / (hi - lo)) * ph; };

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.lineWidth = 1;
    for (let v = lo; v <= hi + step * 0.001; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillText(fmt(v, step < 1 ? 1 : 0), pad.l - 5, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xs = niceStep(x1 - x0, 5);
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1; v += xs) {
      ctx.fillText(fmt(v, 0), X(v), H - pad.b + 5);
    }

    // optional reference band (e.g. healthy range)
    if (this.opts.band) {
      ctx.fillStyle = css('--band');
      const b0 = Y(Math.min(hi, this.opts.band[1])), b1 = Y(Math.max(lo, this.opts.band[0]));
      if (b1 > b0) ctx.fillRect(pad.l, b0, pw, b1 - b0);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
    this.series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.focus ? 2.2 : 1.5; ctx.globalAlpha = s.focus ? 1 : 0.85;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.xs.length; i++) {
        if (s.xs[i] < x0) continue;
        if (s.ys[i] == null) { started = false; continue; }
        const px = X(s.xs[i]), py = Y(s.ys[i]);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.restore(); ctx.globalAlpha = 1;

    // hover read-out
    if (this.hoverX !== null && this.hoverX >= pad.l && this.hoverX <= W - pad.r) {
      const xv = x0 + (this.hoverX - pad.l) / pw * (x1 - x0);
      ctx.strokeStyle = css('--muted'); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(this.hoverX, pad.t); ctx.lineTo(this.hoverX, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
      const rows = [];
      const digits = this.opts.digits || 0;
      this.series.forEach(function (s) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < s.xs.length; i++) { const dd = Math.abs(s.xs[i] - xv); if (dd < bd) { bd = dd; best = i; } }
        if (best >= 0 && s.ys[best] != null) rows.push({ color: s.color, name: s.name, v: s.ys[best] });
      });
      ctx.font = '11px system-ui, sans-serif';
      const lh = 14, bw = 128, bh = lh * (rows.length + 1) + 6;
      let bx = this.hoverX + 10; if (bx + bw > W) bx = this.hoverX - bw - 10;
      ctx.fillStyle = css('--tip'); ctx.fillRect(bx, pad.t + 2, bw, bh);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = css('--muted'); ctx.fillText('day ' + xv.toFixed(1), bx + 6, pad.t + 2 + lh * 0.7);
      rows.forEach(function (r, i) {
        ctx.fillStyle = r.color; ctx.fillRect(bx + 6, pad.t + 2 + lh * (i + 1) + 4, 8, 8);
        ctx.fillStyle = css('--text'); ctx.fillText(fmt(r.v, digits) + '  ' + r.name, bx + 19, pad.t + 2 + lh * (i + 1) + 8);
      });
    }
  };

  // ---- heatmap -------------------------------------------------------------
  // cfg: { grid: [row][col] of {value:0..1|null, label}, xLabel, yLabel, xRange:[a,b], yRange:[a,b] }
  function colorScale(t) {      // 0 = bad (red) .. 1 = good (green)
    t = Math.max(0, Math.min(1, t));
    const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 150);
    const g = t < 0.5 ? Math.round(60 + t * 2 * 150) : Math.round(210 - (t - 0.5) * 2 * 30);
    const b = t < 0.5 ? 70 : 90;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function drawHeatmap(canvas, cfg) {
    const c = setupCanvas(canvas), ctx = c.ctx, W = c.w, H = c.h;
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 56, r: 12, t: 10, b: 36 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const ny = cfg.grid.length, nx = ny ? cfg.grid[0].length : 0;
    const cw = pw / (cfg.nx || nx || 1), chh = ph / (cfg.ny || ny || 1);
    cfg.geom = { pad: pad, cw: cw, ch: chh, nx: cfg.nx || nx, ny: cfg.ny || ny };
    for (let iy = 0; iy < cfg.grid.length; iy++) {
      for (let ix = 0; ix < cfg.grid[iy].length; ix++) {
        const cell = cfg.grid[iy][ix]; if (!cell) continue;
        ctx.fillStyle = colorScale(cell.value);
        const px = pad.l + ix * cw, py = pad.t + ph - (iy + 1) * chh;
        ctx.fillRect(px, py, cw - 1, chh - 1);
      }
    }
    if (cfg.hover) {
      const px = pad.l + cfg.hover.ix * cw, py = pad.t + ph - (cfg.hover.iy + 1) * chh;
      ctx.strokeStyle = css('--text'); ctx.lineWidth = 2; ctx.strokeRect(px, py, cw - 1, chh - 1);
    }
    ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xr = cfg.xRange, yr = cfg.yRange;
    for (let i = 0; i < 5; i++) {
      const f = i / 4, v = xr[0] + (xr[1] - xr[0]) * f;
      ctx.fillText(fmt(v, 1), pad.l + pw * f * (1 - 1 / ((cfg.nx || nx) * 2)) + cw / 2, pad.t + ph + 4);
    }
    ctx.fillText(cfg.xLabel, pad.l + pw / 2, pad.t + ph + 19);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const f = i / 4, v = yr[0] + (yr[1] - yr[0]) * f;
      ctx.fillText(fmt(v, 1), pad.l - 6, pad.t + ph - (f * (ph - chh) + chh / 2));
    }
    ctx.save(); ctx.translate(12, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();
  }
  function heatmapHit(canvas, cfg, ev) {
    if (!cfg.geom) return null;
    const r = canvas.getBoundingClientRect(), g = cfg.geom;
    const x = ev.clientX - r.left - g.pad.l, y = ev.clientY - r.top - g.pad.t;
    const ph = g.ch * g.ny;
    const ix = Math.floor(x / g.cw), iy = Math.floor((ph - y) / g.ch);
    if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny) return null;
    return { ix: ix, iy: iy };
  }

  Terra.charts = { LineChart, drawHeatmap, heatmapHit, colorScale };
})(window);
