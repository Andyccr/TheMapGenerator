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
