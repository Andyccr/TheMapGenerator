/**
 * Hydrology after Martin O'Leary and Amit Patel:
 * 1. Classify ocean as water connected to the map border.
 * 2. Priority-flood depressions so every land cell drains to the sea (Planchon–Darboux / Barnes).
 * 3. Route flow downhill; accumulate flux; rivers never climb and therefore never cross ridges.
 * 4. Remaining filled basins become lakes.
 */
import { chaikin, pointInPolygon } from "../util/geometry.js";

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
 * Enclosed water (height below sea, not connected to the ocean) becomes a lake.
 * Priority-flood leftovers that still sit above sea level stay land so rivers
 * can drain them. Mud-puddles of 2–6 cells are dropped.
 * @param {import("../types.js").Cell[]} cells
 */
export function markLakesFromFill(cells) {
  for (const c of cells) c.lake = !c.ocean && c.height < 0;
  const minSize = Math.max(7, Math.round(cells.length * 0.0012));
  const seen = new Uint8Array(cells.length);
  for (const start of cells) {
    if (!start.lake || seen[start.id]) continue;
    /** @type {number[]} */
    const ids = [];
    const stack = [start.id];
    seen[start.id] = 1;
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const nid of cells[id].neighbors) {
        if (seen[nid] || !cells[nid].lake) continue;
        seen[nid] = 1;
        stack.push(nid);
      }
    }
    if (ids.length < minSize) {
      for (const id of ids) cells[id].lake = false;
    }
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
  const n = cells.length;
  const ids = new Int32Array(n + 1);
  const keys = new Float64Array(n + 1);
  let size = 0;
  const push = (id, key) => {
    let i = ++size;
    ids[i] = id;
    keys[i] = key;
    while (i > 1) {
      const parent = i >> 1;
      if (keys[parent] <= keys[i]) break;
      const swapId = ids[parent];
      ids[parent] = ids[i];
      ids[i] = swapId;
      const swapKey = keys[parent];
      keys[parent] = keys[i];
      keys[i] = swapKey;
      i = parent;
    }
  };
  const pop = () => {
    const id = ids[1];
    size -= 1;
    if (size > 0) {
      ids[1] = ids[size + 1];
      keys[1] = keys[size + 1];
      let i = 1;
      for (;;) {
        const left = i << 1;
        const right = left + 1;
        let smallest = i;
        if (left <= size && keys[left] < keys[smallest]) smallest = left;
        if (right <= size && keys[right] < keys[smallest]) smallest = right;
        if (smallest === i) break;
        const swapId = ids[smallest];
        ids[smallest] = ids[i];
        ids[i] = swapId;
        const swapKey = keys[smallest];
        keys[smallest] = keys[i];
        keys[i] = swapKey;
        i = smallest;
      }
    }
    return id;
  };

  const closed = new Uint8Array(n);
  for (const c of cells) {
    c.filledHeight = c.height;
    if (c.ocean || c.border) {
      push(c.id, c.height);
      closed[c.id] = 1;
    }
  }
  while (size) {
    const id = pop();
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      if (closed[nid]) continue;
      closed[nid] = 1;
      const next = cells[nid];
      next.filledHeight = Math.max(next.height, cell.filledHeight + 1e-4);
      push(nid, next.filledHeight);
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

  const cuts = localRiverCuts(cells, threshold);
  const order = assignStreamOrder(cells);
  const sources = cells
    .filter((c) => !c.ocean && !c.lake && c.flux >= (cuts.get(c.basinId ?? -1) ?? threshold) && c.downslope >= 0)
    .sort((a, b) => a.flux - b.flux);

  for (const src of sources) {
    if (used[src.id]) continue;
    const cut = cuts.get(src.basinId ?? -1) ?? threshold;
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
      if (used[id]) {
        if (path.length) path.push(id);
        break;
      }
      path.push(id);
      if (cell.ocean || cell.lake) break;
      if (cell.downslope < 0) break;
      const next = cells[cell.downslope];
      // Refuse to climb — extra safety beyond filledHeight routing.
      if (next.filledHeight > cell.filledHeight + 1e-6) break;
      id = cell.downslope;
    }
    if (path.length < 3) continue;

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
 * Flux cut per drainage basin. A global percentile gives arid maps the same
 * channel density as wet ones; here the rank and the absolute floor follow
 * the basin's own precipitation.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} threshold
 * @returns {Map<number, number>}
 */
function localRiverCuts(cells, threshold) {
  /** @type {Map<number, import("../types.js").Cell[]>} */
  const groups = new Map();
  for (const c of cells) {
    if (c.ocean || c.lake) continue;
    const key = c.basinId ?? -1;
    let bucket = groups.get(key);
    if (!bucket) groups.set(key, (bucket = []));
    bucket.push(c);
  }
  /** @type {Map<number, number>} */
  const cuts = new Map();
  for (const [key, bucket] of groups) {
    if (!bucket.length) continue;
    let precip = 0;
    for (const c of bucket) precip += c.precipitation == null ? 0.5 : c.precipitation;
    precip /= bucket.length;
    const dryness = 1 - Math.min(1, Math.max(0, precip));
    const pct = 0.84 + dryness * 0.13;
    const fluxes = bucket.map((c) => c.flux).sort((a, b) => a - b);
    const idx = Math.min(fluxes.length - 1, Math.max(0, Math.floor((fluxes.length - 1) * pct)));
    const ranked = fluxes[idx];
    const floor = 1.5 + dryness * Math.max(4, threshold) * 0.85;
    cuts.set(key, Math.max(2, floor, ranked));
  }
  return cuts;
}

/**
 * Low-gradient reaches wander, then the offset is pulled back onto a
 * downhill river cell so the pen cannot climb onto a ridge or the coast.
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
    const slope = ds ? Math.abs((c.filledHeight ?? c.height) - (ds.filledHeight ?? ds.height)) : 0.2;
    const amp = Math.max(0, 0.55 - slope * 4) * 3.2;
    const wave = Math.sin(i * 0.9 + path[0] * 0.17) * amp;
    const x = out[i][0] + (-dy / len) * wave;
    const y = out[i][1] + (dx / len) * wave;
    const clamped = clampMeander(x, y, cells, path, ci);
    out[i][0] = clamped[0];
    out[i][1] = clamped[1];
  }
  return out;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} path
 * @param {number} ci
 * @returns {number[]}
 */
function clampMeander(x, y, cells, path, ci) {
  let index = ci;
  while (index > 0 && cells[path[index]]?.ocean) index--;
  const thalweg = cells[path[index]];
  if (!thalweg || thalweg.ocean) return [x, y];
  const cap = thalweg.filledHeight ?? thalweg.height;
  /** @type {number[]} */
  const allowed = [];
  for (let k = ci; k <= Math.min(path.length - 1, ci + 1); k++) {
    const id = path[k];
    const c = cells[id];
    if (!c || c.ocean) continue;
    if ((c.filledHeight ?? c.height) <= cap + 1e-4) allowed.push(id);
  }
  if (!allowed.length) return [thalweg.x, thalweg.y];
  const allowSet = new Set(allowed);
  /** @type {number[]} */
  const banned = [];
  for (const id of allowed) {
    for (const nid of cells[id].neighbors || []) {
      if (!allowSet.has(nid) && !banned.includes(nid)) banned.push(nid);
    }
  }
  const polys = allowed.filter((id) => (cells[id].polygon || []).length >= 3);
  if (polys.some((id) => pointInPolygon(x, y, cells[id].polygon))) return [x, y];
  const pool = allowed.concat(banned);
  const nearest = (px, py) => {
    let best = allowed[0];
    let bestD = Infinity;
    for (const id of pool) {
      const c = cells[id];
      if (!c) continue;
      const d = (c.x - px) ** 2 + (c.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
  if (!polys.length && allowSet.has(nearest(x, y))) return [x, y];
  let lo = 0;
  let hi = 1;
  let bx = thalweg.x;
  let by = thalweg.y;
  for (let k = 0; k < 8; k++) {
    const t = (lo + hi) * 0.5;
    const px = thalweg.x + (x - thalweg.x) * t;
    const py = thalweg.y + (y - thalweg.y) * t;
    const ok = polys.length
      ? polys.some((id) => pointInPolygon(px, py, cells[id].polygon))
      : allowSet.has(nearest(px, py));
    if (ok) {
      bx = px;
      by = py;
      lo = t;
    } else hi = t;
  }
  return [bx, by];
}

/**
 * After climate-weighted flux exists, cut a shallow thalweg.
 * Wear is a fraction of the step down to the next cell, so another pass
 * cannot drain the river to the sea. Dry channels cut less than wet ones.
 * Height stays downhill; filledHeight routing is left alone.
 * @param {import("../types.js").Cell[]} cells
 */
export function inciseThalweg(cells) {
  const channel = cells.filter((c) => !c.ocean && !c.lake && c.riverId >= 0 && c.downslope >= 0);
  channel.sort((a, b) => b.filledHeight - a.filledHeight);
  for (const c of channel) {
    const ds = cells[c.downslope];
    if (!ds || c.border) continue;
    const floor = ds.ocean || ds.lake ? Math.max(0.012, ds.height + 0.004) : ds.height + 0.008;
    const excess = c.height - floor;
    if (excess <= 0.01) continue;
    const wet = Math.max(0.15, Math.min(1, c.precipitation == null ? 0.5 : c.precipitation));
    const budget = 0.0032 * Math.log2(1 + Math.max(0, c.flux)) * wet;
    const wear = Math.min(excess * 0.4, budget, 0.014);
    if (wear > 0.001) c.height -= wear;
  }
}

/**
 * Mountains are local prominence or slope, not a height percentile.
 * A high plateau is flat, so it stays unmarked; a lower ridge still qualifies.
 * @param {import("../types.js").Cell[]} cells
 */
export function markMountains(cells) {
  for (const c of cells) {
    if (c.ocean || c.lake || !c.neighbors?.length) {
      c.mountain = false;
      continue;
    }
    let rise = 0;
    let slope = 0;
    for (const nid of c.neighbors) {
      const dh = c.height - cells[nid].height;
      if (dh > 0) rise += dh;
      if (dh > slope) slope = dh;
    }
    const prominence = rise / c.neighbors.length;
    c.mountain = prominence >= 0.045 || slope >= 0.11;
  }
}
