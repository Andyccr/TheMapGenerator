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
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Plate[]} plates
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @param {number} seaLevel
 */
export function assignElevation(cells, plates, rng, width, height, seaLevel) {
  const simplex = createSimplex(rng);
  const invW = 1 / width;
  const invH = 1 / height;
  const boundDist = plateBoundaryDistance(cells);

  /** @type {number[]} */
  const strain = new Array(cells.length).fill(0);

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
      n++;
    }
    strain[cell.id] = n ? s / Math.max(1, n * 0.5) : 0;
  }

  /** @type {number[]} */
  let field = strain.slice();
  for (let pass = 0; pass < 4; pass++) {
    const next = field.slice();
    for (const cell of cells) {
      let acc = field[cell.id] * 1.6;
      let w = 1.6;
      for (const nid of cell.neighbors) {
        acc += field[nid];
        w += 1;
      }
      next[cell.id] = acc / w;
    }
    field = next;
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
    const slope = (nx * tx + ny * ty - 0.5) * (p.continental ? 0.07 : 0.03);
    const continental = p.continental ? 0.2 : -0.44;
    const d = boundDist[cell.id];
    const belt = Math.exp(-d / 2.6);
    const mountains = Math.max(0, field[cell.id]) * (0.42 + 0.95 * belt);
    const rift = Math.min(0, field[cell.id]) * (0.35 + 0.25 * belt);
    let h = continental + mountains + rift + rolling + detail + wrinkle + slope;

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

    if (cell.border) h = Math.min(h, -0.55);
    cell.height = h;
  }
  setLandFraction(cells, 0.48, seaLevel);
  roundLand(cells);
}

/**
 * O'Leary-style sea-level set: pick a cutoff so a target fraction of interior
 * cells are land. The UI slider then nudges that shoreline.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} targetLand
 * @param {number} seaSlider
 */
export function setLandFraction(cells, targetLand, seaSlider) {
  const interior = cells.filter((c) => !c.border);
  if (!interior.length) return;
  const heights = interior.map((c) => c.height).sort((a, b) => a - b);
  const idx = Math.floor(heights.length * (1 - targetLand));
  const cutoff = heights[Math.max(0, Math.min(heights.length - 1, idx))] + seaSlider * 0.01;
  for (const cell of cells) {
    cell.height -= cutoff;
    if (cell.border) cell.height = Math.min(cell.height, -0.28);
  }

  for (let k = 0; k < 2; k++) {
    for (const cell of cells) {
      if (cell.border) continue;
      let land = 0;
      let sea = 0;
      for (const nid of cell.neighbors) {
        if (cells[nid].height >= 0) land++;
        else sea++;
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
function roundLand(cells) {
  for (const c of cells) {
    if (c.height <= 0) continue;
    c.height = Math.pow(c.height, 0.82);
  }
}
