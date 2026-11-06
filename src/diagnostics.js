/*
 * Daily health check: turns raw numbers into plain-language warnings.
 * Each rule must hold for a couple of days before it fires, and must be clear
 * for a few days before it is reported as resolved, so the log doesn't flicker.
 * Plant-specific rules are generated per plant ("Fittonia #2 is shaded"). Rules that depend on
 * the day/night cycle (CO2, humidity, leaf wetness) use the last 24 hours of history.
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});

  const WINDOW = 60;     // days of memory for trend rules
  const START_DAYS = 2;
  const CLEAR_DAYS = 4;

  const CAUSE_TEXT = {
    drought: 'dried out', hypoxia: 'drowned: its roots rotted in waterlogged, oxygen-free soil', toxin: 'was poisoned by hydrogen sulfide in the soil',
    shade: 'was shaded out by taller plants', scorch: 'was scorched by too much light', cold: 'was chilled', heat: 'overheated',
    crowd: 'rotted from crowding against the glass', disease: 'was killed by grey mold', rot: 'was killed by root / stem-base rot (Pythium-type)',
    nutrient: 'starved of nutrients', ph: 'could not cope with the soil pH',
  };

  function species(id) { return Terra.species[id] || Terra.species.generic; }
  function plantLabel(j, i) {
    const pl = j.s.plants[i];
    return species(pl.sp).short + (pl.wasCutting ? ' cutting' : '') + (j.s.plants.length > 1 ? ' #' + (i + 1) : '');
  }
  function pct(x) { return (x * 100).toFixed(0) + '%'; }

  // level: 'bad' (system failing), 'warn' (stress / risky), 'good'
  const RULES = [
    { id: 'waterlogged', level: 'bad', label: 'Water table in the soil',
      test: function (j) { return j.d.wtf > 0.15; },
      start: function (j) { return (j.geo.Cd > 0 ? 'The drainage layer is full and the water table has risen into the soil' : 'There is no drainage layer, so the soil is over-saturated') + ' (' + pct(j.d.wtf) + ' of the soil is under water). Roots can\'t breathe, anaerobic microbes take over, and springtails drown.'; },
      end: 'The water table dropped back out of the soil.' },
    { id: 'drainfull', level: 'warn', label: 'Drainage layer almost full',
      test: function (j) { return j.geo.Cd > 0 && j.d.drainFill > 0.9 && j.d.wtf < 0.15; },
      start: function (j) { return 'The drainage layer is ' + pct(j.d.drainFill) + ' full. More water and the water table will rise into the roots.'; },
      end: 'Drainage layer has room again.' },
    { id: 'drought', level: 'bad', label: 'Soil too dry',
      test: function (j) { return j.d.theta < 0.10; },
      start: function (j) { return 'Soil is too dry (' + (j.d.theta * 100).toFixed(0) + '% moisture). Plants wilt, soil animals dry out, decomposers stall.'; },
      end: 'Soil moisture recovered.' },
    { id: 'anoxic', level: 'bad', label: 'Soil without oxygen',
      test: function (j) { return j.d.anox > 0.4; },
      start: function (j) { return pct(j.d.anox) + ' of the soil has no oxygen. Aerobic bacteria and fungi stall; anaerobes ferment the litter into acids, methane and hydrogen sulfide.'; },
      end: 'Oxygen is reaching the soil again.' },
    { id: 'h2s', level: 'bad', label: 'Hydrogen sulfide (rotten-egg gas)',
      test: function (j) { return j.d.h2sConc * 1000 > 15; },
      start: function (j) { return 'Hydrogen sulfide in the soil water is ' + (j.d.h2sConc * 1000).toFixed(0) + ' µmol/L. It poisons roots and soil animals. Sulfate-reducing microbes make it when the soil has no oxygen; charcoal binds it.'; },
      end: 'Hydrogen sulfide cleared.' },
    { id: 'methane', level: 'warn', label: 'Methane build-up',
      test: function (j) { return j.d.ch4ppm > 1000; },
      start: function (j) { return 'Methane in the air is ' + j.d.ch4ppm.toFixed(0) + ' ppm: anaerobic decay has been going on for a while.'; },
      end: 'Methane dropped.' },
    { id: 'phlow', level: 'warn', label: 'Soil too acidic',
      test: function (j) { return j.d.pH < 5.0; },
      start: function (j) { return 'Soil pH is ' + j.d.pH.toFixed(1) + '. Most plants, bacteria and springtails struggle below 5; phosphorus gets locked up. Lime or a better-buffered soil helps.'; },
      end: 'pH recovered.' },
    { id: 'phhigh', level: 'warn', label: 'Soil too alkaline',
      test: function (j) { return j.d.pH > 7.8; },
      start: function (j) { return 'Soil pH is ' + j.d.pH.toFixed(1) + '. Phosphorus and micronutrients get locked up and acid-loving plants suffer.'; },
      end: 'pH recovered.' },
    { id: 'co2low', level: 'warn', label: 'CO₂ starvation',
      test: function (j, m) { return m.co2.min < 70; },
      start: function (j, m) { return 'CO₂ falls to ' + m.co2.min.toFixed(0) + ' ppm in the afternoon; photosynthesis stalls near 50 ppm. Not enough decomposition is feeding CO₂ back to the plants.'; },
      end: 'CO₂ stays workable all day.' },
    { id: 'co2high', level: 'warn', label: 'CO₂ build-up',
      test: function (j, m) { return m.co2.mean > 6000; },
      start: function (j, m) { return 'CO₂ averages ' + m.co2.mean.toFixed(0) + ' ppm (peaks at ' + m.co2.max.toFixed(0) + '). Decay and respiration outrun photosynthesis. High CO₂ stresses soil animals above about 1–2%.'; },
      end: 'CO₂ came back down.' },
    { id: 'o2low', level: 'bad', label: 'Low oxygen in the air',
      test: function (j) { return j.d.o2pct < 15; },
      start: function (j) { return 'Oxygen in the jar has dropped to ' + j.d.o2pct.toFixed(1) + '%. Usually from rotting biomass or dead or dark plants.'; },
      end: 'Oxygen recovered.' },
    { id: 'dark', level: 'warn', label: 'Too little light',
      test: function (j) { return j.s.effLight * j.s.effPhoto / 24 < 0.12; },
      start: function (j) { return 'Very little light (' + j.s.effPhoto.toFixed(1) + ' h at ' + j.s.effLight.toFixed(2) + '× on average' + (j.params.lightSource ? ', a winter window' : '') + '). Plants can barely cover their own respiration.'; },
      end: 'Light level is adequate again.' },
    { id: 'hot', level: 'bad', label: 'Overheating',
      test: function (j, m) { return m.temp.max > 32; },
      start: function (j, m) { return 'The air in the jar reaches ' + m.temp.max.toFixed(1) + ' °C (a lamp heats a sealed jar well above room temperature). Plants scorch and springtails die above about 30 °C.'; },
      end: 'Temperature is back in range.' },
    { id: 'cold', level: 'warn', label: 'Too cold',
      test: function (j, m) { return m.temp.max < 12; },
      start: function (j, m) { return 'It\'s cold in here (' + m.temp.max.toFixed(1) + ' °C at best). All biology slows to a crawl.'; },
      end: 'Warmed up.' },
    { id: 'dryair', level: 'warn', label: 'Air too dry',
      test: function (j, m) { return m.rh.mean < 0.75 && j.d.alive > 0; },
      start: function (j, m) { return 'Average humidity is ' + pct(m.rh.mean) + ' (a sealed jar sits near 100%). The lid is letting moisture out: springtails and mites dry out, cuttings and small roots can\'t keep up with transpiration.'; },
      end: 'Humidity is back up.' },
    { id: 'wetleaves', level: 'warn', label: 'Wet leaves, grey-mold weather',
      test: function (j, m) { return m.lw.mean > 0.8 && j.d.leafDisease < 0.1 && j.d.alive > 0; },
      start: function (j, m) { return 'The leaves are wet ' + pct(m.lw.mean) + ' of the time (dew at night, no drying). Grey mold spreads in exactly this: still, humid, mild air. Ventilation or less water helps.'; },
      end: 'Leaves dry out between dew periods again.' },
    { id: 'nutrient', level: 'warn', label: 'Nutrient shortage',
      test: function (j) { return j.d.fnut < 0.6 && j.d.alive > 0; },
      start: function (j) { return 'Growth is limited by ' + j.d.limiting + ' (nutrients work like Liebig\'s barrel: the scarcest one decides). Free N ' + j.d.nmin.toFixed(2) + ' · available P ' + j.d.pav.toFixed(3) + ' · K ' + j.d.kmin.toFixed(2) + ' mmol.'; },
      end: 'Nutrients are available again.' },
    { id: 'hoarding', level: 'warn', label: 'Plant dominance',
      test: function (j) { return j.d.plantShare > 0.85 && j.d.shoot > 5; },
      start: function (j) { return 'Plants hold ' + pct(j.d.plantShare) + ' of all organic carbon, leaving little for decomposers and animals.'; },
      end: 'Carbon is spread more evenly again.' },
    { id: 'crowded', level: 'warn', label: 'Overgrown',
      test: function (j) { return j.d.occupancy > 1.2; },
      start: function (j) { return 'The plants fill ' + pct(j.d.occupancy) + ' of the jar\'s capacity. Leaves press on the glass, stay wet and rot, feeding mold and using up oxygen.'; },
      end: 'Plants are back within the jar\'s capacity.' },
    { id: 'bloom', level: 'warn', label: 'Mold bloom',
      test: function (j) { return j.s.F > 3; },
      start: function (j) { return 'Fungi / mold has reached ' + j.s.F.toFixed(1) + ' (a healthy jar sits near 0.5–1). Wet rotting litter, no springtails to graze it, or a crowded canopy feed it; it also uses up oxygen.'; },
      end: 'Fungal growth settled.' },
    { id: 'mites', level: 'warn', label: 'Predatory mite boom',
      test: function (j) { return j.d.miteCount > 40; },
      start: function (j) { return 'Predatory mites have grown to ' + j.d.miteCount.toFixed(0) + '. They will crash their prey (springtails and nematodes) and then starve.'; },
      end: 'Mite numbers settled.' },
    { id: 'plantdie', level: 'bad', label: 'Plants dying back',
      test: function (j, m) { return m.P0 > 1 && m.Pnow < 0.5 * m.P0 && j.d.alive > 0; },
      start: function (j, m) { return 'Total plant biomass fell from ' + m.P0.toFixed(1) + ' to ' + m.Pnow.toFixed(1) + ' in about a month.'; },
      end: 'Plants stopped declining.' },
    { id: 'plantdead', level: 'bad', label: 'All plants dead',
      test: function (j) { return j.initial.plants.length > 0 && j.d.alive === 0; },
      start: function () { return 'Every plant is dead. Without photosynthesis nothing replaces the oxygen and food.'; },
      end: null },
    { id: 'springcrash', level: 'bad', label: 'Springtail crash',
      test: function (j, m) { return m.Smax > 60 && j.d.count < 0.3 * m.Smax && j.d.count >= 1; },
      start: function (j, m) { return 'Springtail population crashed from ~' + m.Smax.toFixed(0) + ' to ' + j.d.count.toFixed(0) + '.'; },
      end: 'Springtails recovering.' },
    { id: 'springgone', level: 'bad', label: 'Springtails extinct',
      test: function (j) { return j.initial.springtails >= 1 && j.d.count < 1; },
      start: function () { return 'Springtails are extinct.'; },
      end: null },
    { id: 'stable', level: 'good', label: 'Stable',
      test: function (j, m) { return m.stable; },
      start: function () { return 'Everything has been steady for ' + WINDOW + ' days (plants, springtails, gases all within a few %). Looks like a self-sustaining jar.'; },
      end: 'No longer steady.' },
  ];

  // Rules generated per plant (they depend on which plants the jar has).
  function plantRules(j) {
    const out = [];
    j.s.plants.forEach(function (pl, i) {
      const sp = species(pl.sp), lab = plantLabel(j, i);
      const NAMES = { dead: 'dead', rootrot: 'roots failing', shade: 'shaded', scorch: 'scorched', cold: 'chilled', thirst: 'wilting', nutrient: 'nutrient-starved',
                      ph: 'pH stress', heat: 'overheating', dormant: 'dry and dormant', toxin: 'poisoned', hypoxia: 'roots drowning', disease: 'grey mold', pythium: 'root rot', norooting: 'not rooting', rooted: 'rooted' };
      const rule = function (key, level, test, start, end) {
        out.push({ id: key + ':' + i, level: level, label: lab + ': ' + NAMES[key], test: test, start: start, end: end });
      };
      rule('dead', 'bad', function () { return pl.dead; },
        function () { return lab + ' died: it ' + (CAUSE_TEXT[pl.cause] || 'declined') + '.'; }, null);
      if (pl.dead) return;
      rule('rootrot', 'bad', function () { return pl.h < 0.6; },
        function () { return lab + ': root health is down to ' + pct(pl.h) + '. Oxygen-free soil, toxins, acid or drought damage roots, and a plant with failing roots can\'t drink.'; },
        'Roots recovered.');
      rule('hypoxia', 'bad', function () { return pl.st.hypoxia > 0.02; },
        function () { return lab + '\'s roots are drowning: the soil around them has no oxygen.'; }, 'Roots can breathe again.');
      rule('toxin', 'bad', function () { return pl.st.toxin > 0.01; },
        function () { return lab + '\'s roots are being poisoned by hydrogen sulfide.'; }, 'Toxin gone.');
      rule('disease', 'bad', function () { return pl.fF > 0.15; },
        function () { return lab + ': grey mold covers ' + pct(pl.fF) + ' of its leaves. It thrives on wet leaves in still, mild air, especially on stressed plants and fresh cuttings.'; },
        'Grey mold retreated.');
      rule('pythium', 'bad', function () { return pl.fR > 0.15; },
        function () { return lab + ': ' + pct(pl.fR) + ' of its roots / stem base are infected with a Pythium-type rot. It strikes in warm, waterlogged soil, and cuttings are most vulnerable.'; },
        'Root rot retreated.');
      rule('shade', 'warn', function () { return pl.shade < 0.45 && pl.S > 0.2; },
        function () { return lab + ' only gets ' + pct(pl.shade) + ' of the light; taller plants above it are shading it out.'; }, 'Getting enough light again.');
      rule('scorch', 'warn', function () { return pl.st.scorch > 0.004; },
        function () { return lab + ' is being scorched: too much light for this species (it prefers lower light).'; }, 'Scorching stopped.');
      rule('heat', 'warn', function () { return pl.st.heat > 0.003; },
        function () { return lab + ' is overheating: the jar air goes above ' + sp.tMaxSafe + ' °C, its limit. A sunny window heats a sealed jar well above room temperature.'; }, 'Cooled down.');
      rule('cold', 'warn', function () { return pl.st.cold > 0.003; },
        function () { return lab + ' is too cold (this species wants at least ' + sp.tMinSafe + ' °C).'; }, 'Warm enough again.');
      if (sp.moss) rule('dormant', 'warn', function () { return pl.w < 0.35; },
        function () { return lab + ' has dried out and gone dormant (air humidity ' + pct(j.d.rh) + '). It revives when the air is humid again, but long dry spells weaken it.'; }, 'Hydrated again.');
      rule('thirst', 'warn', function () { return pl.st.drought > 0.005; },
        function () { return lab + ' is water-stressed and wilting' + (pl.cutting ? ' (no roots yet to drink with)' : '') + '.'; }, 'No longer water-stressed.');
      rule('nutrient', 'warn', function () { return pl.st.nutrient > 0.004; },
        function () { return lab + ' is short of ' + pl.limiting + ' (' + ({ nitrogen: 'pale, yellowing older leaves', phosphorus: 'stunted, dark or purplish leaves', potassium: 'brown scorched leaf edges' }[pl.limiting] || '') + ').'; },
        'Nutrients available again.');
      rule('ph', 'warn', function () { return pl.st.ph > 0.004; },
        function () { return lab + ' dislikes the soil pH (' + j.d.pH.toFixed(1) + '; it wants ' + sp.ph[1] + '–' + sp.ph[2] + ').'; }, 'pH suits it again.');
      if (pl.wasCutting) {
        rule('norooting', 'warn', function () { return pl.cutting && (j.hours - pl.born) / 24 > 21; },
          function () { return lab + ' still has not rooted after three weeks. It needs moist but not soggy soil and enough warmth.'; }, 'Roots finally formed.');
        rule('rooted', 'good', function () { return !pl.cutting; },
          function () { return lab + ' has rooted and can now drink and anchor itself.'; }, null);
      }
    });
    return out;
  }
  function allRules(j) { return RULES.concat(plantRules(j)); }

  function init(j) {
    j.diag = { active: {}, streak: {}, mem: { P: [], F: [], S: [], C: [], O: [] } };
  }

  function note(j, level, msg) {
    j.log.push({ day: j.hours / 24, level: level, msg: msg, id: 'note' });
    if (j.log.length > 400) j.log.shift();
  }

  function steady(a) {
    if (a.length < WINDOW) return false;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    const mid = (lo + hi) / 2 || 1;
    return (hi - lo) / Math.abs(mid) < 0.1;
  }

  // min / max / mean over the day just finished (accumulated hourly by the model)
  function dayStats(j, key) {
    const q = j.acc && j.acc[key];
    return q && q.n ? { min: q.min, max: q.max, mean: q.sum / q.n } : { min: 0, max: 0, mean: 0 };
  }

  function daily(j) {
    if (!j.diag) init(j);
    const dg = j.diag, mem = dg.mem, s = j.s, d = j.d;
    const ptot = d.shoot + d.rootmass;
    // daily means for the slow-trend memory (CO2 / O2 swing every day)
    const co2 = dayStats(j, 'co2'), o2 = dayStats(j, 'o2');
    mem.P.push(ptot); mem.F.push(s.F); mem.S.push(d.count); mem.C.push(co2.mean); mem.O.push(o2.mean);
    Object.keys(mem).forEach(function (k) { if (mem[k].length > WINDOW) mem[k].shift(); });
    const old = Math.max(0, mem.P.length - 31);
    const m = {
      P0: mem.P[old], Pnow: ptot,
      Smax: Math.max.apply(null, mem.S),
      co2: co2, rh: dayStats(j, 'rh'), lw: dayStats(j, 'lw'), temp: dayStats(j, 'temp'),
      stable: steady(mem.P) && steady(mem.S) && steady(mem.C) && steady(mem.O) && d.shoot > 1 && d.count >= 20,
    };

    allRules(j).forEach(function (r) {
      const on = r.test(j, m);
      const st = dg.streak[r.id] || 0;
      if (!dg.active[r.id]) {
        dg.streak[r.id] = on ? st + 1 : 0;
        if (dg.streak[r.id] >= START_DAYS) {
          dg.active[r.id] = true; dg.streak[r.id] = 0;
          j.log.push({ day: d.day, level: r.level, id: r.id, label: r.label, msg: r.start(j, m) });
        }
      } else if (r.end) {
        dg.streak[r.id] = on ? 0 : st + 1;
        if (dg.streak[r.id] >= CLEAR_DAYS) {
          dg.active[r.id] = false; dg.streak[r.id] = 0;
          j.log.push({ day: d.day, level: 'info', id: r.id, label: r.label, msg: 'Resolved: ' + r.end });
        }
      }
    });
    j.acc = null;
    if (j.log.length > 400) j.log.splice(0, j.log.length - 400);
  }

  function activeRules(j) {
    const act = (j.diag && j.diag.active) || {};
    return allRules(j).filter(function (r) { return act[r.id]; });
  }

  function status(j) {
    const act = (j.diag && j.diag.active) || {};
    const rs = activeRules(j);
    if (act.plantdead) return { label: 'Collapsed', cls: 'bad' };
    const bad = rs.some(function (r) { return r.level === 'bad'; });
    const warn = rs.some(function (r) { return r.level === 'warn'; });
    if (bad) return { label: 'Failing', cls: 'bad' };
    if (warn) return { label: 'Stressed', cls: 'warn' };
    if (act.stable) return { label: 'Stable', cls: 'good' };
    return { label: j.hours < 24 * 14 ? 'Settling' : 'Healthy', cls: 'ok' };
  }

  // One line per plant for the table in the UI.
  function plantStatus(j, i) {
    const pl = j.s.plants[i], sp = species(pl.sp);
    if (pl.dead) return { text: 'died: ' + (CAUSE_TEXT[pl.cause] || '?'), cls: 'bad' };
    if (pl.fF > 0.15) return { text: 'grey mold on ' + pct(pl.fF) + ' of leaves', cls: 'bad' };
    if (pl.fR > 0.15) return { text: 'root / stem rot (' + pct(pl.fR) + ' infected)', cls: 'bad' };
    if (sp.moss && pl.w < 0.35) return { text: 'dry and dormant', cls: 'warn' };
    if (pl.cutting) {
      const tgt = sp.rootRatio * pl.S;
      return { text: 'rooting, roots at ' + (tgt > 0 ? Math.min(100, pl.R / tgt * 100).toFixed(0) : 0) + '% of target', cls: 'ok' };
    }
    if (pl.h < 0.6) return { text: 'roots failing (' + pct(pl.h) + ' healthy)', cls: 'bad' };
    let best = null, bv = 0.004;
    Terra.model.STRESS_KEYS.forEach(function (k) { if (pl.st[k] > bv) { bv = pl.st[k]; best = k; } });
    const lab = { drought: 'thirsty', hypoxia: 'roots drowning', toxin: 'poisoned by H₂S', shade: 'shaded', scorch: 'too much light', cold: 'too cold', heat: 'too hot',
                  crowd: 'crowded', disease: 'grey mold', rot: 'root rot', nutrient: 'short of ' + pl.limiting, ph: 'pH stress' };
    if (best) return { text: lab[best], cls: 'warn' };
    return { text: 'healthy', cls: 'good' };
  }

  Terra.diagnostics = { RULES, daily, note, status, activeRules, plantStatus, plantLabel, CAUSE_TEXT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
