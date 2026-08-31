/**
 * Landform templates as recipes of heightmap operations (Azgaar-style).
 * Tectonics still provide texture; these steps decide the coastline.
 */
import { setLandFraction } from "./tectonics.js";

/** @typedef {{ op: string, n?: number|number[], x?: number, y?: number, rx?: number, ry?: number, amp?: number|number[], jitter?: boolean|number, edge?: number }} LandformStep */

/** @type {{ id: string, label: string, land: number }[]} */
export const LANDFORMS = [
  { id: "continents", label: "诸大陆", land: 0.48 },
  { id: "pangea", label: "盘古大陆", land: 0.58 },
  { id: "archipelago", label: "群岛", land: 0.22 },
  { id: "island", label: "大岛", land: 0.22 },
  { id: "peninsula", label: "半岛", land: 0.36 },
  { id: "isthmus", label: "地峡", land: 0.4 },
  { id: "inland-sea", label: "内海", land: 0.64 },
  { id: "lakes", label: "湖区", land: 0.52 },
];

export const STEP_OPS = [
  { op: "hill", label: "丘" },
  { op: "pit", label: "洼" },
  { op: "range", label: "岭" },
  { op: "trough", label: "槽" },
  { op: "strait", label: "海峡" },
  { op: "sink", label: "沉降" },
  { op: "raise", label: "抬升" },
  { op: "mask", label: "切边" },
];

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
export function landformLabel(id) {
  return landformById(id).label;
}

/** @param {string} [id] */
export function recipeFor(id) {
  const steps = RECIPES[id] || RECIPES.continents;
  return steps.map((s) => ({ ...s }));
}

/** @param {string} op */
export function opLabel(op) {
  return STEP_OPS.find((s) => s.op === op)?.label || op;
}

/** @param {LandformStep} step */
export function stepSummary(step) {
  const name = opLabel(step.op);
  const n = Array.isArray(step.n) ? `${step.n[0]}–${step.n[1]}` : step.n;
  if (n) return `${name} ×${n}`;
  if (step.op === "sink" || step.op === "raise") return `${name} ${step.amp ?? ""}`;
  if (step.op === "mask") return `${name}`;
  return name;
}

/** @param {unknown} raw @returns {LandformStep[] | null} */
export function parseRecipe(raw) {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  /** @type {LandformStep[]} */
  const out = [];
  const allowed = new Set(STEP_OPS.map((s) => s.op));
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const op = String(item.op || "");
    if (!allowed.has(op)) continue;
    out.push({ ...item, op });
  }
  return out;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @param {string} [landformId]
 * @param {number} [seaLevel]
 * @param {LandformStep[] | null} [recipe]
 */
export function applyLandform(cells, rng, width, height, landformId = "continents", seaLevel = 0, recipe = null) {
  const spec = landformById(landformId);
  const steps = Array.isArray(recipe) ? recipe : recipeFor(spec.id);
  if (!steps.length && spec.id === "continents") return;

  for (const step of steps) applyStep(cells, rng, width, height, step);

  setLandFraction(cells, spec.land, seaLevel);
  for (const c of cells) {
    if (c.height > 0) c.height = Math.pow(c.height, 0.86);
    if (c.border) c.height = Math.min(c.height, -0.28);
  }
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @param {LandformStep} step
 */
export function applyStep(cells, rng, width, height, step) {
  const count = pickCount(step.n, rng);
  if (step.op === "sink") {
    addAll(cells, -(Number(step.amp) || 0.16));
    return;
  }
  if (step.op === "raise") {
    addAll(cells, Number(step.amp) || 0.06);
    return;
  }
  if (step.op === "mask") {
    maskEdge(cells, width, height, Number(step.edge) || 0.14, Number(step.amp) || 2.4);
    return;
  }
  if (step.op === "strait") {
    blob(cells, width * 0.5, height * 0.5, width * 0.08, height * 0.55, -(Number(step.amp) || 0.55));
    return;
  }
  const negative = step.op === "pit" || step.op === "trough";
  const elongated = step.op === "range" || step.op === "trough";
  for (let i = 0; i < count; i++) {
    const amp = Math.abs(pickAmp(step.amp, rng)) * (negative ? -1 : 1);
    let rx = (step.rx ?? 0.12) * width;
    let ry = (step.ry ?? 0.1) * height;
    if (elongated && !step.ry) ry = rx * 0.35;
    let x = step.x;
    let y = step.y;
    const jitter = step.jitter;
    if (x == null || y == null || jitter === true) {
      x = 0.12 + rng() * 0.76;
      y = 0.12 + rng() * 0.76;
    } else if (typeof jitter === "number" && jitter > 0) {
      x = clamp01((x ?? 0.5) + (rng() - 0.5) * 2 * jitter);
      y = clamp01((y ?? 0.5) + (rng() - 0.5) * 2 * jitter);
    }
    blob(cells, x * width, y * height, rx, ry, amp);
  }
}

/** @param {unknown} n @param {() => number} rng */
function pickCount(n, rng) {
  if (Array.isArray(n) && n.length >= 2) {
    const a = Number(n[0]) || 1;
    const b = Number(n[1]) || a;
    return a + ((rng() * (b - a + 1)) | 0);
  }
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** @param {unknown} amp @param {() => number} rng */
function pickAmp(amp, rng) {
  if (Array.isArray(amp) && amp.length >= 2) {
    const a = Number(amp[0]) || 0.2;
    const b = Number(amp[1]) || a;
    return a + rng() * (b - a);
  }
  const v = Number(amp);
  return Number.isFinite(v) ? v : 0.3;
}

/** @param {import("../types.js").Cell[]} cells @param {number} delta */
function addAll(cells, delta) {
  for (const c of cells) {
    if (!c.border) c.height += delta;
  }
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} width
 * @param {number} height
 * @param {number} edge
 * @param {number} amp
 */
function maskEdge(cells, width, height, edge, amp) {
  for (const c of cells) {
    if (c.border) continue;
    const nx = c.x / width;
    const ny = c.y / height;
    const d = Math.min(nx, 1 - nx, ny, 1 - ny);
    if (d < edge) c.height -= (edge - d) * amp;
  }
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} amp
 */
function blob(cells, cx, cy, rx, ry, amp) {
  const rxSafe = Math.max(1, rx);
  const rySafe = Math.max(1, ry);
  for (const c of cells) {
    if (c.border) continue;
    const dx = (c.x - cx) / rxSafe;
    const dy = (c.y - cy) / rySafe;
    const d2 = dx * dx + dy * dy;
    if (d2 < 8) c.height += amp * Math.exp(-d2 * 0.85);
  }
}

/** @param {number} t */
function clamp01(t) {
  return Math.max(0.05, Math.min(0.95, t));
}
