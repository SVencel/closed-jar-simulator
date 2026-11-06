(function () {
  'use strict';
  const T = window.Terra, M = T.model, D = T.diagnostics;

  const COLORS = ['#4cc9f0', '#f77f00', '#80ed99', '#f72585', '#ffd166', '#b388eb', '#90be6d', '#adb5bd'];
  const SPEEDS = [
    { label: '1 hour / s', v: 1 / 24 }, { label: '6 hours / s', v: 0.25 }, { label: '1 day / s', v: 1 },
    { label: '3 days / s', v: 3 }, { label: '10 days / s', v: 10 }, { label: '30 days / s', v: 30 },
    { label: '100 days / s', v: 100 }, { label: '1 year / s', v: 365 },
  ];

  const state = { jars: [], focus: null, shown: new Set(), running: false, speed: 1, acc: 0, colorN: 0, tab: 'live', dirty: false };
  const $ = function (id) { return document.getElementById(id); };

  function h(tag, attrs) {
    const el = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }
  function focused() { return state.jars.find(function (j) { return j.id === state.focus; }); }
  function fmtNum(v, d) { return (+v).toFixed(d); }

  // ---------------------------------------------------------------- jars ----
  function addJar(jar) {
    jar._color = COLORS[state.colorN++ % COLORS.length];
    state.jars.push(jar);
    state.shown.add(jar.id);
    state.focus = jar.id;
    renderAll();
  }
  function addFromPreset(p) {
    const jar = M.createJar(p.params, p.name);
    // Bring the newcomer to the same day as the others so charts line up.
    const lead = state.jars.reduce(function (m, j) { return Math.max(m, j.hours); }, 0);
    if (lead > 0) M.advance(jar, lead);
    addJar(jar);
  }
  function removeJar(id) {
    if (state.jars.length <= 1) return;
    state.jars = state.jars.filter(function (j) { return j.id !== id; });
    state.shown.delete(id);
    if (state.focus === id) state.focus = state.jars[0].id;
    renderAll();
  }
  function forkJar(j) {
    const c = M.clone(j);
    c.name = j.name + ' (fork)';
    c._color = COLORS[state.colorN++ % COLORS.length];
    state.jars.push(c); state.shown.add(c.id); state.focus = c.id;
    renderAll();
  }

  // ------------------------------------------------------------- sidebar ----
  const cardEls = {};
  function renderJarList() {
    const list = $('jarList');
    list.innerHTML = '';
    state.jars.forEach(function (j) {
      const dot = h('span', { class: 'dot' }); dot.style.background = j._color;
      const cb = h('input', { type: 'checkbox', title: 'Show in charts' });
      cb.checked = state.shown.has(j.id);
      cb.addEventListener('click', function (e) { e.stopPropagation(); });
      cb.addEventListener('change', function () { cb.checked ? state.shown.add(j.id) : state.shown.delete(j.id); updateCharts(); });
      const chip = h('span', { class: 'chip' });
      const meta = h('div', { class: 'meta' });
      const nameEl = h('span', { class: 'name', text: j.name, title: 'Double-click to rename' });
      nameEl.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        const n = prompt('Rename jar', j.name); if (n) { j.name = n; renderAll(); }
      });
      const btns = h('div', { class: 'btns' },
        h('button', { class: 'small', title: 'Copy this jar as it is now, then change a setting and compare', onclick: function (e) { e.stopPropagation(); forkJar(j); } }, 'Fork'),
        h('button', { class: 'small', title: 'Restart this jar from day 0', onclick: function (e) { e.stopPropagation(); M.resetState(j); renderAll(); } }, 'Restart'),
        h('button', { class: 'small', title: 'Remove', onclick: function (e) { e.stopPropagation(); removeJar(j.id); } }, '✕'));
      const card = h('div', { class: 'jar-card' + (j.id === state.focus ? ' focus' : ''), onclick: function () { state.focus = j.id; renderAll(); } },
        h('div', { class: 'row' }, cb, dot, nameEl, chip), meta, btns);
      list.appendChild(card);
      cardEls[j.id] = { chip: chip, meta: meta };
    });
    updateJarCards();
  }
  function updateJarCards() {
    state.jars.forEach(function (j) {
      const e = cardEls[j.id]; if (!e) return;
      const st = D.status(j);
      e.chip.className = 'chip ' + st.cls; e.chip.textContent = st.label;
      e.meta.textContent = '';
      const o = M.observe(j);
      [['day ' + Math.floor(j.hours / 24)], ['shoots ' + fmtNum(o.shoot, 1)], ['springtails ' + fmtNum(o.springtails, 0)], ['O₂ ' + fmtNum(o.o2pct, 1) + '%']]
        .forEach(function (t) { e.meta.appendChild(h('span', { text: t[0] })); });
    });
  }

  const plantNowSel = { sp: 'fittonia', cutting: true };
  function renderActions() {
    const box = $('actions'); box.innerHTML = '';
    const spSel = h('select', { title: 'Species to plant' });
    T.speciesOrder.forEach(function (id) { spSel.appendChild(h('option', { value: id, text: T.species[id].name })); });
    spSel.value = plantNowSel.sp;
    spSel.addEventListener('change', function () { plantNowSel.sp = spSel.value; });
    const cut = h('input', { type: 'checkbox', id: 'plantNowCut' }); cut.checked = plantNowSel.cutting;
    cut.addEventListener('change', function () { plantNowSel.cutting = cut.checked; });
    box.appendChild(h('div', { style: 'width:100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px' },
      spSel, h('label', { class: 'hint' }, cut, ' cutting (no roots)'),
      h('button', { class: 'small', onclick: function () {
        const j = focused(), sp = T.species[plantNowSel.sp];
        M.plantNow(j, { sp: plantNowSel.sp, start: plantNowSel.cutting ? Math.max(0.6, sp.start * 0.3) : sp.start, cutting: plantNowSel.cutting });
        updateUI(true);
      } }, 'Plant it now')));
    Object.keys(M.ACTIONS).forEach(function (k) {
      box.appendChild(h('button', { class: 'small', onclick: function () { const j = focused(); M.act(j, k); updateUI(true); } }, M.ACTIONS[k].label));
    });
  }

  const openGroups = { Climate: true, Plants: true, Water: true };
  function renderParams() {
    const j = focused(); const box = $('params'); box.innerHTML = '';
    $('paramTitle').textContent = 'Settings – ' + j.name;
    let det = null, group = null;
    M.PARAM_DEFS.forEach(function (def) {
      if (def.group !== group) {
        group = def.group;
        const g = group;
        det = h('details', { class: 'pgroup' }, h('summary', { text: group }));
        if (openGroups[g]) det.setAttribute('open', '');
        det.addEventListener('toggle', function () { openGroups[g] = det.open; });
        box.appendChild(det);
      }
      const val = h('span', { class: 'val' });
      const show = function () { val.textContent = fmtNum(j.params[def.key], def.step < 1 ? (def.step < 0.1 ? 2 : 1) : 0) + (def.unit ? ' ' + def.unit : ''); };
      const input = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: j.params[def.key], title: def.help });
      input.addEventListener('input', function () {
        j.params[def.key] = +input.value; show();
        if (def.live) { M.derive(j); updateUI(true); } else { renderRestartNote(); markDirty(); }
      });
      show();
      det.appendChild(h('div', { class: 'param', title: def.help },
        h('div', { class: 'top' }, h('span', { text: def.label + (def.live ? '' : ' ↻') }), val), input,
        def.help ? h('div', { class: 'phelp', text: def.help }) : null));
      if (def.key === 'plantGrowth') det.appendChild(plantsEditor(j));
    });
    renderRestartNote();
  }
  // Starting plants: species, size, and whether it is a rootless cutting. Applies on restart.
  function plantsEditor(j) {
    const wrap = h('div', {});
    wrap.appendChild(h('div', { class: 'hint', style: 'margin:6px 0 2px', text: 'Plants at start ↻' }));
    j.params.plants.forEach(function (spec, i) {
      const sel = h('select'); T.speciesOrder.forEach(function (id) { sel.appendChild(h('option', { value: id, text: T.species[id].name })); });
      sel.value = spec.sp;
      sel.addEventListener('change', function () { spec.sp = sel.value; renderRestartNote(); });
      const size = h('input', { type: 'number', min: 0.2, max: 40, step: 0.2, value: spec.start != null ? spec.start : T.species[spec.sp].start, title: 'Shoot size in mmol C' });
      size.addEventListener('input', function () { spec.start = Math.max(0.2, +size.value || 0.2); renderRestartNote(); });
      const cut = h('input', { type: 'checkbox' }); cut.checked = !!spec.cutting;
      cut.addEventListener('change', function () { spec.cutting = cut.checked; renderRestartNote(); });
      const del = h('button', { class: 'small', title: 'Remove this plant', onclick: function () { j.params.plants.splice(i, 1); renderParams(); } }, '✕');
      wrap.appendChild(h('div', { class: 'plant-edit' }, h('div', { class: 'line' }, sel, size, h('label', { class: 'hint' }, cut, ' cutting'), del)));
    });
    wrap.appendChild(h('button', { class: 'small', onclick: function () { j.params.plants.push({ sp: 'fittonia', start: T.species.fittonia.start, cutting: false }); renderParams(); } }, '+ add a plant'));
    return wrap;
  }

  function renderRestartNote() {
    const j = focused(); const box = $('restartNote'); box.innerHTML = '';
    const changed = M.PARAM_DEFS.filter(function (d) { return !d.live && j.params[d.key] !== j.initial[d.key]; });
    if (JSON.stringify(j.params.plants) !== JSON.stringify(j.initial.plants)) changed.push({ label: 'plants' });
    if (changed.length) {
      box.appendChild(h('div', { class: 'restart-note' },
        'Changed starting values (' + changed.map(function (d) { return d.label; }).join(', ') + ') only apply after a restart. ',
        h('button', { class: 'small', onclick: function () { M.resetState(j); renderAll(); } }, 'Restart this jar')));
    } else {
      box.appendChild(h('div', { class: 'hint', text: 'Settings marked ↻ are starting amounts: change them, then restart the jar. The others act live.' }));
    }
  }

  // ----------------------------------------------------------- main panel ----
  const chartObjs = {};
  const BANDS = { o2pct: [19, 23], ph: [5.5, 7.5], humidity: [60, 100], temp: [18, 26], moisture: [18, 40], roots: [80, 100] };
  const NOZERO = { temp: 1, soiltemp: 1, o2pct: 1, ph: 1 };
  function buildCharts() {
    const box = $('charts'); box.innerHTML = '';
    const sel = $('chartGroup'); sel.innerHTML = '';
    ['All'].concat(M.VARGROUPS).concat(['Per plant']).forEach(function (g) { sel.appendChild(h('option', { value: g, text: g === 'All' ? 'All charts' : g })); });
    sel.addEventListener('change', function () { applyChartFilter(); updateCharts(); });
    M.VARGROUPS.forEach(function (g) {
      box.appendChild(h('div', { class: 'chart-group-title', 'data-group': g, text: g }));
      M.VARS.filter(function (v) { return v.group === g; }).forEach(function (v) {
        const canvas = h('canvas'); const val = h('span', { class: 'v' });
        const card = h('div', { class: 'chart-card', 'data-group': g },
          h('div', { class: 'hd' }, h('span', { class: 't', text: v.label + (v.unit ? ' (' + v.unit + ')' : '') }), val), canvas);
        box.appendChild(card);
        const opts = { digits: v.digits, zero: !NOZERO[v.key] };
        if (BANDS[v.key]) opts.band = BANDS[v.key];
        chartObjs[v.key] = { chart: new T.charts.LineChart(canvas, opts), val: val, def: v, card: card };
      });
    });
    box.appendChild(h('div', { class: 'chart-group-title', 'data-group': 'Per plant', text: 'Per plant (focused jar)' }));
    [['pl_shoot', 'Each plant: shoot (mmol C)', 'shoot', 2], ['pl_root', 'Each plant: roots (mmol C)', 'root', 2], ['pl_health', 'Each plant: root health (%)', 'health', 0]].forEach(function (c) {
      const canvas = h('canvas');
      const card = h('div', { class: 'chart-card', 'data-group': 'Per plant' }, h('div', { class: 'hd' }, h('span', { class: 't', text: c[1] }), h('span', { class: 'v' })), canvas);
      box.appendChild(card);
      chartObjs[c[0]] = { chart: new T.charts.LineChart(canvas, { digits: c[3] }), field: c[2], plantChart: true, card: card };
    });
    applyChartFilter();
  }
  function applyChartFilter() {
    const g = $('chartGroup').value;
    document.querySelectorAll('#charts [data-group]').forEach(function (el) { el.hidden = !(g === 'All' || el.getAttribute('data-group') === g); });
  }
  function updateCharts() {
    const win = +$('window').value;
    const shown = state.jars.filter(function (j) { return state.shown.has(j.id); });
    const f = focused();
    let xMax = 0; shown.forEach(function (j) { xMax = Math.max(xMax, j.hours / 24); });
    const xMin = win > 0 ? Math.max(0, xMax - win) : 0;
    const ob = M.observe(f);
    Object.keys(chartObjs).forEach(function (key) {
      const o = chartObjs[key];
      if (o.card.hidden) return;
      if (o.plantChart) {
        o.chart.setData(f.s.plants.map(function (pl, i) {
          return { name: D.plantLabel(f, i), color: COLORS[i % COLORS.length], xs: f.hist.t, ys: f.hist.pl[i] ? f.hist.pl[i][o.field] : [], focus: true };
        }), xMin, xMax);
        return;
      }
      o.chart.setData(shown.map(function (j) {
        return { name: j.name, color: j._color, xs: j.hist.t, ys: j.hist.series[key], focus: j.id === f.id };
      }), xMin, xMax);
      o.val.textContent = fmtNum(ob[key], o.def.digits);
    });
  }

  function renderPlantTable(j) {
    const box = $('plantTable'); box.innerHTML = '';
    const grid = h('div', { class: 'ptable' });
    if (!j.s.plants.length) grid.appendChild(h('div', { class: 'hint', text: 'No plants in this jar.' }));
    j.s.plants.forEach(function (pl, i) {
      const sp = T.species[pl.sp] || T.species.generic, st = D.plantStatus(j, i);
      const sw = h('span', { class: 'sw' }); sw.style.background = COLORS[i % COLORS.length];
      const tgt = sp.rootRatio * pl.S;
      const rootPct = pl.dead ? 0 : (tgt > 0 ? Math.min(100, pl.R / tgt * 100) : 0);
      const mk = function (pct, col) { const b = h('span', { class: 'bar' }), f = h('i'); f.style.width = pct + '%'; f.style.background = col; b.appendChild(f); return b; };
      const nm = h('div', { class: 'nm' }, h('b', { text: D.plantLabel(j, i) }),
        h('span', { class: 'sub', text: '  shoot ' + pl.S.toFixed(1) + ' · roots ' + pl.R.toFixed(1) + ' · reserve ' + pl.A.toFixed(2) + (pl.fF > 0.02 ? ' · leaf mold ' + (pl.fF * 100).toFixed(0) + '%' : '') + (pl.fR > 0.02 ? ' · root rot ' + (pl.fR * 100).toFixed(0) + '%' : '') }),
        h('div', { class: 'bars' }, h('span', { class: 'sub', text: 'roots' }), mk(rootPct, 'var(--accent)'), h('span', { class: 'sub', text: 'health' }), mk(pl.dead ? 0 : pl.h * 100, pl.h < 0.6 ? 'var(--bad)' : 'var(--good)')));
      grid.appendChild(sw); grid.appendChild(nm); grid.appendChild(h('span', { class: 'chip ' + st.cls, text: st.text }));
    });
    box.appendChild(grid);
  }

  let lastLogSig = '', lastAlertSig = '';
  function updatePanel(force) {
    const j = focused();
    $('focusName').textContent = j.name;
    const st = D.status(j);
    $('focusStatus').innerHTML = ''; $('focusStatus').appendChild(h('span', { class: 'chip ' + st.cls, text: st.label }));

    renderPlantTable(j);
    const active = D.activeRules(j);
    const sig = j.id + ':' + (j.hours < 48) + ':' + active.map(function (r) { return r.id; }).join(',') + ':' + j.log.length;
    if (force || sig !== lastAlertSig) {
      lastAlertSig = sig;
      const box = $('alerts'); box.innerHTML = '';
      if (!active.length) box.appendChild(h('div', { class: 'hint', text: j.hours < 48 ? 'Just started...' : 'No active problems.' }));
      active.forEach(function (r) {
        let last = null;
        for (let i = j.log.length - 1; i >= 0; i--) if (j.log[i].id === r.id && j.log[i].level !== 'info') { last = j.log[i]; break; }
        box.appendChild(h('div', { class: 'alert ' + r.level }, h('b', { text: r.label }), last ? last.msg : ''));
      });
    }
    const lsig = j.id + ':' + j.log.length;
    if (force || lsig !== lastLogSig) {
      lastLogSig = lsig;
      const box = $('log'); box.innerHTML = '';
      if (!j.log.length) box.appendChild(h('div', { class: 'info', text: 'Nothing has happened yet.' }));
      for (let i = j.log.length - 1, n = 0; i >= 0 && n < 120; i--, n++) {
        const e = j.log[i];
        box.appendChild(h('div', { class: e.level }, h('span', { class: 'd', text: 'day ' + Math.floor(e.day) }), h('span', { text: e.msg })));
      }
    }
  }

  function updateClock() {
    const lead = state.jars.reduce(function (m, j) { return Math.max(m, j.hours); }, 0);
    const y = Math.floor(lead / 24 / 365), d = Math.floor(lead / 24) % 365;
    const f = focused();
    const cal = f && (f.params.seasonOn || f.params.lightSource) ? ' · ' + M.dateOf(f.s.doy) : '';
    $('clock').textContent = 'Day ' + Math.floor(lead / 24) + (y ? '  (' + y + ' y ' + d + ' d)' : '') + cal;
  }

  function updateUI(force) {
    if (force === true) markDirty();
    updateClock(); updateJarCards(); updatePanel(force); updateCharts();
  }
  function renderAll() {
    renderJarList(); renderParams(); renderActions(); updateUI(true);
  }

  // ----------------------------------------------------------- time loop ----
  function advanceAll(hours) {
    state.jars.forEach(function (j) { M.advance(j, hours); });
    if (hours > 0) markDirty();
  }
  let lastTs = 0, lastUi = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - (lastTs || ts)) / 1000); lastTs = ts;
    if (state.running) {
      state.acc += state.speed * 24 * dt;
      const n = Math.floor(state.acc);
      if (n > 0) { state.acc -= n; advanceAll(n); }
    }
    if (state.tab === 'live') {
      const j = focused(); if (j) T.jarview.draw($('jarCanvas'), j, ts);
      if (ts - lastUi > 120) { lastUi = ts; updateUI(false); }
    } else if (state.tab === '3d') {
      const j = focused();
      if (j && T.jar3d && T.jar3d.available) {
        try { T.jar3d.frame(j, ts); } catch (err) { show3dError(err); }
        if (ts - lastUi > 250) { lastUi = ts; update3dInfo(j); updateJarCards(); updateClock(); }
      }
    }
    requestAnimationFrame(frame);
  }
  // ------------------------------------------------------------------- 3D ----
  let threeReady = false;
  function show3dError(err) {
    const box = $('msg3d'); box.hidden = false;
    box.textContent = '3D view problem: ' + (err && err.message ? err.message : err);
    console.error(err);
  }
  function ensure3d() {
    if (threeReady) return;
    const box = $('msg3d');
    if (!T.jar3d || !T.jar3d.available) {
      box.hidden = false;
      box.innerHTML = 'The 3D view needs the Three.js library, which is loaded from the internet (cdn.jsdelivr.net) and could not be reached. Connect to the internet and reload the page. The 2D view and everything else still works.';
      return;
    }
    try { T.jar3d.init($('view3d')); threeReady = true; } catch (err) { show3dError(err); }
  }
  function update3dInfo(j) {
    const o = M.observe(j), st = D.status(j), el = $('info3d');
    const cal = (j.params.seasonOn || j.params.lightSource) ? M.dateOf(j.s.doy) + ' · ' : '';
    const active = D.activeRules(j).filter(function (r) { return r.level !== 'good'; }).slice(0, 4);
    const sig = [j.id, Math.floor(j.hours), st.label, active.map(function (r) { return r.id; }).join()].join('|');
    if (el._sig === sig) return; el._sig = sig;
    const hh = Math.floor(j.hours % 24);
    el.innerHTML = '<b>' + j.name + '</b> · ' + st.label + '<br>' + cal + 'day ' + Math.floor(j.hours / 24) + ', ' + (hh < 10 ? '0' : '') + hh + ':00<br>' +
      o.temp.toFixed(1) + ' °C · ' + o.humidity.toFixed(0) + '% RH · CO₂ ' + o.co2ppm.toFixed(0) + ' ppm · O₂ ' + o.o2pct.toFixed(1) + '% · pH ' + o.ph.toFixed(1) + '<br>' +
      'soil ' + o.moisture.toFixed(0) + '% · drainage layer ' + o.drain.toFixed(0) + '% · springtails ' + o.springtails.toFixed(0) +
      active.map(function (r) { return '<br><span class="' + r.level + '">● ' + r.label + '</span>'; }).join('');
  }
  function setRunning(on) { state.running = on; $('playBtn').textContent = on ? '⏸ Pause' : '▶ Play'; }

  // --------------------------------------------------------------- sweep ----
  const sweep = { cfg: null, cells: [], running: false, token: 0 };
  function buildSweepForm() {
    const form = $('sweepForm'); form.innerHTML = '';
    function axis(id, label, defKey) {
      const sel = h('select', { id: id + 'Key' }); M.PARAM_DEFS.forEach(function (d) { sel.appendChild(h('option', { value: d.key, text: d.label + (d.unit ? ' (' + d.unit + ')' : '') })); });
      sel.value = defKey;
      const mn = h('input', { type: 'number', id: id + 'Min', step: 'any' }), mx = h('input', { type: 'number', id: id + 'Max', step: 'any' }), n = h('input', { type: 'number', id: id + 'N', value: 14, min: 2, max: 40 });
      const reset = function () { const d = M.PARAM_DEFS.find(function (x) { return x.key === sel.value; }); mn.value = d.min; mx.value = d.max; };
      sel.addEventListener('change', reset); reset();
      form.appendChild(h('div', { class: 'f' }, h('label', { text: label }), sel,
        h('div', { class: 'line', style: 'margin-top:6px' }, h('span', { class: 'hint', text: 'from' }), mn, h('span', { class: 'hint', text: 'to' }), mx, h('span', { class: 'hint', text: 'steps' }), n)));
    }
    axis('sx', 'Horizontal axis', 'water');
    axis('sy', 'Vertical axis', 'light');
    const days = h('input', { type: 'number', id: 'sDays', value: 365, min: 30, max: 3650 });
    const metric = h('select', { id: 'sMetric' },
      h('option', { value: 'days', text: 'Days survived (green = whole run)' }),
      h('option', { value: 'plant', text: 'Plant size at the end' }),
      h('option', { value: 'springtails', text: 'Springtails at the end' }));
    form.appendChild(h('div', { class: 'f' }, h('label', { text: 'Run length (days) and colour by' }), h('div', { class: 'line' }, days, metric)));
  }
  function cellValue(res, metric, days) {
    if (metric === 'plant') return Math.min(1, res.plant / 25);
    if (metric === 'springtails') return Math.min(1, res.springtails / 80);
    return res.failDay / days;
  }
  function runSweep() {
    if (sweep.running) { sweep.token++; sweep.running = false; $('sweepRun').textContent = 'Run sweep'; return; }
    const f = focused();
    const cfg = {
      base: Object.assign({}, f.initial),
      xKey: $('sxKey').value, xMin: +$('sxMin').value, xMax: +$('sxMax').value, xN: Math.max(2, Math.min(40, +$('sxN').value)),
      yKey: $('syKey').value, yMin: +$('syMin').value, yMax: +$('syMax').value, yN: Math.max(2, Math.min(40, +$('syN').value)),
      days: Math.max(10, +$('sDays').value),
    };
    const metric = $('sMetric').value;
    const xd = M.PARAM_DEFS.find(function (d) { return d.key === cfg.xKey; }), yd = M.PARAM_DEFS.find(function (d) { return d.key === cfg.yKey; });
    sweep.cfg = { grid: [], nx: cfg.xN, ny: cfg.yN, xLabel: xd.label + (xd.unit ? ' (' + xd.unit + ')' : ''), yLabel: yd.label + (yd.unit ? ' (' + yd.unit + ')' : ''), xRange: [cfg.xMin, cfg.xMax], yRange: [cfg.yMin, cfg.yMax] };
    sweep.cells = []; sweep.run = cfg; sweep.metric = metric;
    const token = ++sweep.token; sweep.running = true;
    $('sweepRun').textContent = 'Stop';
    let iy = 0;
    (function next() {
      if (token !== sweep.token) return;
      if (iy >= cfg.yN) { sweep.running = false; $('sweepRun').textContent = 'Run sweep'; $('sweepProg').textContent = 'Done.'; return; }
      const t0 = performance.now();
      const row = T.sweep.sweepRow(cfg, iy);
      sweep.cells.push(row);
      sweep.cfg.grid.push(row.map(function (r) { return { value: cellValue(r, metric, cfg.days) }; }));
      iy++;
      $('sweepProg').textContent = 'Row ' + iy + ' of ' + cfg.yN;
      T.charts.drawHeatmap($('heat'), sweep.cfg);
      setTimeout(next, 0);
    })();
  }
  function describeCell(cell, cfg) {
    const r = cell.res || cell;
    const head = cfg.xLabel.split(' (')[0] + ' = ' + fmtNum(r.params[sweep.run.xKey], 2) + ',  ' + cfg.yLabel.split(' (')[0] + ' = ' + fmtNum(r.params[sweep.run.yKey], 2);
    const why = { plant: 'the plant died', springtails: 'the springtails went extinct', air: 'the air became unbreathable' };
    const out = r.survived ? 'survived all ' + sweep.run.days + ' days' : 'failed on day ' + r.failDay + ': ' + why[r.failWhat];
    return head + '  →  ' + out + '  (plant ' + fmtNum(r.plant, 1) + ', springtails ' + fmtNum(r.springtails, 0) + ', CO₂ ' + fmtNum(r.co2ppm, 0) + ' ppm, O₂ ' + fmtNum(r.o2pct, 1) + '%)';
  }

  // -------------------------------------------------------------- saving ----
  function markDirty() { state.dirty = true; }
  function appSnapshot() {
    return {
      focus: state.jars.findIndex(function (j) { return j.id === state.focus; }),
      shown: state.jars.map(function (j) { return state.shown.has(j.id); }),
      speed: state.speed, tab: state.tab, window: $('window').value, chartGroup: $('chartGroup').value,
      theme: document.documentElement.getAttribute('data-theme'),
      o3: T.jar3d && T.jar3d.opts ? Object.assign({}, T.jar3d.opts) : null,
    };
  }
  function saveStatus(text, cls) { const el = $('saveStatus'); el.textContent = text; el.className = 'hint ' + (cls || ''); }
  function clockTime(ms) { const d = new Date(ms); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  function saveNow() {
    if (!T.store || !state.jars.length) return;
    const r = T.store.save(state.jars, appSnapshot());
    state.dirty = !r.ok;
    if (r.ok) saveStatus('Saved on this device at ' + clockTime(r.at) + '. Jars come back when you reopen the page.', 'saveok');
    else saveStatus('Not saved: ' + r.why + '. Use "Copy backup" to keep your jars.', 'savewarn');
  }
  function loadStarterJars() {
    state.jars = []; state.shown = new Set(); state.colorN = 0;
    ['fittonia', 'cuttings', 'balanced'].forEach(function (id) {
      const p = T.presets.find(function (x) { return x.id === id; });
      addJar(M.createJar(p.params, p.name));
    });
    state.focus = state.jars[0].id; renderAll();
  }
  // Put restored jars (from the autosave or a pasted backup) into the app. mode: 'replace' or 'add'.
  function applyRestored(u, mode) {
    const app = u.app || {};
    if (mode === 'replace') { state.jars = []; state.shown = new Set(); state.colorN = 0; Object.keys(cardEls).forEach(function (k) { delete cardEls[k]; }); }
    const firstNew = state.jars.length;
    u.jars.forEach(function (j) {
      j._color = (mode === 'replace' && j._color) || COLORS[state.colorN++ % COLORS.length];
      state.jars.push(j); state.shown.add(j.id);
    });
    if (mode === 'replace') {
      u.jars.forEach(function (j, i) { if (app.shown && app.shown[i] === false) state.shown.delete(j.id); });
      const f = app.focus >= 0 && app.focus < u.jars.length ? app.focus : 0;
      state.focus = u.jars[f].id;
      if (app.speed) { state.speed = app.speed; $('speed').value = String(app.speed); if ($('speed').value !== String(app.speed)) { state.speed = 1; $('speed').value = '1'; } }
      if (app.window !== undefined && app.window !== null) $('window').value = app.window;
      if (app.chartGroup) { $('chartGroup').value = app.chartGroup; applyChartFilter(); }
      if (app.theme) document.documentElement.setAttribute('data-theme', app.theme);
      if (app.o3 && T.jar3d && T.jar3d.opts) { Object.keys(app.o3).forEach(function (k) { if (k in T.jar3d.opts) T.jar3d.opts[k] = !!app.o3[k]; }); $('o3Cut').checked = T.jar3d.opts.cutaway; $('o3Roots').checked = T.jar3d.opts.roots; $('o3Fauna').checked = T.jar3d.opts.fauna; $('o3Spin').checked = T.jar3d.opts.autorotate; }
    } else state.focus = state.jars[firstNew].id;
    if (T.jar3d && T.jar3d.invalidate) T.jar3d.invalidate();
    setRunning(false);
    renderAll();
    if (mode === 'replace' && app.tab && app.tab !== 'live') { const b = document.querySelector('[data-tab="' + app.tab + '"]'); if (b) b.click(); }
    markDirty();
  }
  function bkMessage(text, cls) { const el = $('bkMsg'); el.textContent = text; el.className = 'hint ' + (cls || ''); }
  function initSaving() {
    $('bkCopy').addEventListener('click', function () {
      T.store.toText(state.jars, appSnapshot()).then(function (text) {
        const done = function () { saveStatus('Backup copied (' + Math.round(text.length / 1024) + ' KB). Paste it with "Paste backup…" on another device.', 'saveok'); };
        const fallback = function () {
          $('bkPanel').hidden = false; $('bkText').value = text; $('bkText').focus(); $('bkText').select();
          bkMessage('Select all of this text and copy it by hand (your browser did not allow automatic copying).', 'savewarn');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
      }, function (err) { saveStatus('Could not make a backup: ' + err.message, 'savewarn'); });
    });
    $('bkPasteOpen').addEventListener('click', function () { $('bkPanel').hidden = !$('bkPanel').hidden; bkMessage('Paste the backup text, then choose what to do with it.'); });
    $('bkClose').addEventListener('click', function () { $('bkPanel').hidden = true; });
    const doRestore = function (mode) {
      T.store.fromText($('bkText').value).then(function (obj) {
        const u = T.store.unpack(obj);
        if (!u.jars.length) throw new Error('The backup has no readable jars.');
        applyRestored(u, mode);
        $('bkPanel').hidden = true; $('bkText').value = '';
        saveStatus((mode === 'replace' ? 'Replaced your jars with ' : 'Added ') + u.jars.length + ' jar' + (u.jars.length > 1 ? 's' : '') + ' from the backup.' + (u.notes.length ? ' ' + u.notes.join(' ') : ''), u.notes.length ? 'savewarn' : 'saveok');
        saveNow();
      }).catch(function (err) { bkMessage(err.message, 'savewarn'); });
    };
    $('bkReplace').addEventListener('click', function () { doRestore('replace'); });
    $('bkAdd').addEventListener('click', function () { doRestore('add'); });
    let resetArmed = null;
    $('bkReset').addEventListener('click', function () {
      if (!resetArmed) {
        $('bkReset').textContent = 'Really reset? Tap again';
        resetArmed = setTimeout(function () { resetArmed = null; $('bkReset').textContent = 'Reset to starter jars'; }, 4000);
        return;
      }
      clearTimeout(resetArmed); resetArmed = null; $('bkReset').textContent = 'Reset to starter jars';
      T.store.clear(); setRunning(false); loadStarterJars(); saveNow();
      saveStatus('Back to the three starter jars.', 'saveok');
    });
    setInterval(function () { if (state.dirty) saveNow(); }, 4000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && state.dirty) saveNow(); });
    window.addEventListener('pagehide', function () { if (state.dirty) saveNow(); });
  }

  // ----------------------------------------------------------------- init ----
  function init() {
    SPEEDS.forEach(function (s, i) { $('speed').appendChild(h('option', { value: s.v, text: s.label })); });
    $('speed').value = 1; state.speed = 1;
    $('speed').addEventListener('change', function () { state.speed = +$('speed').value; markDirty(); });
    $('playBtn').addEventListener('click', function () { setRunning(!state.running); });
    document.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () { advanceAll(Math.round(+b.getAttribute('data-step') * 24)); updateUI(true); });
    });
    $('menuBtn').addEventListener('click', function () { const open = document.body.classList.toggle('aside-open'); $('menuBtn').textContent = open ? '✕ Close' : '☰ Jars & settings'; });
    $('restartAll').addEventListener('click', function () { state.jars.forEach(function (j) { M.resetState(j); }); renderAll(); });
    $('themeBtn').addEventListener('click', function () {
      const el = document.documentElement;
      const cur = el.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      el.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light'); updateUI(true);
      if (sweep.cfg) T.charts.drawHeatmap($('heat'), sweep.cfg);
    });
    T.presets.forEach(function (p, i) { $('presetSel').appendChild(h('option', { value: i, text: p.name })); });
    const showNote = function () { $('presetNote').textContent = T.presets[+$('presetSel').value].note; };
    $('presetSel').addEventListener('change', showNote); showNote();
    $('addJar').addEventListener('click', function () { addFromPreset(T.presets[+$('presetSel').value]); });
    $('window').addEventListener('change', function () { updateCharts(); markDirty(); });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab'); markDirty();
        document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('tab-live').hidden = state.tab !== 'live'; $('tab-sweep').hidden = state.tab !== 'sweep'; $('tab-3d').hidden = state.tab !== '3d';
        if (state.tab === '3d') { ensure3d(); if (T.jar3d && T.jar3d.resize) T.jar3d.resize(); }
        else if (state.tab === 'live') updateUI(true); else if (sweep.cfg) T.charts.drawHeatmap($('heat'), sweep.cfg);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) { e.preventDefault(); setRunning(!state.running); }
    });
    buildCharts(); buildSweepForm();
    [['o3Cut', 'cutaway'], ['o3Roots', 'roots'], ['o3Fauna', 'fauna'], ['o3Spin', 'autorotate']].forEach(function (c) {
      $(c[0]).addEventListener('change', function () { if (T.jar3d && T.jar3d.opts) { T.jar3d.opts[c[1]] = $(c[0]).checked; if (T.jar3d.invalidate && c[1] !== 'autorotate') T.jar3d.invalidate(); } });
    });
    $('o3Reset').addEventListener('click', function () { if (T.jar3d && T.jar3d.resetView) T.jar3d.resetView(); });
    $('sweepRun').addEventListener('click', runSweep);
    const heat = $('heat');
    heat.addEventListener('mousemove', function (e) {
      if (!sweep.cfg) return;
      const hit = T.charts.heatmapHit(heat, sweep.cfg, e);
      const row = hit && sweep.cells[hit.iy]; const cell = row && row[hit.ix];
      sweep.cfg.hover = cell ? hit : null; T.charts.drawHeatmap(heat, sweep.cfg);
      $('heatTip').textContent = cell ? describeCell(cell, sweep.cfg) + '   (click to open as a jar)' : 'Hover a cell for details.';
    });
    heat.addEventListener('click', function (e) {
      if (!sweep.cfg) return;
      const hit = T.charts.heatmapHit(heat, sweep.cfg, e);
      const row = hit && sweep.cells[hit.iy]; const cell = row && row[hit.ix];
      if (!cell) return;
      const jar = M.createJar(cell.params, 'Sweep ' + sweep.run.xKey + '=' + fmtNum(cell.params[sweep.run.xKey], 1) + ' ' + sweep.run.yKey + '=' + fmtNum(cell.params[sweep.run.yKey], 1));
      addJar(jar);
      document.querySelector('[data-tab="live"]').click();
    });
    window.addEventListener('resize', function () { if (state.tab === 'live') updateUI(true); else if (sweep.cfg) T.charts.drawHeatmap(heat, sweep.cfg); });

    // start with the saved jars, or three starter jars so comparison is visible straight away
    initSaving();
    let restored = false;
    try {
      const sv = T.store && T.store.load();
      if (sv) {
        const u = T.store.unpack(sv);
        if (u.jars.length) {
          applyRestored(u, 'replace'); restored = true; state.dirty = false;
          saveStatus('Restored your saved jars (saved ' + (sv.savedAt ? clockTime(sv.savedAt) : 'earlier') + '). The simulation is paused: press Play to continue.' + (u.notes.length ? ' ' + u.notes.join(' ') : ''), u.notes.length ? 'savewarn' : 'saveok');
        }
      }
    } catch (err) { saveStatus('The saved jars could not be read (' + err.message + '). Starting with the starter jars.', 'savewarn'); }
    if (!restored) loadStarterJars();
    requestAnimationFrame(frame);
  }
  init();
  window.__app = { state: state, advanceAll: advanceAll, setRunning: setRunning, saveNow: saveNow };   // handy in the console
})();
