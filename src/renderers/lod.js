/**
 * Cartographic LOD. Zoom changes how the map is *drawn* (generalization,
 * line weight, which labels appear). WorldData cells are never rewritten.
 */

export const LOD_LABELS = {
  overview: "全图",
  regional: "地区",
  local: "近景",
};

/**
 * Relative zoom is scale / fitScale. Fit view is 1.
 * @param {number} relZoom
 */
export function lodFromZoom(relZoom) {
  if (relZoom < 1.28) return "overview";
  if (relZoom < 2.55) return "regional";
  return "local";
}

/**
 * @param {number} relZoom
 * @param {number} cellCount
 * @param {number} visibleEst
 */
export function lodConfig(relZoom, cellCount, visibleEst) {
  const level = lodFromZoom(relZoom);
  return {
    level,
    /**
     * Paint a baked bitmap while the view still holds thousands of cells.
     * Close-up draws welded polygons. Cell edges stay off until the mesh toggle.
     */
    useRaster: visibleEst > 5200 || (level !== "local" && cellCount > 8000),
    /** Overview merges biomes; local keeps Whittaker classes. */
    generalize: level === "overview",
    hillshade: level === "local" && visibleEst < 14000,
    cellEdges: false,
    mountainMarks: level !== "overview",
    mountainStep: level === "regional" ? 3 : 1,
    riverMinWidth: level === "overview" ? 1.25 : level === "regional" ? 0.7 : 0,
    riverSimplify: level === "overview" ? 9 : level === "regional" ? 5 : 0,
    coastWidth: level === "overview" ? 1.7 : level === "regional" ? 1.25 : 1.05,
    borderAlpha: level === "overview" ? 0.78 : 0.5,
    labels: {
      village: level === "local",
      town: true,
      city: true,
      capital: true,
      name: {
        village: relZoom >= 3.2,
        town: relZoom >= 1.55,
        city: true,
        capital: true,
      },
    },
  };
}

/**
 * Broader atlas classes used only while drawing at overview zoom.
 * @param {string} biome
 */
export function macroBiome(biome) {
  if (biome === "OCEAN") return "OCEAN";
  if (biome === "LAKE") return "LAKE";
  if (biome === "ICE" || biome === "SNOW" || biome === "TUNDRA") return "COLD";
  if (
    biome === "TEMPERATE_RAIN_FOREST" ||
    biome === "TEMPERATE_DECIDUOUS" ||
    biome === "TROPICAL_RAIN_FOREST" ||
    biome === "TROPICAL_SEASONAL" ||
    biome === "TAIGA"
  ) {
    return "FOREST";
  }
  if (
    biome === "SUBTROPICAL_DESERT" ||
    biome === "TEMPERATE_DESERT" ||
    biome === "BEACH" ||
    biome === "SCORCHED" ||
    biome === "BARE"
  ) {
    return "DESERT";
  }
  return "GRASS";
}
