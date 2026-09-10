/**
 * Factory helpers for GM-created cultures, faiths, and realms.
 * Editors own these mutations; they do not flood the map — paint does that.
 */
import { pickPhonology } from "../generators/names.js";
import { makeRng } from "../generators/rng.js";

const PALETTE = ["#8c3a3a", "#3a5f8c", "#6a7a38", "#7a4e8c", "#8c6a32", "#2f6d62", "#8c4e5c", "#4e6a8c", "#6a4e32", "#a33b24"];

/** @param {Set<string>} used */
export function nextColor(used) {
  return PALETTE.find((c) => !used.has(c.toLowerCase()) && !used.has(c)) || PALETTE[used.size % PALETTE.length];
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} name
 * @param {string} [type]
 */
export function createCulture(world, cellId, name, type = "river") {
  const cell = world.cells[cellId];
  if (!cell || cell.ocean || cell.border || !name) return null;
  if (!world.cultures) world.cultures = [];
  const id = world.cultures.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  const used = new Set(world.cultures.map((c) => c.color));
  const phon = pickPhonology(makeRng(`${world.meta.seed}:culture:${id}`));
  const cult = {
    id,
    name,
    color: nextColor(used),
    type,
    originId: cellId,
    phonologyId: phon.id,
    note: "",
  };
  world.cultures.push(cult);
  cell.cultureId = id;
  const s = world.settlements.find((x) => x.cellId === cellId);
  if (s) s.cultureId = id;
  return cult;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} name
 * @param {"folk"|"organized"} [type]
 */
export function createReligion(world, cellId, name, type = "organized") {
  const cell = world.cells[cellId];
  if (!cell || cell.ocean || cell.border || !name) return null;
  if (!world.religions) world.religions = [];
  const id = world.religions.reduce((m, r) => Math.max(m, r.id), -1) + 1;
  const used = new Set(world.religions.map((r) => r.color));
  const rel = {
    id,
    name,
    type,
    cultureId: cell.cultureId,
    color: nextColor(used),
    originId: cellId,
    note: "",
  };
  world.religions.push(rel);
  cell.religionId = id;
  return rel;
}

/**
 * Found a realm at an existing town. Does not flood neighbors.
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} name
 */
export function createRealm(world, cellId, name) {
  const cell = world.cells[cellId];
  const town = world.settlements.find((s) => s.cellId === cellId);
  if (!cell || cell.ocean || !town || !name) return null;
  const id = world.regions.reduce((m, r) => Math.max(m, r.id), -1) + 1;
  const used = new Set(world.regions.map((r) => r.color));
  const realm = {
    id,
    name,
    color: nextColor(used),
    capitalId: town.id,
    cultureId: town.cultureId,
    note: "",
  };
  world.regions.push(realm);
  town.type = "capital";
  town.regionId = id;
  cell.regionId = id;
  return realm;
}
