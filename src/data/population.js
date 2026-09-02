/**
 * Read-only hinterland pressure for the population paint layer.
 * Lives in data so the renderer does not import generators.
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
