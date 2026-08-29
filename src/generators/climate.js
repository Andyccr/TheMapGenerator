/**
 * Climate: latitude + elevation temperature (Amit Patel / Whittaker),
 * moisture from orographic rain and river proximity, rain-shadow from
 * prevailing wind (Scott Turner's wind-pattern explorations).
 */

const BIOMES = {
  OCEAN: "OCEAN",
  LAKE: "LAKE",
  ICE: "ICE",
  MARSH: "MARSH",
  BEACH: "BEACH",
  SNOW: "SNOW",
  TUNDRA: "TUNDRA",
  BARE: "BARE",
  SCORCHED: "SCORCHED",
  TAIGA: "TAIGA",
  SHRUBLAND: "SHRUBLAND",
  TEMPERATE_DESERT: "TEMPERATE_DESERT",
  TEMPERATE_RAIN_FOREST: "TEMPERATE_RAIN_FOREST",
  TEMPERATE_DECIDUOUS: "TEMPERATE_DECIDUOUS",
  GRASSLAND: "GRASSLAND",
  TROPICAL_RAIN_FOREST: "TROPICAL_RAIN_FOREST",
  TROPICAL_SEASONAL: "TROPICAL_SEASONAL",
  SUBTROPICAL_DESERT: "SUBTROPICAL_DESERT",
};

export { BIOMES };

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} height
 * @param {{ x: number, y: number }} wind
 * @param {number} [width]
 */
export function assignClimate(cells, height, wind, width) {
  const len = Math.hypot(wind.x, wind.y) || 1;
  const wx = wind.x / len;
  const wy = wind.y / len;
  const span = Math.hypot(width || height * 1.6, height);
  const stepLen = Math.max(16, span * 0.016);
  const nSteps = Math.min(18, Math.max(8, Math.round(span / 220)));

  /** Walk upwind; tall ridges steal moisture. Length scales with map span. */
  for (const cell of cells) {
    const lat = 1 - cell.y / height; // 1 = north poleward, 0 = south/tropics
    const lapse = Math.max(0, cell.height) * 0.55;
    cell.temperature = 1 - lat * 0.85 - lapse;
    if (cell.ocean) cell.temperature += 0.04;

    if (cell.ocean) {
      cell.precipitation = 1;
      cell.moisture = 1;
      continue;
    }

    let shadow = 0;
    let x = cell.x;
    let y = cell.y;
    let id = cell.id;
    for (let step = 0; step < nSteps; step++) {
      x -= wx * stepLen;
      y -= wy * stepLen;
      let next = -1;
      let best = 1e9;
      for (const nid of cells[id].neighbors) {
        const n = cells[nid];
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < best) {
          best = d;
          next = nid;
        }
      }
      if (next < 0 || next === id) break;
      id = next;
      const n = cells[id];
      if (n.ocean) {
        shadow *= 0.4;
        break;
      }
      shadow += Math.max(0, n.height - cell.height) * (n.mountain ? 1.6 : 1);
    }

    const orographic = Math.max(0, cell.height) * 0.35;
    cell.precipitation = Math.max(0.05, 0.72 + orographic - shadow * 0.55);
  }

  // Moisture spreads downhill and from fresh water (Patel's distance-to-river idea).
  for (const cell of cells) {
    if (cell.ocean) continue;
    cell.moisture = cell.precipitation;
    if (cell.lake) cell.moisture = Math.max(cell.moisture, 0.9);
    if (cell.riverId >= 0) cell.moisture = Math.max(cell.moisture, 0.75);
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const cell of cells) {
      if (cell.ocean) continue;
      let acc = cell.moisture;
      let w = 1;
      for (const nid of cell.neighbors) {
        const n = cells[nid];
        acc += n.moisture * 0.45;
        w += 0.45;
      }
      cell.moisture = Math.min(1, acc / w);
    }
  }
}

/**
 * Whittaker-style lookup with latitude already baked into temperature.
 * @param {import("../types.js").Cell} cell
 */
export function biomeFor(cell) {
  if (cell.ocean) return BIOMES.OCEAN;
  if (cell.lake) {
    if (cell.temperature < 0.18) return BIOMES.ICE;
    if (cell.height < 0.04) return BIOMES.MARSH;
    return BIOMES.LAKE;
  }
  if (cell.coast && cell.height < 0.12 && cell.temperature > 0.28) return BIOMES.BEACH;

  const t = cell.temperature;
  const m = cell.moisture;

  if (t < 0.18) {
    if (m > 0.5) return BIOMES.SNOW;
    if (m > 0.33) return BIOMES.TUNDRA;
    if (m > 0.16) return BIOMES.BARE;
    return BIOMES.SCORCHED;
  }
  if (t < 0.38) {
    if (m > 0.66) return BIOMES.TAIGA;
    if (m > 0.33) return BIOMES.SHRUBLAND;
    return BIOMES.TEMPERATE_DESERT;
  }
  if (t < 0.62) {
    if (m > 0.83) return BIOMES.TEMPERATE_RAIN_FOREST;
    if (m > 0.5) return BIOMES.TEMPERATE_DECIDUOUS;
    if (m > 0.16) return BIOMES.GRASSLAND;
    return BIOMES.TEMPERATE_DESERT;
  }
  if (m > 0.66) return BIOMES.TROPICAL_RAIN_FOREST;
  if (m > 0.33) return BIOMES.TROPICAL_SEASONAL;
  if (m > 0.16) return BIOMES.GRASSLAND;
  return BIOMES.SUBTROPICAL_DESERT;
}

/** @param {import("../types.js").Cell[]} cells */
export function assignBiomes(cells) {
  for (const c of cells) c.biome = biomeFor(c);
}
