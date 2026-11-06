/*
 * Closed-jar ecosystem model v3 (framework-free: runs in the browser and in Node).
 *
 * Layers (top to bottom):  headspace air | litter + soil | drainage layer (LECA / gravel).
 * Each hour the slow biology and chemistry are computed once, then a fast loop of 4 quarter-hour
 * sub-steps integrates the quick physics: photosynthesis, CO2 / O2 / vapour, temperatures,
 * condensation. Conserved with a sealed lid and no interventions: C, S and water exactly;
 * N, P, K are totals with the free amount derived (checked never to go negative).
 *
 *  C pools (mmol C):  plants[ S shoot, R roots, A reserve sugars ], L labile litter, Rc humus,
 *                     B bacteria, An anaerobes, F fungi, Nm nematodes, Sp springtails, Mt predatory mites,
 *                     Ch CO2, Cm CH4.
 *  N, P, K: the free mineral amount is "total minus what the pools hold" (fixed stoichiometry per
 *           pool), plus an explicit N2 pool for denitrified nitrogen.
 *  S: sulfate SO4 and hydrogen sulfide Hs (their sum is conserved).
 *  Water: W soil, Wd drainage layer, V vapour, Wg condensation on the glass (ml).
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});

  // ---- constants (see PARAMETERS.md for the status of each) ----------------------------
  const K = {
    dt: 1 / 24, nSub: 4,
    gasMmolPerL: 41,
    ambientCO2: 420, ambientO2: 20.9, roomRH: 0.5,
    Q10: 2,
    cn: { plant: 18, L: 30, Rc: 15, B: 5, An: 5, F: 10, Nm: 5, Sp: 5, Mt: 5 },
    cp: { plant: 450, L: 700, Rc: 120, B: 60, An: 60, F: 150, Nm: 100, Sp: 100, Mt: 100 },
    ckPlant: 60,
    mass: { Sp: 0.0006, Nm: 0.00004, Mt: 0.001 },          // mmol C per individual
    floor: { B: 0.002, F: 0.002, An: 0.001, Nm: 0.0003 },     // dormant spores / cysts: pools never decay below this
    capPerArea: 16, growthResp: 0.2, kGrow: 0.5, rgrMax: 0.2,
    // decomposers
    uB: 0.9, uBR: 0.005, kL: 3, kR: 20, yB: 0.4, mB: 0.10, Bk: 1.5,
    uFL: 0.6, uFR: 0.027, yF: 0.45, mF: 0.03, Fk: 1.5,
    uAn: 0.8, yAn: 0.12, mAn: 0.04,
    hum: 0.02,                                             // fraction of decomposed litter carbon stabilised as humus
    // fauna
    gN: 0.4, kN: 0.15, eN: 0.30, rN: 0.25, mN: 0.06,
    gS: 0.3, kS: 0.25, eS: 0.30, rS: 0.20, mS: 0.02, rMaintS: 0.01,
    gM: 0.15, kM: 0.05, eM: 0.20, rM: 0.25, mM: 0.05,
    // soil gas
    gO0: 3.0, gD0: 1.5e-4,
    // vapour / climate
    sHeatT: 28, dis0: 0.12,       // springtail heat-stress threshold (C); grey-mold infection rate
    kEvap: 0.4, kCond: 1.5, kVent: 2.0, kOpen: 10,   // kOpen: ml/day of soil water lost through a fully open lid into 0%-humidity air
  };

  // live: true -> can change while running; false -> starting amounts, applied on restart
  const PARAM_DEFS = [
    { key: 'jarVolume',   group: 'Container',   label: 'Jar volume',           unit: 'ml',   min: 1000, max: 10000, step: 100, def: 3000, live: false, help: 'Total volume. Air space = jar − soil − drainage layer.' },
    { key: 'soilVolume',  group: 'Container',   label: 'Soil volume',          unit: 'ml',   min: 200,  max: 2000,  step: 50,  def: 700,  live: false, help: '' },
    { key: 'drainVolume', group: 'Container',   label: 'Drainage layer',       unit: 'ml',   min: 0,    max: 1000,  step: 25,  def: 200,  live: false, help: 'LECA / gravel under the soil. It stores surplus water; if it fills up, the water table rises into the roots.' },
    { key: 'charcoal',    group: 'Container',   label: 'Activated charcoal',   unit: '0–1',  min: 0,    max: 1,     step: 0.05, def: 0.3, live: false, help: 'Adsorbs toxins (H₂S) and buffers pH.' },
    { key: 'leak',        group: 'Container',   label: 'Lid openness',         unit: '',     min: 0,    max: 1,     step: 0.05, def: 0,   live: true,  help: '0 = sealed. Above 0, gases, vapour and spores exchange with the room; humidity drops.' },
    { key: 'temperature', group: 'Climate',     label: 'Room temperature',     unit: '°C',   min: 0,    max: 40,    step: 0.5, def: 21,   live: true,  help: '' },
    { key: 'tempSwing',   group: 'Climate',     label: 'Day/night swing',      unit: '°C',   min: 0,    max: 12,    step: 0.5, def: 3,    live: true,  help: 'Room temperature swing over the day.' },
    { key: 'light',       group: 'Climate',     label: 'Light intensity',      unit: '×',    min: 0,    max: 3,     step: 0.05, def: 1,   live: true,  help: '1 ≈ a bright indirect window or modest grow lamp (≈100 µmol/m²/s average).' },
    { key: 'photoperiod', group: 'Climate',     label: 'Hours of light',       unit: 'h',    min: 0,    max: 24,    step: 0.5, def: 12,   live: true,  help: '' },
    { key: 'lampHeat',    group: 'Climate',     label: 'Lamp heating',         unit: '°C/×', min: 0,    max: 8,     step: 0.5, def: 2.5,  live: true,  help: 'How much the light warms the air inside the jar (greenhouse effect).' },
    { key: 'seasonOn',    group: 'Seasons',     label: 'Seasons (0 off, 1 on)', unit: '',    min: 0,    max: 1,     step: 1,   def: 0,    live: true,  help: 'On: the room temperature follows a yearly cycle between the winter and summer values below.' },
    { key: 'tempWinter',  group: 'Seasons',     label: 'Winter room temperature', unit: '°C', min: 10,   max: 28,    step: 0.5, def: 22,   live: true,  help: 'Mean room temperature in the middle of winter (the daily swing comes on top).' },
    { key: 'tempSummer',  group: 'Seasons',     label: 'Summer room temperature', unit: '°C', min: 15,   max: 34,    step: 0.5, def: 26.5, live: true,  help: 'Mean room temperature in the middle of summer.' },
    { key: 'startDay',    group: 'Seasons',     label: 'Day of the year at the start', unit: '', min: 1,  max: 365,   step: 1,   def: 1,    live: false, help: '1 = 1 January, 91 = 1 April, 182 = 1 July, 274 = 1 October.' },
    { key: 'lightSource', group: 'Seasons',     label: 'Light: 0 lamp, 1 window', unit: '',    min: 0,    max: 1,     step: 1,   def: 0,    live: true,  help: 'Window: day length and brightness follow the sun for your latitude and date (the light and hours sliders are then ignored).' },
    { key: 'windowShare', group: 'Seasons',     label: 'Share of outdoor light that reaches the jar', unit: '', min: 0.02, max: 0.8, step: 0.02, def: 0.18, live: true, help: 'A jar on a south sill gets roughly 0.15–0.3 of outdoor light; further from the glass, much less. 0.18 gives about 7,500 lux in summer and 1,900 lux in winter (a measured range for a window: 5,000–10,000 and 1,000–2,000).' },
    { key: 'sunHeat',     group: 'Seasons',     label: 'Sun heating of the jar (window)', unit: '×', min: 0.2, max: 2.5, step: 0.1, def: 1.0, live: true, help: 'How much a sunlit window warms the sealed jar, relative to the lamp setting. A guess: set it so the afternoon peak matches a thermometer in your jar (the jar-air peak is shown in the Air temperature chart).' },
    { key: 'latitude',    group: 'Seasons',     label: 'Latitude',             unit: '°N',   min: 0,    max: 70,    step: 0.5, def: 47.5, live: true,  help: 'Budapest is 47.5°N.' },
    { key: 'texture',     group: 'Substrate',   label: 'Soil texture',         unit: '0–1',  min: 0,    max: 1,     step: 0.05, def: 0.5, live: false, help: '0 = sandy / perlite (drains fast, holds little). 1 = clay / peat (holds a lot, drains slowly, buffers pH).' },
    { key: 'ph0',         group: 'Substrate',   label: 'Starting pH',          unit: '',     min: 4,    max: 8.5,   step: 0.1, def: 6.3,  live: false, help: 'Potting mix is ~6; peat ~4.5; with lime ~7.5.' },
    { key: 'buffer',      group: 'Substrate',   label: 'pH buffering',         unit: '×',    min: 0.2,  max: 3,     step: 0.1, def: 1,    live: false, help: 'How strongly the soil resists pH change (clay, lime, humus).' },
    { key: 'water',       group: 'Water',       label: 'Water in soil',        unit: 'ml',   min: 0,    max: 700,   step: 5,   def: 210,  live: false, help: 'Field capacity ≈ 210 ml for the default soil.' },
    { key: 'drainWater',  group: 'Water',       label: 'Water in drainage layer', unit: 'ml', min: 0,   max: 450,   step: 5,   def: 40,   live: false, help: '' },
    { key: 'nitrogen',    group: 'Nutrients',   label: 'Mineral nitrogen',     unit: 'mmol N', min: 0,  max: 15,    step: 0.1, def: 2.5,  live: false, help: 'Free N at the start. All nutrients only recycle, nothing is added.' },
    { key: 'phosphorus',  group: 'Nutrients',   label: 'Mineral phosphorus',   unit: 'mmol P', min: 0,  max: 2,     step: 0.02, def: 0.3, live: false, help: 'Only part is plant-available (best at pH 6–7).' },
    { key: 'potassium',   group: 'Nutrients',   label: 'Potassium',            unit: 'mmol K', min: 0,  max: 5,     step: 0.1, def: 0.8,  live: false, help: '' },
    { key: 'sulfate',     group: 'Nutrients',   label: 'Sulfate',              unit: 'mmol S', min: 0,  max: 5,     step: 0.1, def: 1.0,  live: false, help: 'Fuel for H₂S ("rotten egg") production when the soil turns anoxic.' },
    { key: 'plantGrowth', group: 'Plants',      label: 'Plant vigor (all)',    unit: '×',    min: 0.2,  max: 5,     step: 0.1, def: 1,    live: true,  help: 'Multiplies photosynthesis and growth rate of every plant.' },
    { key: 'litter',      group: 'Soil life',   label: 'Leaf litter (labile)', unit: 'mmol C', min: 0,  max: 60,    step: 1,   def: 4,    live: false, help: 'Fresh dead matter: eaten fast.' },
    { key: 'humus',       group: 'Soil life',   label: 'Humus / soil organic matter', unit: 'mmol C', min: 0, max: 150, step: 2, def: 30, live: false, help: 'Slowly decomposed, mostly by fungi.' },
    { key: 'bacteria',    group: 'Soil life',   label: 'Bacteria',             unit: 'mmol C', min: 0,  max: 5,     step: 0.1, def: 0.6,  live: false, help: '' },
    { key: 'fungi',       group: 'Soil life',   label: 'Fungi (mold)',         unit: 'mmol C', min: 0,  max: 5,     step: 0.1, def: 0.4,  live: false, help: '' },
    { key: 'nematodes',   group: 'Soil life',   label: 'Nematodes',            unit: 'count', min: 0,   max: 2000,  step: 20,  def: 80,   live: false, help: 'Eat bacteria and recycle nitrogen.' },
    { key: 'springtails', group: 'Soil life',   label: 'Springtails',          unit: 'count', min: 0,   max: 3000,  step: 10,  def: 100,  live: false, help: 'Graze fungi, litter and spores.' },
    { key: 'mites',       group: 'Soil life',   label: 'Predatory mites',      unit: 'count', min: 0,   max: 100,   step: 1,   def: 3,    live: false, help: 'Hitchhikers that hunt springtails and nematodes.' },
    { key: 'pathFoliar',  group: 'Soil life',   label: 'Leaf-mold spores (grey mold)', unit: '0–1', min: 0, max: 1, step: 0.01, def: 0.02, live: false, help: 'Airborne spore load. Plants infect when leaves stay wet in humid, mild air.' },
    { key: 'pathRoot',    group: 'Soil life',   label: 'Root-rot pathogen (Pythium)', unit: '0–1', min: 0, max: 1, step: 0.01, def: 0.01, live: false, help: 'Strikes roots and cutting bases in waterlogged, warm soil.' },
  ];
  const DEFAULTS = { plants: [{ sp: 'generic', start: 6, cutting: false }] };
  PARAM_DEFS.forEach(function (d) { DEFAULTS[d.key] = d.def; });

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function bell(x, lo, a, b, hi) { if (x <= lo || x >= hi) return 0; if (x < a) return (x - lo) / (a - lo); if (x > b) return (hi - x) / (hi - b); return 1; }
  function esat(T) { return 6.112 * Math.exp(17.62 * T / (243.12 + T)); }                      // hPa
  function vsat(T, airMl) { return 216.7 * esat(T) / (T + 273.15) * airMl / 1e6; }           // ml of liquid water held as saturated vapour
  function species(id) { return Terra.species[id] || Terra.species.generic; }

  // Sunlight for a latitude and day of the year: day length (h) and the mean outdoor light during the day, in model units
  // (1 unit = 100 umol photons m-2 s-1). Clear-sky Hungary: Dec ~0.7 kWh/m2/day, Jun ~5.8 kWh/m2/day on a flat surface.
  function solar(latDeg, doy) {
    const phi = latDeg * Math.PI / 180;
    const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
    const x = clamp(-Math.tan(phi) * Math.tan(dec), -1, 1);
    const ws = Math.acos(x);                                         // sunset hour angle
    const daylen = 24 * ws / Math.PI;
    const E0 = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365);
    const H0 = 24 * 3600 / Math.PI * 1367 * E0 * (Math.cos(phi) * Math.cos(dec) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(dec)) / 1e6;   // MJ/m2/day above the atmosphere
    const kt = 0.40 - 0.10 * Math.cos(2 * Math.PI * (doy - 15) / 365);   // cloudiness: 0.30 in winter (grey Hungary), 0.50 in summer
    const global = Math.max(0, kt * H0);                                  // MJ/m2/day reaching the ground
    const par = 0.45 * global * 4.57;                                     // mol photons m-2 day-1 (45 % of sunlight is photosynthetic light)
    const meanPPFD = daylen > 0.1 ? par * 1e6 / (daylen * 3600) : 0;     // umol m-2 s-1 averaged over the daylight hours
    return { daylen: daylen, kWh: global / 3.6, meanPPFD: meanPPFD, units: meanPPFD / 100 };
  }
  // Room temperature, light and day length for today, from the season settings
  function updateSeason(j) {
    const p = j.params, s = j.s;
    const doy = (Math.floor(p.startDay - 1 + j.hours / 24) % 365) + 1;
    s.doy = doy;
    s.effTemp = p.seasonOn ? 0.5 * (p.tempWinter + p.tempSummer) - 0.5 * (p.tempSummer - p.tempWinter) * Math.cos(2 * Math.PI * (doy - 20) / 365) : p.temperature;   // coldest around 20 Jan
    if (p.lightSource) {
      const sol = solar(p.latitude, doy);
      s.effPhoto = sol.daylen; s.effLight = p.windowShare * sol.units;
    } else { s.effPhoto = p.photoperiod; s.effLight = p.light; }
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function dateOf(doy) { let d = doy; for (let m = 0; m < 12; m++) { if (d <= MDAYS[m]) return MONTHS[m] + ' ' + d; d -= MDAYS[m]; } return 'Dec 31'; }

  function geometry(p) {
    const t = p.texture;
    const airMl = Math.max(100, p.jarVolume - p.soilVolume - p.drainVolume);
    return {
      soilMl: p.soilVolume, drainMl: p.drainVolume, Cd: p.drainVolume * 0.45, airMl: airMl,
      gasMmol: airMl / 1000 * K.gasMmolPerL,
      areaF: Math.pow(p.jarVolume / 3000, 2 / 3),
      thFC: 0.18 + 0.24 * t, thSat: 0.40 + 0.18 * t, kDrain: 3.0 - 2.4 * t,
      Bcap: p.soilVolume / 100 * ((0.5 + 1.5 * t) * p.buffer + 1.5 * p.charcoal),
    };
  }

  // ---- plants ---------------------------------------------------------------
  const STRESS_KEYS = ['drought', 'hypoxia', 'toxin', 'shade', 'scorch', 'cold', 'heat', 'crowd', 'disease', 'rot', 'nutrient', 'ph'];
  function newPlant(spec, x) {
    const sp = species(spec.sp);
    const S = spec.start != null ? spec.start : sp.start;
    const st = {}; STRESS_KEYS.forEach(function (k) { st[k] = 0; });
    return { sp: spec.sp, S: S, R: spec.cutting ? 0 : sp.rootRatio * S, A: S * (spec.cutting ? 0.3 : 0.1),
             h: 1, w: 1, fF: 0, fR: 0, x: x, cutting: !!spec.cutting, wasCutting: !!spec.cutting,
             dead: false, diedHour: null, cause: null, shade: 1, limiting: null, born: 0, st: st };
  }
  function plantX(i, n) { return n === 1 ? 0.5 : 0.16 + 0.68 * i / (n - 1); }

  // ---- nutrients held in pools ---------------------------------------------------
  const ORG = ['L', 'Rc', 'B', 'An', 'F', 'Nm', 'Sp', 'Mt'];
  function heldN(s) {
    let n = s.N2; for (let i = 0; i < ORG.length; i++) n += s[ORG[i]] / K.cn[ORG[i]];
    for (let i = 0; i < s.plants.length; i++) n += (s.plants[i].S + s.plants[i].R) / K.cn.plant;
    return n;
  }
  function heldP(s) {
    let n = 0; for (let i = 0; i < ORG.length; i++) n += s[ORG[i]] / K.cp[ORG[i]];
    for (let i = 0; i < s.plants.length; i++) n += (s.plants[i].S + s.plants[i].R) / K.cp.plant;
    return n;
  }
  function heldK(s) { let n = 0; for (let i = 0; i < s.plants.length; i++) n += (s.plants[i].S + s.plants[i].R) / K.ckPlant; return n; }

  // ---- jar creation ---------------------------------------------------------
  function createJar(params, name) {
    const p = Object.assign({}, DEFAULTS, params || {});
    p.plants = JSON.parse(JSON.stringify(p.plants));
    const j = { name: name || 'Jar', params: p, initial: null, geo: geometry(p), hours: 0, s: {}, d: {}, log: [], hist: null, diag: null,
                id: Terra._nextId = (Terra._nextId || 0) + 1 };
    resetState(j);
    return j;
  }

  function resetState(j) {
    const p = j.params, g = j.geo = geometry(p);
    j.initial = JSON.parse(JSON.stringify(p));
    j.hours = 0; j.log = []; j.diag = null;
    j.hist = { stride: 2, t: [], series: {}, pl: [] };
    VARS.forEach(function (v) { j.hist.series[v.key] = []; });
    const n = p.plants.length;
    const s = j.s = {
      plants: p.plants.map(function (spec, i) { return newPlant(spec, plantX(i, n)); }),
      L: p.litter, Rc: p.humus, B: p.bacteria, An: 0.01, F: p.fungi,
      Nm: p.nematodes * K.mass.Nm, Sp: p.springtails * K.mass.Sp, Mt: p.mites * K.mass.Mt,
      Ch: K.ambientCO2 * 1e-6 * g.gasMmol, O: K.ambientO2 / 100 * g.gasMmol, Cm: 0, Hs: 0, SO4: p.sulfate, N2: 0,
      W: p.water, Wd: Math.min(p.drainWater, g.Cd), V: 0, Wg: 0,
      Ta: p.temperature, Ts: p.temperature, Tg: p.temperature, doy: 1, effTemp: p.temperature, effPhoto: p.photoperiod, effLight: p.light,
      H: 0, If: p.pathFoliar, Ir: p.pathRoot, leafWet: 0, crowd: 0, o2dem: 0.3, csoil: 0.3,
      _co2Rate: 0, _o2Rate: 0,
    };
    updateSeason(j);
    s.Ta = s.Ts = s.Tg = s.effTemp;
    s.V = 0.6 * vsat(s.Ta, g.airMl);
    s.Nt = heldN(s) + p.nitrogen; s.Pt = heldP(s) + p.phosphorus; s.Kt = heldK(s) + p.potassium;
    derive(j);
    record(j);
    return j;
  }

  // ---- derived quantities ---------------------------------------------------
  function derive(j) {
    const p = j.params, s = j.s, g = j.geo, d = j.d;
    const hod = (j.hours % 24) + 0.5;
    d.day = j.hours / 24;
    updateSeason(j);
    const Lp = s.effPhoto;
    const warm = (Lp > 0 && hod < Lp) ? Math.sin(Math.PI * hod / Lp) : 0;
    d.lightNow = warm * s.effLight * Math.PI / 2;
    d.leakNow = Math.max(p.leak, (s.ventUntil || 0) > j.hours ? 1 : 0);   // lid slider, or a temporary 'lid off'
    d.theta = s.W / g.soilMl;
    const Wfc = g.thFC * g.soilMl, Wsat = g.thSat * g.soilMl;
    d.pond = Math.max(0, s.W - Wsat);
    d.drainFill = g.Cd > 0 ? s.Wd / g.Cd : 0;
    const wtfBulk = (g.Cd > 0 && d.drainFill < 0.98) ? 0 : clamp((s.W - Wfc) / (Wsat - Wfc), 0, 1);
    const fringe = g.Cd > 0 ? (0.08 + 0.25 * p.texture) * clamp((d.drainFill - 0.85) / 0.15, 0, 1) : 0;   // capillary rise from a (nearly) full drainage layer
    d.wtf = Math.max(wtfBulk, fringe);                                    // share of the soil that is water-saturated
    d.co2ppm = s.Ch / g.gasMmol * 1e6;
    d.o2pct = s.O / g.gasMmol * 100;
    d.ch4ppm = s.Cm / g.gasMmol * 1e6;
    d.vsA = vsat(s.Ta, g.airMl);
    d.rh = Math.min(1, s.V / d.vsA);
    d.vpd = esat(s.Ta) / 10 * (1 - d.rh);                                   // kPa
    d.airFilled = Math.max(0.01, g.thSat - d.theta);
    const poro = Math.pow(d.airFilled / 0.25, 1.5);
    const gO = K.gO0 * poro * (d.o2pct / 20.9);
    d.anoxDiff = s.o2dem > 1e-9 ? 1 - Math.min(1, gO / s.o2dem) : 0;
    d.anox = 1 - (1 - d.wtf) * (1 - 0.8 * d.anoxDiff);                     // share of the soil without oxygen
    d.soilCO2 = d.co2ppm + s.csoil / (K.gD0 * poro);
    d.pH = clamp(p.ph0 - s.H / g.Bcap - 0.35 * Math.log10(Math.max(300, d.soilCO2) / 1500), 3, 9.5);
    d.availP = 0.15 + 0.6 * bell(d.pH, 4.0, 6.0, 7.2, 9.0);
    d.nmin = Math.max(0, s.Nt - heldN(s));
    d.pav = Math.max(0, s.Pt - heldP(s)) * d.availP;
    d.kmin = Math.max(0, s.Kt - heldK(s));
    d.h2sConc = s.Hs / (s.W / 1000 + 0.05);                                 // mmol per litre of soil water
    d.toxH2S = clamp(d.h2sConc / 0.05, 0, 2);
    d.count = s.Sp / K.mass.Sp; d.nemCount = s.Nm / K.mass.Nm; d.miteCount = s.Mt / K.mass.Mt;

    let shoot = 0, rootmass = 0, reserve = 0, hw = 0, hwt = 0, leafArea = 0, alive = 0, occ = 0, fF = 0, fR = 0, wsum = 0;
    for (let i = 0; i < s.plants.length; i++) {
      const pl = s.plants[i]; if (pl.dead) continue;
      const sp = species(pl.sp);
      alive++; shoot += pl.S; rootmass += pl.R; reserve += pl.A;
      const wgt = pl.R + 0.1 * pl.S; hw += pl.h * wgt; hwt += wgt; wsum += pl.S;
      fF += pl.fF * pl.S; fR += pl.fR * pl.S;
      leafArea += sp.kCanopy / g.areaF * pl.S;
      occ += sp.spaceUse * pl.S;
    }
    d.shoot = shoot; d.rootmass = rootmass; d.reserve = reserve; d.alive = alive;
    d.rootHealth = hwt > 0 ? hw / hwt : 0;
    d.leafDisease = wsum > 0 ? fF / wsum : 0; d.rootDisease = wsum > 0 ? fR / wsum : 0;
    d.canopy = 1 - Math.exp(-leafArea);
    d.occupancy = occ / (K.capPerArea * g.areaF);
    const org = shoot + rootmass + reserve + s.L + s.Rc + s.B + s.An + s.F + s.Nm + s.Sp + s.Mt;
    d.plantShare = org > 0 ? (shoot + rootmass + reserve) / org : 0;
    d.organic = org;
  }

  // ---- one hour ---------------------------------------------------------------
  function step(j) {
    const p = j.params, s = j.s, g = j.geo, d = j.d, dt = K.dt, area = g.areaF;
    const fTs = Math.pow(K.Q10, (s.Ts - 20) / 10), fTa = Math.pow(K.Q10, (s.Ta - 20) / 10);
    const anox = d.anox, ae = 1 - anox, theta = d.theta, pH = d.pH;
    const fo2 = Math.min(1.1, d.o2pct / (d.o2pct + 3) * 24 / 21);
    const fnm = Math.min(d.nmin / (d.nmin + 0.05), d.pav / (d.pav + 0.006));
    const rhS = clamp((d.rh - 0.75) / 0.2, 0, 1);
    const tox = d.toxH2S;
    const pls = s.plants;

    // =========================== plants (slow part) ===========================
    const fNn = d.nmin / (d.nmin + 0.25), fPp = d.pav / (d.pav + 0.012), fKk = d.kmin / (d.kmin + 0.12);
    const fnut = Math.min(fNn, fPp, fKk);
    const limiting = fnut === fNn ? 'nitrogen' : fnut === fPp ? 'phosphorus' : 'potassium';
    d.fnut = fnut; d.limiting = limiting;

    const order = [];
    for (let i = 0; i < pls.length; i++) if (!pls[i].dead) order.push(i);
    order.sort(function (a, b) { return species(pls[b].sp).heightK * Math.sqrt(pls[b].S) - species(pls[a].sp).heightK * Math.sqrt(pls[a].S); });
    const hgt = order.map(function (i) { return species(pls[i].sp).heightK * Math.sqrt(pls[i].S); });
    const lai = order.map(function (i) { return species(pls[i].sp).kCanopy / area * pls[i].S; });
    const demandF = clamp(d.vpd / 0.6, 0, 1.5);
    const crowdTarget = clamp(d.occupancy - 1, 0, 1.5);
    const crowdRate = 0.3 * s.crowd;
    const wetF = Math.pow(s.leafWet, 1.5);
    const tempF = bell(s.Ta, 4, 14, 24, 32);
    const tempR = bell(s.Ts, 10, 22, 30, 38);
    const wtfRoot = Math.max(d.wtf, d.anox * 0.8);

    const PL = [];
    let nGrowthN = 0, gainSum = 0;
    for (let o = 0; o < order.length; o++) {
      const pl = pls[order[o]], sp = species(pl.sp);
      let above = 0;
      for (let q = 0; q < o; q++) above += lai[q] * clamp((hgt[q] - hgt[o]) / (0.35 * hgt[q] + 1e-9), 0, 1);
      pl.shade = Math.exp(-above);
      const cover = 1 - Math.exp(-lai[o]);
      const Rtarget = sp.rootRatio * pl.S;
      const moss = !!sp.moss;
      const hEff = moss ? 1 : pl.h * (1 - 0.7 * pl.fR);
      const ra = clamp(((pl.R + 0.05 * pl.S) * hEff) / (0.5 * Rtarget + 0.02), 0, 1);
      const fWs = clamp((theta - sp.thWilt) / (sp.thOpt - sp.thWilt), 0, 1) * (1 - 0.6 * d.wtf);
      let sfNow, surfFlood = 0;
      if (moss) {   // moss hydrates from humid air, dew and the damp surface; it is not limited by roots or soil water
        sfNow = clamp(Math.max(clamp((d.rh - 0.6) / 0.35, 0, 1) * 0.8 + 0.2 * clamp(theta / g.thFC, 0, 1), 0.9 * s.leafWet), 0, 1);
        surfFlood = d.pond > 0 ? 1 : clamp((d.wtf - 0.8) / 0.2, 0, 1);      // only a flooded surface drowns it
      } else sfNow = fWs * clamp(1.4 * ra / Math.max(0.35, demandF), 0, 1);
      pl.w += (sfNow - pl.w) * (1 - Math.exp(-dt / (moss ? 0.1 : 0.3)));
      const nk = sp.nutK || 1;
      const fnutP = Math.min(d.nmin / (d.nmin + 0.25 * nk), d.pav / (d.pav + 0.012 * nk), d.kmin / (d.kmin + 0.12 * nk));
      const fpH = bell(pH, sp.ph[0], sp.ph[1], sp.ph[2], sp.ph[3]);
      const fTg = Math.max(0, 1 - Math.pow((s.Ta - sp.tOpt) / sp.tWidth, 2));
      pl.limiting = limiting;
      // maintenance respiration is drawn from the reserve (or from the plant itself when that runs dry)
      const dorm = moss ? 0.2 + 0.8 * pl.w : 1;                           // a dried-out moss is dormant
      const RmS = sp.rpS * pl.S * fTa * dorm, RmR = sp.rpR * pl.R * fTs * dorm;
      const mA = Math.min(RmS + RmR, 0.95 * pl.A / dt);
      const starv = (RmS + RmR) - mA;
      const shareS = (RmS + RmR) > 0 ? RmS / (RmS + RmR) : 0.5;
      // growth from the reserve, limited by nutrients, water, pH, temperature
      let gr = (sp.kGrow || K.kGrow) * pl.A * fTg * fnutP * pl.w * fpH * hEff;
      gr = Math.min(gr, (sp.rgr || K.rgrMax) * p.plantGrowth * (pl.S + pl.R + 0.05), Math.max(0, 0.95 * pl.A / dt - mA));
      const gain = gr * (1 - K.growthResp);
      const callus = pl.cutting ? clamp(((j.hours - pl.born) / 24 - 5) / 10, 0, 1) : 1;      // a cutting heals over before rooting
      const fr = callus * clamp(sp.rootRatio / (1 + sp.rootRatio) + 1.5 * (Rtarget - pl.R) / (Rtarget + 0.3), 0.05, 0.9);
      const moist = clamp((theta - 0.10) / 0.08, 0, 1) * (1 - d.wtf);
      let tr = sp.rootInit * pl.S * moist * fTs * callus * Math.max(0, 1 - pl.R / (Rtarget + 1e-9)) * hEff;
      tr = Math.min(tr, 0.4 * pl.S / dt);

      const f = {
        pl: pl, sp: sp, cover: cover, RmS: RmS, RmR: RmR, mA: mA, starv: starv, shareS: shareS, gr: gr, gain: gain, fr: fr, tr: tr,
        drought: 0.08 * Math.pow(1 - pl.w, 2) * (sp.droughtTol != null ? sp.droughtTol : 1),
        scorch: 0.15 * clamp((d.lightNow * pl.shade / sp.lightInh - 0.9) / 0.5, 0, 1),
        cold: 0.06 * clamp((sp.tMinSafe - s.Ta) / 6, 0, 1),
        heat: 0.1 * clamp((s.Ta - sp.tMaxSafe) / 6, 0, 1),
        nutrient: 0.03 * (1 - fnutP) * (1 - fnutP), ph: 0.03 * (1 - fpH), sub: 1 - 0.8 * surfFlood,
        crowd: crowdRate, fpH: fpH,
      };
      // diseases: grey mold needs wet leaves in mild air; root rot needs a waterlogged, warm soil
      const stress = clamp(1 - Math.min(pl.w, hEff) * clamp(pl.A / (0.04 * (pl.S + pl.R) + 0.01), 0, 1), 0, 1);
      const wound = pl.cutting ? 1 : 0;
      f.dFF = K.dis0 * wetF * tempF * (s.If + pl.fF) * (1 - pl.fF) * sp.susF * (1 + 2 * stress + wound) - pl.fF * (0.05 + 0.15 * (1 - s.leafWet));
      f.dFR = 0.4 * (s.Ir + pl.fR) * Math.pow(wtfRoot, 1.5) * tempR * sp.susR * (1 + 2 * stress + 2 * wound) * (1 - pl.fR) - pl.fR * 0.03 * (1 - wtfRoot);
      f.disease = 0.05 * pl.fF;
      f.rot = 0.06 * pl.fR;
      f.hypoxia = moss ? 0.06 * surfFlood : 0.07 * sp.floodSens * (pl.R < 0.5 * Rtarget ? 1.6 : 1) * Math.pow(wtfRoot, 1.5);
      f.toxin = 0.08 * tox * (sp.toxK || 1);
      f.dh = moss ? 0 : -(f.hypoxia + f.toxin + 0.02 * Math.pow(1 - clamp((theta - sp.thWilt) / (sp.thOpt - sp.thWilt), 0, 1), 2) + 0.03 * (1 - fpH)) * pl.h
             + 0.03 * (1 - wtfRoot) * (1 - Math.min(1, tox)) * (1 - pl.h);
      f.senS = pl.S * (sp.senBase + (moss ? f.hypoxia : 0) + f.drought + f.scorch + f.cold + f.heat + f.crowd + f.disease + f.nutrient + f.ph + 0.05 * (1 - pl.h) + (pl.cutting ? 0.4 * f.rot : 0));
      f.senR = pl.R * (sp.senRoot + 0.08 * (1 - pl.h) + f.rot);
      PL.push(f);
      nGrowthN += gain / K.cn.plant; gainSum += gain;
      // 5-day memory of each stress, used to explain deaths
      const st = pl.st, a = dt / 5;
      const dry = moss ? clamp((0.9 - d.rh) / 0.3, 0, 1) : clamp(1.5 * (sp.thOpt - theta) / (sp.thOpt - sp.thWilt), 0, 1);
      const rates = { drought: f.drought * dry, hypoxia: f.hypoxia + f.drought * (1 - dry), toxin: f.toxin, shade: pl.shade < 0.5 ? (1 - pl.shade) * 0.05 : 0, scorch: f.scorch,
                      cold: f.cold, heat: f.heat, crowd: f.crowd, disease: f.disease, rot: f.rot, nutrient: f.nutrient, ph: f.ph };
      for (let k = 0; k < STRESS_KEYS.length; k++) { const key = STRESS_KEYS[k]; st[key] += (rates[key] - st[key]) * a; }
    }
    // shared nutrient caps on growth
    let gScale = 1;
    if (gainSum > 0) {
      gScale = Math.min(1, 0.5 * d.nmin / dt / nGrowthN, 0.5 * d.pav / dt / (gainSum / K.cp.plant), 0.5 * d.kmin / dt / (gainSum / K.ckPlant));
      if (!(gScale >= 0)) gScale = 0;
    }

    // =========================== soil life (slow part) ===========================
    const fmB = clamp((theta - 0.06) / 0.16, 0, 1) * (1 - 0.5 * d.wtf), fmF = clamp((theta - 0.04) / 0.12, 0, 1), fmN = clamp((theta - 0.10) / 0.10, 0, 1);
    const fpB = bell(pH, 4.0, 5.8, 8.0, 9.5), fpF = bell(pH, 2.8, 4.2, 6.8, 8.8), fpA = bell(pH, 5.0, 6.2, 8.0, 9.5), fpN = bell(pH, 4.0, 5.5, 8.0, 9.5), fpS = bell(pH, 3.8, 4.8, 7.8, 9.2);
    const SL = s.L, SR = s.Rc;
    let uBL = K.uB * fTs * s.B * SL / (SL + K.kL) * fmB * fpB * ae * fo2 * fnm;
    let uBR = K.uBR * fTs * s.B * SR / (SR + K.kR) * fmB * fpB * ae * fo2 * fnm;
    let uFL = K.uFL * fTs * s.F * SL / (SL + K.kL) * fmF * fpF * ae * ae * fo2 * rhS * fnm;
    let uFR = K.uFR * fTs * s.F * SR / (SR + K.kR) * fmF * fpF * ae * ae * fo2 * rhS * fnm;
    let uAn = K.uAn * fTs * s.An * SL / (SL + K.kL) * anox * fpA;
    // fauna feeding
    const actS = clamp((d.rh - 0.8) / 0.15, 0, 1) * clamp((theta - 0.05) / 0.1, 0, 1) * fpS * (1 - 0.7 * d.wtf);
    const bact = s.B + s.An;
    const availS = s.F + 0.3 * bact + 0.05 * SL;
    const iS = availS > 0 ? K.gS * fTs * s.Sp * availS / (availS + K.kS) * actS : 0;
    let sF = availS > 0 ? iS * s.F / availS : 0, sB = availS > 0 ? iS * 0.3 * bact / availS : 0, sL = iS - sF - sB;
    let iN = bact > 0 ? K.gN * fTs * s.Nm * bact / (bact + K.kN) * fmN * fpN * (0.3 + 0.7 * ae) : 0;
    const availM = s.Sp + 0.6 * s.Nm;
    const actM = clamp((d.rh - 0.7) / 0.2, 0, 1) * (1 - 0.5 * d.wtf);
    const iM = availM > 0 ? K.gM * fTs * s.Mt * availM / (availM + K.kM) * actM : 0;
    let mSp = availM > 0 ? iM * s.Sp / availM : 0, mNm = iM - mSp;
    // never let one step eat more than half of any resource
    function cap(pool, list) {
      let tot = 0; for (let i = 0; i < list.length; i++) tot += list[i].v;
      const c = 0.5 * pool / dt;
      if (tot > c && tot > 0) { const f = c / tot; for (let i = 0; i < list.length; i++) list[i].v *= f; }
    }
    const aL = { v: uBL }, bL = { v: uFL }, cL = { v: uAn }, dL = { v: sL }; cap(SL, [aL, bL, cL, dL]); uBL = aL.v; uFL = bL.v; uAn = cL.v; sL = dL.v;
    const aR = { v: uBR }, bR = { v: uFR }; cap(SR, [aR, bR]); uBR = aR.v; uFR = bR.v;
    const aB = { v: sB }, bB = { v: iN }; cap(Math.max(0, bact - K.floor.B - K.floor.An), [aB, bB]); sB = aB.v; iN = bB.v;
    const aF = { v: sF }; cap(Math.max(0, s.F - K.floor.F), [aF]); sF = aF.v;
    const aS = { v: mSp }; cap(s.Sp, [aS]); mSp = aS.v;
    const aN = { v: mNm }; cap(Math.max(0, s.Nm - K.floor.Nm), [aN]); mNm = aN.v;
    const iSr = sF + sB + sL, iMr = mSp + mNm;
    const shB = bact > 0 ? s.B / bact : 1;                          // bacteria vs anaerobes share of what gets grazed

    // fauna energetics: growth / respiration / faeces
    const mateS = Math.min(1, d.count / 8), mateN = Math.min(1, d.nemCount / 4), mateM = Math.min(1, d.miteCount / 2);
    const gS = K.eS * mateS * iSr, rSr = (K.rS + K.eS * (1 - mateS)) * iSr + K.rMaintS * fTs * s.Sp, fecS = iSr * (1 - K.eS - K.rS);
    const gN = K.eN * mateN * iN, rNr = (K.rN + K.eN * (1 - mateN)) * iN, fecN = iN * (1 - K.eN - K.rN);
    const gM = K.eM * mateM * iMr, rMr = (K.rM + K.eM * (1 - mateM)) * iMr, fecM = iMr * (1 - K.eM - K.rM);
    // mortality (dead things become labile litter); dormant pools never fall below their floor
    const mBt = s.B > K.floor.B ? s.B * K.mB * (1 + 1.5 * (1 - fmB)) * (1 + s.B / K.Bk) : 0;
    const mFt = s.F > K.floor.F ? s.F * (K.mF + 0.3 * anox) * (1 + s.F / K.Fk) : 0;
    const mAnt = s.An > K.floor.An ? s.An * K.mAn * (0.2 + 2 * (1 - anox)) : 0;
    const dryS = clamp((0.88 - d.rh) / 0.2, 0, 1);
    const mSt = s.Sp * Math.min(5, K.mS + 0.06 * d.count / (400 * area) + 0.3 * dryS + 0.5 * d.wtf + 0.5 * clamp((15 - d.o2pct) / 6, 0, 1) + 0.6 * tox + 0.5 * clamp((s.Ta - K.sHeatT) / 8, 0, 1) + 0.3 * (1 - fpS));
    const mNt = s.Nm > K.floor.Nm ? s.Nm * (K.mN + 0.2 * anox + 0.5 * tox + 0.01 * (1 - fmN)) * (1 + d.nemCount / 1500) : 0;
    const mMt = s.Mt * (K.mM + 0.3 * clamp((0.8 - d.rh) / 0.2, 0, 1) + 0.5 * tox + 0.4 * clamp((s.Ta - 30) / 6, 0, 1));

    // anaerobic metabolism: sulfate reduction (H2S) and methanogenesis -------------
    const Ccat = (1 - K.yAn) * uAn;
    const fS = s.SO4 / (s.SO4 + 0.3) * 0.4;
    const h2sProd = Math.min(0.5 * Ccat * fS, 0.5 * s.SO4 / dt);
    const ch4Prod = 0.5 * Ccat * (1 - fS);
    const co2An = Ccat - ch4Prod;
    const ch4Ox = Math.min(0.5 * fTs * s.Cm * ae * fo2, 0.5 * s.Cm / dt);          // methanotrophs: C returns as CO2
    const h2sOx = Math.min(0.5 * s.Hs * ae * fo2 + 1.5 * p.charcoal * s.Hs, 0.5 * s.Hs / dt);   // oxidation + charcoal binding
    const denit = Math.min(0.02 * d.nmin * anox * fTs * SL / (SL + K.kL), 0.5 * d.nmin / dt);   // nitrate lost as N2 when anoxic
    const fix = Math.min(0.0004 * ae * fTs, s.N2 / dt);                                      // tiny free-living N fixation

    // respiration, CO2 and O2 budgets (mmol per day) ----------------------------
    const aerobicResp = (1 - K.yB - K.hum) * uBL + (1 - K.yB) * uBR + (1 - K.yF - K.hum) * uFL + (1 - K.yF) * uFR;
    const humIn = K.hum * (uBL + uFL);
    const faunaResp = rSr + rNr + rMr;
    let rootResp = 0, plantResp = 0;
    for (let k = 0; k < PL.length; k++) { const f = PL[k]; plantResp += f.RmS + f.RmR + K.growthResp * f.gr * gScale; rootResp += f.RmR; }
    s._co2Rate = aerobicResp + faunaResp + plantResp + co2An + ch4Ox;
    s._o2Rate = aerobicResp + faunaResp + plantResp + 2 * ch4Ox + 2 * h2sOx;
    const soilO2 = aerobicResp + 0.8 * faunaResp + 0.6 * rootResp + 2 * ch4Ox + 2 * h2sOx;
    const soilCO2 = aerobicResp + 0.8 * faunaResp + co2An + 0.6 * rootResp;

    // =========================== apply slow updates ===========================
    let toL = 0, toRc = 0;
    for (let k = 0; k < PL.length; k++) {
      const f = PL[k], pl = f.pl, gnow = f.gain * gScale, grr = f.gr * gScale;
      const starvS = f.starv * f.shareS, starvR = f.starv - starvS;
      pl.A = Math.max(0, pl.A + (-f.mA - grr) * dt);
      pl.S = Math.max(0, pl.S + ((1 - f.fr) * gnow - f.senS - starvS - f.tr) * dt);
      pl.R = Math.max(0, pl.R + (f.fr * gnow - f.senR - starvR + f.tr) * dt);
      pl.h = clamp(pl.h + f.dh * dt, 0, 1);
      pl.fF = clamp(pl.fF + f.dFF * dt, 0, 1);
      pl.fR = clamp(pl.fR + f.dFR * dt, 0, 1);
      toL += 0.95 * f.senS + 0.8 * f.senR; toRc += 0.05 * f.senS + 0.2 * f.senR;
      if (pl.cutting && pl.R > 0.7 * f.sp.rootRatio * pl.S && pl.R > 0.05) pl.cutting = false;
    }
    s.crowd = clamp(s.crowd + (crowdTarget - s.crowd) / 12 * dt, 0, 1.5);

    const necro = mBt + mFt + mAnt + mNt + mSt + mMt;
    s.L = Math.max(0, s.L + (toL + necro + fecS + fecN + fecM - uBL - uFL - uAn - sL) * dt);
    s.Rc = Math.max(0, s.Rc + (toRc + humIn - uBR - uFR) * dt);
    s.B = Math.max(0, s.B + (K.yB * (uBL + uBR) - mBt - (sB + iN) * shB) * dt);
    s.An = Math.max(0, s.An + (K.yAn * uAn - mAnt - (sB + iN) * (1 - shB)) * dt);
    s.F = Math.max(0, s.F + (K.yF * (uFL + uFR) - mFt - sF) * dt);
    s.Nm = Math.max(0, s.Nm + (gN - mNt - mNm) * dt);
    s.Sp = Math.max(0, s.Sp + (gS - mSt - mSp - K.rMaintS * fTs * s.Sp) * dt);
    s.Mt = Math.max(0, s.Mt + (gM - mMt) * dt);
    // below one individual a population is gone
    if (s.Sp > 0 && s.Sp / K.mass.Sp < 0.5) { s.L += s.Sp; s.Sp = 0; }
    if (s.Mt > 0 && s.Mt / K.mass.Mt < 0.5) { s.L += s.Mt; s.Mt = 0; }
    if (s.Nm > 0 && s.Nm / K.mass.Nm < 0.5) { s.L += s.Nm; s.Nm = 0; }
    // gases, sulfur, nitrogen
    s.Cm = Math.max(0, s.Cm + (ch4Prod - ch4Ox) * dt);
    s.Hs = Math.max(0, s.Hs + (h2sProd - h2sOx) * dt);
    s.SO4 = Math.max(0, s.SO4 + (h2sOx - h2sProd) * dt);
    s.N2 = Math.max(0, s.N2 + (denit - fix) * dt);
    s.o2dem = soilO2; s.csoil = soilCO2;
    // acids and pH: fungal respiration, fermentation and plant nutrient uptake acidify; the soil buffers it back
    s.H = Math.max(0, s.H + (0.05 * (1 - K.yF) * (uFL + uFR) + 0.4 * Ccat + 0.5 * nGrowthN * gScale - 0.02 * s.H * (1 + ae)) * dt);
    // pathogen inoculum: re-seeded by infected tissue, grazed by springtails
    let mFF = 0, mFR = 0, wS = 0;
    for (let k = 0; k < PL.length; k++) { const q = PL[k].pl; mFF += q.fF * q.S; mFR += q.fR * q.S; wS += q.S; }
    if (wS > 0) { mFF /= wS; mFR /= wS; }
    const spCtl = s.Sp / (0.06 * area);
    s.If = Math.max(0, s.If + (0.1 * (p.pathFoliar + 0.8 * mFF - s.If) - 0.08 * spCtl * s.If * actS) * dt);
    s.Ir = Math.max(0, s.Ir + 0.05 * (p.pathRoot + 0.8 * mFR - s.Ir) * dt);
    // water between the soil and the drainage layer
    const Wfc = g.thFC * g.soilMl;
    const down = g.Cd > 0 ? Math.max(0, Math.min(g.kDrain * Math.max(0, s.W - Wfc), (g.Cd - s.Wd) / dt)) : 0;
    let up = g.Cd > 0 ? 0.08 * g.soilMl * clamp((0.85 * Wfc - s.W) / (0.85 * Wfc), 0, 1) * Math.min(1, s.Wd / (0.05 * g.Cd + 1e-9)) : 0;
    up = Math.min(up, 0.9 * s.Wd / dt);
    s.W = Math.max(0, s.W + (up - down) * dt); s.Wd = Math.max(0, s.Wd + (down - up) * dt);   // down: soil -> drainage layer, up: capillary rise

    // plants with nothing left are dead (remember what killed them)
    for (let k = 0; k < PL.length; k++) {
      const pl = PL[k].pl;
      if (pl.S + pl.R + pl.A < 0.06) {
        s.L += pl.S + pl.R + pl.A; pl.S = 0; pl.R = 0; pl.A = 0; pl.dead = true; pl.diedHour = j.hours;
        let best = 'drought', bv = -1;
        for (let q = 0; q < STRESS_KEYS.length; q++) { const key = STRESS_KEYS[q]; if (pl.st[key] > bv) { bv = pl.st[key]; best = key; } }
        pl.cause = best;
      }
    }

    fast(j, PL);
    j.hours++;
    derive(j);
  }

  // Quick physics, 4 quarter-hours: light, temperatures, photosynthesis, gases, vapour, condensation.
  function fast(j, PL) {
    const p = j.params, s = j.s, g = j.geo, area = g.areaF, n = K.nSub;
    const dH = 1 / n, dd = dH / 24;
    const Ls = s.effPhoto;
    const nmin = j.d.nmin;
    for (let sub = 0; sub < n; sub++) {
      const hod = (j.hours % 24) + (sub + 0.5) * dH;
      const warm = (Ls > 0 && hod < Ls) ? Math.sin(Math.PI * hod / Ls) : 0;
      const ell0 = warm * s.effLight * Math.PI / 2;
      const Troom = s.effTemp + 0.5 * p.tempSwing * Math.sin(2 * Math.PI * (hod - 10) / 24);
      s.Ta += (Troom + p.lampHeat * (p.lightSource ? p.sunHeat : 1) * ell0 - s.Ta) * (1 - Math.exp(-dH / 1.5));
      s.Tg += (Troom + 0.25 * (s.Ta - Troom) - s.Tg) * (1 - Math.exp(-dH / 1.0));
      s.Ts += (0.5 * (s.Ta + s.effTemp) - s.Ts) * (1 - Math.exp(-dH / 10));
      const vsA = vsat(s.Ta, g.airMl), vsG = vsat(s.Tg, g.airMl), vsS = vsat(Math.max(s.Ta, s.Ts), g.airMl);
      const rh = Math.min(1, s.V / vsA);
      const vpd = esat(s.Ta) / 10 * (1 - rh);
      const co2ppm = s.Ch / g.gasMmol * 1e6;

      // photosynthesis and transpiration, plant by plant
      let Gtot = 0, trTot = 0;
      const Gi = new Array(PL.length);
      for (let k = 0; k < PL.length; k++) {
        const f = PL[k], pl = f.pl, sp = f.sp;
        if (pl.dead) { Gi[k] = 0; continue; }
        const ell = ell0 * pl.shade;
        const inh = 1 / (1 + Math.pow(ell / sp.lightInh, 4));
        const fL = ell / (ell + sp.lightK) * (1 + sp.lightK) * inh;
        const fTp = Math.max(0, 1 - Math.pow((s.Ta - sp.tOpt) / sp.tWidth, 2));
        const cc = Math.max(0, co2ppm - 50);
        const fCO2 = cc / (cc + 250) / 0.5625;
        const fA = 1 / (1 + Math.pow(pl.A / (0.3 * (pl.S + pl.R) + 0.1), 2));
        const fN = nmin / (nmin + 0.4);
        const G = sp.aMax * p.plantGrowth * area * f.cover * fL * fCO2 * fTp * pl.w * f.fpH * fA * fN * f.sub * (1 - 0.7 * pl.fF);
        Gi[k] = G; Gtot += G;
        const open = clamp(0.1 + 0.9 * ell / (ell + 0.3), 0, 1);
        trTot += sp.transp * pl.S * open * vpd * pl.w * (1 - 0.5 * pl.fF);
      }
      let scale = 1;
      if (Gtot * dd > 0.6 * s.Ch) scale = 0.6 * s.Ch / (Gtot * dd);
      for (let k = 0; k < PL.length; k++) {
        const G = Gi[k] * scale * dd;
        if (G > 0) { PL[k].pl.A += G; s.Ch -= G; s.O += G; }
      }
      // respiration and decomposition gases computed in the slow part, spread evenly over the hour
      s.Ch += s._co2Rate * dd;
      s.O = Math.max(0, s.O - s._o2Rate * dd);

      // vapour: soil evaporation, transpiration, condensation on the glass, drip back into the soil
      const fth = Math.pow(clamp(s.W / g.soilMl / g.thFC, 0, 1), 1.5);
      let evap = K.kEvap * area * fth * Math.max(0, vsS - s.V) * dH;
      evap = Math.min(evap, s.W * 0.5, Math.max(0, vsS - s.V));
      s.W -= evap; s.V += evap;
      const tr = Math.min(trTot * dd, s.W * 0.2, Math.max(0, vsA - s.V));
      s.W -= tr; s.V += tr;
      if (s.V > vsG) {
        const c = Math.min(s.V - vsG, K.kCond * (s.V - vsG) * dH * Math.min(1, area));
        s.V -= c; s.Wg += c;
      } else if (s.Wg > 0) {
        const e = Math.min(s.Wg, K.kCond * 0.5 * (vsG - s.V) * dH, vsG - s.V);
        s.V += e; s.Wg -= e;
      }
      const drip = Math.min(s.Wg, s.Wg * (2 + s.Wg / 8) * dd);
      s.Wg -= drip; s.W += drip;
      // dew on the leaves when they are cooler than the dew point (at night); slow to dry
      const wetT = clamp((s.V / vsat(s.Ta + (warm > 0 ? 0.6 * ell0 : -1.0), g.airMl) - 0.97) / 0.06, 0, 1);
      s.leafWet += (wetT - s.leafWet) * (1 - Math.exp(-dH / (wetT > s.leafWet ? 2 : 6)));
      // lid open: everything exchanges with the room
      const leakNow = Math.max(p.leak, (s.ventUntil || 0) > j.hours ? 1 : 0);
      if (leakNow > 0) {
        const k = 1 - Math.exp(-leakNow * K.kVent * dH);
        s.Ch += k * (K.ambientCO2 * 1e-6 * g.gasMmol - s.Ch);
        s.O += k * (K.ambientO2 / 100 * g.gasMmol - s.O);
        s.Cm -= k * s.Cm; s.Hs -= k * s.Hs * 0.5;
        const Vroom = K.roomRH * vsat(Troom, g.airMl);
        s.V += k * (Vroom - s.V);
        // water carried out of the jar by the air stream (the small vapour pool alone can't carry it)
        const lost = Math.min(s.W * 0.2, leakNow * K.kOpen * area * fth * Math.max(0, 1 - Vroom / vsS) * dd);
        s.W -= lost;
      }
      if (s.V < 0) s.V = 0;
      if (s.Ch < 0) s.Ch = 0;
    }
  }

  // ---- variables for charts ---------------------------------------------------
  const VARS = [
    { key: 'co2ppm', group: 'Air', label: 'CO₂ (air)', unit: 'ppm', digits: 0, get: function (j) { return j.d.co2ppm; } },
    { key: 'o2pct', group: 'Air', label: 'O₂ (air)', unit: '%', digits: 2, get: function (j) { return j.d.o2pct; } },
    { key: 'ch4ppm', group: 'Air', label: 'Methane', unit: 'ppm', digits: 0, get: function (j) { return j.d.ch4ppm; } },
    { key: 'temp', group: 'Climate', label: 'Air temperature', unit: '°C', digits: 1, get: function (j) { return j.s.Ta; } },
    { key: 'soiltemp', group: 'Climate', label: 'Soil temperature', unit: '°C', digits: 1, get: function (j) { return j.s.Ts; } },
    { key: 'roomtemp', group: 'Climate', label: 'Room temperature (season)', unit: '°C', digits: 1, get: function (j) { return j.s.effTemp; } },
    { key: 'daylen', group: 'Climate', label: 'Day length', unit: 'h', digits: 1, get: function (j) { return j.s.effPhoto; } },
    { key: 'light', group: 'Climate', label: 'Light', unit: '×', digits: 2, get: function (j) { return j.d.lightNow; } },
    { key: 'humidity', group: 'Climate', label: 'Relative humidity', unit: '%', digits: 0, get: function (j) { return j.d.rh * 100; } },
    { key: 'vpd', group: 'Climate', label: 'Vapour pressure deficit', unit: 'kPa', digits: 2, get: function (j) { return j.d.vpd; } },
    { key: 'leafwet', group: 'Climate', label: 'Leaf wetness (dew)', unit: '%', digits: 0, get: function (j) { return j.s.leafWet * 100; } },
    { key: 'glass', group: 'Water', label: 'Condensation on glass', unit: 'ml', digits: 2, get: function (j) { return j.s.Wg; } },
    { key: 'moisture', group: 'Water', label: 'Soil moisture', unit: '% vol', digits: 1, get: function (j) { return j.d.theta * 100; } },
    { key: 'drain', group: 'Water', label: 'Drainage layer fill', unit: '%', digits: 0, get: function (j) { return j.d.drainFill * 100; } },
    { key: 'watertable', group: 'Water', label: 'Water table in the soil', unit: '%', digits: 0, get: function (j) { return j.d.wtf * 100; } },
    { key: 'ph', group: 'Soil chemistry', label: 'Soil pH', unit: '', digits: 2, get: function (j) { return j.d.pH; } },
    { key: 'aeration', group: 'Soil chemistry', label: 'Anoxic share of the soil', unit: '%', digits: 0, get: function (j) { return j.d.anox * 100; } },
    { key: 'soilco2', group: 'Soil chemistry', label: 'CO₂ in the soil', unit: 'ppm', digits: 0, get: function (j) { return j.d.soilCO2; } },
    { key: 'h2s', group: 'Soil chemistry', label: 'Hydrogen sulfide in soil water', unit: 'µmol/L', digits: 1, get: function (j) { return j.d.h2sConc * 1000; } },
    { key: 'nitrogen', group: 'Nutrients', label: 'Free nitrogen', unit: 'mmol N', digits: 2, get: function (j) { return j.d.nmin; } },
    { key: 'phosphorus', group: 'Nutrients', label: 'Available phosphorus', unit: 'mmol P', digits: 3, get: function (j) { return j.d.pav; } },
    { key: 'potassium', group: 'Nutrients', label: 'Free potassium', unit: 'mmol K', digits: 2, get: function (j) { return j.d.kmin; } },
    { key: 'sulfate', group: 'Nutrients', label: 'Sulfate', unit: 'mmol S', digits: 2, get: function (j) { return j.s.SO4; } },
    { key: 'shoot', group: 'Plants', label: 'Shoot biomass', unit: 'mmol C', digits: 2, get: function (j) { return j.d.shoot; } },
    { key: 'rootmass', group: 'Plants', label: 'Root biomass', unit: 'mmol C', digits: 2, get: function (j) { return j.d.rootmass; } },
    { key: 'reserve', group: 'Plants', label: 'Sugar reserves', unit: 'mmol C', digits: 2, get: function (j) { return j.d.reserve; } },
    { key: 'roots', group: 'Plants', label: 'Root health', unit: '%', digits: 0, get: function (j) { return j.d.rootHealth * 100; } },
    { key: 'leafdis', group: 'Plants', label: 'Leaf disease (grey mold)', unit: '%', digits: 1, get: function (j) { return j.d.leafDisease * 100; } },
    { key: 'rootdis', group: 'Plants', label: 'Root / stem-base rot', unit: '%', digits: 1, get: function (j) { return j.d.rootDisease * 100; } },
    { key: 'crowd', group: 'Plants', label: 'Crowding stress', unit: '%', digits: 0, get: function (j) { return j.s.crowd / 1.5 * 100; } },
    { key: 'litter', group: 'Soil life', label: 'Leaf litter', unit: 'mmol C', digits: 2, get: function (j) { return j.s.L; } },
    { key: 'humus', group: 'Soil life', label: 'Humus', unit: 'mmol C', digits: 1, get: function (j) { return j.s.Rc; } },
    { key: 'bacteria', group: 'Soil life', label: 'Bacteria', unit: 'mmol C', digits: 3, get: function (j) { return j.s.B; } },
    { key: 'fungi', group: 'Soil life', label: 'Fungi / mold', unit: 'mmol C', digits: 3, get: function (j) { return j.s.F; } },
    { key: 'anaerobes', group: 'Soil life', label: 'Anaerobic microbes', unit: 'mmol C', digits: 3, get: function (j) { return j.s.An; } },
    { key: 'nematodes', group: 'Soil life', label: 'Nematodes', unit: 'count', digits: 0, get: function (j) { return j.d.nemCount; } },
    { key: 'springtails', group: 'Soil life', label: 'Springtails', unit: 'count', digits: 0, get: function (j) { return j.d.count; } },
    { key: 'mites', group: 'Soil life', label: 'Predatory mites', unit: 'count', digits: 1, get: function (j) { return j.d.miteCount; } },
  ];
  const VARGROUPS = ['Air', 'Climate', 'Water', 'Soil chemistry', 'Nutrients', 'Plants', 'Soil life'];

  function observe(j) {
    const o = {};
    for (let i = 0; i < VARS.length; i++) o[VARS[i].key] = VARS[i].get(j);
    return o;
  }

  const MAX_POINTS = 2600;
  function record(j) {
    const h = j.hist;
    if (j.hours % h.stride !== 0) return;
    const s = j.s;
    h.t.push(j.hours / 24);
    for (let i = 0; i < VARS.length; i++) h.series[VARS[i].key].push(VARS[i].get(j));
    while (h.pl.length < s.plants.length) {
      const pad = []; for (let i = 0; i < h.t.length - 1; i++) pad.push(null);
      h.pl.push({ shoot: pad.slice(), root: pad.slice(), health: pad.slice() });
    }
    for (let i = 0; i < s.plants.length; i++) {
      const pl = s.plants[i];
      h.pl[i].shoot.push(pl.S); h.pl[i].root.push(pl.R); h.pl[i].health.push(pl.dead ? 0 : pl.h * 100);
    }
    if (h.t.length > MAX_POINTS) {
      h.stride *= 2;
      const keep = function (a) { return a.filter(function (_, i) { return i % 2 === 0; }); };
      h.t = keep(h.t);
      VARS.forEach(function (v) { h.series[v.key] = keep(h.series[v.key]); });
      h.pl.forEach(function (q) { q.shoot = keep(q.shoot); q.root = keep(q.root); q.health = keep(q.health); });
    }
  }

  // Hourly min / max / mean of the quantities that swing every day, for the daily health check.
  function accumulate(j) {
    const a = j.acc || (j.acc = {}), d = j.d, s = j.s;
    const vals = { co2: d.co2ppm, o2: d.o2pct, rh: d.rh, lw: s.leafWet, temp: s.Ta };
    for (const k in vals) {
      const v = vals[k], q = a[k] || (a[k] = { min: Infinity, max: -Infinity, sum: 0, n: 0 });
      if (v < q.min) q.min = v; if (v > q.max) q.max = v; q.sum += v; q.n++;
    }
  }

  // Run `hours` steps. opts.diag === false skips history and diagnostics (sweeps).
  function advance(j, hours, opts) {
    const full = !(opts && opts.diag === false);
    for (let i = 0; i < hours; i++) {
      step(j);
      if (full) {
        accumulate(j);
        record(j);
        if (j.hours % 24 === 0 && Terra.diagnostics) Terra.diagnostics.daily(j);
      }
    }
  }

  function failure(j) {
    if (j.initial.plants.length > 0 && j.d.alive === 0) return 'plant';
    if (j.initial.springtails >= 1 && j.d.count < 1) return 'springtails';
    if (j.d.o2pct < 8 || j.d.co2ppm > 80000) return 'air';
    return null;
  }

  // Element totals for conservation checks. "debt" > 0 would mean pools hold more of an element than exists.
  function totals(j) {
    const s = j.s;
    let C = s.Ch + s.Cm;
    ORG.forEach(function (k) { C += s[k]; });
    s.plants.forEach(function (pl) { C += pl.S + pl.R + pl.A; });
    return { C: C, S: s.SO4 + s.Hs, water: s.W + s.Wd + s.V + s.Wg,
             debtN: heldN(s) - s.Nt, debtP: heldP(s) - s.Pt, debtK: heldK(s) - s.Kt };
  }

  // ---- interventions --------------------------------------------------------
  function addPlant(j, spec) {
    const s = j.s, xs = s.plants.filter(function (q) { return !q.dead; }).map(function (q) { return q.x; }).concat([0.08, 0.92]).sort(function (a, b) { return a - b; });
    let bx = 0.5, bg = -1;
    for (let i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] > bg) { bg = xs[i + 1] - xs[i]; bx = (xs[i] + xs[i + 1]) / 2; }
    const pl = newPlant(spec, bx);
    pl.born = j.hours;
    s.plants.push(pl);
    s.Nt += (pl.S + pl.R) / K.cn.plant; s.Pt += (pl.S + pl.R) / K.cp.plant; s.Kt += (pl.S + pl.R) / K.ckPlant;
    derive(j);
    return pl;
  }
  function addPool(j, key, mmolC) { const s = j.s; s[key] += mmolC; s.Nt += mmolC / K.cn[key]; s.Pt += mmolC / K.cp[key]; }
  const ACTIONS = {
    addWater:    { label: '+ 30 ml water',          text: 'added 30 ml of water to the soil', apply: function (j) { j.s.W += 30; } },
    removeWater: { label: '− 30 ml water',          text: 'removed 30 ml of water from the soil', apply: function (j) { j.s.W = Math.max(0, j.s.W - 30); } },
    drain:       { label: 'Empty drainage layer',   text: 'emptied the drainage layer', apply: function (j) { j.s.Wd = 0; } },
    drainSome:   { label: '− 30 ml from drainage layer', text: 'syringed 30 ml out of the drainage layer', apply: function (j) { j.s.Wd = Math.max(0, j.s.Wd - 30); } },
    ventDay:     { label: 'Lid off for 1 day',      text: 'took the lid off for a day', apply: function (j) { j.s.ventUntil = j.hours + 24; } },
    ventWeek:    { label: 'Lid off for 1 week',     text: 'took the lid off for a week', apply: function (j) { j.s.ventUntil = j.hours + 24 * 7; } },
    airJar:      { label: 'Refresh the air (quick vent)', text: 'quickly refreshed the air (this does not remove water)', apply: function (j) { const g = j.geo; j.s.Ch = K.ambientCO2 * 1e-6 * g.gasMmol; j.s.O = K.ambientO2 / 100 * g.gasMmol; j.s.Cm = 0; j.s.Hs *= 0.5; j.s.V = K.roomRH * vsat(j.s.Ta, g.airMl); j.s.leafWet = 0; } },
    addSpring:   { label: '+ 100 springtails',      text: 'added 100 springtails', apply: function (j) { addPool(j, 'Sp', 100 * K.mass.Sp); } },
    addMites:    { label: '+ 5 predatory mites',    text: 'added 5 predatory mites', apply: function (j) { addPool(j, 'Mt', 5 * K.mass.Mt); } },
    prune:       { label: 'Prune shoots 50%',       text: 'pruned every plant by half', apply: function (j) { j.s.plants.forEach(function (pl) { if (!pl.dead) { j.s.L += pl.S * 0.5 * 0.95; j.s.Rc += pl.S * 0.5 * 0.05; pl.S *= 0.5; } }); } },
    removeDead:  { label: 'Remove leaf litter',     text: 'removed the leaf litter', apply: function (j) { const m = j.s.L; j.s.L = 0; j.s.Nt -= m / K.cn.L; j.s.Pt -= m / K.cp.L; } },
    addLitter:   { label: '+ 10 leaf litter',       text: 'added 10 mmol of leaf litter', apply: function (j) { addPool(j, 'L', 10); } },
    addMold:     { label: 'Introduce mold',         text: 'introduced mold', apply: function (j) { addPool(j, 'F', 0.5); } },
    fungicide:   { label: 'Fungicide on leaves',    text: 'sprayed fungicide on the leaves', apply: function (j) { j.s.If *= 0.1; j.s.plants.forEach(function (pl) { pl.fF *= 0.3; }); } },
    addLime:     { label: 'Add lime (raise pH)',    text: 'added lime', apply: function (j) { j.s.H = Math.max(0, j.s.H - 1.5 * j.geo.Bcap); } },
    fertilize:   { label: 'Add fertiliser (NPK)',   text: 'added fertiliser', apply: function (j) { j.s.Nt += 1.5; j.s.Pt += 0.1; j.s.Kt += 0.4; } },
    killSpring:  { label: 'Remove springtails',     text: 'removed all springtails', apply: function (j) { j.s.L += j.s.Sp; j.s.Sp = 0; } },
  };
  function act(j, name) {
    ACTIONS[name].apply(j);
    derive(j);
    if (Terra.diagnostics) Terra.diagnostics.note(j, 'info', 'You ' + ACTIONS[name].text + '.');
  }
  function plantNow(j, spec) {
    const pl = addPlant(j, spec);
    if (Terra.diagnostics) Terra.diagnostics.note(j, 'info', 'You planted ' + (spec.cutting ? 'a cutting of ' : '') + species(spec.sp).name + '.');
    return pl;
  }
  function clone(j) {
    const c = JSON.parse(JSON.stringify(j));
    c.id = Terra._nextId = (Terra._nextId || 0) + 1;
    return c;
  }

  // Bump VERSION whenever an equation, constant or species trait changes the simulation's results: saved jars from an older version
  // are then rebuilt from their starting setup instead of being loaded as they were.
  const VERSION = '3.3-moss-seasons';

  Terra.model = { VERSION, K, PARAM_DEFS, DEFAULTS, VARS, VARGROUPS, STRESS_KEYS, solar, dateOf, updateSeason, ACTIONS, createJar, resetState, step, advance, derive, observe, record, failure, act, plantNow, addPlant, clone, geometry, species, totals, bell, esat, vsat, ORG, heldN, heldP, heldK };
})(typeof globalThis !== 'undefined' ? globalThis : this);
