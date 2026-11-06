/* Ready-made starting setups: parameter overrides on the defaults. `plants` lists what is in the jar. */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});
  const P = function (sp, start, cutting) { return { sp: sp, start: start, cutting: !!cutting }; };
  const CUTS = [P('pothos', 1.2, true), P('pothos', 1, true), P('pothos', 0.8, true)];

  Terra.presets = [
    { id: 'balanced',    name: 'Balanced jar',                 note: 'Generic plant, drainage layer, charcoal: should settle into a self-sustaining loop.', params: {} },
    { id: 'fittonia',    name: 'Fittonia',                     note: 'A rooted fittonia in a calm, humid jar. Prone to grey mold.', params: { plants: [P('fittonia', 3)], light: 0.6 } },
    { id: 'cuttings',    name: 'Three cuttings',               note: 'Three pothos cuttings with no roots yet: do they root, rot or get grey mold?', params: { plants: CUTS, light: 0.8 } },
    { id: 'wetcuttings', name: 'Cuttings, drainage overflowing', note: 'Too much water: the drainage layer fills and the water table rises into the cuttings.', params: { plants: CUTS, light: 0.8, water: 330, drainWater: 90 } },
    { id: 'win_generic', name: 'Window jar, Hungary (seasons)', note: 'Generic plant on a windowsill at 47.5°N: room 22 °C in winter, 26.5 °C in summer, sunlight following the date.', params: { seasonOn: 1, lightSource: 1 } },
    { id: 'win_fittonia', name: 'Fittonia on the windowsill (seasons)', note: 'Fittonia with real seasons: dim winters, warm and bright summers.', params: { plants: [P('fittonia', 3)], seasonOn: 1, lightSource: 1 } },
    { id: 'win_moss',    name: 'Moss on the windowsill (seasons)', note: 'Moss in a window: how does it cope with 26-28 °C summers?', params: { plants: [P('moss', 4)], seasonOn: 1, lightSource: 1 } },
    { id: 'win_mossfit', name: 'Fittonia + moss, windowsill (seasons)', note: 'The two shade lovers through a whole year of seasons.', params: { plants: [P('fittonia', 3), P('moss', 4)], seasonOn: 1, lightSource: 1 } },
    { id: 'moss',         name: 'Moss patch',                   note: 'A patch of generic moss in cool, dim light: no roots, it drinks from the humid air.', params: { plants: [P('moss', 4)], light: 0.4, temperature: 19 } },
    { id: 'mossbright',  name: 'Moss in a bright, warm window', note: 'Strong light and warmth: moss yellows and declines.', params: { plants: [P('moss', 4)], light: 1.6, temperature: 23 } },
    { id: 'mossfit',     name: 'Fittonia + moss',              note: 'Two shade lovers sharing a jar.', params: { plants: [P('fittonia', 3), P('moss', 4)], light: 0.5, temperature: 20 } },
    { id: 'mossopen',    name: 'Moss, lid left open',          note: 'Dry air: moss goes dormant (brown, crispy) instead of dying at once.', params: { plants: [P('moss', 4)], light: 0.4, temperature: 19, leak: 0.5 } },
    { id: 'aggressive',  name: 'Aggressive vine + fittonia',   note: 'A vigorous pothos shades and starves a fittonia.', params: { plants: [P('pothos', 6), P('fittonia', 3)], plantGrowth: 2.5 } },
    { id: 'overgrown',   name: 'Overgrown, little nitrogen',   note: 'One huge, vigorous plant and lots of litter: mold, CO₂ build-up, nitrogen shortage.', params: { plants: [P('generic', 25)], plantGrowth: 5, nitrogen: 2, litter: 20 } },
    { id: 'flooded',     name: 'Too much water (drainage full)', note: 'The drainage layer overflows into the soil: anoxia, H₂S, drowned roots.', params: { water: 330, drainWater: 90 } },
    { id: 'nodrain',     name: 'Overwatered, no drainage layer', note: 'Same water, nowhere to put it.', params: { drainVolume: 0, water: 400 } },
    { id: 'nocharcoal',  name: 'Flooded, litter, no charcoal', note: 'Rotting litter in waterlogged soil without charcoal: rotten-egg gas and methane.', params: { water: 330, drainWater: 90, litter: 15, charcoal: 0 } },
    { id: 'drought',     name: 'Almost no water',              note: 'Barely damp soil, empty drainage layer.', params: { water: 40, drainWater: 0 } },
    { id: 'nospring',    name: 'No springtails',               note: 'Nobody grazes the mold or spores.', params: { springtails: 0 } },
    { id: 'hot',         name: 'Hot lamp',                     note: 'Strong lamp heats the sealed jar.', params: { light: 2.5, temperature: 27 } },
    { id: 'dark',        name: 'Dark corner',                  note: 'Very little light.', params: { light: 0.15 } },
    { id: 'cold',        name: 'Cold windowsill (fittonia)',   note: 'Fittonia hates temperatures under 15 °C.', params: { plants: [P('fittonia', 3)], temperature: 10, light: 0.6 } },
    { id: 'open',        name: 'Lid half open',                note: 'Humidity drops, gases and water leak out.', params: { leak: 0.5 } },
    { id: 'acid',        name: 'Acid peat, weak buffer',       note: 'pH 4.3 and little buffering: pH drops further.', params: { ph0: 4.3, buffer: 0.4 } },
    { id: 'lowN',        name: 'Poor soil (low nitrogen)',     note: 'Little nitrogen to go round.', params: { nitrogen: 0.3, plantGrowth: 2 } },
    { id: 'lowK',        name: 'Low potassium',                note: 'Potassium decides growth.', params: { potassium: 0.05, plantGrowth: 2 } },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
