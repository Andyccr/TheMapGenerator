/**
 * Hydrology after Martin O'Leary and Amit Patel:
 * 1. Classify ocean as water connected to the map border.
 * 2. Priority-flood depressions so every land cell drains to the sea (Planchon–Darboux / Barnes).
 * 3. Route flow downhill; accumulate flux; rivers never climb and therefore never cross ridges.
 * 4. Remaining filled basins become lakes.
 */
import { MinHeap } from "../util/heap.js";
import { chaikin } from "../util/geometry.js";

/**
 * @param {import("../types.js").Cell[]} cells
 */
export function classifyOceanAndCoast(cells) {
  for (const c of cells) {
    c.ocean = false;
    c.lake = false;
    c.coast = false;
  }

  const queue = [];
  const seen = new Uint8Array(cells.length);
  for (const c of cells) {
    if (c.border && c.height < 0) {
      queue.push(c.id);
      seen[c.id] = 1;
      c.ocean = true;
    }
  }
  let qh = 0;
  while (qh < queue.length) {
    const id = queue[qh++];
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      if (seen[nid]) continue;
      if (cells[nid].height < 0) {
        seen[nid] = 1;
        cells[nid].ocean = true;
        queue.push(nid);
      }
    }
  }

  for (const c of cells) {
    if (c.ocean) continue;
    c.coast = c.neighbors.some((nid) => cells[nid].ocean);
  }
}

/**
 * Closed basins that had to be filled become lakes. Tiny one-cell puddles stay land.
 * @param {import("../types.js").Cell[]} cells
 */
export function markLakesFromFill(cells) {
  for (const c of cells) {
    if (c.ocean) continue;
    c.lake = c.filledHeight - c.height > 0.018;
  }
  for (const c of cells) {
    if (!c.lake) continue;
    const lakeN = c.neighbors.filter((id) => cells[id].lake).length;
    if (lakeN === 0 && c.filledHeight - c.height < 0.05) c.lake = false;
  }
  for (const c of cells) {
    if (c.ocean) continue;
    c.coast = c.neighbors.some((nid) => cells[nid].ocean);
  }
}

/**
 * Barnes priority-flood. `filledHeight` is a hydrologically correct surface.
 * @param {import("../types.js").Cell[]} cells
 */
export function fillDepressions(cells) {
  const heap = new MinHeap();
  const closed = new Uint8Array(cells.length);
  for (const c of cells) {
    c.filledHeight = c.height;
    if (c.ocean || c.border) {
      heap.push(c.id, c.height);
      closed[c.id] = 1;
    }
  }
  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const cell = cells[popped.item];
    for (const nid of cell.neighbors) {
      if (closed[nid]) continue;
      closed[nid] = 1;
      const n = cells[nid];
      n.filledHeight = Math.max(n.height, cell.filledHeight + 1e-4);
      heap.push(nid, n.filledHeight);
    }
  }
}

/**
 * @param {import("../types.js").Cell[]} cells
 */
/**
 * One id per drainage basin. Ocean stays -1. Total work is O(cells).
 * @param {import("../types.js").Cell[]} cells
 */
export function assignBasins(cells) {
  const basin = new Int32Array(cells.length);
  basin.fill(-1);
  let next = 0;
  for (const start of cells) {
    if (start.ocean || basin[start.id] >= 0) continue;
    /** @type {number[]} */
    const path = [];
    let id = start.id;
    let guard = 0;
    while (id >= 0 && basin[id] < 0 && guard++ < cells.length) {
      path.push(id);
      const cell = cells[id];
      const n = cell.downslope;
      if (n < 0 || cells[n].ocean) break;
      id = n;
    }
    const inherited = id >= 0 && basin[id] >= 0 ? basin[id] : next++;
    for (const pid of path) basin[pid] = inherited;
  }
  for (const c of cells) c.basinId = c.ocean ? -1 : basin[c.id];
}

export function assignDownslope(cells) {
  for (const cell of cells) {
    if (cell.ocean) {
      cell.downslope = -1;
      continue;
    }
    let best = -1;
    let bestH = cell.filledHeight;
    for (const nid of cell.neighbors) {
      const h = cells[nid].filledHeight;
      if (h < bestH) {
        bestH = h;
        best = nid;
      }
    }
    cell.downslope = best;
  }
}

/**
 * Strahler order. Upstream cells are higher, so one descending sweep is enough.
 * @param {import("../types.js").Cell[]} cells
 * @returns {Int16Array}
 */
export function assignStreamOrder(cells) {
  const order = new Int16Array(cells.length);
  const land = [];
  for (const c of cells) {
    if (!c.ocean) land.push(c);
  }
  land.sort((a, b) => b.filledHeight - a.filledHeight);
  for (const c of land) {
    let max = 0;
    let second = 0;
    let any = false;
    for (const nid of c.neighbors) {
      if (cells[nid].downslope !== c.id) continue;
      any = true;
      const o = order[nid];
      if (o > max) {
        second = max;
        max = o;
      } else if (o > second) second = o;
    }
    if (!any) order[c.id] = 1;
    else order[c.id] = second === max && max > 0 ? max + 1 : Math.max(1, max);
  }
  return order;
}

/**
 * Mouth flux plus stream order. Wider downstream, still capped for the pen.
 * @param {number} flux
 * @param {number} order
 */
export function riverWidth(flux, order) {
  return Math.min(7.2, 0.42 + Math.log2(1 + Math.max(0, flux)) * 0.33 + Math.max(0, order - 1) * 0.22);
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {boolean} [usePrecip] weight flux by climate precipitation
 */
export function accumulateFlux(cells, usePrecip = false) {
  for (const c of cells) {
    if (c.ocean) {
      c.flux = 0;
      continue;
    }
    const rain = usePrecip ? Math.max(0.15, c.precipitation || 0.5) : 1;
    c.flux = rain * (1 + Math.max(0, c.height) * 0.8);
  }
  const order = cells
    .filter((c) => !c.ocean)
    .sort((a, b) => b.filledHeight - a.filledHeight);
  for (const cell of order) {
    if (cell.downslope >= 0) {
      cells[cell.downslope].flux += cell.flux;
    }
  }
}

/**
 * Extract river polylines from high-flux land cells.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} [threshold]
 * @returns {import("../types.js").River[]}
 */
export function extractRivers(cells, threshold = 14) {
  for (const c of cells) c.riverId = -1;
  /** @type {import("../types.js").River[]} */
  const rivers = [];
  const used = new Uint8Array(cells.length);

  const landFlux = cells.filter((c) => !c.ocean && !c.lake).map((c) => c.flux).sort((a, b) => a - b);
  const percentile = landFlux.length ? landFlux[Math.min(landFlux.length - 1, Math.floor(landFlux.length * 0.93))] : threshold;
  const cut = Math.max(2, percentile);

  const order = assignStreamOrder(cells);
  const sources = cells
    .filter((c) => !c.ocean && !c.lake && c.flux >= cut && c.downslope >= 0)
    .sort((a, b) => a.flux - b.flux);

  for (const src of sources) {
    if (used[src.id]) continue;
    const ups = src.neighbors.some(
      (nid) => cells[nid].downslope === src.id && cells[nid].flux >= cut && cells[nid].flux > src.flux,
    );
    if (ups) continue;

    /** @type {number[]} */
    const path = [];
    let id = src.id;
    let guard = 0;
    while (id >= 0 && guard++ < 8000) {
      const cell = cells[id];
      path.push(id);
      if (cell.ocean || cell.lake) break;
      if (cell.downslope < 0) break;
      const next = cells[cell.downslope];
      // Refuse to climb — extra safety beyond filledHeight routing.
      if (next.filledHeight > cell.filledHeight + 1e-6) break;
      id = cell.downslope;
    }
    if (path.length < 4) continue;

    const rid = rivers.length;
    for (const cid of path) {
      if (cells[cid].ocean) continue;
      used[cid] = 1;
      if (cells[cid].riverId < 0) cells[cid].riverId = rid;
    }
    const points = meander(
      chaikin(
        path.map((cid) => [cells[cid].x, cells[cid].y]),
        cells.length > 18000 ? 1 : 2,
      ),
      cells,
      path,
    );
    let mouth = 0;
    let mouthId = path[0];
    for (const cid of path) {
      if (cells[cid].ocean) continue;
      if (cells[cid].flux >= mouth) {
        mouth = cells[cid].flux;
        mouthId = cid;
      }
    }
    const width = riverWidth(mouth, order[mouthId] || 1);
    rivers.push({ id: rid, cellIds: path, points, width, name: "", order: order[mouthId] || 1 });
  }
  return rivers;
}

/**
 * Low-gradient reaches wander; steep ones stay in the thalweg.
 * Endpoints stay put so the mouth still meets the sea.
 * @param {number[][]} points
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} path
 */
function meander(points, cells, path) {
  if (points.length < 5) return points;
  const out = points.map((p) => [p[0], p[1]]);
  for (let i = 1; i < out.length - 1; i++) {
    const prev = out[i - 1];
    const next = out[i + 1];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = i / (out.length - 1);
    const ci = Math.min(path.length - 1, Math.round(t * (path.length - 1)));
    const c = cells[path[ci]];
    const ds = c?.downslope >= 0 ? cells[c.downslope] : null;
    const slope = ds ? Math.abs(c.height - ds.height) : 0.2;
    const amp = Math.max(0, 0.55 - slope * 4) * 3.2;
    const wave = Math.sin(i * 0.9 + path[0] * 0.17) * amp;
    out[i][0] += (-dy / len) * wave;
    out[i][1] += (dx / len) * wave;
  }
  return out;
}

/**
 * Mark mountains from local prominence so icons and settlement penalties agree.
 * @param {import("../types.js").Cell[]} cells
 */
export function markMountains(cells) {
  const land = cells.filter((c) => !c.ocean && !c.lake);
  if (!land.length) return;
  const heights = land.map((c) => c.height).sort((a, b) => a - b);
  const high = heights[Math.floor(heights.length * 0.78)];
  for (const c of cells) {
    if (c.ocean || c.lake) {
      c.mountain = false;
      continue;
    }
    let prominence = 0;
    for (const nid of c.neighbors) prominence += c.height - cells[nid].height;
    prominence /= Math.max(1, c.neighbors.length);
    c.mountain = c.height >= Math.max(0.36, high) && prominence > 0.012;
  }
}
