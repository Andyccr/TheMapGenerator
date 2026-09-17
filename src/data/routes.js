/**
 * Plain-JSON helpers for the road network. Pathfinding stays in generators;
 * dropping invalid or erased routes is a save-file consistency pass.
 */

/**
 * Drop every route whose path includes this cell (the erase tool's road click).
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @returns {number} how many routes were removed
 */
export function removeRoutesThrough(world, cellId) {
  const before = world.routes?.length || 0;
  if (!before) return 0;
  world.routes = world.routes.filter((r) => !r.cellIds.includes(cellId));
  return before - world.routes.length;
}

/**
 * Drop routes whose endpoints no longer exist. Does not regenerate the network,
 * so GM-drawn roads between remaining towns stay put.
 * @param {import("../types.js").WorldData} world
 */
export function pruneRoutes(world) {
  const ids = new Set((world.settlements || []).map((s) => s.id));
  const before = world.routes?.length || 0;
  world.routes = (world.routes || []).filter((r) => ids.has(r.fromId) && ids.has(r.toId));
  return before - world.routes.length;
}
