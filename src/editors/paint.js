/**
 * Cartographic paint: mutate biome / culture / religion / realm / province on
 * land cells. Physical ocean stays ocean — hydrology is a different tool.
 */
import { LAND_BIOMES } from "../data/catalogs.js";

export { LAND_BIOMES };

export const PAINT_LAYERS = [
  { id: "biome", label: "生物群系", style: "atlas" },
  { id: "culture", label: "文化", style: "cultural" },
  { id: "religion", label: "信仰", style: "religions" },
  { id: "realm", label: "国度", style: "political" },
  { id: "province", label: "行省", style: "provinces" },
];

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {number[]}
 */
export function cellsInBrush(world, cx, cy, radius) {
  const r2 = radius * radius;
  /** @type {number[]} */
  const out = [];
  for (const cell of world.cells) {
    if (cell.border || cell.ocean) continue;
    const d2 = (cell.x - cx) ** 2 + (cell.y - cy) ** 2;
    if (d2 <= r2) out.push(cell.id);
  }
  return out;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} layer
 */
export function eyedrop(world, cellId, layer) {
  const cell = world.cells[cellId];
  if (!cell) return "";
  if (layer === "biome") return cell.ocean ? "" : cell.biome || "";
  if (layer === "culture") return cell.cultureId >= 0 ? String(cell.cultureId) : "";
  if (layer === "religion") return cell.religionId >= 0 ? String(cell.religionId) : "";
  if (layer === "realm") return cell.regionId >= 0 ? String(cell.regionId) : "";
  if (layer === "province") return cell.provinceId >= 0 ? String(cell.provinceId) : "";
  return "";
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} layer
 * @param {string} value
 */
export function paintCell(world, cellId, layer, value) {
  const cell = world.cells[cellId];
  if (!cell || cell.ocean || cell.border) return false;
  if (layer === "biome") {
    if (!LAND_BIOMES.includes(value)) return false;
    cell.biome = value;
    return true;
  }
  if (value === "" || value == null) return clearLayer(world, cell, layer);
  if (layer === "culture") {
    const id = Number(value);
    if (!world.cultures?.[id]) return false;
    cell.cultureId = id;
    const s = world.settlements.find((x) => x.cellId === cellId);
    if (s) s.cultureId = id;
    return true;
  }
  if (layer === "religion") {
    const id = Number(value);
    if (!world.religions?.[id]) return false;
    cell.religionId = id;
    return true;
  }
  if (layer === "realm") {
    const id = Number(value);
    if (!world.regions[id]) return false;
    cell.regionId = id;
    const s = world.settlements.find((x) => x.cellId === cellId);
    if (s) s.regionId = id;
    const p = cell.provinceId >= 0 ? world.provinces?.[cell.provinceId] : null;
    if (!p || p.regionId !== id) cell.provinceId = nearestProvince(world, id, cell);
    return true;
  }
  if (layer === "province") {
    const id = Number(value);
    const p = world.provinces?.[id];
    if (!p) return false;
    cell.provinceId = id;
    cell.regionId = p.regionId;
    const s = world.settlements.find((x) => x.cellId === cellId);
    if (s) s.regionId = p.regionId;
    return true;
  }
  return false;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {import("../types.js").Cell} cell
 * @param {string} layer
 */
function clearLayer(world, cell, layer) {
  if (layer === "culture") {
    cell.cultureId = -1;
    const s = world.settlements.find((x) => x.cellId === cell.id);
    if (s) s.cultureId = -1;
    return true;
  }
  if (layer === "religion") {
    cell.religionId = -1;
    return true;
  }
  if (layer === "realm") {
    cell.regionId = -1;
    cell.provinceId = -1;
    const s = world.settlements.find((x) => x.cellId === cell.id);
    if (s) s.regionId = -1;
    return true;
  }
  if (layer === "province") {
    cell.provinceId = -1;
    return true;
  }
  return false;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number[]} cellIds
 * @param {string} layer
 * @param {string} value
 */
export function paintCells(world, cellIds, layer, value) {
  let n = 0;
  for (const id of cellIds) {
    if (paintCell(world, id, layer, value)) n += 1;
  }
  return n;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} regionId
 * @param {import("../types.js").Cell} cell
 */
function nearestProvince(world, regionId, cell) {
  const list = (world.provinces || []).filter((p) => p.regionId === regionId);
  if (!list.length) return -1;
  let best = list[0];
  let bestD = Infinity;
  for (const p of list) {
    const seat = world.settlements.find((s) => s.id === p.seatId);
    const sc = seat ? world.cells[seat.cellId] : null;
    if (!sc) continue;
    const d = (sc.x - cell.x) ** 2 + (sc.y - cell.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.id;
}
