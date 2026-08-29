/**
 * Data layer. Factory and clone helpers only — WorldData remains a plain JSON
 * object with no methods attached, so import/export and LocalStorage stay trivial.
 */

/** @typedef {import("../types.js").WorldData} WorldData */
/** @typedef {import("../types.js").GenerateConfig} GenerateConfig */

/**
 * @param {GenerateConfig} config
 * @returns {WorldData}
 */
export function createWorldShell(config) {
  const width = config.width ?? 1400;
  const height = config.height ?? 900;
  return {
    version: 1,
    meta: {
      seed: String(config.seed ?? "terra"),
      width,
      height,
      cellSize: config.cellSize ?? 18,
      plateCount: config.plateCount ?? 10,
      seaLevel: config.seaLevel ?? 0,
      wind: config.wind ?? { x: 1, y: 0 },
      style: "atlas",
    },
    cells: [],
    plates: [],
    rivers: [],
    settlements: [],
    regions: [],
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
  return w;
}
