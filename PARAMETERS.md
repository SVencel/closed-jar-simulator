# How real are the numbers?

The model is **mechanistic** (real processes, real units, conserved matter), but it is **not calibrated** against
measurements of any actual jar. Every constant below is tagged with how much I trust it. I wrote these from general
knowledge, not from looking up papers, so treat even the "literature range" ones as *plausible order of magnitude*,
not as citations.

| Tag | Meaning |
|---|---|
| **[P]** | Physics / chemistry / standard formula. Trust it. |
| **[L]** | Falls in the range commonly reported for this kind of system (typical textbook or horticulture value). |
| **[T]** | **Tuned**: chosen so the balanced jar behaves sensibly. No data behind it. The biggest source of error. |
| **[G]** | Educated guess. The qualitative effect is real, the number is made up. |

## Climate and physics
| Constant | Value | Tag | Note |
|---|---|---|---|
| Gas per litre of air | 41 mmol/L | P | ideal gas near room temperature |
| Saturation vapour pressure | Magnus formula | P | gives 19.4 g/m³ at 22 °C |
| Biological rate rise per 10 °C (Q10) | 2 | L | |
| Lamp heating of the sealed jar | 2.5 °C per unit of light | G | depends heavily on the lamp |
| Air / glass / soil temperature lag | 1.5 h / 1 h / 10 h | G | |
| Evaporation, condensation, venting rates | 0.4, 1.5, 2.0 per h | T | set so a sealed jar sits near 100 % RH and an open one near 60–70 % |
| Leaf temperature offset (dew timing) | +0.6·light by day, −1 °C at night | G | decides how long leaves stay wet |
| Room humidity (open lid) | 50 % | G | |
| Transpiration | ml per mmol shoot per day per kPa | T | species values 0.10–0.15 |
| Water carried out through an open lid (`kOpen`) | 10 ml/day for a fully open lid into 0 % humidity air, so about 5 ml/day at 50 % room humidity | G | real value depends on the opening size and the room; a few ml/day for a 3 L jar is typical |
| Capillary fringe above a full drainage layer | 8–33 % of the soil depth saturated (more in fine soil) | G | why a full drainage layer is not harmless |

## Soil, water and gases
| Constant | Value | Tag | Note |
|---|---|---|---|
| Field capacity / saturation by texture | 0.18–0.42 / 0.40–0.58 (volume fraction) | L | sand to clay / peat |
| Drainage layer porosity (LECA / gravel) | 0.45 | L | |
| Drainage and capillary rise rates | 3.0–0.6 /day; 0.08 of soil/day | G | |
| pH buffering capacity | ~9 mmol per pH unit for default soil | G | |
| Soil gas diffusion (O₂ supply, CO₂ release) | 3 mmol/day, 1.5e-4 mmol/day/ppm at 25 % air-filled | T | decides when soil goes anoxic |
| Soil CO₂ effect on pH | −0.35 pH per tenfold CO₂ | G | |
| Phosphorus availability vs pH | 15 % to 75 %, best pH 6–7.2 | L (shape) / G (numbers) | |

## Stoichiometry (how much N, P, K each pool holds per carbon)
| Pool | C:N | C:P | Tag |
|---|---|---|---|
| Plant tissue | 18 | 450 (C:K 60) | L |
| Fresh litter | 30 | 700 | L |
| Humus | 15 | 120 | L |
| Bacteria / fungi | 5 / 10 | 60 / 150 | L |
| Nematodes, springtails, mites | 5 | 100 | L |

Nutrients only recycle (no mineral weathering, no leaching out, no fixing except a tiny amount of free-living N₂ fixation).

## Decomposers and soil animals
| Constant | Value | Tag | Note |
|---|---|---|---|
| Growth efficiency: bacteria / fungi / anaerobes | 0.40 / 0.45 / 0.12 | L | |
| Uptake rates, half-saturations, death rates | see `K` in model.js | **T** | all of them |
| Humification (litter → humus) | 2 % | T | real soils 5–20 %; lowered so a sealed jar doesn't lock all its carbon away |
| Humus decomposition (fungi / bacteria) | 0.027 / 0.005 per day per biomass | T | balanced against humus formation |
| Dormant floors (spores, cysts) | 0.001–0.002 mmol C | G | so populations can restart |
| Animal mass: springtail / nematode / mite | 7 / 0.5 / 12 µg C | L | about right for each |
| Feeding rates, assimilation 0.3, respiration 0.2–0.25 | | T (rates) / L (efficiencies) | |
| Springtail and mite humidity needs | springtails need > 80 % RH; mites > 70 % | L (qualitative) | |
| Hydrogen sulfide toxicity | 50 µmol/L is "fully toxic" | G | order of magnitude only |
| Anaerobic chemistry | 2 CH₂O → CH₄ + CO₂; 2 CH₂O + SO₄ → 2 CO₂ + H₂S | P | rates T/G |

## Plants
| Constant | Value | Tag | Note |
|---|---|---|---|
| CO₂ compensation point | ~50 ppm | L | |
| Photosynthesis capacity, light response, canopy (`aMax`, `kCanopy`, `lightK`) | | **T** | relative units; 1 light ≈ 100 µmol/m²/s |
| Maintenance respiration | 2–3.5 %/day (shoot) | L | |
| Growth respiration | 20 % | L | |
| Root : shoot target | 0.25–0.3 | L | |
| Sugar-reserve feedback, growth rate caps | | G | |
| Jar capacity before crowding | 16 mmol C shoot (3 L jar) | G | |
| **Species traits** (temperature, pH, light, wilting point, disease susceptibility) | see `species.js` | approx. horticulture knowledge | Fittonia: ≥ 15 °C, humid, low light. Pothos: tough and fast. Not measured |
| Cutting callus period | 5 days, roots ramp up over 10 | G | |

## Seasons and window light
| Constant | Value | Tag | Note |
|---|---|---|---|
| Day length and sun geometry | astronomical formulas for the latitude | P | Budapest: 8.2 h in December, 15.8 h in June |
| Clear-sky fraction (cloudiness) | 0.30 in winter, 0.50 in summer | L | tuned so Budapest gives ~0.8 kWh/m²/day in December and ~5.7 in June (matches what I found for the region: roughly 1.1–1.2 and 5.6–5.9 on a tilted panel, so lower on the flat) |
| Photosynthetically active share of sunlight | 45 % | L | |
| **Share of outdoor light that reaches the jar** (`windowShare`) | 0.18 | **G**, anchored to lux ranges | about 1,900 lux in winter and 7,300 in summer, inside the 1,000–2,000 / 5,000–10,000 lux ranges quoted for a window. Measure your own: ≈ 54 lux per µmol for daylight |
| Room temperature cycle | sinusoid, coldest ~20 January, between your winter and summer values | G | the daily swing comes on top |
| **Sun heating of the jar** (`sunHeat`) | 1.0 × the lamp value (2.5 °C per 100 µmol) | **G, and the most important number in the seasons** | at 1.0 the jar air peaks at ~31 °C on a July afternoon (room 26.5). Half a degree here decides whether springtails and moss survive the summer |
| Springtail heat limit | 28 °C (mortality rises above it) | G | |

Sensitivity (tested): with window light and seasons, a jar survives or dies depending mainly on the jar-air summer peak
and the grey-mold rate. Changing any one of sun heating, the springtail heat limit or the mold rate lets the generic
plant and fittonia survive three years. So **please calibrate the summer peak temperature with a thermometer in a real jar**.

## Moss
Mosses are not small vascular plants. The model treats them differently: **no roots** (rhizoids only), water from the humid air and
dew instead of the soil, **dormant when dry** (respiration drops, little damage), no transpiration, drowned only by a flooded surface.

| Constant | Value | Tag | Note |
|---|---|---|---|
| Light: half-saturation / photoinhibition | 30 / 250 µmol m⁻² s⁻¹ (light units 0.3 / 2.5) | L (shade mosses saturate at roughly 100–300 µmol) | exact shape G |
| Temperature optimum / limit | 18 °C, zero growth at 6 and 30 °C, heat damage above 26 °C | L (qualitative: low optimum, heat is a main limit) / G (numbers) | |
| Photosynthesis capacity (`aMax`) | 1.0 vs 3.4 for the generic plant | G | mosses photosynthesise at a fraction of leaf rates per area |
| Maintenance respiration | 1.2 %/day | G | |
| Relative growth rate cap | 3 %/day of biomass | **G** | no data found; mosses are slow |
| Drought damage | 8 % of a vascular plant's | G | desiccation tolerance is real, how long varies a lot by species |
| pH range | 3.8–8.0, best 4.8–6.5 | L | |
| Nutrient needs | 30 % of a vascular plant's half-saturation | G | |
| What makes it yellow | strong light, heat above 26 °C, dryness, low pH extremes, grey mold | L (qualitative) | |

## Diseases
| Constant | Tag | Note |
|---|---|---|
| Grey mold needs wet leaves, mild temperature (14–24 °C best), still air | L (qualitative) | rates G |
| Root / stem-base rot needs waterlogging and warmth (22–30 °C best) | L (qualitative) | rates G |
| Springtails reduce spore load | L (qualitative) | strength G |

## What is NOT modelled
Algae on the glass and moss, insects (fungus gnats, spider mites), mycorrhizae and symbiotic nitrogen fixers,
nutrient leaching and salt build-up, micronutrients (Ca, Mg, Fe), mineral weathering, light colour and photoperiod
effects on plants, springtail life stages and reproduction delay, vertical gradients inside the soil, soil structure and
compaction, dissolved organic carbon, ethylene and plant hormones, humic acids.

## How to make it real
Log a real jar (photos, weights, plant size, springtail counts, a CO₂ / O₂ sensor if possible), then fit the **[T]** and
**[G]** values to match. The simulation is fast (a simulated year takes about 50 ms), so fitting is feasible.
