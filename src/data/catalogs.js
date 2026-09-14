/**
 * Shared display catalogs. Plain data and tiny lookups — no algorithms, no DOM.
 * Generators, editors, renderers, and UI all read from here so labels and ids
 * cannot drift apart.
 */

export const BIOMES = {
  OCEAN: "OCEAN",
  LAKE: "LAKE",
  ICE: "ICE",
  MARSH: "MARSH",
  BEACH: "BEACH",
  SNOW: "SNOW",
  TUNDRA: "TUNDRA",
  BARE: "BARE",
  SCORCHED: "SCORCHED",
  TAIGA: "TAIGA",
  SHRUBLAND: "SHRUBLAND",
  TEMPERATE_DESERT: "TEMPERATE_DESERT",
  TEMPERATE_RAIN_FOREST: "TEMPERATE_RAIN_FOREST",
  TEMPERATE_DECIDUOUS: "TEMPERATE_DECIDUOUS",
  GRASSLAND: "GRASSLAND",
  TROPICAL_RAIN_FOREST: "TROPICAL_RAIN_FOREST",
  TROPICAL_SEASONAL: "TROPICAL_SEASONAL",
  SUBTROPICAL_DESERT: "SUBTROPICAL_DESERT",
};

/** @type {Record<string, string>} */
export const BIOME_LABELS = {
  OCEAN: "海洋",
  LAKE: "湖泊",
  ICE: "冰面",
  MARSH: "沼泽",
  BEACH: "海滩",
  SNOW: "雪原",
  TUNDRA: "苔原",
  BARE: "裸岩",
  SCORCHED: "焦土",
  TAIGA: "泰加林",
  SHRUBLAND: "灌丛",
  TEMPERATE_DESERT: "温带沙漠",
  TEMPERATE_RAIN_FOREST: "温带雨林",
  TEMPERATE_DECIDUOUS: "落叶林",
  GRASSLAND: "草原",
  TROPICAL_RAIN_FOREST: "热带雨林",
  TROPICAL_SEASONAL: "季雨林",
  SUBTROPICAL_DESERT: "亚热带沙漠",
};

/** Land biomes a GM may stamp. Ocean and lake stay hydrology. */
export const LAND_BIOMES = Object.keys(BIOME_LABELS).filter((k) => k !== "OCEAN" && k !== "LAKE");

/** @type {Record<string, { label: string, glyph: string }>} */
export const MARKER_TYPES = {
  volcano: { label: "火山", glyph: "▲" },
  ruins: { label: "废墟", glyph: "⌂" },
  lighthouse: { label: "灯塔", glyph: "⚑" },
  mine: { label: "矿坑", glyph: "◆" },
  shrine: { label: "神祠", glyph: "✦" },
  dungeon: { label: "地下城", glyph: "▼" },
  dragon: { label: "龙巢", glyph: "⚔" },
  port: { label: "港口", glyph: "⚓" },
};

/** @param {string} type */
export function markerLabel(type) {
  return MARKER_TYPES[type]?.label || type;
}

/** @param {string} type */
export function markerGlyph(type) {
  return MARKER_TYPES[type]?.glyph || "•";
}

/** @type {Record<string, string>} */
export const CULTURE_TYPE_LABELS = {
  river: "河畔",
  naval: "沿海",
  highland: "山地",
  nomad: "草原",
  hunting: "林猎",
  desert: "沙海",
};

/** @param {string} type */
export function cultureTypeLabel(type) {
  return CULTURE_TYPE_LABELS[type] || type;
}

/** @type {Record<string, string>} */
export const RELIGION_TYPE_LABELS = {
  folk: "民俗",
  organized: "建制",
};

/** @param {string} [type] */
export function religionTypeLabel(type) {
  return RELIGION_TYPE_LABELS[type] || RELIGION_TYPE_LABELS.folk;
}

/** @type {Record<string, string>} */
export const FEATURE_TYPE_LABELS = {
  continent: "大陆",
  island: "岛屿",
  lake: "湖泊",
  sea: "海域",
};

/** @param {string} [type] */
export function featureTypeLabel(type) {
  return FEATURE_TYPE_LABELS[type] || "地貌";
}

/** @type {Record<string, string>} */
export const SETTLEMENT_TYPE_LABELS = {
  capital: "都城",
  city: "城市",
  town: "城镇",
  village: "村落",
};

/** @type {Record<string, string>} */
export const LANDFORM_LABELS = {
  continents: "诸大陆",
  pangea: "盘古大陆",
  archipelago: "群岛",
  island: "大岛",
  peninsula: "半岛",
  isthmus: "地峡",
  "inland-sea": "内海",
  lakes: "湖区",
};

/** @param {string} [id] */
export function landformLabel(id) {
  return LANDFORM_LABELS[id] || LANDFORM_LABELS.continents;
}

/** Ordered heightmap ops. Generators keep the algorithms; labels live here. */
export const STEP_OP_ORDER = ["hill", "pit", "range", "trough", "strait", "sink", "raise", "mask"];

/** @type {Record<string, string>} */
export const STEP_OP_LABELS = {
  hill: "丘",
  pit: "洼",
  range: "岭",
  trough: "槽",
  strait: "海峡",
  sink: "沉降",
  raise: "抬升",
  mask: "切边",
};

/** @param {string} op */
export function stepOpLabel(op) {
  return STEP_OP_LABELS[op] || op;
}

/**
 * @param {{ op: string, n?: number|number[], amp?: number|number[] }} step
 */
export function stepSummary(step) {
  const name = stepOpLabel(step.op);
  const n = Array.isArray(step.n) ? `${step.n[0]}–${step.n[1]}` : step.n;
  if (n) return `${name} ×${n}`;
  if (step.op === "sink" || step.op === "raise") return `${name} ${step.amp ?? ""}`;
  if (step.op === "mask") return `${name}`;
  return name;
}

/** @type {Record<string, string>} */
export const STANCE_LABELS = {
  ally: "同盟",
  peace: "和平",
  rival: "敌对",
  war: "交战",
};

/** @param {string} [stance] */
export function stanceLabel(stance) {
  return STANCE_LABELS[stance] || "往来";
}

/** @type {Record<string, string>} */
export const ROUTE_KIND_LABELS = {
  sea: "海路",
  trail: "小径",
  road: "商路",
};

/** @param {string} [kind] */
export function routeKindLabel(kind) {
  return ROUTE_KIND_LABELS[kind] || ROUTE_KIND_LABELS.road;
}
