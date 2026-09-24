/**
 * Climate: latitude belts + elevation lapse (Patel / Whittaker),
 * continentality from distance to the sea, moisture from orographic rain
 * and river proximity, rain-shadow from prevailing wind (Turner).
 *
 * The upwind walk is capped and bails once the shadow is saturated, so a
 * finer mesh does not do more work per cell than a coarse one.
 */

import { BIOMES } from "../data/catalogs.js";
import { latitudeBand, circulationWind } from "../data/climate.js";

/**
 * Graph hops from the nearest ocean cell. -1 when the map has no ocean.
 * @param {import("../types.js").Cell[]} cells
 */
function distanceFromOcean(cells) {
  const dist = new Int32Array(cells.length);
  dist.fill(-1);
  /** @type {number[]} */
  const q = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].ocean) {
      dist[i] = 0;
      q.push(i);
    }
  }
  let h = 0;
  while (h < q.length) {
    const id = q[h++];
    const next = dist[id] + 1;
    for (const nid of cells[id].neighbors) {
      if (dist[nid] >= 0) continue;
      dist[nid] = next;
      q.push(nid);
    }
  }
  return dist;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} height
 * @param {{ x: number, y: number }} wind
 * @param {number} [width]
 */
export function assignClimate(cells, height, wind, width) {
  const userWind = wind || { x: 1, y: 0 };
  const span = Math.hypot(width || height * 1.6, height);
  const stepLen = Math.max(16, span * 0.016);
  const nSteps = Math.min(12, Math.max(7, Math.round(span / 260)));
  const fromSea = distanceFromOcean(cells);
  const mapH = height || 1;

  /** Walk upwind; tall ridges steal moisture. Length scales with map span. */
  for (const cell of cells) {
    const lat = 1 - cell.y / mapH; // 1 = north poleward, 0 = south/tropics
    const lapse = Math.max(0, cell.height) * 0.55;
    let temperature = 1 - lat * 0.85 - lapse;
    if (cell.ocean) temperature += 0.04;
    const hops = fromSea[cell.id];
    const inland = hops < 0 ? 0 : Math.min(1, hops / 16);
    const maritime = 1 - inland;
    temperature = temperature * (1 - 0.16 * maritime) + 0.52 * 0.16 * maritime;
    cell.temperature = temperature;
    cell.tempRange = (0.06 + lat * 0.2) * (0.3 + inland * 0.7);

    if (cell.ocean) {
      cell.precipitation = 1;
      cell.moisture = 1;
      continue;
    }

    const flow = circulationWind(lat, userWind);
    let shadow = 0;
    let x = cell.x;
    let y = cell.y;
    let id = cell.id;
    for (let step = 0; step < nSteps; step++) {
      if (shadow > 1.35) break;
      x -= flow.x * stepLen;
      y -= flow.y * stepLen;
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
    let precip = latitudeBand(lat) + orographic - shadow * 0.55 - inland * 0.2;
    if (cell.coast) precip = Math.max(precip, 0.32);
    cell.precipitation = Math.max(0.04, Math.min(1, precip));
    cell.moisture = cell.precipitation;
  }
}

/**
 * Freshwater floor, then a few neighbor passes.
 * Call this after rivers exist: the floor reads `riverId`, and biomes should
 * be stamped from the moisture that results.
 * @param {import("../types.js").Cell[]} cells
 */
export function spreadMoisture(cells) {
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
