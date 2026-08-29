/**
 * Hydrology after Martin O'Leary and Amit Patel:
 * 1. Classify ocean as water connected to the map border.
 * 2. Priority-flood depressions so every land cell drains to the sea (Planchon–Darboux / Barnes).
 * 3. Route flow downhill; accumulate flux; rivers never climb and therefore never cross ridges.
 * 4. Remaining filled basins become lakes.
 */
import { MinHeap } from "../util/heap.js";

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
 * Precipitation seeds flux; high cells and windward slopes get more rain later.
 * This pass uses a uniform drizzle plus height so mountains still feed rivers.
 * @param {import("../types.js").Cell[]} cells
 */
export function accumulateFlux(cells) {
  for (const c of cells) {
    c.flux = c.ocean ? 0 : 1 + Math.max(0, c.height) * 0.8;
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
  const percentile = landFlux.length ? landFlux[Math.min(landFlux.length - 1, Math.floor(landFlux.length * 0.9))] : threshold;
  const cut = Math.max(3.2, Math.min(threshold, percentile));

  const sources = cells
    .filter((c) => !c.ocean && !c.lake && c.flux >= cut && c.downslope >= 0)
    .sort((a, b) => a.flux - b.flux);

  for (const src of sources) {
    if (used[src.id]) continue;
    // A source should not already be downstream of a bigger river cell.
    const ups = src.neighbors.some(
      (nid) => cells[nid].downslope === src.id && cells[nid].flux >= threshold && cells[nid].flux > src.flux,
    );
    if (ups) continue;

    /** @type {number[]} */
    const path = [];
    let id = src.id;
    let guard = 0;
    while (id >= 0 && guard++ < 4000) {
      const cell = cells[id];
      path.push(id);
      if (cell.ocean || cell.lake) break;
      if (cell.downslope < 0) break;
      const next = cells[cell.downslope];
      // Refuse to climb — extra safety beyond filledHeight routing.
      if (next.filledHeight > cell.filledHeight + 1e-6) break;
      id = cell.downslope;
    }
    if (path.length < 2) continue;

    const rid = rivers.length;
    for (const cid of path) {
      if (cells[cid].ocean) continue;
      used[cid] = 1;
      if (cells[cid].riverId < 0) cells[cid].riverId = rid;
    }
    const points = path.map((cid) => [cells[cid].x, cells[cid].y]);
    const width = Math.min(4.2, 0.55 + Math.log(1 + src.flux) * 0.35);
    rivers.push({ id: rid, cellIds: path, points, width });
  }
  return rivers;
}

/**
 * Mark mountains from local prominence so icons and settlement penalties agree.
 * @param {import("../types.js").Cell[]} cells
 */
export function markMountains(cells) {
  const land = cells.filter((c) => !c.ocean && !c.lake).map((c) => c.height).sort((a, b) => a - b);
  const cutoff = land.length ? land[Math.floor(land.length * 0.82)] : 0.45;
  for (const c of cells) {
    c.mountain = !c.ocean && !c.lake && c.height >= Math.max(0.42, cutoff);
  }
}
