/**
 * Derived stroke geometry for the renderer. Reads polygons, never writes cells.
 */
import { chaikin, simplifyPolyline } from "../util/geometry.js";

/**
 * Shared or reconstructed edge between two neighboring cells.
 * @param {import("../types.js").Cell} a
 * @param {import("../types.js").Cell} b
 * @param {number} cellSize
 * @returns {number[][] | null}
 */
export function edgeBetween(a, b, cellSize) {
  const eps = Math.max(1.2, cellSize * 0.45);
  const eps2 = eps * eps;
  const shared = [];
  const pa = a.polygon;
  const pb = b.polygon;
  for (let i = 0; i < pa.length; i++) {
    const p = pa[i];
    for (let j = 0; j < pb.length; j++) {
      const q = pb[j];
      const dx = p[0] - q[0];
      const dy = p[1] - q[1];
      if (dx * dx + dy * dy <= eps2) {
        shared.push(p);
        break;
      }
    }
  }
  if (shared.length >= 2) {
    let best = [shared[0], shared[1]];
    let bestD = 0;
    for (let i = 0; i < shared.length; i++) {
      for (let j = i + 1; j < shared.length; j++) {
        const dx = shared[i][0] - shared[j][0];
        const dy = shared[i][1] - shared[j][1];
        const d = dx * dx + dy * dy;
        if (d > bestD) {
          bestD = d;
          best = [shared[i], shared[j]];
        }
      }
    }
    return best;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const h = cellSize * 0.48;
  return [
    [mx - (dy / len) * h, my + (dx / len) * h],
    [mx + (dy / len) * h, my - (dx / len) * h],
  ];
}

/**
 * Walk unused segments into polylines.
 * @param {number[][][]} segments
 * @returns {number[][][]}
 */
export function chainPolylines(segments) {
  const qk = (p) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;
  const segs = segments.map((s) => ({ a: s[0], b: s[1], used: false }));
  /** @type {Map<string, number[]>} */
  const idx = new Map();
  const add = (key, i) => {
    let arr = idx.get(key);
    if (!arr) {
      arr = [];
      idx.set(key, arr);
    }
    arr.push(i);
  };
  for (let i = 0; i < segs.length; i++) {
    add(qk(segs[i].a), i);
    add(qk(segs[i].b), i);
  }

  const nextUnused = (key) => {
    const list = idx.get(key);
    if (!list) return -1;
    for (const j of list) {
      if (!segs[j].used) return j;
    }
    return -1;
  };

  /** @type {number[][][]} */
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].used) continue;
    segs[i].used = true;
    /** @type {number[][]} */
    const pts = [segs[i].a, segs[i].b];
    let head = segs[i].a;
    let tail = segs[i].b;
    for (;;) {
      const j = nextUnused(qk(tail));
      if (j < 0) break;
      segs[j].used = true;
      if (qk(segs[j].a) === qk(tail)) {
        tail = segs[j].b;
        pts.push(tail);
      } else {
        tail = segs[j].a;
        pts.push(tail);
      }
    }
    for (;;) {
      const j = nextUnused(qk(head));
      if (j < 0) break;
      segs[j].used = true;
      if (qk(segs[j].a) === qk(head)) {
        head = segs[j].b;
        pts.unshift(head);
      } else {
        head = segs[j].a;
        pts.unshift(head);
      }
    }
    if (pts.length >= 2) lines.push(pts);
  }
  return lines;
}

/**
 * @param {import("../types.js").WorldData} world
 */
export function buildContours(world) {
  const cells = world.cells;
  const cs = world.meta.cellSize || 10;
  /** @type {number[][][]} */
  const coastSeg = [];
  /** @type {number[][][]} */
  const shoreSeg = [];
  /** @type {number[][][]} */
  const borderSeg = [];
  /** @type {number[][][]} */
  const cultureSeg = [];
  /** @type {number[][][]} */
  const provinceSeg = [];
  /** @type {number[][][]} */
  const religionSeg = [];

  for (const cell of cells) {
    if (cell.ocean || cell.polygon.length < 3) continue;
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      if (n.ocean) {
        const e = edgeBetween(cell, n, cs);
        if (e) coastSeg.push(e);
        continue;
      }
      if (nid < cell.id) continue;
      if (cell.lake !== n.lake && (cell.lake || n.lake)) {
        const e = edgeBetween(cell, n, cs);
        if (e) shoreSeg.push(e);
      }
      if (cell.regionId >= 0 && n.regionId >= 0 && cell.regionId !== n.regionId) {
        const e = edgeBetween(cell, n, cs);
        if (e) borderSeg.push(e);
      }
      if (cell.cultureId >= 0 && n.cultureId >= 0 && cell.cultureId !== n.cultureId) {
        const e = edgeBetween(cell, n, cs);
        if (e) cultureSeg.push(e);
      }
      if (cell.provinceId >= 0 && n.provinceId >= 0 && cell.provinceId !== n.provinceId) {
        const e = edgeBetween(cell, n, cs);
        if (e) provinceSeg.push(e);
      }
      if (cell.religionId >= 0 && n.religionId >= 0 && cell.religionId !== n.religionId) {
        const e = edgeBetween(cell, n, cs);
        if (e) religionSeg.push(e);
      }
    }
  }

  const polish = (segs, simplify) =>
    chainPolylines(segs).map((line) => chaikin(simplifyPolyline(line, simplify), 1));

  return {
    coasts: polish(coastSeg, cs * 0.35),
    shores: polish(shoreSeg, cs * 0.4),
    borders: polish(borderSeg, cs * 0.45),
    cultures: polish(cultureSeg, cs * 0.5),
    provinces: polish(provinceSeg, cs * 0.48),
    religions: polish(religionSeg, cs * 0.5),
  };
}

/** Land form-lines and two bathymetric lines. Paint-only. */
export const ELEVATION_LEVELS = [-0.55, -0.22, 0.34, 0.52, 0.7, 0.88];

/**
 * Chord contours: each cell that a level crosses emits the segment between
 * the two edge intersections. Shared vertices chain into polylines.
 * @param {import("../types.js").WorldData} world
 * @returns {number[][][][]}
 */
export function buildElevationContours(world) {
  const cells = world.cells;
  const cs = world.meta.cellSize || 10;
  /** @type {number[][][][]} */
  const buckets = ELEVATION_LEVELS.map(() => []);
  for (const cell of cells) {
    if (!cell || cell.lake || !cell.neighbors?.length) continue;
    for (let li = 0; li < ELEVATION_LEVELS.length; li++) {
      const level = ELEVATION_LEVELS[li];
      if (level < 0 ? !cell.ocean : cell.ocean || cell.height <= 0) continue;
      /** @type {number[][]} */
      const hits = [];
      for (const nid of cell.neighbors) {
        const n = cells[nid];
        if (!n || n.lake) continue;
        if (level < 0 ? !n.ocean : n.ocean) continue;
        const p = crossHeight(cell, n, level);
        if (p) hits.push(p);
      }
      if (hits.length < 2) continue;
      const cx = cell.x;
      const cy = cell.y;
      hits.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
      for (let i = 0; i + 1 < hits.length; i += 2) buckets[li].push([hits[i], hits[i + 1]]);
    }
  }
  return buckets.map((segs) => chainPolylines(segs).map((line) => simplifyPolyline(line, cs * 0.35)));
}

/**
 * @param {{ x: number, y: number, height: number }} a
 * @param {{ x: number, y: number, height: number }} b
 * @param {number} level
 * @returns {number[] | null}
 */
function crossHeight(a, b, level) {
  const d = b.height - a.height;
  if (Math.abs(d) < 1e-8) return null;
  const t = (level - a.height) / d;
  if (t < 0 || t > 1) return null;
  return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
}
