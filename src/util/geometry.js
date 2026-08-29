/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy */
export function circumcenter(ax, ay, bx, by, cx, cy) {
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) {
    return { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3 };
  }
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return {
    x: (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D,
    y: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D,
  };
}

/**
 * Sutherland–Hodgman clip against an axis-aligned rectangle.
 * @param {number[][]} poly
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @returns {number[][]}
 */
export function clipPolygon(poly, minX, minY, maxX, maxY) {
  /** @param {number[][]} input @param {(p: number[]) => boolean} inside @param {(a: number[], b: number[]) => number[]} intersect */
  const clip = (input, inside, intersect) => {
    const out = [];
    if (!input.length) return out;
    let prev = input[input.length - 1];
    for (const cur of input) {
      const cin = inside(cur);
      const pin = inside(prev);
      if (cin) {
        if (!pin) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (pin) {
        out.push(intersect(prev, cur));
      }
      prev = cur;
    }
    return out;
  };

  let p = poly;
  p = clip(
    p,
    (q) => q[0] >= minX,
    (a, b) => {
      const t = (minX - a[0]) / (b[0] - a[0] || 1e-9);
      return [minX, a[1] + t * (b[1] - a[1])];
    },
  );
  p = clip(
    p,
    (q) => q[0] <= maxX,
    (a, b) => {
      const t = (maxX - a[0]) / (b[0] - a[0] || 1e-9);
      return [maxX, a[1] + t * (b[1] - a[1])];
    },
  );
  p = clip(
    p,
    (q) => q[1] >= minY,
    (a, b) => {
      const t = (minY - a[1]) / (b[1] - a[1] || 1e-9);
      return [a[0] + t * (b[0] - a[0]), minY];
    },
  );
  p = clip(
    p,
    (q) => q[1] <= maxY,
    (a, b) => {
      const t = (maxY - a[1]) / (b[1] - a[1] || 1e-9);
      return [a[0] + t * (b[0] - a[0]), maxY];
    },
  );
  return p;
}

/** @param {number[][]} poly */
export function polygonCentroid(poly) {
  let x = 0;
  let y = 0;
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    const c = x0 * y1 - x1 * y0;
    a += c;
    x += (x0 + x1) * c;
    y += (y0 + y1) * c;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-8) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p[0];
      sy += p[1];
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: x / (6 * a), y: y / (6 * a) };
}

/** @param {number} x @param {number} y @param {number[][]} poly */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Stable 0–1 hash so shared Voronoi vertices jitter identically. */
export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Subdivide long edges then jitter vertices. Same quantized input → same
 * output, so adjacent cells keep a watertight mesh (Patel noisy-edge idea).
 * Dense maps skip subdivision to keep vertex count in check.
 * @param {number[][]} poly
 * @param {number} amp
 * @param {boolean} [subdivide]
 */
export function organicPolygon(poly, amp, subdivide = true) {
  if (poly.length < 3) return poly;
  const minLen = subdivide ? Math.max(6, amp * 4.5) : Infinity;
  /** @type {number[][]} */
  const mid = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    mid.push(a);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx * dx + dy * dy > minLen * minLen) {
      mid.push([(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5]);
    }
  }
  return mid.map(([x, y]) => {
    const qx = Math.round(x * 8) / 8;
    const qy = Math.round(y * 8) / 8;
    return [x + (hash2(qx, qy) - 0.5) * 2 * amp, y + (hash2(qx + 19.2, qy + 7.1) - 0.5) * 2 * amp];
  });
}

/**
 * Chaikin corner-cutting for river polylines.
 * @param {number[][]} pts
 * @param {number} [iters]
 */
export function chaikin(pts, iters = 2) {
  if (pts.length < 3) return pts;
  let p = pts;
  for (let k = 0; k < iters; k++) {
    /** @type {number[][]} */
    const n = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      n.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      n.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    n.push(p[p.length - 1]);
    p = n;
  }
  return p;
}

/**
 * Drop vertices closer than `minDist` (world units). Endpoints stay.
 * Used by the renderer for zoomed-out strokes; does not touch WorldData.
 * @param {number[][]} pts
 * @param {number} minDist
 */
export function simplifyPolyline(pts, minDist) {
  if (pts.length < 3 || minDist <= 0) return pts;
  const min2 = minDist * minDist;
  /** @type {number[][]} */
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const p = pts[i];
    const dx = p[0] - prev[0];
    const dy = p[1] - prev[1];
    if (dx * dx + dy * dy >= min2) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
