/**
 * 2D simplex noise (Stefan Gustavson / Ashima Arts permutation).
 * Used as *detail* on top of tectonics — never as the sole landmass source.
 * @param {() => number} rng
 */
export function createSimplex(rng) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const grad = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  /**
   * @param {number} x
   * @param {number} y
   */
  function noise2D(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    /** @param {number} n @param {number} gx @param {number} gy */
    const contrib = (n, gx, gy) => {
      const t0 = 0.5 - gx * gx - gy * gy;
      if (t0 < 0) return 0;
      const g = grad[n % 8];
      const t2 = t0 * t0;
      return t2 * t2 * (g[0] * gx + g[1] * gy);
    };

    const n0 = contrib(perm[ii + perm[jj]], x0, y0);
    const n1 = contrib(perm[ii + i1 + perm[jj + j1]], x1, y1);
    const n2 = contrib(perm[ii + 1 + perm[jj + 1]], x2, y2);
    return 70 * (n0 + n1 + n2);
  }

  /**
   * Fractal Brownian motion. Keep amplitude modest so it cannot invent continents.
   * @param {number} x
   * @param {number} y
   * @param {number} [octaves]
   */
  function fbm(x, y, octaves = 4) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2D(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / (norm || 1);
  }

  return { noise2D, fbm };
}
