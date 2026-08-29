/**
 * Lightweight plate-tectonics simulation (Scott Turner / Nortantis school):
 * plates with velocity, then strain along shared margins.
 *
 * Continents come from continental plates, not from a noise threshold.
 * Mountain *chains* form where plates converge; rifts where they diverge.
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
    const speed = 0.4 + rng() * 0.9;
    const continental = i < continentalTarget;
    const margin = continental ? 0.16 : 0.04;
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

  for (const cell of cells) {
    let best = 0;
    let bestD = Infinity;
    for (const p of plates) {
      const dx = cell.x - p.cx;
      const dy = cell.y - p.cy;
      // Slight wrap-free Euclidean; plates are seeds, not spherical.
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
      if (closing > 0.12) {
        const bothLand = p.continental && q.continental;
        const subduct = p.continental !== q.continental;
        if (bothLand) s += 1.15 * closing;
        else if (subduct) s += p.continental ? 0.9 * closing : 0.15 * closing;
        else s += 0.2 * closing;
      } else if (closing < -0.12) {
        s -= 0.35 * -closing;
      }
      n++;
    }
    strain[cell.id] = n ? s / Math.max(1, n * 0.55) : 0;
  }

  // Spread strain a few cells so ranges have width (Turner-style chains, not hairlines).
  /** @type {number[]} */
  let field = strain.slice();
  for (let pass = 0; pass < 3; pass++) {
    const next = field.slice();
    for (const cell of cells) {
      let acc = field[cell.id] * 1.4;
      let w = 1.4;
      for (const nid of cell.neighbors) {
        acc += field[nid];
        w += 1;
      }
      next[cell.id] = acc / w;
    }
    field = next;
  }

  for (const cell of cells) {
    const p = plates[cell.plateId];
    const nx = cell.x * invW;
    const ny = cell.y * invH;
    const detail = simplex.fbm(nx * 3.2, ny * 3.2, 5) * 0.08;
    const wrinkle = simplex.fbm(nx * 8.5 + 20, ny * 8.5, 3) * 0.025;
    const continental = p.continental ? 0.22 : -0.42;
    const mountains = Math.max(0, field[cell.id]) * 0.85;
    const rift = Math.min(0, field[cell.id]) * 0.45;
    let h = continental + mountains + rift + detail + wrinkle;

    if (p.continental) {
      let oceanNb = 0;
      for (const nid of cell.neighbors) {
        if (!plates[cells[nid].plateId].continental) oceanNb++;
      }
      if (oceanNb >= 3) h -= 0.045 * oceanNb;
    }

    if (cell.border) h = Math.min(h, -0.5);
    cell.height = h;
  }
  setLandFraction(cells, 0.5, seaLevel);
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
    if (cell.border) cell.height = Math.min(cell.height, -0.25);
  }

  // Tiny morphological clean-up so single-cell puddles do not become lakes later.
  for (let k = 0; k < 2; k++) {
    for (const cell of cells) {
      if (cell.border) continue;
      let land = 0;
      let sea = 0;
      for (const nid of cell.neighbors) {
        if (cells[nid].height >= 0) land++;
        else sea++;
      }
      if (cell.height >= 0 && sea >= 5) cell.height = -0.05;
      if (cell.height < 0 && land >= 5) cell.height = 0.04;
    }
  }
}
