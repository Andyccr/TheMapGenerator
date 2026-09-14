/**
 * Pairwise stances between neighboring realms. Not a simulation: a legend
 * for the GM, generated once from culture overlap and a dice roll.
 *
 * Display labels and JSON helpers live in data/; this file is the algorithm.
 */
import { STANCE_LABELS, stanceLabel } from "../data/catalogs.js";
import { tiesFor, otherId, setStance, pruneDiplomacy } from "../data/diplomacy.js";

export { STANCE_LABELS, stanceLabel, tiesFor, otherId, setStance, pruneDiplomacy };

/**
 * @param {import("../types.js").Region[]} regions
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @returns {import("../types.js").DiplomacyTie[]}
 */
export function placeDiplomacy(regions, cells, rng) {
  /** @type {import("../types.js").DiplomacyTie[]} */
  const ties = [];
  if (regions.length < 2) return ties;

  /** @type {Set<string>} */
  const seen = new Set();
  for (const cell of cells) {
    if (cell.ocean || cell.regionId < 0) continue;
    for (const nid of cell.neighbors) {
      const r2 = cells[nid].regionId;
      if (r2 < 0 || r2 === cell.regionId) continue;
      const a = Math.min(cell.regionId, r2);
      const b = Math.max(cell.regionId, r2);
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const same = regions[a]?.cultureId != null && regions[a].cultureId === regions[b]?.cultureId;
      const roll = rng();
      let stance = "peace";
      if (same) {
        stance = roll < 0.4 ? "ally" : roll < 0.88 ? "peace" : "rival";
      } else {
        stance = roll < 0.1 ? "ally" : roll < 0.48 ? "peace" : roll < 0.78 ? "rival" : "war";
      }
      ties.push({ a, b, stance });
    }
  }
  return ties;
}
