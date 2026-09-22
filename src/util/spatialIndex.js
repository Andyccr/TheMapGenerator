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

/** @type {WeakMap<object, { cellSize: number, buckets: Map<string, number[]> }>} */
const diskGrids = new WeakMap();

/**
 * Typical neighbor spacing, used as the disk-query bucket size.
 * @param {import("../types.js").Cell[]} cells
 */
function gridSpacing(cells) {
  const a = cells[0];
  const nid = a?.neighbors?.[0];
  const b = nid != null ? cells[nid] : null;
  if (!a || !b) return 16;
  return Math.max(4, Math.hypot(a.x - b.x, a.y - b.y));
}

/**
 * One bucket per cell center. Unlike {@link buildSpatialIndex} this is for
 * radius brushes, not point-in-polygon, so cells are not duplicated.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} spacing
 */
function buildCellGrid(cells, spacing) {
  const cellSize = spacing;
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  for (const c of cells) {
    const key = `${Math.floor(c.x / cellSize)},${Math.floor(c.y / cellSize)}`;
    let b = buckets.get(key);
    if (!b) {
      b = [];
      buckets.set(key, b);
    }
    b.push(c.id);
  }
  return { cellSize, buckets };
}

/**
 * Cell ids whose centers fall inside the disk.
 * The grid is cached on the cells array: positions stay put when a brush
 * edits height, so a stroke does not rescan the whole mesh.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {number[]}
 */
export function cellsInDisk(cells, x, y, radius) {
  if (!cells?.length || !(radius > 0)) return [];
  let grid = diskGrids.get(cells);
  if (!grid) {
    grid = buildCellGrid(cells, gridSpacing(cells));
    diskGrids.set(cells, grid);
  }
  const { cellSize, buckets } = grid;
  const r2 = radius * radius;
  const gx0 = Math.floor((x - radius) / cellSize);
  const gx1 = Math.floor((x + radius) / cellSize);
  const gy0 = Math.floor((y - radius) / cellSize);
  const gy1 = Math.floor((y + radius) / cellSize);
  /** @type {number[]} */
  const out = [];
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = buckets.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const id of bucket) {
        const c = cells[id];
        if (!c) continue;
        const dx = c.x - x;
        const dy = c.y - y;
        if (dx * dx + dy * dy <= r2) out.push(id);
      }
    }
  }
  return out;
}

/**
 * Cell ids whose centers fall inside the rectangle.
 * Shares the brush grid, so a zoomed-in redraw does not walk the whole mesh.
 * @param {import("../types.js").Cell[]} cells
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {(id: number) => void} visit
 */
export function visitCellsInRect(cells, x0, y0, x1, y1, visit) {
  if (!cells?.length) return;
  let grid = diskGrids.get(cells);
  if (!grid) {
    grid = buildCellGrid(cells, gridSpacing(cells));
    diskGrids.set(cells, grid);
  }
  const { cellSize, buckets } = grid;
  const gx0 = Math.floor(x0 / cellSize);
  const gx1 = Math.floor(x1 / cellSize);
  const gy0 = Math.floor(y0 / cellSize);
  const gy1 = Math.floor(y1 / cellSize);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = buckets.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const id of bucket) visit(id);
    }
  }
}
