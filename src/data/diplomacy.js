/**
 * Plain-JSON helpers for pairwise realm stances.
 * No generation, no DOM — generators place ties; editors and UI rewrite them.
 */
import { STANCE_LABELS } from "./catalogs.js";

/**
 * @param {import("../types.js").DiplomacyTie[]} ties
 * @param {number} regionId
 */
export function tiesFor(ties, regionId) {
  return (ties || []).filter((t) => t.a === regionId || t.b === regionId);
}

/**
 * @param {import("../types.js").DiplomacyTie} tie
 * @param {number} regionId
 */
export function otherId(tie, regionId) {
  return tie.a === regionId ? tie.b : tie.a;
}

/**
 * Drop ties whose realms no longer exist. Does not reroll stances.
 * @param {import("../types.js").DiplomacyTie[]} ties
 * @param {import("../types.js").Region[]} regions
 */
export function pruneDiplomacy(ties, regions) {
  const ids = new Set((regions || []).map((r) => r.id));
  return (ties || []).filter((t) => ids.has(t.a) && ids.has(t.b) && t.a !== t.b);
}

/**
 * @param {import("../types.js").DiplomacyTie[]} ties
 * @param {number} a
 * @param {number} b
 * @param {string} stance
 */
export function setStance(ties, a, b, stance) {
  if (!STANCE_LABELS[stance] || a === b) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const existing = (ties || []).find((t) => t.a === lo && t.b === hi);
  if (existing) {
    existing.stance = stance;
    return existing;
  }
  const tie = { a: lo, b: hi, stance };
  ties.push(tie);
  return tie;
}
