/**
 * Style presets. Renderer reads these; generators and editors never do.
 * Colors are chosen for atlas printing, not a generic UI palette.
 */

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
  OCEAN: "Ocean",
  LAKE: "Lake",
  ICE: "Ice",
  MARSH: "Marsh",
  BEACH: "Beach",
  SNOW: "Snow",
  TUNDRA: "Tundra",
  BARE: "Bare rock",
  SCORCHED: "Scorched",
  TAIGA: "Taiga",
  SHRUBLAND: "Shrubland",
  TEMPERATE_DESERT: "Temperate desert",
  TEMPERATE_RAIN_FOREST: "Temperate rainforest",
  TEMPERATE_DECIDUOUS: "Deciduous forest",
  GRASSLAND: "Grassland",
  TROPICAL_RAIN_FOREST: "Tropical rainforest",
  TROPICAL_SEASONAL: "Seasonal forest",
  SUBTROPICAL_DESERT: "Subtropical desert",
};

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {string} style
 */
export function fillFor(cell, world, style) {
  if (style === "physical") return physicalFill(cell);
  if (style === "political") return politicalFill(cell, world);
  if (style === "parchment") return parchmentFill(cell);
  if (style === "night") return nightFill(cell);
  return ATLAS_BIOME[cell.biome] || "#666";
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
 */
function politicalFill(cell, world) {
  if (cell.ocean) return "#1c3d52";
  if (cell.lake) return "#3a6e82";
  if (cell.regionId >= 0) {
    const col = world.regions[cell.regionId]?.color || "#888";
    return mix(col, ATLAS_BIOME[cell.biome] || "#888", 0.28);
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
