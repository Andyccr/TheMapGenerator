/**
 * Style presets. Renderer reads these; generators and editors never do.
 * Colors are chosen for atlas printing, not a generic UI palette.
 * Biome *names* live in `data/catalogs.js` so UI and paint stay in sync.
 */
import { macroBiome } from "./lod.js";
import { hinterlandPressure } from "../data/population.js";
import { BIOME_LABELS } from "../data/catalogs.js";
import { climateBeltIndex } from "../data/climate.js";
import { COVER, landcoverOf } from "./landcover.js";

/**
 * Low-zoom reference palette. Land stays a light paper, water a flat blue,
 * and landcover is a wash — the same generalization a z5–z8 basemap uses.
 */
const ATLAS_MACRO = {
  OCEAN: "#aad3df",
  LAKE: "#9ecae0",
  FOREST: "#c5d7a4",
  GRASS: "#efe9d6",
  DESERT: "#f3e6c4",
  COLD: "#eef2f2",
};

/** @type {Record<string, string>} */
export const ATLAS_BIOME = {
  OCEAN: "#aad3df",
  LAKE: "#99c6dc",
  ICE: "#f7fbfd",
  MARSH: "#c5d4b0",
  BEACH: "#f5e9c8",
  SNOW: "#f7f7f7",
  TUNDRA: "#e4e8dc",
  BARE: "#ddd6cc",
  SCORCHED: "#d9cfc0",
  TAIGA: "#b7c99a",
  SHRUBLAND: "#e3e6c4",
  TEMPERATE_DESERT: "#f0e2b8",
  TEMPERATE_RAIN_FOREST: "#a9c892",
  TEMPERATE_DECIDUOUS: "#b7d09a",
  GRASSLAND: "#e7efc8",
  TROPICAL_RAIN_FOREST: "#8fbf86",
  TROPICAL_SEASONAL: "#b5d48a",
  SUBTROPICAL_DESERT: "#f2dd9e",
};

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {string} style
 * @param {"overview"|"regional"|"local"} [lod]
 */
export function fillFor(cell, world, style, lod = "local") {
  if (style === "osm") return osmFill(cell, world);
  if (style === "nautical") return nauticalFill(cell, world);
  if (style === "survey") return surveyFill(cell);
  if (style === "dusk") return duskFill(cell, world);
  if (style === "physical" || style === "height") {
    return lod === "overview" ? physicalOverview(cell) : physicalFill(cell);
  }
  if (style === "bathymetry") return bathymetryFill(cell);
  if (style === "basins") return basinsFill(cell);
  if (style === "belts") return beltsFill(cell, world);
  if (style === "runoff") return runoffFill(cell);
  if (style === "plates") return platesFill(cell);
  if (style === "copper") return copperFill(cell);
  if (style === "satellite") return lod === "overview" ? satelliteOverview(cell) : satelliteFill(cell);
  if (lod === "overview") return fillOverview(cell, world, style);
  if (style === "political") return politicalFill(cell, world, 0.28);
  if (style === "cultural") return culturalFill(cell, world, 0.22);
  if (style === "provinces") return provinceFill(cell, world, 0.2);
  if (style === "religions") return religionFill(cell, world, 0.2);
  if (style === "temperature") return temperatureFill(cell);
  if (style === "precipitation") return precipitationFill(cell);
  if (style === "population") return populationFill(cell, world);
  if (style === "parchment") return parchmentFill(cell);
  if (style === "night") return nightFill(cell);
  if (cell.ocean) return cell.height < -0.42 ? "#8fbed2" : cell.height < -0.16 ? "#aad3df" : "#c5e4ee";
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
  if (style === "political") return politicalFill(cell, world, 0.1);
  if (style === "cultural") return culturalFill(cell, world, 0.08);
  if (style === "provinces") return provinceFill(cell, world, 0.06);
  if (style === "religions") return religionFill(cell, world, 0.06);
  if (style === "temperature") return temperatureFill(cell);
  if (style === "precipitation") return precipitationFill(cell);
  if (style === "population") return populationFill(cell, world);
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
  if (cell.ocean) return cell.height < -0.42 ? "#8fbed2" : "#aad3df";
  if (cell.lake) return ATLAS_MACRO.LAKE;
  if (cell.mountain) return mix(ATLAS_MACRO[macroBiome(cell.biome)] || "#efe9d6", "#e4e0d8", 0.55);
  return ATLAS_MACRO[macroBiome(cell.biome)] || ATLAS_BIOME[cell.biome] || "#efe9d6";
}

const OSM_COVER = {
  [COVER.DEEP]: "#8fbed4",
  [COVER.SHELF]: "#aad3df",
  [COVER.LAKE]: "#99c6dc",
  [COVER.BEACH]: "#fff1ba",
  [COVER.URBAN]: "#e0dfdf",
  [COVER.FARM]: "#eef0d5",
  [COVER.WOOD]: "#add19e",
  [COVER.SCRUB]: "#d1d8b0",
  [COVER.ROCK]: "#e0dcd4",
  [COVER.SNOW]: "#f7f7f7",
  [COVER.SAND]: "#f4e4b5",
  [COVER.MARSH]: "#c5d4b0",
  [COVER.GRASS]: "#f2efe9",
};

const NAUTICAL_COVER = {
  [COVER.DEEP]: "#123a66",
  [COVER.SHELF]: "#7eb6d6",
  [COVER.LAKE]: "#6aa4c4",
  [COVER.BEACH]: "#f6e2a8",
  [COVER.URBAN]: "#d9c7a2",
  [COVER.FARM]: "#efe6c8",
  [COVER.WOOD]: "#b7c48a",
  [COVER.SCRUB]: "#ddd2a4",
  [COVER.ROCK]: "#cabb9a",
  [COVER.SNOW]: "#f4f7f8",
  [COVER.SAND]: "#f3d48a",
  [COVER.MARSH]: "#c5c99a",
  [COVER.GRASS]: "#efe6c8",
};

const DUSK_COVER = {
  [COVER.DEEP]: "#071422",
  [COVER.SHELF]: "#123044",
  [COVER.LAKE]: "#16385a",
  [COVER.BEACH]: "#3a3428",
  [COVER.URBAN]: "#e0a04a",
  [COVER.FARM]: "#243044",
  [COVER.WOOD]: "#1c3328",
  [COVER.SCRUB]: "#2a3030",
  [COVER.ROCK]: "#3a3848",
  [COVER.SNOW]: "#d5dde8",
  [COVER.SAND]: "#3a3428",
  [COVER.MARSH]: "#1a3330",
  [COVER.GRASS]: "#243044",
};

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {Record<number, string>} palette
 */
function coverFill(cell, world, palette) {
  const use = landcoverOf(world);
  return palette[use[cell.id]] || palette[COVER.GRASS];
}

/** @param {import("../types.js").Cell} cell @param {import("../types.js").WorldData} world */
function osmFill(cell, world) {
  return coverFill(cell, world, OSM_COVER);
}

/** @param {import("../types.js").Cell} cell @param {import("../types.js").WorldData} world */
function nauticalFill(cell, world) {
  return coverFill(cell, world, NAUTICAL_COVER);
}

/** @param {import("../types.js").Cell} cell @param {import("../types.js").WorldData} world */
function duskFill(cell, world) {
  return coverFill(cell, world, DUSK_COVER);
}

/** Printed topographic sheet: a few elevation bands, not a smooth ramp. */
function surveyFill(cell) {
  if (cell.ocean) return cell.height < -0.35 ? "#8eb4d0" : "#c5dff0";
  if (cell.lake) return "#b7d4ea";
  if (cell.biome === "SNOW" || cell.biome === "ICE" || cell.height > 0.72) return "#f7f7f7";
  const h = Math.max(0, cell.height);
  if (h < 0.12) return "#d5ebc0";
  if (h < 0.28) return "#e7e3b4";
  if (h < 0.48) return "#e6c896";
  return "#d2b48c";
}

/** @param {import("../types.js").Cell} cell */
function physicalOverview(cell) {
  if (cell.ocean) return cell.height < -0.35 ? "#0e3348" : "#2f6d86";
  if (cell.lake) return "#4a88a0";
  if (cell.mountain) return "#a88862";
  const h = Math.max(0, Math.min(1, (cell.height + 0.05) / 0.85));
  if (h < 0.4) return "#7fa04a";
  if (h < 0.72) return "#c4b05a";
  return "#c4a07a";
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

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {number} biomeMix
 */
function provinceFill(cell, world, biomeMix = 0.2) {
  if (cell.ocean) return "#1c3d52";
  if (cell.lake) return "#3a6e82";
  const p = cell.provinceId >= 0 ? world.provinces?.[cell.provinceId] : null;
  if (p) return mix(p.color, ATLAS_BIOME[cell.biome] || "#888", biomeMix);
  return politicalFill(cell, world, biomeMix);
}

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 * @param {number} biomeMix
 */
function religionFill(cell, world, biomeMix = 0.2) {
  if (cell.ocean) return "#1c3d52";
  if (cell.lake) return "#3a6e82";
  const r = cell.religionId >= 0 ? world.religions?.[cell.religionId] : null;
  if (r) return mix(r.color, ATLAS_BIOME[cell.biome] || "#888", biomeMix);
  return culturalFill(cell, world, biomeMix);
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
 */
function populationFill(cell, world) {
  if (cell.ocean) return "#1a3040";
  if (cell.lake) return "#3a6e82";
  const p = hinterlandPressure(cell, world);
  const t = Math.max(0, Math.min(1, Math.log1p(p) / 4.2));
  if (t < 0.35) return lerpColor("#cbb992", "#d4b46a", t / 0.35);
  if (t < 0.7) return lerpColor("#d4b46a", "#c45a28", (t - 0.35) / 0.35);
  return lerpColor("#c45a28", "#7a1820", (t - 0.7) / 0.3);
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

const BELT_COLORS = ["#3f8f4a", "#d2b15a", "#5d8a4a", "#c5d0d4"];

/** @type {Record<string, string>} */
const SATELLITE_BIOME = {
  LAKE: "#2f6f88",
  ICE: "#e7eef2",
  MARSH: "#4f6848",
  BEACH: "#d9c48a",
  SNOW: "#f2f4f4",
  TUNDRA: "#b7b89a",
  BARE: "#9a846c",
  SCORCHED: "#8a7058",
  TAIGA: "#2f4a38",
  SHRUBLAND: "#8a9348",
  TEMPERATE_DESERT: "#c6a86a",
  TEMPERATE_RAIN_FOREST: "#1e4a32",
  TEMPERATE_DECIDUOUS: "#3d6b3a",
  GRASSLAND: "#8ea24a",
  TROPICAL_RAIN_FOREST: "#143c28",
  TROPICAL_SEASONAL: "#3a7a38",
  SUBTROPICAL_DESERT: "#d4b46a",
};

/** @param {import("../types.js").Cell} cell */
function bathymetryFill(cell) {
  if (cell.ocean) {
    const t = Math.max(0, Math.min(1, (cell.height + 0.85) / 0.85));
    if (t < 0.35) return lerpColor("#061018", "#0c3a5c", t / 0.35);
    if (t < 0.7) return lerpColor("#0c3a5c", "#1a8aa8", (t - 0.35) / 0.35);
    return lerpColor("#1a8aa8", "#b7e3d2", (t - 0.7) / 0.3);
  }
  if (cell.lake) return "#7eb8c4";
  const h = Math.max(0, Math.min(1, cell.height));
  return lerpColor("#e4ddd0", "#8d877c", h * 0.45);
}

/** @param {import("../types.js").Cell} cell */
function basinsFill(cell) {
  if (cell.ocean) return "#16384c";
  if (cell.lake) return "#4a90a4";
  const id = cell.basinId;
  if (id == null || id < 0) return "#8a8074";
  return idColor(id + 3, 0.58, 0.5);
}

/**
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").WorldData} world
 */
function beltsFill(cell, world) {
  const h = world.meta?.height || 1;
  const lat = 1 - (cell.y || 0) / h;
  const base = BELT_COLORS[climateBeltIndex(lat)];
  if (cell.ocean) return mix(base, "#123044", 0.72);
  if (cell.lake) return mix(base, "#2a6478", 0.4);
  const wet = Math.max(0, Math.min(1, cell.moisture ?? 0.5));
  if (wet > 0.55) return mix(base, "#1d4a32", (wet - 0.55) * 0.7);
  return mix(base, "#efe6c4", (0.55 - wet) * 0.55);
}

/** @param {import("../types.js").Cell} cell */
function runoffFill(cell) {
  if (cell.ocean) {
    return lerpColor("#0e2c40", "#3a86a4", Math.max(0, Math.min(1, (cell.height + 0.7) / 0.75)));
  }
  if (cell.lake) return "#2a78a0";
  const t = Math.max(0, Math.min(1, Math.log1p(Math.max(0, cell.flux || 0)) / 5.5));
  if (t < 0.4) return lerpColor("#e6d7a8", "#7aaa62", t / 0.4);
  return lerpColor("#7aaa62", "#143c6a", (t - 0.4) / 0.6);
}

/** @param {import("../types.js").Cell} cell */
function platesFill(cell) {
  const base = idColor(cell.plateId || 0, 0.52, 0.5);
  if (cell.ocean) return mix(base, "#0e2433", 0.62);
  if (cell.lake) return mix(base, "#2a6a80", 0.4);
  if (cell.mountain) return mix(base, "#2c241c", 0.32);
  return base;
}

/** @param {import("../types.js").Cell} cell */
function copperFill(cell) {
  if (cell.ocean) {
    const t = Math.max(0, Math.min(1, (cell.height + 0.8) / 0.8));
    return lerpColor("#5e584e", "#c4baa8", t);
  }
  if (cell.lake) return "#8a94a0";
  const h = Math.max(0, Math.min(1, cell.height));
  return lerpColor("#f3eadc", "#3a342c", h);
}

/** @param {import("../types.js").Cell} cell */
function satelliteFill(cell) {
  if (cell.ocean) {
    const t = Math.max(0, Math.min(1, (cell.height + 0.8) / 0.8));
    return lerpColor("#071820", "#2f7ea0", t);
  }
  if (cell.lake) return SATELLITE_BIOME.LAKE;
  const base = SATELLITE_BIOME[cell.biome] || "#6a7050";
  if (cell.mountain || cell.height > 0.72) {
    return mix(base, "#f4f1ea", Math.min(0.55, Math.max(0, cell.height - 0.55) * 0.85));
  }
  return base;
}

/** @param {import("../types.js").Cell} cell */
function satelliteOverview(cell) {
  if (cell.ocean) return cell.height < -0.35 ? "#071820" : "#1d6484";
  if (cell.lake) return "#2f6f88";
  if (cell.mountain) return "#d5d2c8";
  const m = macroBiome(cell.biome);
  if (m === "FOREST") return "#1e4a32";
  if (m === "DESERT") return "#c6a86a";
  if (m === "COLD") return "#e4e8ea";
  return "#7f9444";
}

/** Stable hue from an integer id. */
function idColor(id, sat, light) {
  const h = (((Number(id) || 0) * 137.508) % 360 + 360) % 360;
  return hslHex(h, sat, light);
}

/** @param {number} h @param {number} s @param {number} l */
function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** @param {string} style */
export function inkFor(style) {
  if (style === "osm") {
    return { coast: "#7fafc6", river: "#6aa4c8", border: "#9e73b8", text: "#333333", paper: "#f2efe9", halo: "#ffffff" };
  }
  if (style === "nautical") {
    return { coast: "#1a1a1a", river: "#1d4e89", border: "#8a3030", text: "#1a1a1a", paper: "#e7eef2", halo: "#f4f7f4" };
  }
  if (style === "survey") {
    return { coast: "#3d6f99", river: "#3d7ea8", border: "#6a3030", text: "#222222", paper: "#f7f6f2", halo: "#ffffff" };
  }
  if (style === "dusk") {
    return { coast: "#7eb8e0", river: "#6aa4d4", border: "#e0b060", text: "#f4efe4", paper: "#0c121c", halo: "#101820", marks: "light" };
  }
  if (style === "night") {
    return { coast: "#6ec8ff", river: "#4aa7d8", border: "#d4a857", text: "#f0e6d2", paper: "#07080f", halo: "#07080f", marks: "light" };
  }
  if (style === "satellite") {
    return { coast: "#e7f2ea", river: "#d5eaf6", border: "#f0ddb0", text: "#f4f1e8", paper: "#101610", halo: "#101610", marks: "light" };
  }
  if (style === "copper") {
    return { coast: "#2a241c", river: "#3a4a58", border: "#4a2420", text: "#1c1610", paper: "#e4dcc8", halo: "#f4ecdf" };
  }
  if (style === "parchment") {
    return { coast: "#3a2a18", river: "#3d5c74", border: "#6a2a22", text: "#2a1c10", paper: "#e8d7b0", halo: "#f3e6c8" };
  }
  if (style === "bathymetry") {
    return { coast: "#102028", river: "#1a5a78", border: "#4a1c1c", text: "#1a120c", paper: "#d5d0c6", halo: "#f4f1ea" };
  }
  return { coast: "#4f7f99", river: "#6aa4c4", border: "#8d6b96", text: "#222222", paper: "#f2efe9", halo: "#f8f6f1" };
}

/**
 * Reference-map highway inks. Null means the fantasy atlas palette.
 * @param {string} kind
 * @param {string} style
 * @param {"overview"|"regional"|"local"} level
 */
function themedRoute(kind, style, level) {
  if (style !== "osm" && style !== "nautical" && style !== "survey" && style !== "dusk") return null;
  if (kind === "sea") {
    const stroke = style === "dusk" ? "#8fd4ff" : style === "nautical" ? "#1d4e89" : "#7eb8d4";
    return { show: true, casing: "", casingWidth: 0, stroke, width: 1.2, dash: [7, 5], alpha: 0.8 };
  }
  if (kind === "trail") {
    const show = style === "osm" ? level !== "overview" : level === "local";
    return { show, casing: "", casingWidth: 0, stroke: style === "dusk" ? "#c8b48a" : "#b0aaa2", width: 0.9, dash: [2, 3], alpha: 0.85 };
  }
  if (style === "osm") {
    if (kind === "trunk") {
      return { show: true, casing: "#dc2a67", stroke: "#e892a2", width: 2.55, casingWidth: 4.35, dash: null, alpha: 1 };
    }
    if (kind === "primary") {
      return { show: true, casing: "#a06b00", stroke: "#fcd6a4", width: 2, casingWidth: 3.45, dash: null, alpha: 1 };
    }
    return { show: true, casing: "#8f8f8f", stroke: "#ffffff", width: level === "overview" ? 1.15 : 1.45, casingWidth: level === "overview" ? 2.15 : 2.55, dash: null, alpha: 1 };
  }
  if (style === "nautical") {
    return { show: kind !== "trail", casing: "", casingWidth: 0, stroke: "#2a241c", width: kind === "trunk" ? 1.35 : 0.9, dash: null, alpha: 0.85 };
  }
  if (style === "survey") {
    const stroke = kind === "trunk" ? "#c23b22" : "#2a2a2a";
    return { show: true, casing: "", casingWidth: 0, stroke, width: kind === "trunk" ? 1.7 : kind === "primary" ? 1.25 : 0.9, dash: null, alpha: 0.9 };
  }
  const stroke = kind === "trunk" ? "#ffd27a" : kind === "primary" ? "#f0b85a" : "#e8d7b0";
  return { show: true, casing: "#5a3a18", stroke, width: kind === "trunk" ? 2.1 : 1.35, casingWidth: kind === "trunk" ? 3.4 : 2.2, dash: null, alpha: 0.95 };
}

export function routePaint(kind, style, level) {
  const themed = themedRoute(kind, style, level);
  if (themed) return themed;
  const night = style === "night" || style === "satellite";
  if (kind === "sea") {
    return { show: true, casing: "", casingWidth: 0, stroke: night ? "#8fd4ff" : "#5b92b0", width: 1.25, dash: [7, 5], alpha: 0.75 };
  }
  if (kind === "trail") {
    return {
      show: true,
      casing: "",
      casingWidth: 0,
      stroke: night ? "#d2c4a4" : "#9a9488",
      width: level === "overview" ? 0.85 : 1.15,
      dash: level === "overview" ? null : [2.2, 3.2],
      alpha: level === "overview" ? 0.55 : 0.9,
    };
  }
  if (kind === "trunk") {
    return {
      show: true,
      casing: night ? "#6a5030" : "#c24e3c",
      stroke: night ? "#ffd98a" : "#e8894a",
      width: 2.35,
      casingWidth: 4.15,
      dash: null,
      alpha: 1,
    };
  }
  if (kind === "primary") {
    return {
      show: true,
      casing: night ? "#5c5038" : "#c4a04a",
      stroke: night ? "#ffe7a8" : "#f6d56a",
      width: 1.85,
      casingWidth: 3.25,
      dash: null,
      alpha: 1,
    };
  }
  return {
    show: true,
    casing: night ? "#3a3a3a" : "#b7b1a6",
    stroke: night ? "#f4f4f4" : "#ffffff",
    width: level === "overview" ? 1.2 : 1.45,
    casingWidth: level === "overview" ? 2.2 : 2.6,
    dash: null,
    alpha: 1,
  };
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
