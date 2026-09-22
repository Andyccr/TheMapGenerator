/**
 * Read-only hinterland pressure and burg population estimates.
 * Lives in data so the renderer and App do not import generators.
 */

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 */
export function hinterlandPressure(cell, world) {
  if (cell.ocean || cell.lake) return 0;
  const towns = world.settlements || [];
  if (!towns.length) return Math.max(0, cell.moisture) * 0.15;
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
