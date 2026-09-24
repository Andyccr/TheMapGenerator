/**
 * Post-tectonic relief: coastal plains, continental shelves, bathymetry,
 * and a light fluvial erosion pass so valleys follow rivers.
 */
import { assignDownslope, accumulateFlux } from "./hydrology.js";
import { hopsFromWorld } from "../data/worldData.js";

/**
 * Graph distance from a set of seed cell ids.
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} seeds
 */
function graphDistance(cells, seeds) {
  const dist = new Float64Array(cells.length);
  dist.fill(1e9);
  const q = [];
  for (const id of seeds) {
    dist[id] = 0;
    q.push(id);
  }
  let h = 0;
  while (h < q.length) {
    const id = q[h++];
    for (const nid of cells[id].neighbors) {
      const nd = dist[id] + 1;
      if (nd < dist[nid]) {
        dist[nid] = nd;
        q.push(nid);
      }
    }
  }
  return dist;
}

/**
 * Lower land near the sea into plains; drop a shelf then deepen the abyssal ocean.
 * Distances are in world units so finer grids keep the same physical shelf width.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} [cellSize]
 */
export function gradeCoastsAndShelf(cells, cellSize = 10) {
  const oceanIds = [];
  const landIds = [];
  for (const c of cells) {
    if (c.ocean) oceanIds.push(c.id);
    else landIds.push(c.id);
  }
  if (!oceanIds.length || !landIds.length) return;
  const fromOcean = graphDistance(cells, oceanIds);
  const fromLand = graphDistance(cells, landIds);
  const surf = hopsFromWorld(12, cellSize);
  const shelf = hopsFromWorld(36, cellSize);
  const abyss = hopsFromWorld(130, cellSize);
  const hinter = hopsFromWorld(24, cellSize);
  const inland = hopsFromWorld(80, cellSize);

  for (const c of cells) {
    if (c.ocean) {
      const d = fromLand[c.id];
      if (d <= surf) c.height = Math.max(c.height, -0.07);
      else if (d <= shelf) c.height = Math.min(c.height, -0.12 - d * 0.03);
      else c.height = Math.min(c.height, -0.22 - Math.min(abyss, d) * 0.04);
      continue;
    }
    if (c.lake || c.mountain) continue;
    const d = fromOcean[c.id];
    if (d <= surf && c.height < 0.38) c.height *= 0.42;
    else if (d <= hinter && c.height < 0.42) c.height = c.height * 0.62 + 0.015;
    else if (d >= inland) c.height += Math.min(0.08, (d - inland + 1) * 0.008);
  }
}

/**
 * One thermal-slump pass. Steep cells shed a capped amount onto the lower
 * neighbor; the cap keeps a single O(n) pass from planing off mountain belts.
 * @param {import("../types.js").Cell[]} cells
 */
export function slumpSlopes(cells) {
  const delta = new Float64Array(cells.length);
  for (const c of cells) {
    if (c.ocean || c.border || !c.neighbors?.length) continue;
    let low = /** @type {import("../types.js").Cell | null} */ (null);
    let lowH = c.height;
    for (const nid of c.neighbors) {
      const n = cells[nid];
      if (n.height < lowH) {
        lowH = n.height;
        low = n;
      }
    }
    if (!low) continue;
    const drop = c.height - low.height;
    if (drop < 0.08) continue;
    const move = Math.min(0.035, (drop - 0.08) * 0.22);
    if (low.ocean) {
      delta[c.id] -= move * 0.35;
    } else if (!low.border) {
      delta[c.id] -= move;
      delta[low.id] += move * 0.65;
    }
  }
  for (const c of cells) c.height += delta[c.id];
}

/**
 * Wear high-flux steep cells and deposit a little downstream (O'Leary cartoon erosion).
 * @param {import("../types.js").Cell[]} cells
 */
export function erodeFluvial(cells) {
  assignDownslope(cells);
  accumulateFlux(cells);
  /** @type {number[]} */
  const delta = new Array(cells.length).fill(0);
  for (const c of cells) {
    if (c.ocean || c.downslope < 0) continue;
    const ds = cells[c.downslope];
    const slope = Math.max(0, c.filledHeight - ds.filledHeight);
    if (slope < 0.004 || c.height < 0.02) continue;
    const wear = Math.min(0.028, 0.012 * Math.pow(Math.max(1, c.flux), 0.45) * slope);
    delta[c.id] -= wear;
    if (!ds.ocean) delta[ds.id] += wear * 0.35;
  }
  for (const c of cells) {
    if (c.border) continue;
    c.height += delta[c.id];
  }
}
