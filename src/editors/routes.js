/**
 * Draw one extra road / trail / sea lane between two existing towns.
 * Pathfinding is the generator primitive; this module is the editor mutation.
 */
import { pathfind } from "../generators/routes.js";
import { chaikin } from "../util/geometry.js";

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} fromId
 * @param {number} toId
 * @param {"road"|"sea"|"trail"} [kind]
 * @returns {import("../types.js").Route | null}
 */
export function addRouteBetween(world, fromId, toId, kind = "road") {
  if (fromId === toId) return null;
  const a = world.settlements.find((s) => s.id === fromId);
  const b = world.settlements.find((s) => s.id === toId);
  if (!a || !b) return null;
  const dup = (world.routes || []).some(
    (r) => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId),
  );
  if (dup) return null;
  const pathKind = kind === "sea" ? "sea" : "road";
  const path = pathfind(world.cells, a.cellId, b.cellId, pathKind);
  if (!path || path.length < 2) return null;
  let routeKind = kind;
  if (kind !== "sea" && (a.type === "village" || b.type === "village")) routeKind = "trail";
  const points = chaikin(
    path.map((cid) => [world.cells[cid].x, world.cells[cid].y]),
    1,
  );
  if (!world.routes) world.routes = [];
  const id = world.routes.reduce((m, r) => Math.max(m, r.id), -1) + 1;
  const route = { id, kind: routeKind, fromId, toId, cellIds: path, points };
  world.routes.push(route);
  return route;
}
