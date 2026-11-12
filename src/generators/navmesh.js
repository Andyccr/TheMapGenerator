/**
 * Coarse land navigation graph.
 *
 * Long roads are not searched on the full cell mesh. Sampled land cells plus
 * the terminals form a few thousand nodes; A* runs there, then each hop is
 * refined on the cell graph. Edges whose straight samples touch ocean are
 * never created, so a chord cannot skip a channel.
 */
import { MinHeap } from "../util/heap.js";

/**
 * @param {import("../types.js").Cell[]} cells
 */
export function siteSpacing(cells) {
  const a = cells[0];
  const b = a?.neighbors?.length ? cells[a.neighbors[0]] : null;
  if (!a || !b) return 12;
  return Math.max(3.5, Math.hypot(a.x - b.x, a.y - b.y));
}

/**
 * @param {import("../types.js").Cell} cell
 */
function sampleScore(cell) {
  let score = 1.4;
  if (cell.mountain) score -= 2.4;
  if (cell.height > 0.42) score -= 0.8;
  if (cell.riverId >= 0) score += 1.1;
  if (cell.coast) score += 0.35;
  return score;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} spacing
 */
function cellLookup(cells, spacing) {
  const inv = 1 / spacing;
  /** @type {Map<string, import("../types.js").Cell[]>} */
  const buckets = new Map();
  for (const cell of cells) {
    const key = `${Math.floor(cell.x * inv)},${Math.floor(cell.y * inv)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(cell);
  }
  const limit = spacing * spacing * 2.56;
  return (x, y) => {
    const gx = Math.floor(x * inv);
    const gy = Math.floor(y * inv);
    /** @type {import("../types.js").Cell | null} */
    let best = null;
    let bestD = limit;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = buckets.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const cell of bucket) {
          const d = (cell.x - x) ** 2 + (cell.y - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = cell;
          }
        }
      }
    }
    return best;
  };
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} terminalIds settlement (or other) cells that must be nodes
 */
export function buildRoadGraph(cells, terminalIds) {
  const spacing = siteSpacing(cells);
  let land = 0;
  for (const cell of cells) {
    if (!cell.ocean && !cell.lake) land += 1;
  }
  const target = Math.max(48, Math.min(2200, Math.round(Math.max(land, 1) / 16)));
  let stride = spacing * Math.sqrt(Math.max(land, 1) / target);
  stride = Math.max(spacing * 1.35, Math.min(spacing * 12, stride));

  /** @type {number[]} */
  const nodes = [];
  /** @type {Map<number, number>} */
  const index = new Map();
  const addNode = (id) => {
    if (index.has(id)) return index.get(id);
    const at = nodes.length;
    index.set(id, at);
    nodes.push(id);
    return at;
  };
  for (const id of terminalIds) {
    const cell = cells[id];
    if (cell && !cell.ocean) addNode(id);
  }

  /** @type {Map<string, number>} */
  const winners = new Map();
  const invStride = 1 / stride;
  for (const cell of cells) {
    if (cell.ocean || cell.lake) continue;
    const key = `${Math.floor(cell.x * invStride)},${Math.floor(cell.y * invStride)}`;
    const prev = winners.get(key);
    if (prev == null || sampleScore(cell) > sampleScore(cells[prev])) winners.set(key, cell.id);
  }
  for (const id of winners.values()) addNode(id);

  const lookup = cellLookup(cells, spacing);
  const linkR = stride * 1.72;
  const linkR2 = linkR * linkR;
  /** @type {Map<string, number[]>} */
  const hash = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const cell = cells[nodes[i]];
    const key = `${Math.floor(cell.x * invStride)},${Math.floor(cell.y * invStride)}`;
    let bucket = hash.get(key);
    if (!bucket) hash.set(key, (bucket = []));
    bucket.push(i);
  }

  /** @type {{ to: number, cost: number }[][]} */
  const edges = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < nodes.length; i++) {
    const a = cells[nodes[i]];
    const gx = Math.floor(a.x * invStride);
    const gy = Math.floor(a.y * invStride);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bucket = hash.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const b = cells[nodes[j]];
          const ex = a.x - b.x;
          const ey = a.y - b.y;
          const d2 = ex * ex + ey * ey;
          if (d2 < 1 || d2 > linkR2) continue;
          if (!segmentOnLand(lookup, a.x, a.y, b.x, b.y, spacing)) continue;
          const dist = Math.sqrt(d2);
          let factor = 1;
          if (a.mountain || b.mountain) factor *= 2.35;
          else if (a.height > 0.38 || b.height > 0.38) factor *= 1.4;
          if (a.riverId >= 0 || b.riverId >= 0) factor *= 0.84;
          const cost = dist * factor;
          edges[i].push({ to: j, cost });
          edges[j].push({ to: i, cost });
        }
      }
    }
  }

  return { nodes, edges, index, cells, spacing, stride };
}

/**
 * Samples along the segment must sit on land. Endpoints are allowed to be
 * coastal; open water in the middle rejects the chord.
 * @param {(x: number, y: number) => import("../types.js").Cell | null} lookup
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} spacing
 */
function segmentOnLand(lookup, ax, ay, bx, by, spacing) {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(3, Math.ceil(dist / (spacing * 0.7)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cell = lookup(ax + (bx - ax) * t, ay + (by - ay) * t);
    if (!cell || cell.ocean) return false;
    if (cell.lake && i !== 0 && i !== steps) return false;
  }
  return true;
}

/**
 * Connected components of the coarse graph, keyed by cell id.
 * Settlements in the same component share a land route.
 * @param {ReturnType<typeof buildRoadGraph>} graph
 * @returns {Map<number, number>}
 */
export function landComponents(graph) {
  const comp = new Int32Array(graph.nodes.length);
  comp.fill(-1);
  /** @type {number[]} */
  const stack = [];
  let count = 0;
  for (let i = 0; i < graph.nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const id = count++;
    stack.push(i);
    comp[i] = id;
    while (stack.length) {
      const node = stack.pop();
      for (const edge of graph.edges[node]) {
        if (comp[edge.to] >= 0) continue;
        comp[edge.to] = id;
        stack.push(edge.to);
      }
    }
  }
  /** @type {Map<number, number>} */
  const byCell = new Map();
  for (let i = 0; i < graph.nodes.length; i++) byCell.set(graph.nodes[i], comp[i]);
  return byCell;
}

/**
 * @param {ReturnType<typeof buildRoadGraph>} graph
 * @param {number} startId
 * @param {number} goalId
 * @returns {number[] | null} cell ids of the coarse nodes, including both ends
 */
export function searchGraph(graph, startId, goalId) {
  const start = graph.index.get(startId);
  const goal = graph.index.get(goalId);
  if (start == null || goal == null) return null;
  if (start === goal) return [startId];
  const { nodes, edges, cells } = graph;
  const goalCell = cells[goalId];
  const gScore = new Float64Array(nodes.length);
  gScore.fill(Infinity);
  const prev = new Int32Array(nodes.length);
  prev.fill(-1);
  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(start, 0);
  let guard = 0;
  const limit = nodes.length * 6;
  while (heap.size && guard++ < limit) {
    const popped = heap.pop();
    if (!popped) break;
    const id = popped.item;
    const here = cells[nodes[id]];
    const hHere = Math.hypot(here.x - goalCell.x, here.y - goalCell.y) * 0.84;
    if (popped.key > gScore[id] + hHere + 1e-6) continue;
    if (id === goal) break;
    for (const edge of edges[id]) {
      const next = gScore[id] + edge.cost;
      if (next >= gScore[edge.to]) continue;
      gScore[edge.to] = next;
      prev[edge.to] = id;
      const cell = cells[nodes[edge.to]];
      const h = Math.hypot(cell.x - goalCell.x, cell.y - goalCell.y) * 0.84;
      heap.push(edge.to, next + h);
    }
  }
  if (gScore[goal] === Infinity) return null;
  /** @type {number[]} */
  const path = [];
  let id = goal;
  let safety = 0;
  while (id >= 0 && safety++ <= nodes.length) {
    path.push(nodes[id]);
    if (id === start) break;
    id = prev[id];
  }
  if (path[path.length - 1] !== startId) return null;
  path.reverse();
  return path;
}
