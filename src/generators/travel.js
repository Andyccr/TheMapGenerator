/**
 * Party travel on the cell graph. Roads are cheap corridors; ocean is
 * impassable on a march. A coastal pair may instead take the sea lane when
 * that chronicle is clearly faster.
 */
import { MinHeap } from "../util/heap.js";
import { pathfind } from "./routes.js";
import { chronicle, corridorMask } from "../data/journeys.js";

const IMPASSABLE = 1e9;

/**
 * @param {import("../types.js").Cell} cell
 * @param {number} rank
 */
function marchStep(cell, rank) {
  if (!cell || cell.ocean) return IMPASSABLE;
  if (rank >= 2) return 0.48;
  if (rank === 1) return 0.72;
  if (cell.lake) return 2.6;
  if (cell.mountain) return 4.4;
  if (cell.height > 0.42) return 2.2;
  if (cell.riverId >= 0) return 0.8;
  return 1;
}

/**
 * Overland A* that prefers road and trail cells.
 * @param {import("../types.js").Cell[]} cells
 * @param {Uint8Array} mask
 * @param {number} start
 * @param {number} goal
 * @returns {number[] | null}
 */
export function marchPath(cells, mask, start, goal) {
  if (start === goal) return [start];
  const goalCell = cells[goal];
  const startCell = cells[start];
  if (!goalCell || !startCell || goalCell.ocean || startCell.ocean) return null;
  const heap = new MinHeap();
  const gScore = new Float64Array(cells.length);
  const prev = new Int32Array(cells.length);
  const closed = new Uint8Array(cells.length);
  gScore.fill(Infinity);
  prev.fill(-1);
  gScore[start] = 0;
  heap.push(start, 0);
  let hop = 18;
  const near = startCell.neighbors?.[0];
  if (near != null && cells[near]) {
    hop = Math.max(4, Math.hypot(startCell.x - cells[near].x, startCell.y - cells[near].y));
  }
  const hScale = 0.4 / hop;
  let steps = 0;

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const id = popped.item;
    if (closed[id]) continue;
    closed[id] = 1;
    if (++steps > cells.length) break;
    if (id === goal) break;
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      const step = marchStep(n, mask[nid] || 0);
      if (step >= IMPASSABLE) continue;
      const next = gScore[id] + step;
      if (next < gScore[nid]) {
        gScore[nid] = next;
        prev[nid] = id;
        const h = Math.hypot(n.x - goalCell.x, n.y - goalCell.y) * hScale;
        heap.push(nid, next + h);
      }
    }
  }
  if (prev[goal] < 0 && start !== goal) return null;
  const path = [];
  let id = goal;
  let guard = 0;
  while (id >= 0 && guard++ < cells.length + 2) {
    path.push(id);
    if (id === start) break;
    id = prev[id];
  }
  if (path[path.length - 1] !== start) return null;
  path.reverse();
  return path;
}

/**
 * Pick a march or a voyage, whichever the chronicle says is faster.
 * Near-ties stay on land.
 * @param {import("../types.js").WorldData} world
 * @param {number} from
 * @param {number} to
 * @returns {{ cellIds: number[], mode: "march" | "voyage" } | null}
 */
export function planLeg(world, from, to) {
  if (from === to) return null;
  const cells = world.cells;
  const a = cells[from];
  const b = cells[to];
  if (!a || !b) return null;
  const land = a.ocean || b.ocean ? null : marchPath(cells, corridorMask(world), from, to);
  const seaOk = (a.ocean || a.coast) && (b.ocean || b.coast);
  const sea = seaOk ? pathfind(cells, from, to, "sea", cells.length) : null;
  if ((!land || land.length < 2) && (!sea || sea.length < 2)) return null;
  if (!sea || sea.length < 2) return { cellIds: /** @type {number[]} */ (land), mode: "march" };
  if (!land || land.length < 2) return { cellIds: sea, mode: "voyage" };
  const landDays = chronicle(world, land).days;
  const seaDays = chronicle(world, sea).days;
  if (seaDays + 0.5 < landDays) return { cellIds: sea, mode: "voyage" };
  return { cellIds: land, mode: "march" };
}
