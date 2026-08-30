/**
 * Style presets. Renderer reads these; generators and editors never do.
 * Colors are chosen for atlas printing, not a generic UI palette.
 */
import { macroBiome } from "./lod.js";

/** Posterized atlas colors used only at overview zoom. */
const ATLAS_MACRO = {
  OCEAN: "#1a4860",
  LAKE: "#3a7a92",
  FOREST: "#3a6b44",
  GRASS: "#9eaf58",
  DESERT: "#dcc56e",
  COLD: "#d4dce4",
};

/** @type {Record<string, string>} */
export const ATLAS_BIOME = {
  OCEAN: "#1f4f68",
  LAKE: "#3d7f96",
  ICE: "#d9e6ee",
  MARSH: "#6d7f55",
  BEACH: "#e6d5a2",
  SNOW: "#eef2f4",
  TUNDRA: "#c4c6b0",
  BARE: "#c3b09a",
  SCORCHED: "#a89070",
  TAIGA: "#4f7356",
  SHRUBLAND: "#9aa15c",
  TEMPERATE_DESERT: "#d2c07e",
  TEMPERATE_RAIN_FOREST: "#2f6844",
  TEMPERATE_DECIDUOUS: "#5a8a48",
  GRASSLAND: "#a4b45a",
  TROPICAL_RAIN_FOREST: "#245c36",
  TROPICAL_SEASONAL: "#4e9444",
  SUBTROPICAL_DESERT: "#e0c36a",
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

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {string} style
 * @param {"overview"|"regional"|"local"} [lod]
 */
export function fillFor(cell, world, style, lod = "local") {
  if (lod === "overview") return fillOverview(cell, world, style);
  if (style === "physical" || style === "height") return physicalFill(cell);
  if (style === "political") return politicalFill(cell, world, 0.28);
  if (style === "cultural") return culturalFill(cell, world, 0.22);
  if (style === "temperature") return temperatureFill(cell);
  if (style === "precipitation") return precipitationFill(cell);
  if (style === "parchment") return parchmentFill(cell);
  if (style === "night") return nightFill(cell);
  if (cell.ocean) {
    const t = Math.max(0, Math.min(1, (cell.height + 0.75) / 0.75));
    return lerpColor("#123344", "#3d7a94", t);
  }
  return ATLAS_BIOME[cell.biome] || "#666";
}

/**
 * Generalized tints: fewer classes, stronger continents. Cells keep their
 * real biome in WorldData; this is paint-only.
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {string} style
 */
function fillOverview(cell, world, style) {
  if (style === "physical" || style === "height") {
    if (cell.ocean) return cell.height < -0.35 ? "#0e3348" : "#2f6d86";
    if (cell.lake) return "#4a88a0";
    if (cell.mountain) return "#a88862";
    const h = Math.max(0, Math.min(1, (cell.height + 0.05) / 0.85));
    if (h < 0.4) return "#7fa04a";
    if (h < 0.72) return "#c4b05a";
    return "#c4a07a";
  }
  if (style === "political") return politicalFill(cell, world, 0.1);
  if (style === "cultural") return culturalFill(cell, world, 0.08);
  if (style === "temperature") return temperatureFill(cell);
  if (style === "precipitation") return precipitationFill(cell);
  if (style === "parchment") {
    if (cell.ocean) return "#c4b48a";
    if (cell.lake) return "#b7a57a";
    if (cell.mountain) return "#8a7352";
    const m = macroBiome(cell.biome);
    if (m === "FOREST") return "#b39b6a";
    if (m === "DESERT") return "#e6d3a4";
    return "#d8c49a";
  }
  if (style === "night") {
    if (cell.ocean) return "#091018";
    if (cell.lake) return "#16304a";
    const m = macroBiome(cell.biome);
    if (m === "FOREST") return "#142c20";
    if (m === "DESERT") return "#332616";
    if (m === "COLD") return "#243040";
    return "#1a2620";
  }
  if (cell.ocean) return cell.height < -0.32 ? "#123044" : "#2c6a86";
  if (cell.lake) return ATLAS_MACRO.LAKE;
  if (cell.mountain) return mix(ATLAS_MACRO[macroBiome(cell.biome)] || "#888", "#8a7a68", 0.45);
  return ATLAS_MACRO[macroBiome(cell.biome)] || ATLAS_BIOME[cell.biome] || "#666";
}

/** @param {import("../types.js").Cell} cell */
function physicalFill(cell) {
  if (cell.ocean) {
    const d = Math.max(-0.8, cell.height);
    return lerpColor("#0b2a3c", "#3c7a96", (d + 0.8) / 0.8);
  }
  if (cell.lake) return "#4a88a0";
  const h = Math.max(0, Math.min(1, (cell.height + 0.05) / 0.85));
  if (h < 0.25) return lerpColor("#6b8f46", "#c4c45c", h / 0.25);
  if (h < 0.55) return lerpColor("#c4c45c", "#c49a5c", (h - 0.25) / 0.3);
  if (h < 0.8) return lerpColor("#c49a5c", "#9a6b46", (h - 0.55) / 0.25);
  return lerpColor("#9a6b46", "#f2efe8", (h - 0.8) / 0.2);
}

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {number} biomeMix
 */
function culturalFill(cell, world, biomeMix = 0.22) {
  if (cell.ocean) return "#1c3d52";
  if (cell.lake) return "#3a6e82";
  const cult = cell.cultureId >= 0 ? world.cultures?.[cell.cultureId] : null;
  if (cult) return mix(cult.color, ATLAS_BIOME[cell.biome] || "#888", biomeMix);
  if (cell.regionId >= 0) return politicalFill(cell, world, biomeMix);
  return "#6a6258";
}

/** @param {import("../types.js").Cell} cell */
function temperatureFill(cell) {
  if (cell.ocean) return lerpColor("#12304a", "#2a6a88", Math.max(0, Math.min(1, (cell.height + 0.7) / 0.8)));
  if (cell.lake) return "#3a7a96";
  const t = Math.max(0, Math.min(1, cell.temperature));
  if (t < 0.35) return lerpColor("#9bb4d8", "#e8eef2", t / 0.35);
  if (t < 0.6) return lerpColor("#e8eef2", "#e8d07a", (t - 0.35) / 0.25);
  return lerpColor("#e8d07a", "#c44a28", (t - 0.6) / 0.4);
}

/** @param {import("../types.js").Cell} cell */
function precipitationFill(cell) {
  if (cell.ocean) return "#1a4860";
  if (cell.lake) return "#3d7f96";
  const m = Math.max(0, Math.min(1, cell.moisture));
  if (m < 0.35) return lerpColor("#c4a05a", "#c4c46a", m / 0.35);
  if (m < 0.65) return lerpColor("#c4c46a", "#5a9e6a", (m - 0.35) / 0.3);
  return lerpColor("#5a9e6a", "#1a6a78", (m - 0.65) / 0.35);
}

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {number} biomeMix
 */
function politicalFill(cell, world, biomeMix = 0.28) {
  if (cell.ocean) return "#1c3d52";
  if (cell.lake) return "#3a6e82";
  if (cell.regionId >= 0) {
    const col = world.regions[cell.regionId]?.color || "#888";
    return mix(col, ATLAS_BIOME[cell.biome] || "#888", biomeMix);
  }
  return "#6a6258";
}

/** @param {import("../types.js").Cell} cell */
function parchmentFill(cell) {
  if (cell.ocean) return "#cbb992";
  if (cell.lake) return "#b7a57a";
  if (cell.mountain) return "#8a7352";
  if (cell.biome.includes("FOREST") || cell.biome === "TAIGA") return "#b39b6a";
  if (cell.biome.includes("DESERT") || cell.biome === "BEACH") return "#e6d3a4";
  return "#d8c49a";
}

/** @param {import("../types.js").Cell} cell */
function nightFill(cell) {
  if (cell.ocean) return "#0b1020";
  if (cell.lake) return "#16304a";
  if (cell.mountain) return "#3a3548";
  if (cell.biome.includes("FOREST") || cell.biome === "TAIGA") return "#163324";
  if (cell.biome.includes("DESERT")) return "#3a2c18";
  if (cell.biome === "SNOW" || cell.biome === "TUNDRA" || cell.biome === "ICE") return "#2a3444";
  return "#1e2a22";
}

/** @param {string} style */
export function inkFor(style) {
  if (style === "night") {
    return { coast: "#6ec8ff", river: "#4aa7d8", border: "#d4a857", text: "#f0e6d2", paper: "#07080f" };
  }
  if (style === "parchment") {
    return { coast: "#3a2a18", river: "#3d5c74", border: "#6a2a22", text: "#2a1c10", paper: "#e8d7b0" };
  }
  return { coast: "#102028", river: "#1c5a78", border: "#4a1c1c", text: "#1a120c", paper: "#d8c7a0" };
}

/** @param {string} a @param {string} b @param {number} t */
function lerpColor(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  const u = Math.max(0, Math.min(1, t));
  const r = (A[0] + (B[0] - A[0]) * u) | 0;
  const g = (A[1] + (B[1] - A[1]) * u) | 0;
  const bl = (A[2] + (B[2] - A[2]) * u) | 0;
  return `rgb(${r},${g},${bl})`;
}

/** @param {string} a @param {string} b @param {number} t mix b into a */
function mix(a, b, t) {
  return lerpColor(a, b, t);
}

/** @param {string} c */
function hex(c) {
  const s = c.replace("#", "");
  if (s.length === 3) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
  }
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
