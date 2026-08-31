/**
 * Landform templates. Tectonics still provide the texture (belts, shelves,
 * rifts); these masks decide the *silhouette* — island, pangea, archipelago —
 * the way Azgaar's heightmap templates decide the coastline before biomes.
 */
import { setLandFraction } from "./tectonics.js";

/** @type {{ id: string, label: string, land: number }[]} */
export const LANDFORMS = [
  { id: "continents", label: "诸大陆", land: 0.48 },
  { id: "pangea", label: "盘古大陆", land: 0.58 },
  { id: "archipelago", label: "群岛", land: 0.26 },
  { id: "island", label: "大岛", land: 0.22 },
  { id: "peninsula", label: "半岛", land: 0.36 },
  { id: "isthmus", label: "地峡", land: 0.4 },
  { id: "inland-sea", label: "内海", land: 0.64 },
  { id: "lakes", label: "湖区", land: 0.52 },
];

/** @param {string} [id] */
export function landformById(id) {
  return LANDFORMS.find((t) => t.id === id) || LANDFORMS[0];
}

/** @param {string} [id] */
export function landformLabel(id) {
  return landformById(id).label;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @param {number} width
 * @param {number} height
 * @param {string} [landformId]
 * @param {number} [seaLevel]
 */
export function applyLandform(cells, rng, width, height, landformId = "continents", seaLevel = 0) {
  const spec = landformById(landformId);
  if (spec.id === "continents") return;

  const hill = (cx, cy, rx, ry, amp) => {
    for (const c of cells) {
      if (c.border) continue;
      const dx = (c.x - cx) / rx;
      const dy = (c.y - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 < 8) c.height += amp * Math.exp(-d2 * 0.85);
    }
  };

  if (spec.id === "pangea") {
    for (const c of cells) {
      if (c.border) continue;
      c.height += 0.06;
      const nx = c.x / width;
      const ny = c.y / height;
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      if (edge < 0.14) c.height -= (0.14 - edge) * 2.4;
    }
    hill(width * 0.5, height * 0.5, width * 0.42, height * 0.4, 0.38);
  } else if (spec.id === "island") {
    for (const c of cells) {
      if (!c.border) c.height -= 0.2;
    }
    hill(width * (0.42 + rng() * 0.16), height * (0.44 + rng() * 0.12), width * 0.28, height * 0.26, 0.62);
    const islets = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < islets; i++) {
      hill(width * (0.18 + rng() * 0.64), height * (0.18 + rng() * 0.64), width * 0.07, height * 0.06, 0.28 + rng() * 0.12);
    }
  } else if (spec.id === "archipelago") {
    for (const c of cells) {
      if (!c.border) c.height -= 0.24;
    }
    const n = 10 + ((rng() * 8) | 0);
    for (let i = 0; i < n; i++) {
      hill(
        width * (0.12 + rng() * 0.76),
        height * (0.12 + rng() * 0.76),
        width * (0.045 + rng() * 0.07),
        height * (0.04 + rng() * 0.06),
        0.26 + rng() * 0.28,
      );
    }
  } else if (spec.id === "peninsula") {
    const side = (rng() * 4) | 0;
    const cx = side === 0 ? width * 0.12 : side === 1 ? width * 0.88 : width * (0.35 + rng() * 0.3);
    const cy = side === 2 ? height * 0.12 : side === 3 ? height * 0.88 : height * (0.35 + rng() * 0.3);
    for (const c of cells) {
      if (!c.border) c.height -= 0.16;
    }
    hill(cx, cy, width * 0.34, height * 0.32, 0.55);
    hill(
      (cx + width * 0.5) / 2,
      (cy + height * 0.5) / 2,
      width * 0.18,
      height * 0.16,
      0.32,
    );
  } else if (spec.id === "isthmus") {
    for (const c of cells) {
      if (!c.border) c.height -= 0.14;
    }
    hill(width * 0.22, height * 0.48, width * 0.2, height * 0.28, 0.5);
    hill(width * 0.78, height * 0.52, width * 0.2, height * 0.28, 0.5);
    hill(width * 0.5, height * 0.5, width * 0.16, height * 0.08, 0.42);
  } else if (spec.id === "inland-sea") {
    for (const c of cells) {
      if (c.border) continue;
      const nx = c.x / width;
      const ny = c.y / height;
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      c.height += 0.1 + edge * 0.08;
    }
    hill(width * 0.5, height * 0.5, width * 0.28, height * 0.24, -0.72);
  } else if (spec.id === "lakes") {
    const pits = 6 + ((rng() * 6) | 0);
    for (let i = 0; i < pits; i++) {
      hill(
        width * (0.22 + rng() * 0.56),
        height * (0.22 + rng() * 0.56),
        width * (0.05 + rng() * 0.05),
        height * (0.045 + rng() * 0.04),
        -0.22 - rng() * 0.18,
      );
    }
  }

  setLandFraction(cells, spec.land, seaLevel);
  for (const c of cells) {
    if (c.height > 0) c.height = Math.pow(c.height, 0.86);
    if (c.border) c.height = Math.min(c.height, -0.28);
  }
}
