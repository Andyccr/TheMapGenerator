/**
 * Data layer. Factory and clone helpers only — WorldData remains a plain JSON
 * object with no methods attached, so import/export and persistence stay trivial.
 */

/** @typedef {import("../types.js").WorldData} WorldData */
/** @typedef {import("../types.js").GenerateConfig} GenerateConfig */

/** Keep generation and frame time in a comfortable band on typical laptops. */
export const MAX_CELLS = 110000;

/** Baseline hypot(1600, 1000) used by the original default atlas. */
const BASE_SPAN = 1887;

/**
 * Estimate hex-lattice count (matches createMesh packing).
 * @param {number} width
 * @param {number} height
 * @param {number} cellSize
 */
export function estimateCellCount(width, height, cellSize) {
  const w = Math.sqrt(3) * cellSize;
  const h = 1.5 * cellSize;
  return Math.ceil(width / w + 6) * Math.ceil(height / h + 6);
}

/**
 * If the chosen extent × detail would exceed MAX_CELLS, coarsen cellSize.
 * @param {number} width
 * @param {number} height
 * @param {number} cellSize
 */
export function clampGrid(width, height, cellSize) {
  let size = Math.max(3.5, cellSize);
  while (estimateCellCount(width, height, size) > MAX_CELLS && size < 24) {
    size += 0.5;
  }
  return size;
}

/**
 * Convert a world-space length into graph hops for the current cell size.
 * @param {number} worldUnits
 * @param {number} cellSize
 */
export function hopsFromWorld(worldUnits, cellSize) {
  return Math.max(1, Math.round(worldUnits / Math.max(3.5, cellSize)));
}

/**
 * How much larger this map is than the original ~1600×1000 atlas.
 * @param {number} width
 * @param {number} height
 */
export function worldScale(width, height) {
  return Math.max(0.45, Math.hypot(width, height) / BASE_SPAN);
}

/**
 * @param {GenerateConfig} config
 * @returns {WorldData}
 */
export function createWorldShell(config) {
  const width = config.width ?? 2560;
  const height = config.height ?? 1600;
  const cellSize = clampGrid(width, height, config.cellSize ?? 7);
  return {
    version: 1,
    meta: {
      seed: String(config.seed ?? "terra"),
      width,
      height,
      cellSize,
      plateCount: config.plateCount ?? 12,
      seaLevel: config.seaLevel ?? 0,
      wind: config.wind ?? { x: 1, y: 0 },
      style: "atlas",
      societySeed: String(config.societySeed ?? config.seed ?? "terra"),
      mapName: "",
      landform: config.landform || "continents",
      landformSteps: Array.isArray(config.landformSteps) ? config.landformSteps : undefined,
    },
    cells: [],
    plates: [],
    rivers: [],
    settlements: [],
    regions: [],
    cultures: [],
    routes: [],
    markers: [],
    provinces: [],
    religions: [],
    features: [],
    diplomacy: [],
    view: { x: 0, y: 0, scale: 1 },
    generatedAt: new Date().toISOString(),
  };
}

/** @param {WorldData} world */
export function cloneWorld(world) {
  return /** @type {WorldData} */ (structuredClone(world));
}

/**
 * Cheap checksum used by tests and the inspector.
 * @param {WorldData} world
 */
export function summarizeWorld(world) {
  const land = world.cells.filter((c) => !c.ocean && !c.lake).length;
  const ocean = world.cells.filter((c) => c.ocean).length;
  return {
    cells: world.cells.length,
    land,
    ocean,
    rivers: world.rivers.length,
    settlements: world.settlements.length,
    regions: world.regions.length,
    cultures: world.cultures?.length ?? 0,
    routes: world.routes?.length ?? 0,
    markers: world.markers?.length ?? 0,
    provinces: world.provinces?.length ?? 0,
    religions: world.religions?.length ?? 0,
    features: world.features?.length ?? 0,
  };
}

/**
 * Validate a parsed save file. Throws if the document cannot be used.
 * @param {unknown} raw
 * @returns {WorldData}
 */
export function parseWorld(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("存档不是 JSON 对象。");
  }
  const w = /** @type {WorldData} */ (raw);
  if (w.version !== 1) {
    throw new Error(`不支持的世界版本：${String(w.version)}`);
  }
  if (!Array.isArray(w.cells) || !w.meta) {
    throw new Error("存档缺少 cells 或 meta。");
  }
  hydrateWorld(w);
  return w;
}

/**
 * Fill optional playability fields so older JSON saves still load.
 * @param {WorldData} w
 */
export function hydrateWorld(w) {
  if (!w.cultures) w.cultures = [];
  if (!w.routes) w.routes = [];
  if (!w.markers) w.markers = [];
  if (!w.provinces) w.provinces = [];
  if (!w.religions) w.religions = [];
  if (!w.features) w.features = [];
  if (!w.diplomacy) w.diplomacy = [];
  if (!w.meta.societySeed) w.meta.societySeed = w.meta.seed;
  if (!w.meta.mapName) w.meta.mapName = "";
  if (!w.meta.landform) w.meta.landform = "continents";
  for (const c of w.cells) {
    if (c.cultureId == null) c.cultureId = -1;
    if (c.provinceId == null) c.provinceId = -1;
    if (c.religionId == null) c.religionId = -1;
    if (c.featureId == null) c.featureId = -1;
  }
  for (const f of w.features) {
    if (f.cx == null || f.cy == null) {
      const origin = w.cells[f.originId];
      f.cx = origin?.x ?? 0;
      f.cy = origin?.y ?? 0;
    }
    if (f.note == null) f.note = "";
  }
  for (const s of w.settlements) {
    if (s.cultureId == null) s.cultureId = w.cells[s.cellId]?.cultureId ?? -1;
    if (s.population == null) s.population = 0;
    if (s.note == null) s.note = "";
  }
  for (const r of w.rivers) {
    if (r.name == null) r.name = "";
    if (r.note == null) r.note = "";
  }
  for (const r of w.regions) {
    if (r.note == null) r.note = "";
    if (r.cultureId == null) r.cultureId = -1;
  }
  for (const c of w.cultures) {
    if (c.note == null) c.note = "";
  }
  for (const p of w.provinces) {
    if (p.note == null) p.note = "";
  }
  for (const rel of w.religions) {
    if (rel.note == null) rel.note = "";
  }
  for (const m of w.markers) {
    if (m.note == null) m.note = "";
  }
}
