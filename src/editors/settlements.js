/**
 * Founding and deleting towns. Placement scoring stays in generators;
 * these are pointer-driven mutations of WorldData.
 */
import { estimatePopulation } from "../data/population.js";

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} name
 * @param {"city"|"town"|"village"} [type]
 */
export function addSettlement(world, cellId, name, type = "town") {
  const cell = world.cells[cellId];
  if (!cell || cell.ocean || cell.lake) return null;
  if (world.settlements.some((s) => s.cellId === cellId)) return null;
  const id = world.settlements.reduce((m, s) => Math.max(m, s.id), -1) + 1;
  const s = {
    id,
    cellId,
    name,
    type,
    regionId: cell.regionId,
    cultureId: cell.cultureId ?? -1,
    population: estimatePopulation(cell, type),
    note: "",
  };
  world.settlements.push(s);
  return s;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} settlementId
 */
export function removeSettlement(world, settlementId) {
  const s = world.settlements.find((x) => x.id === settlementId);
  if (!s) return false;
  const capitals = world.settlements.filter((x) => x.type === "capital");
  if (s.type === "capital" && capitals.length <= 1) return false;
  if (s.type === "capital") {
    const heir = world.settlements.find((x) => x.id !== s.id && x.regionId === s.regionId && x.type !== "village");
    const region = world.regions.find((r) => r.id === s.regionId);
    if (heir && region) {
      heir.type = "capital";
      heir.population = estimatePopulation(world.cells[heir.cellId], "capital");
      region.capitalId = heir.id;
    }
  }
  world.settlements = world.settlements.filter((x) => x.id !== settlementId);
  return true;
}
