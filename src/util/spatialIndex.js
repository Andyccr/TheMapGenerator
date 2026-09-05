/**
 * Spatial hash so hit-testing thousands of polygons stays cheap.
 * Lives in util so the renderer never imports a generator module.
 *
 * @param {import("../types.js").Cell[]} cells
 * @param {number} spacing
 */
export function buildSpatialIndex(cells, spacing) {
  const cellSize = spacing * 2.2;
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  for (const c of cells) {
    if (c.polygon.length < 3) continue;
    const gx = Math.floor(c.x / cellSize);
    const gy = Math.floor(c.y / cellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${gx + dx},${gy + dy}`;
        let b = buckets.get(key);
        if (!b) {
          b = [];
          buckets.set(key, b);
        }
        b.push(c.id);
      }
    }
  }
  return { cellSize, buckets };
}
