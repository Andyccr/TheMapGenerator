/**
 * Landform recipe data: ids, land fractions, and heightmap step lists.
 * Algorithms that apply those steps live in generators/landforms.js.
 */
import { LANDFORM_LABELS, STEP_OP_ORDER } from "./catalogs.js";

/** @typedef {{ op: string, n?: number|number[], x?: number, y?: number, rx?: number, ry?: number, amp?: number|number[], jitter?: boolean|number, edge?: number }} LandformStep */

/** @type {{ id: string, land: number }[]} */
export const LANDFORM_SPECS = [
  { id: "continents", land: 0.48 },
  { id: "pangea", land: 0.58 },
  { id: "archipelago", land: 0.22 },
  { id: "island", land: 0.22 },
  { id: "peninsula", land: 0.36 },
  { id: "isthmus", land: 0.4 },
  { id: "inland-sea", land: 0.64 },
  { id: "lakes", land: 0.52 },
];

/** @type {{ id: string, label: string, land: number }[]} */
export const LANDFORMS = LANDFORM_SPECS.map((s) => ({ ...s, label: LANDFORM_LABELS[s.id] }));

/** @type {Record<string, LandformStep[]>} */
export const RECIPES = {
  continents: [],
  pangea: [
    { op: "raise", amp: 0.06 },
    { op: "mask", edge: 0.14, amp: 2.4 },
    { op: "hill", x: 0.5, y: 0.5, rx: 0.42, ry: 0.4, amp: 0.38 },
  ],
  island: [
    { op: "sink", amp: 0.2 },
    { op: "hill", x: 0.5, y: 0.5, rx: 0.28, ry: 0.26, amp: 0.62, jitter: 0.08 },
    { op: "hill", n: [2, 5], rx: 0.07, ry: 0.06, amp: [0.28, 0.4], jitter: true },
  ],
  archipelago: [
    { op: "sink", amp: 0.38 },
    { op: "hill", n: [16, 24], rx: 0.04, ry: 0.035, amp: [0.38, 0.7], jitter: true },
  ],
  peninsula: [
    { op: "sink", amp: 0.16 },
    { op: "range", n: 1, rx: 0.34, ry: 0.32, amp: 0.55, jitter: true },
    { op: "hill", x: 0.5, y: 0.5, rx: 0.18, ry: 0.16, amp: 0.32 },
  ],
  isthmus: [
    { op: "sink", amp: 0.14 },
    { op: "hill", x: 0.22, y: 0.48, rx: 0.2, ry: 0.28, amp: 0.5 },
    { op: "hill", x: 0.78, y: 0.52, rx: 0.2, ry: 0.28, amp: 0.5 },
    { op: "range", x: 0.5, y: 0.5, rx: 0.16, ry: 0.08, amp: 0.42 },
  ],
  "inland-sea": [
    { op: "raise", amp: 0.1 },
    { op: "mask", edge: 0.12, amp: -0.7 },
    { op: "pit", x: 0.5, y: 0.5, rx: 0.28, ry: 0.24, amp: 0.72 },
  ],
  lakes: [{ op: "pit", n: [6, 12], rx: 0.055, ry: 0.05, amp: [0.22, 0.4], jitter: true }],
};

/** @param {string} [id] */
export function landformById(id) {
  return LANDFORMS.find((t) => t.id === id) || LANDFORMS[0];
}

/** @param {string} [id] */
export function recipeFor(id) {
  const steps = RECIPES[id] || RECIPES.continents;
  return steps.map((s) => ({ ...s }));
}

/** @param {unknown} raw @returns {LandformStep[] | null} */
export function parseRecipe(raw) {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  /** @type {LandformStep[]} */
  const out = [];
  const allowed = new Set(STEP_OP_ORDER);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const op = String(item.op || "");
    if (!allowed.has(op)) continue;
    out.push({ ...item, op });
  }
  return out;
}
