/**
 * Lightweight plate-tectonics simulation (Scott Turner / Nortantis school):
 * warped plate seeds, strain along margins, mountain *belts* of finite width,
 * coastal plains, shelves, and island arcs.
 *
 * Continents come from continental plates, not from a noise threshold.
 */
import { createSimplex } from "./noise.js";

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} plateCount
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @returns {import("../types.js").Plate[]}
 */
export function assignPlates(cells, plateCount, rng, width, height) {
  const count = Math.max(4, plateCount);
  const continentalTarget = Math.max(2, Math.round(count * 0.55));
  /** @type {import("../types.js").Plate[]} */
  const plates = [];
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const speed = 0.35 + rng() * 1.05;
    const continental = i < continentalTarget;
    const margin = continental ? 0.14 : 0.03;
    plates.push({
      id: i,
      continental,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      cx: margin * width + rng() * width * (1 - 2 * margin),
      cy: margin * height + rng() * height * (1 - 2 * margin),
    });
  }
  if (!plates.some((p) => !p.continental)) plates[plates.length - 1].continental = false;

  const simplex = createSimplex(rng);
  const warp = Math.min(width, height) * 0.1;
  for (const cell of cells) {
    const wx = simplex.noise2D(cell.x / 160, cell.y / 160) * warp;
    const wy = simplex.noise2D(cell.x / 160 + 40, cell.y / 160) * warp;
    const px = cell.x + wx;
    const py = cell.y + wy;
    let best = 0;
    let bestD = Infinity;
    for (const p of plates) {
      const dx = px - p.cx;
      const dy = py - p.cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    cell.plateId = best;
  }
  return plates;
}

/**
 * Graph distance to a cell whose neighbor belongs to another plate.
 * @param {import("../types.js").Cell[]} cells
 * @returns {Float64Array}
 */
function plateBoundaryDistance(cells) {
  const dist = new Float64Array(cells.length);
  dist.fill(1e9);
  const q = [];
  for (const c of cells) {
    if (c.neighbors.some((id) => cells[id].plateId !== c.plateId)) {
      dist[c.id] = 0;
      q.push(c.id);
    }
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
 * Keep convergent strain on the plate margin.
 * Isotropic neighbor passes (especially the 3–8 used on fine grids) bleed a
 * boundary chain into a filled blob. Here each pass averages only cells that
 * already sit on the margin, so the belt stays a ribbon of finite width.
 * @param {import("../types.js").Cell[]} cells
 * @param {number[]} strain
 * @param {Float64Array | number[]} boundDist
 * @returns {number[]}
 */
export function diffuseMarginStrain(cells, strain, boundDist) {
  const margin = 1;
  let field = strain.slice();
  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (const cell of cells) {
      if (boundDist[cell.id] > margin) {
        next[cell.id] = 0;
        continue;
      }
      let acc = field[cell.id] * 2.2;
      let w = 2.2;
      for (const nid of cell.neighbors) {
        if (boundDist[nid] > margin) continue;
        acc += field[nid];
        w += 1;
      }
      next[cell.id] = acc / w;
    }
    field = next;
  }
  const width = 1.15;
  for (let i = 0; i < field.length; i++) {
    if (boundDist[i] > margin) field[i] = 0;
    else field[i] *= Math.exp(-boundDist[i] / width);
  }
  return field;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Plate[]} plates
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @param {number} seaLevel
 * @param {number} [cellSize]
 */
export function assignElevation(cells, plates, rng, width, height, seaLevel, cellSize = 10) {
  const simplex = createSimplex(rng);
  const invW = 1 / width;
  const invH = 1 / height;
  const boundDist = plateBoundaryDistance(cells);
  const beltLength = Math.max(2.2, 26 / Math.max(3.5, cellSize));
  const microFreq = 1 / Math.max(8, cellSize * 3.2);

  /** @type {number[]} */
  const strain = new Array(cells.length).fill(0);
  const trench = new Float64Array(cells.length);

  for (const cell of cells) {
    const p = plates[cell.plateId];
    let s = 0;
    let n = 0;
    for (const nid of cell.neighbors) {
      const other = cells[nid];
      if (other.plateId === cell.plateId) continue;
      const q = plates[other.plateId];
      const dx = other.x - cell.x;
      const dy = other.y - cell.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const closing = -((q.vx - p.vx) * nx + (q.vy - p.vy) * ny);
      if (closing > 0.1) {
        const bothLand = p.continental && q.continental;
        const subduct = p.continental !== q.continental;
        if (bothLand) s += 1.35 * closing;
        else if (subduct) s += p.continental ? 1.05 * closing : 0.22 * closing;
        else s += 0.28 * closing;
      } else if (closing < -0.1) {
        s -= 0.42 * -closing;
      }
      if (!p.continental && q.continental && closing > 0.15) {
        trench[cell.id] = Math.max(trench[cell.id], closing);
      }
      n++;
    }
    strain[cell.id] = n ? s / Math.max(1, n * 0.5) : 0;
  }

  const field = diffuseMarginStrain(cells, strain, boundDist);

  const hotspots = [];
  const nHot = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nHot; i++) {
    hotspots.push({
      x: rng() * width,
      y: rng() * height,
      r2: (Math.min(width, height) * (0.03 + rng() * 0.028)) ** 2,
      amp: 0.16 + rng() * 0.2,
    });
  }

  const tiltAng = rng() * Math.PI * 2;
  const tx = Math.cos(tiltAng);
  const ty = Math.sin(tiltAng);

  for (const cell of cells) {
    const p = plates[cell.plateId];
    const nx = cell.x * invW;
    const ny = cell.y * invH;
    const rolling = simplex.fbm(nx * 1.7, ny * 1.7, 5) * 0.11;
    const detail = simplex.fbm(nx * 4.4, ny * 4.4, 5) * 0.055;
    const wrinkle = simplex.fbm(nx * 11 + 20, ny * 11, 3) * 0.02;
    const micro = simplex.fbm(cell.x * microFreq, cell.y * microFreq, 3) * 0.016;
    const grain =
      cellSize <= 6 ? simplex.fbm(cell.x * microFreq * 2.6 + 8, cell.y * microFreq * 2.6, 2) * 0.012 : 0;
    const slope = (nx * tx + ny * ty - 0.5) * (p.continental ? 0.07 : 0.03);
    const continental = p.continental ? 0.2 : -0.44;
    const d = boundDist[cell.id];
    const belt = Math.exp(-d / beltLength);
    const mountains = Math.max(0, field[cell.id]) * (0.42 + 0.95 * belt);
    const rift = Math.min(0, field[cell.id]) * (0.35 + 0.25 * belt);
    let h = continental + mountains + rift + rolling + detail + wrinkle + micro + grain + slope;
    if (!p.continental && trench[cell.id] > 0) h -= 0.16 * trench[cell.id];
    if (p.continental && belt > 0.18 && belt < 0.62 && mountains < 0.22) h -= 0.07 * belt;
    if (d > beltLength * 1.5) {
      for (const spot of hotspots) {
        const dx = cell.x - spot.x;
        const dy = cell.y - spot.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < spot.r2) h += spot.amp * (1 - d2 / spot.r2);
      }
    }

    if (p.continental) {
      let oceanNb = 0;
      for (const nid of cell.neighbors) {
        if (!plates[cells[nid].plateId].continental) oceanNb++;
      }
      if (oceanNb >= 3 && mountains < 0.2) h -= 0.035 * oceanNb;
    } else if (mountains > 0.18 && rng() < 0.12 + mountains * 0.15) {
      // Island arc on the oceanic side of a convergent margin.
      h = Math.max(h, 0.12 + mountains * 0.35 + detail);
    }

    // Border cells keep their relief. A continent may meet the map edge;
    // ocean is whatever is below sea and connected to a low border, not a forced frame.
    cell.height = h;
  }
  setLandFraction(cells, 0.48, seaLevel);
  roundLand(cells);
}

/**
 * O'Leary-style sea-level set: pick a cutoff so about `targetLand` of all
 * cells are land. Border cells are in that sample, so a high edge can stay
 * land, and a border cell with no land neighbor is dropped as a speck.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} targetLand
 * @param {number} seaSlider
 */
export function setLandFraction(cells, targetLand, seaSlider) {
  if (!cells.length) return;
  const heights = cells.map((c) => c.height).sort((a, b) => a - b);
  const idx = Math.floor(heights.length * (1 - targetLand));
  const cutoff = heights[Math.max(0, Math.min(heights.length - 1, idx))] + seaSlider * 0.01;
  for (const cell of cells) cell.height -= cutoff;

  for (let k = 0; k < 2; k++) {
    for (const cell of cells) {
      let land = 0;
      let sea = 0;
      for (const nid of cell.neighbors) {
        if (cells[nid].height >= 0) land++;
        else sea++;
      }
      // A border cell beside interior land is the continent meeting the map edge.
      // Border-only chains are not a coastline; they go back under water.
      if (cell.border) {
        let inland = 0;
        for (const nid of cell.neighbors) {
          const n = cells[nid];
          if (!n.border && n.height >= 0) inland++;
        }
        if (cell.height >= 0 && inland === 0) cell.height = -0.04;
        continue;
      }
      if (cell.height >= 0 && sea >= 6 && land <= 1) cell.height = -0.04;
      if (cell.height < 0 && land >= 6 && sea <= 1) cell.height = 0.03;
    }
  }
}

/**
 * Soften plains and keep peaks (O'Leary "round hills").
 * @param {import("../types.js").Cell[]} cells
 */
/**
 * Earth-like hypsometry: most land stays low, a short tail keeps the ranges.
 * @param {number} height
 */
export function shapeHypsometry(height) {
  if (height <= 0) return height;
  if (height < 0.2) return height * 0.65;
  const t = (height - 0.2) / 0.8;
  return 0.13 + Math.pow(Math.max(0, t), 0.62) * 0.87;
}

function roundLand(cells) {
  for (const c of cells) {
    if (c.height <= 0) continue;
    c.height = shapeHypsometry(c.height);
  }
}
