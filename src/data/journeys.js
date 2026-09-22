/**
 * Campaign journeys are plain JSON: a walked cell path plus a day-by-day
 * chronicle. Pathfinding stays in generators; this module only reads the
 * save file and writes consistent journey records.
 */
import { BIOME_LABELS, journeyModeLabel } from "./catalogs.js";

const SHIP = 26;
const ROAD = 20;
const TRAIL = 15;
const OPEN = 14;
const WOODS = 12;
const DRY = 11;
const HILL = 9;
const MARSH = 8;
const PEAK = 6;
const FORD_DAYS = 0.35;

const WOODS_BIOMES = new Set([
  "TAIGA",
  "TEMPERATE_RAIN_FOREST",
  "TEMPERATE_DECIDUOUS",
  "TROPICAL_RAIN_FOREST",
  "TROPICAL_SEASONAL",
]);

const DRY_BIOMES = new Set(["SUBTROPICAL_DESERT", "TEMPERATE_DESERT"]);

/**
 * Road and trail cells are cheaper to march. Sea lanes are not corridors.
 * @param {import("../types.js").WorldData} world
 * @returns {Uint8Array} 0 none, 1 trail, 2 road
 */
export function corridorMask(world) {
  const mask = new Uint8Array(world.cells.length);
  for (const route of world.routes || []) {
    const rank = route.kind === "road" ? 2 : route.kind === "trail" ? 1 : 0;
    if (!rank) continue;
    for (const id of route.cellIds) {
      if (rank > mask[id]) mask[id] = rank;
    }
  }
  return mask;
}

/**
 * Leagues a party can cover in a day on this cell.
 * @param {import("../types.js").Cell} cell
 * @param {number} rank corridor rank from {@link corridorMask}
 */
export function paceLeaguesPerDay(cell, rank) {
  if (!cell) return OPEN;
  if (cell.ocean) return SHIP;
  if (rank >= 2) return ROAD;
  if (rank === 1) return TRAIL;
  if (cell.mountain || cell.biome === "SCORCHED" || cell.biome === "BARE") return PEAK;
  if (cell.height > 0.38 || cell.biome === "SNOW" || cell.biome === "TUNDRA") return HILL;
  if (cell.lake || cell.biome === "MARSH") return MARSH;
  if (WOODS_BIOMES.has(cell.biome)) return WOODS;
  if (DRY_BIOMES.has(cell.biome)) return DRY;
  return OPEN;
}

/** @param {number} days */
export function formatDays(days) {
  const d = Math.round(Number(days) * 10) / 10;
  const text = Number.isInteger(d) ? String(d) : d.toFixed(1);
  return `${text} 日`;
}

/**
 * @param {import("../types.js").Journey} journey
 */
export function formatJourneySummary(journey) {
  return `${journeyModeLabel(journey.mode)} · ${formatDays(journey.days)} · ${journey.leagues} 里格`;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 */
export function journeysThrough(world, cellId) {
  return (world.journeys || []).filter((j) => j.cellIds?.includes(cellId));
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} id
 * @returns {number}
 */
export function removeJourney(world, id) {
  const before = world.journeys?.length || 0;
  world.journeys = (world.journeys || []).filter((j) => j.id !== id);
  return before - world.journeys.length;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} id
 * @param {string} name
 */
export function renameJourney(world, id, name) {
  const journey = (world.journeys || []).find((j) => j.id === id);
  if (!journey) return false;
  const next = String(name || "").trim();
  if (!next) return false;
  journey.name = next;
  return true;
}

/**
 * Turn a cell path into leagues, days, and the stops a GM would write down.
 * Does not mutate the world.
 * @param {import("../types.js").WorldData} world
 * @param {number[]} cellIds
 */
export function chronicle(world, cellIds) {
  const cells = world.cells;
  const ids = cellIds.filter((id) => cells[id]);
  const empty = { days: 0, leagues: 0, mode: "march", legs: /** @type {import("../types.js").JourneyLeg[]} */ ([]) };
  if (!ids.length) return empty;
  const mask = corridorMask(world);
  const townAt = new Map((world.settlements || []).map((s) => [s.cellId, s]));
  const markerAt = new Map((world.markers || []).map((m) => [m.cellId, m]));
  /** @param {import("../types.js").Cell} cell */
  const placeLabel = (cell) => {
    const town = townAt.get(cell.id);
    if (town) return town.name;
    const marker = markerAt.get(cell.id);
    if (marker) return marker.name;
    return BIOME_LABELS[cell.biome] || cell.biome || "旷野";
  };
  let days = 0;
  let leagues = 0;
  let ocean = cells[ids[0]].ocean ? 1 : 0;
  /** @type {import("../types.js").JourneyLeg[]} */
  const legs = [];
  let lastLegDay = -1;
  /** @param {number} cellId @param {string} kind @param {string} label */
  const pushLeg = (cellId, kind, label) => {
    legs.push({ cellId, day: Math.round(days * 10) / 10, kind, label });
    lastLegDay = days;
  };
  pushLeg(ids[0], "start", placeLabel(cells[ids[0]]));
  for (let i = 1; i < ids.length; i++) {
    const prev = cells[ids[i - 1]];
    const cell = cells[ids[i]];
    const dist = Math.hypot(cell.x - prev.x, cell.y - prev.y);
    const rank = mask[cell.id] || 0;
    const pace = Math.max(1, paceLeaguesPerDay(cell, rank));
    days += dist / pace;
    const fording = cell.riverId >= 0 && prev.riverId < 0 && rank < 2 && !cell.ocean;
    if (fording) days += FORD_DAYS;
    leagues += dist;
    if (cell.ocean) ocean += 1;
    const last = i === ids.length - 1;
    if (last) {
      if (fording && !townAt.get(cell.id)) {
        const river = world.rivers?.[cell.riverId];
        pushLeg(cell.id, "ford", river?.name || "渡河");
      }
      pushLeg(cell.id, "end", placeLabel(cell));
      break;
    }
    const town = townAt.get(cell.id);
    if (town) {
      pushLeg(cell.id, "town", town.name);
      continue;
    }
    const marker = markerAt.get(cell.id);
    if (marker) {
      pushLeg(cell.id, "marker", marker.name);
      continue;
    }
    if (fording) {
      const river = world.rivers?.[cell.riverId];
      pushLeg(cell.id, "ford", river?.name || "渡河");
      continue;
    }
    if (cell.biome !== prev.biome && days - lastLegDay >= 0.8) {
      pushLeg(cell.id, "biome", BIOME_LABELS[cell.biome] || cell.biome || "旷野");
    }
  }
  const frac = ocean / ids.length;
  const mode = frac > 0.6 ? "voyage" : ocean > 0 ? "mixed" : "march";
  return {
    days: Math.round(days * 10) / 10,
    leagues: Math.round(leagues),
    mode,
    legs,
  };
}
