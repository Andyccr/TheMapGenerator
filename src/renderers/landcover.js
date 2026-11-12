/**
 * Draw-only land cover. Biomes stay on the cell; this classification adds
 * the urban / farm / wood split a reference street map needs, and it is
 * never written back into the save.
 */

/** @type {WeakMap<object, { rev: string, use: Uint8Array }>} */
const cache = new WeakMap();

export const COVER = {
  DEEP: 0,
  SHELF: 1,
  LAKE: 2,
  BEACH: 3,
  URBAN: 4,
  FARM: 5,
  WOOD: 6,
  SCRUB: 7,
  ROCK: 8,
  SNOW: 9,
  SAND: 10,
  MARSH: 11,
  GRASS: 12,
};

const WOOD = new Set([
  "TEMPERATE_RAIN_FOREST",
  "TEMPERATE_DECIDUOUS",
  "TROPICAL_RAIN_FOREST",
  "TROPICAL_SEASONAL",
  "TAIGA",
]);

const REACH = { capital: 14, city: 9.5, town: 6, village: 3.2 };

/**
 * @param {import("../types.js").WorldData} world
 * @returns {Uint8Array}
 */
export function landcoverOf(world) {
  const rev = `${world.generatedAt || ""}:${world.meta?.surfaceRev || 0}:${world.settlements?.length || 0}:${world.cells.length}`;
  const hit = cache.get(world);
  if (hit && hit.rev === rev) return hit.use;
  const use = classify(world);
  cache.set(world, { rev, use });
  return use;
}

/**
 * @param {import("../types.js").WorldData} world
 */
function classify(world) {
  const cells = world.cells;
  const use = new Uint8Array(cells.length);
  const spacing = Math.max(4, world.meta?.cellSize || 8);
  for (const cell of cells) {
    if (cell.ocean) {
      use[cell.id] = cell.height < -0.28 ? COVER.DEEP : COVER.SHELF;
      continue;
    }
    if (cell.lake) {
      use[cell.id] = COVER.LAKE;
      continue;
    }
    if (cell.biome === "BEACH" || (cell.coast && cell.height < 0.08)) use[cell.id] = COVER.BEACH;
    else if (cell.biome === "MARSH") use[cell.id] = COVER.MARSH;
    else if (cell.biome === "SNOW" || cell.biome === "ICE" || cell.biome === "TUNDRA") use[cell.id] = COVER.SNOW;
    else if (cell.biome === "SUBTROPICAL_DESERT" || cell.biome === "TEMPERATE_DESERT") use[cell.id] = COVER.SAND;
    else if (cell.biome === "BARE" || cell.biome === "SCORCHED" || cell.mountain) use[cell.id] = COVER.ROCK;
    else if (WOOD.has(cell.biome)) use[cell.id] = COVER.WOOD;
    else if (cell.biome === "SHRUBLAND") use[cell.id] = COVER.SCRUB;
    else if (cell.biome === "GRASSLAND") use[cell.id] = COVER.FARM;
    else use[cell.id] = COVER.GRASS;
  }

  const reach = spacing * 16;
  const inv = 1 / reach;
  /** @type {Map<number, import("../types.js").Settlement[]>} */
  const buckets = new Map();
  for (const place of world.settlements || []) {
    const cell = cells[place.cellId];
    if (!cell) continue;
    const key = (Math.floor(cell.x * inv) + 8000) * 20000 + (Math.floor(cell.y * inv) + 8000);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(place);
  }
  for (const cell of cells) {
    if (cell.ocean || cell.lake) continue;
    if (use[cell.id] === COVER.BEACH || use[cell.id] === COVER.SNOW) continue;
    const gx = Math.floor(cell.x * inv);
    const gy = Math.floor(cell.y * inv);
    let urban = false;
    for (let dy = -1; dy <= 1 && !urban; dy++) {
      for (let dx = -1; dx <= 1 && !urban; dx++) {
        const bucket = buckets.get((gx + dx + 8000) * 20000 + (gy + dy + 8000));
        if (!bucket) continue;
        for (const place of bucket) {
          const home = cells[place.cellId];
          if (!home) continue;
          const radius = spacing * (REACH[place.type] || 3);
          const ex = home.x - cell.x;
          const ey = home.y - cell.y;
          if (ex * ex + ey * ey <= radius * radius) {
            urban = true;
            break;
          }
        }
      }
    }
    if (urban) use[cell.id] = COVER.URBAN;
  }
  return use;
}
