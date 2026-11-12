/**
 * Overland roads and a few sea lanes between settlements.
 *
 * The network is planned by rank (trunk, primary, road, trail), the way a
 * low-zoom reference map generalizes highways. Search runs on the coarse
 * land graph in `navmesh.js`, then each hop is refined with A* on the cell
 * mesh. One scratch buffer is reused for every refinement, so a denser
 * settlement layer does not allocate a full distance field per road.
 */
import { MinHeap } from "../util/heap.js";
import { chaikin } from "../util/geometry.js";
import { buildRoadGraph, landComponents, searchGraph, siteSpacing } from "./navmesh.js";

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
 */
function makeScratch(cells) {
  const spacing = siteSpacing(cells);
  let maxEdge = spacing;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    for (let k = 0; k < cell.neighbors.length; k++) {
      const other = cells[cell.neighbors[k]];
      const dist = Math.hypot(cell.x - other.x, cell.y - other.y);
      if (dist > maxEdge) maxEdge = dist;
    }
  }
  return {
    n: cells.length,
    gScore: new Float64Array(cells.length),
    prev: new Int32Array(cells.length),
    seen: new Int32Array(cells.length),
    stamp: 0,
    heap: new MinHeap(),
    spacing,
    /** Admissible: cheapest road step divided by the longest neighbor edge. */
    hMul: 0.6 / maxEdge,
  };
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} start
 * @param {number} goal
 * @param {"road"|"sea"} kind
 * @param {number} [maxSteps]
 * @param {ReturnType<typeof makeScratch>} [scratch]
 * @returns {number[] | null}
 */
export function pathfind(cells, start, goal, kind, maxSteps = Math.min(cells.length, 14000), scratch = null) {
  if (start === goal) return [start];
  const goalCell = cells[goal];
  const startCell = cells[start];
  if (!goalCell || !startCell) return null;
  const sc = scratch && scratch.n === cells.length ? scratch : makeScratch(cells);
  if (sc.stamp >= 0x7ffffffe) {
    sc.seen.fill(0);
    sc.stamp = 1;
  } else {
    sc.stamp += 1;
  }
  const stamp = sc.stamp;
  sc.heap.clear();
  const touch = (id) => {
    if (sc.seen[id] === stamp) return;
    sc.seen[id] = stamp;
    sc.gScore[id] = Infinity;
    sc.prev[id] = -1;
  };
  touch(start);
  sc.gScore[start] = 0;
  sc.heap.push(start, 0);
  let steps = 0;
  const limit = maxSteps;
  const hMul = sc.hMul;

  while (sc.heap.size && steps < limit) {
    const popped = sc.heap.pop();
    if (!popped) break;
    const id = popped.item;
    if (sc.seen[id] !== stamp) continue;
    const g = sc.gScore[id];
    const cell = cells[id];
    const hHere = Math.hypot(cell.x - goalCell.x, cell.y - goalCell.y) * hMul;
    if (popped.key > g + hHere + 1e-7) continue;
    steps += 1;
    if (id === goal) break;
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      const step = stepCost(n, kind);
      if (step >= IMPASSABLE) continue;
      touch(nid);
      const next = g + step;
      if (next >= sc.gScore[nid]) continue;
      sc.gScore[nid] = next;
      sc.prev[nid] = id;
      const h = Math.hypot(n.x - goalCell.x, n.y - goalCell.y) * hMul;
      sc.heap.push(nid, next + h);
    }
  }
  if (sc.seen[goal] !== stamp || sc.gScore[goal] === Infinity) return null;
  /** @type {number[]} */
  const path = [];
  let id = goal;
  let guard = 0;
  while (id >= 0 && guard++ <= cells.length) {
    path.push(id);
    if (id === start) break;
    id = sc.prev[id];
  }
  if (path[path.length - 1] !== start) return null;
  path.reverse();
  return path;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} nodeIds
 * @param {ReturnType<typeof makeScratch>} scratch
 */
function refineHops(cells, nodeIds, scratch) {
  if (!nodeIds || nodeIds.length < 2) return null;
  /** @type {number[]} */
  const full = [nodeIds[0]];
  for (let i = 1; i < nodeIds.length; i++) {
    const a = nodeIds[i - 1];
    const b = nodeIds[i];
    if (a === b) continue;
    const dist = Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
    const hops = dist / scratch.spacing;
    const limit = Math.max(900, Math.min(1800, Math.ceil(hops * 12)));
    const hop = pathfind(cells, a, b, "road", limit, scratch);
    if (!hop || hop.length < 2) return null;
    for (let k = 1; k < hop.length; k++) full.push(hop[k]);
  }
  return full.length >= 2 ? full : null;
}

/**
 * @param {import("../types.js").Settlement[]} settlements
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement} origin
 * @param {(other: import("../types.js").Settlement) => boolean} pred
 */
function nearest(settlements, cells, origin, pred) {
  const a = cells[origin.cellId];
  /** @type {{ o: import("../types.js").Settlement, d2: number }[]} */
  const out = [];
  for (const other of settlements) {
    if (other.id === origin.id || !pred(other)) continue;
    const b = cells[other.cellId];
    if (!b) continue;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    out.push({ o: other, d2: dx * dx + dy * dy });
  }
  out.sort((p, q) => p.d2 - q.d2);
  return out;
}

/**
 * @param {import("../types.js").Cell[]} cells
 */
function extentSpan(cells) {
  let maxX = 0;
  let maxY = 0;
  const step = Math.max(1, (cells.length / 480) | 0);
  for (let i = 0; i < cells.length; i += step) {
    const cell = cells[i];
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  return Math.max(1, Math.hypot(maxX, maxY));
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {() => number} rng
 */
export function placeRoutes(cells, settlements, rng) {
  /** @type {import("../types.js").Route[]} */
  const routes = [];
  if (settlements.length < 2 || !cells.length) return routes;
  const graph = buildRoadGraph(
    cells,
    settlements.map((s) => s.cellId),
  );
  const land = landComponents(graph);
  const together = (a, b) => {
    const left = land.get(a.cellId);
    const right = land.get(b.cellId);
    return left != null && left === right;
  };
  const scratch = makeScratch(cells);
  const seen = new Set();
  /** @type {Map<number, number>} */
  const degree = new Map();
  /** @type {{ a: import("../types.js").Settlement, b: import("../types.js").Settlement, kind: "trunk"|"primary"|"road"|"trail"|"sea" }[]} */
  const links = [];
  const keyOf = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const add = (a, b, kind) => {
    if (!a || !b || a.id === b.id) return false;
    const key = keyOf(a.id, b.id);
    if (seen.has(key)) return false;
    seen.add(key);
    links.push({ a, b, kind });
    degree.set(a.id, (degree.get(a.id) || 0) + 1);
    degree.set(b.id, (degree.get(b.id) || 0) + 1);
    return true;
  };

  const capitals = settlements.filter((s) => s.type === "capital");
  const cities = settlements.filter((s) => s.type === "city");
  const towns = settlements.filter((s) => s.type === "town");
  const villages = settlements.filter((s) => s.type === "village");

  for (const place of capitals) {
    for (const peer of nearest(settlements, cells, place, (o) => o.type === "capital" && together(place, o)).slice(0, 3)) {
      add(place, peer.o, "trunk");
    }
    const city = nearest(settlements, cells, place, (o) => o.type === "city" && together(place, o))[0];
    if (city) add(place, city.o, "primary");
    const ferry = nearest(
      settlements,
      cells,
      place,
      (o) => o.type === "capital" && !together(place, o) && cells[place.cellId].coast && cells[o.cellId].coast,
    )[0];
    if (ferry && rng() < 0.7) add(place, ferry.o, "sea");
  }
  for (const place of cities) {
    const capital = nearest(settlements, cells, place, (o) => o.type === "capital" && together(place, o))[0];
    if (capital) add(place, capital.o, "primary");
    const peer = nearest(settlements, cells, place, (o) => o.type === "city" && together(place, o))[0];
    if (peer) add(place, peer.o, "primary");
  }
  for (const place of towns) {
    const hub = nearest(settlements, cells, place, (o) => (o.type === "city" || o.type === "capital") && together(place, o))[0];
    if (hub) add(place, hub.o, "road");
    const peer = nearest(settlements, cells, place, (o) => o.type === "town" && together(place, o))[0];
    if (peer && (!hub || peer.d2 < hub.d2 * 2.4)) add(place, peer.o, "road");
  }
  const reach2 = (extentSpan(cells) / 12) ** 2;
  for (const place of villages) {
    if (rng() > 0.72) continue;
    const hub = nearest(settlements, cells, place, (o) => o.type !== "village" && together(place, o))[0];
    if (hub && hub.d2 <= reach2) add(place, hub.o, "trail");
  }
  for (const place of settlements) {
    if (place.type === "village" || degree.get(place.id)) continue;
    const hub = nearest(settlements, cells, place, (o) => together(place, o))[0];
    if (hub) add(place, hub.o, place.type === "town" ? "road" : "primary");
  }

  for (const link of links) {
    const from = link.a.cellId;
    const to = link.b.cellId;
    const dist = Math.hypot(cells[from].x - cells[to].x, cells[from].y - cells[to].y);
    let path = null;
    let kind = link.kind;
    if (kind === "sea") {
      const seaLimit = Math.min(cells.length, Math.max(120, Math.ceil((dist / scratch.spacing) * 8)));
      path = pathfind(cells, from, to, "sea", seaLimit, scratch);
    } else {
      const coarse = searchGraph(graph, from, to);
      path = coarse ? refineHops(cells, coarse, scratch) : null;
      if (!path) {
        const limit = Math.min(cells.length, Math.max(600, Math.ceil((dist / scratch.spacing) * 24)));
        path = pathfind(cells, from, to, "road", limit, scratch);
      }
      const aCoast = cells[from]?.coast;
      const bCoast = cells[to]?.coast;
      if (aCoast && bCoast && (kind === "trunk" || kind === "primary")) {
        const landHops = path?.length || 1e9;
        if (landHops > (dist / scratch.spacing) * 2.8) {
          const seaLimit = Math.min(cells.length, Math.max(80, Math.ceil((dist / scratch.spacing) * 6)));
          const sea = pathfind(cells, from, to, "sea", seaLimit, scratch);
          if (sea && sea.length + 2 < landHops) {
            path = sea;
            kind = "sea";
          }
        }
      }
    }
    if (!path || path.length < 2) continue;
    routes.push({
      id: routes.length,
      kind,
      fromId: link.a.id,
      toId: link.b.id,
      cellIds: path,
      points: chaikin(
        path.map((cid) => [cells[cid].x, cells[cid].y]),
        2,
      ),
    });
  }
  return routes;
}
