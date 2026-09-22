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
/**
 * A road or trail that enters the ocean, or a sea lane that crosses inland,
 * is no longer a route the pathfinder would draw.
 * @param {import("../types.js").Route} route
 * @param {import("../types.js").Cell[] | undefined} cells
 */
function routeTerrainOk(route, cells) {
  if (!cells) return true;
  const sea = route.kind === "sea";
  for (const id of route.cellIds || []) {
    const c = cells[id];
    if (!c) return false;
    if (sea) {
      if (!c.ocean && !c.coast && !c.lake) return false;
    } else if (c.ocean) return false;
  }
  return true;
}

export function pruneRoutes(world) {
  const ids = new Set((world.settlements || []).map((s) => s.id));
  const before = world.routes?.length || 0;
  world.routes = (world.routes || []).filter(
    (r) => ids.has(r.fromId) && ids.has(r.toId) && routeTerrainOk(r, world.cells),
  );
  return before - world.routes.length;
}
