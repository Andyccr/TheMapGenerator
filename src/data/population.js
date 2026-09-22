/**
 * Read-only hinterland pressure and burg population estimates.
 * Lives in data so the renderer and App do not import generators.
 */

/** @type {WeakMap<object, { key: number, values: Float32Array }>} */
const pressureFields = new WeakMap();

/**
 * One field per settlement layout. Later cells read it in constant time
 * instead of walking every town on every pixel.
 * @param {import("../types.js").WorldData} world
 */
function pressureField(world) {
  const towns = world.settlements || [];
  let key = towns.length;
  for (const s of towns) key = Math.imul(key, 33) + (s.cellId | 0) + (s.population | 0);
  const hit = pressureFields.get(world);
  if (hit && hit.key === key && hit.values.length === world.cells.length) return hit.values;

  const values = new Float32Array(world.cells.length);
  /** @type {{ x: number, y: number, pop: number }[]} */
  const sites = [];
  for (const s of towns) {
    const c = world.cells[s.cellId];
    if (c) sites.push({ x: c.x, y: c.y, pop: s.population || 400 });
  }
  for (let i = 0; i < world.cells.length; i++) {
    const cell = world.cells[i];
    if (cell.ocean || cell.lake) continue;
    let best = 0;
    for (const s of sites) {
      const d = Math.hypot(cell.x - s.x, cell.y - s.y);
      const inf = s.pop / (90 + d);
      if (inf > best) best = inf;
    }
    values[i] = best;
  }
  pressureFields.set(world, { key, values });
  return values;
}

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 */
export function hinterlandPressure(cell, world) {
  if (cell.ocean || cell.lake) return 0;
  const towns = world.settlements || [];
  if (!towns.length) return Math.max(0, cell.moisture) * 0.15;
  const values = pressureField(world);
  if (world.cells[cell.id] === cell) return values[cell.id] || 0;
  let best = 0;
  for (const s of towns) {
    const c = world.cells[s.cellId];
    if (!c) continue;
    const d = Math.hypot(cell.x - c.x, cell.y - c.y);
    const inf = (s.population || 400) / (90 + d);
    if (inf > best) best = inf;
  }
  return best;
}

/**
 * @param {import("../types.js").Cell} c
 * @param {string} type
 */
export function estimatePopulation(c, type) {
  const base = type === "capital" ? 14000 : type === "city" ? 6200 : type === "town" ? 1900 : 420;
  let m = 1 + c.moisture * 0.7;
  if (c.riverId >= 0) m *= 1.25;
  if (c.coast) m *= 1.18;
  if (c.biome.includes("DESERT")) m *= 0.7;
  if (c.tempRange > 0.25) m *= 0.92;
  return Math.max(80, Math.round(base * m));
}
