/*
 * Plant species traits. Numbers are game-scale approximations of each plant's
 * real-world habits (shade vs sun, cold, humidity, wet feet), not measurements.
 * Add a species by adding an entry here: the model and UI pick it up.
 *
 *  aMax       peak photosynthesis of a fully-covering canopy (relative; generic = 3.4)
 *  kCanopy    leaf area per mmol C of shoot (thin broad leaves = high)
 *  lightK     light level (jar units, 1 = decent window) where photosynthesis is half-saturated
 *  lightInh   light level where photoinhibition / leaf scorch begins
 *  tOpt/tWidth  temperature optimum and half-width (growth is zero at tOpt ± tWidth)
 *  tMinSafe/tMaxSafe  chilling / heat damage beyond these
 *  thWilt/thOpt  soil moisture (vol. fraction) where it wilts / is fully supplied
 *  floodSens  root-rot speed in waterlogged soil
 *  transp     transpiration, ml per mmol shoot per day per kPa of vapour pressure deficit
 *  ph         [lo, optLow, optHigh, hi] soil pH range for growth
 *  susF/susR  susceptibility to leaf grey mold / root-and-stem-base rot (1 = average)
 *  rootRatio  target root:shoot carbon ratio
 *  rootInit   how fast a cutting grows roots (per day)
 *  spaceUse   how much jar space a mmol of shoot takes (crowding)
 *  heightK    how tall it grows (decides who shades whom)
 *  moss       true: no roots, water from humid air, dormant when dry (see the model's plant section)
 *  droughtTol scales damage from drying (default 1); toxK scales sulfide damage; nutK scales nutrient half-saturation;
 *  rgr/kGrow  maximum relative growth rate and reserve-to-growth rate (defaults 0.2 / 0.5)
 */
(function (root) {
  'use strict';
  const Terra = (root.Terra = root.Terra || {});

  Terra.species = {
    generic: {
      name: 'Jar plant (generic)', short: 'Plant', start: 6,
      aMax: 3.4, kCanopy: 0.12, lightK: 0.5, lightInh: 4, tOpt: 24, tWidth: 14, tMinSafe: 8, tMaxSafe: 34,
      rpS: 0.03, rpR: 0.02, senBase: 0.012, senRoot: 0.01, thWilt: 0.08, thOpt: 0.20, floodSens: 1,
      transp: 0.10, ph: [4.0, 5.5, 7.5, 8.8], susF: 1.0, susR: 1.0, rootRatio: 0.3, rootInit: 0.01, spaceUse: 1, heightK: 1,
      leaf: [70, 170, 80], vein: null, style: 'generic',
      note: 'A tolerant all-rounder, used for the balanced reference jar.',
    },
    fittonia: {
      name: 'Fittonia (nerve plant)', short: 'Fittonia', start: 3,
      aMax: 2.2, kCanopy: 0.18, lightK: 0.25, lightInh: 2.4, tOpt: 24, tWidth: 12, tMinSafe: 15, tMaxSafe: 30,
      rpS: 0.035, rpR: 0.025, senBase: 0.015, senRoot: 0.012, thWilt: 0.12, thOpt: 0.27, floodSens: 1.3,
      transp: 0.15, ph: [4.5, 5.5, 6.8, 7.8], susF: 1.1, susR: 1.3, rootRatio: 0.25, rootInit: 0.012, spaceUse: 1.2, heightK: 0.45,
      leaf: [58, 120, 66], vein: [235, 120, 160], style: 'rosette',
      note: 'Rainforest understory: loves humidity and low light, wilts fast when dry, hates cold and soggy soil.',
    },
    pothos: {
      name: 'Pothos (vine)', short: 'Pothos', start: 4,
      aMax: 3.8, kCanopy: 0.10, lightK: 0.4, lightInh: 4.5, tOpt: 25, tWidth: 14, tMinSafe: 12, tMaxSafe: 35,
      rpS: 0.03, rpR: 0.02, senBase: 0.010, senRoot: 0.010, thWilt: 0.06, thOpt: 0.18, floodSens: 0.8,
      transp: 0.11, ph: [4.5, 5.5, 7.0, 8.0], susF: 0.7, susR: 0.8, rootRatio: 0.3, rootInit: 0.02, spaceUse: 1, heightK: 1.3,
      leaf: [86, 168, 70], vein: [200, 215, 90], style: 'vine',
      note: 'Tough, fast, roots easily from cuttings, and will happily outgrow and shade out a small jar.',
    },
    moss: {
      name: 'Moss (cushion / sheet, generic)', short: 'Moss', start: 4, moss: true,
      // Shade-adapted (saturates at roughly 100-300 umol), cool optimum (~15-20 C), no roots (rhizoids only: it drinks through its
      // leaves, so humidity decides its water, not the soil), dries out and goes dormant instead of dying, dies of heat and of
      // sitting under water. Growth rate is a guess: mosses are slow.
      aMax: 1.0, kCanopy: 0.2, lightK: 0.3, lightInh: 2.5, tOpt: 18, tWidth: 12, tMinSafe: -5, tMaxSafe: 26,
      rpS: 0.012, rpR: 0.01, senBase: 0.004, senRoot: 0.01, thWilt: 0.05, thOpt: 0.15, floodSens: 0,
      transp: 0, ph: [3.8, 4.8, 6.5, 8.0], susF: 0.9, susR: 0.1, rootRatio: 0.05, rootInit: 0.01, spaceUse: 0.25, heightK: 0.08,
      droughtTol: 0.08, toxK: 0.3, nutK: 0.3, rgr: 0.03, kGrow: 0.15,
      leaf: [60, 150, 60], vein: null, style: 'moss',
      note: 'No roots: it drinks from the humid air. Likes shade, cool and damp; yellows in strong light, heat or dryness; rots if submerged.',
    },
  };
  Terra.speciesOrder = ['generic', 'fittonia', 'pothos', 'moss'];
})(typeof globalThis !== 'undefined' ? globalThis : this);
