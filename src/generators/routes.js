/**
 * Overland roads and a few sea lanes between settlements.
 * Pathfinding is A* on the cell graph: mountains cost extra, rivers are cheap
 * corridors, ocean is impassable for roads.
 */
import { MinHeap } from "../util/heap.js";
import { chaikin } from "../util/geometry.js";

const IMPASSABLE = 1e9;

/**
 * @param {import("../types.js").Cell} cell
 * @param {"road"|"sea"} kind
 */
function stepCost(cell, kind) {
  if (kind === "sea") {
    if (cell.ocean) return 1;
    if (cell.coast) return 0.85;
    if (cell.lake) return 1.4;
    return IMPASSABLE;
  }
  if (cell.ocean) return IMPASSABLE;
  if (cell.lake) return 2.4;
  if (cell.mountain) return 3.6;
  if (cell.height > 0.38) return 1.9;
  if (cell.riverId >= 0) return 0.62;
  if (cell.coast) return 0.85;
  return 1;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} start
 * @param {number} goal
 * @param {"road"|"sea"} kind
 * @returns {number[] | null}
 */
export function pathfind(cells, start, goal, kind) {
  if (start === goal) return [start];
  const heap = new MinHeap();
  const gScore = new Float64Array(cells.length);
  const prev = new Int32Array(cells.length);
  gScore.fill(Infinity);
  prev.fill(-1);
  const goalCell = cells[goal];
  gScore[start] = 0;
  heap.push(start, 0);
  let steps = 0;
  const maxSteps = Math.min(cells.length, 14000);

  while (heap.size && steps++ < maxSteps) {
    const popped = heap.pop();
    if (!popped) break;
    const id = popped.item;
    if (id === goal) break;
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      const step = stepCost(n, kind);
      if (step >= IMPASSABLE) continue;
      const next = gScore[id] + step;
      if (next < gScore[nid]) {
        gScore[nid] = next;
        prev[nid] = id;
        const h = Math.hypot(n.x - goalCell.x, n.y - goalCell.y) / 18;
        heap.push(nid, next + h);
      }
    }
  }
  if (prev[goal] < 0 && start !== goal) return null;
  const path = [];
  let id = goal;
  let guard = 0;
  while (id >= 0 && guard++ < 8000) {
    path.push(id);
    if (id === start) break;
    id = prev[id];
  }
  if (path[path.length - 1] !== start) return null;
  path.reverse();
  return path;
}

const RANK = { capital: 4, city: 3, town: 2, village: 1 };

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {() => number} rng
 */
export function placeRoutes(cells, settlements, rng) {
  /** @type {import("../types.js").Route[]} */
  const routes = [];
  if (settlements.length < 2) return routes;
  const seen = new Set();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const candidates = (s) => {
    const a = cells[s.cellId];
    return settlements
      .filter((o) => o.id !== s.id)
      .map((o) => {
        const b = cells[o.cellId];
        return { o, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2, rank: RANK[o.type] || 1 };
      })
      .sort((p, q) => p.d - q.d);
  };

  const want = (s) => {
    if (s.type === "capital") return 3;
    if (s.type === "city") return 2;
    if (s.type === "town") return 1;
    return rng() < 0.45 ? 1 : 0;
  };

  for (const s of settlements) {
    const nWant = want(s);
    if (!nWant) continue;
    let added = 0;
    for (const cand of candidates(s)) {
      if (added >= nWant) break;
      if (RANK[s.type] > cand.rank + 1 && s.type !== "village") {
        /* prefer linking up the hierarchy, but still allow peers */
      }
      const k = key(s.id, cand.o.id);
      if (seen.has(k)) {
        added += 1;
        continue;
      }
      const a = cells[s.cellId];
      const b = cells[cand.o.cellId];
      const coastal = a.coast && b.coast;
      const far = cand.d > 220 * 220;
      let kind = "road";
      if (s.type === "village" || cand.o.type === "village") kind = "trail";
      let path = pathfind(cells, s.cellId, cand.o.cellId, "road");
      if ((!path || path.length < 2) && coastal) {
        path = pathfind(cells, s.cellId, cand.o.cellId, "sea");
        kind = "sea";
      } else if (coastal && far && rng() < 0.55) {
        const sea = pathfind(cells, s.cellId, cand.o.cellId, "sea");
        if (sea && sea.length + 4 < (path?.length || 1e9)) {
          path = sea;
          kind = "sea";
        }
      }
      if (!path || path.length < 2) continue;
      seen.add(k);
      added += 1;
      const points = chaikin(
        path.map((cid) => [cells[cid].x, cells[cid].y]),
        1,
      );
      routes.push({
        id: routes.length,
        kind,
        fromId: s.id,
        toId: cand.o.id,
        cellIds: path,
        points,
      });
    }
  }
  return routes;
}

/**
 * Draw one extra road / trail / sea lane between two existing towns.
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
