/**
 * Polygon mesh: jittered pointy-top hex lattice whose dual vertices are
 * circumcenters of adjacent site triplets (Amit Patel's dual-mesh idea,
 * using a hex graph instead of a full Delaunay pass).
 *
 * Small jitter + Lloyd relaxation yields organic coastlines without the
 * "clumpy random points" artifacts Martin O'Leary warns against.
 */
import { circumcenter, clipPolygon, polygonCentroid, organicPolygon } from "../util/geometry.js";
import { estimateCellCount } from "../data/worldData.js";

/** odd-r offset neighbors (pointy-top), even then odd rows */
const ODD_R = [
  [
    [1, 0],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 1],
  ],
];

/**
 * @param {{ width: number, height: number, cellSize: number, rng: () => number, lloydIterations?: number }} opts
 */
export function createMesh(opts) {
  const { width, height, cellSize, rng } = opts;
  const size = cellSize;
  const nEst = estimateCellCount(width, height, size);
  const lloydIterations = opts.lloydIterations ?? (nEst > 14000 ? 1 : 2);
  const w = Math.sqrt(3) * size;
  const h = 1.5 * size;
  const pad = 2;
  const cols = Math.ceil(width / w) + pad * 2 + 1;
  const rows = Math.ceil(height / h) + pad * 2 + 1;
  const jitter = 0.3 * size;

  /** @type {import("../types.js").Cell[]} */
  const cells = [];
  /** @type {Map<string, number>} */
  const at = new Map();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = w * (c + 0.5 * (r & 1)) - pad * w;
      const y = h * r - pad * size * 0.25;
      const id = cells.length;
      cells.push({
        id,
        x: x + (rng() - 0.5) * 2 * jitter,
        y: y + (rng() - 0.5) * 2 * jitter,
        neighbors: [],
        polygon: [],
        border: false,
        plateId: 0,
        height: 0,
        filledHeight: 0,
        flux: 0,
        moisture: 0,
        temperature: 0,
        biome: "OCEAN",
        ocean: false,
        lake: false,
        coast: false,
        mountain: false,
        downslope: -1,
        riverId: -1,
        regionId: -1,
        cultureId: -1,
        precipitation: 0,
      });
      at.set(`${c},${r}`, id);
    }
  }

  for (let r = 0; r < rows; r++) {
    const dirs = ODD_R[r & 1];
    for (let c = 0; c < cols; c++) {
      const id = at.get(`${c},${r}`);
      if (id === undefined) continue;
      const cell = cells[id];
      for (const [dc, dr] of dirs) {
        const nid = at.get(`${c + dc},${r + dr}`);
        if (nid !== undefined) cell.neighbors.push(nid);
      }
    }
  }

  const rebuildPolygons = () => {
    for (const cell of cells) {
      const nbs = cell.neighbors
        .map((id) => cells[id])
        .sort((a, b) => Math.atan2(a.y - cell.y, a.x - cell.x) - Math.atan2(b.y - cell.y, b.x - cell.x));
      /** @type {number[][]} */
      const verts = [];
      for (let i = 0; i < nbs.length; i++) {
        const a = nbs[i];
        const b = nbs[(i + 1) % nbs.length];
        if (a.neighbors.includes(b.id)) {
          const cc = circumcenter(cell.x, cell.y, a.x, a.y, b.x, b.y);
          verts.push([cc.x, cc.y]);
        }
      }
      cell.polygon = clipPolygon(verts, 0, 0, width, height);
    }
  };

  rebuildPolygons();

  for (let k = 0; k < lloydIterations; k++) {
    for (const cell of cells) {
      if (cell.polygon.length < 3) continue;
      const cx = cell.x;
      const cy = cell.y;
      const nearEdge = cx < size || cy < size || cx > width - size || cy > height - size;
      if (nearEdge) continue;
      const c = polygonCentroid(cell.polygon);
      cell.x = cx * 0.35 + c.x * 0.65;
      cell.y = cy * 0.35 + c.y * 0.65;
    }
    rebuildPolygons();
  }

  const amp = 0.16 * size;
  const subdivide = cells.length < 12000;
  for (const cell of cells) {
    if (cell.polygon.length >= 3) {
      cell.polygon = clipPolygon(organicPolygon(cell.polygon, amp, subdivide), 0, 0, width, height);
    }
  }

  for (const cell of cells) {
    cell.border =
      cell.polygon.length < 3 ||
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x > width ||
      cell.y > height ||
      cell.neighbors.length < 5;
  }

  return { cells, width, height, spacing: size };
}

/**
 * Spatial hash so hit-testing thousands of polygons stays cheap.
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
