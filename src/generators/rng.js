/**
 * Seeded PRNG. Hash a string to 32 bits, then Mulberry32.
 * Deterministic across sessions so the same seed always yields the same world.
 * @param {string} seed
 * @returns {() => number}  uniform [0, 1)
 */
export function makeRng(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => number} rng @param {number} min @param {number} max */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** @param {() => number} rng */
export function randSign(rng) {
  return rng() < 0.5 ? -1 : 1;
}
