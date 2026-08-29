/**
 * Post-tectonic relief: coastal plains, continental shelves, bathymetry,
 * and a light fluvial erosion pass so valleys follow rivers.
 */
import { assignDownslope, accumulateFlux } from "./hydrology.js";

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
 * @param {import("../types.js").Cell[]} cells
 */
export function gradeCoastsAndShelf(cells) {
  const oceanIds = [];
  const landIds = [];
  for (const c of cells) {
    if (c.ocean) oceanIds.push(c.id);
    else landIds.push(c.id);
  }
  if (!oceanIds.length || !landIds.length) return;
  const fromOcean = graphDistance(cells, oceanIds);
  const fromLand = graphDistance(cells, landIds);

  for (const c of cells) {
    if (c.ocean) {
      const d = fromLand[c.id];
      if (d <= 1) c.height = Math.max(c.height, -0.07);
      else if (d <= 3) c.height = Math.min(c.height, -0.12 - d * 0.03);
      else c.height = Math.min(c.height, -0.22 - Math.min(12, d) * 0.04);
      continue;
    }
    if (c.lake || c.mountain) continue;
    const d = fromOcean[c.id];
    if (d <= 1 && c.height < 0.38) c.height *= 0.42;
    else if (d <= 2 && c.height < 0.42) c.height = c.height * 0.62 + 0.015;
    else if (d >= 7) c.height += Math.min(0.08, (d - 6) * 0.008);
  }
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
    const wear = Math.min(0.07, 0.01 * Math.pow(Math.max(1, c.flux), 0.38) * slope * 6);
    delta[c.id] -= wear;
    if (!ds.ocean) delta[ds.id] += wear * 0.35;
  }
  for (const c of cells) {
    if (c.border) continue;
    c.height += delta[c.id];
  }
}
