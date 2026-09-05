/**
 * Cultures: a handful of ethnolinguistic hearths that flood across land
 * with biome affinities (Azgaar-style, simplified). Cultures name people;
 * realms are political and grow later from capitals.
 */
import { MinHeap } from "../util/heap.js";
import { worldScale } from "../data/worldData.js";
import { createNameFactory, pickPhonology } from "./names.js";
import { CULTURE_TYPE_LABELS, cultureTypeLabel } from "../data/catalogs.js";

export { cultureTypeLabel };

/** @type {{ id: string, label: string, color: string }[]} */
export const CULTURE_TYPES = [
  { id: "river", label: CULTURE_TYPE_LABELS.river, color: "#3a6f8c" },
  { id: "naval", label: CULTURE_TYPE_LABELS.naval, color: "#2f6d62" },
  { id: "highland", label: CULTURE_TYPE_LABELS.highland, color: "#8c5a32" },
  { id: "nomad", label: CULTURE_TYPE_LABELS.nomad, color: "#8c8a32" },
  { id: "hunting", label: CULTURE_TYPE_LABELS.hunting, color: "#3a6b44" },
  { id: "desert", label: CULTURE_TYPE_LABELS.desert, color: "#c49a3a" },
];

const PALETTE = ["#8c3a3a", "#3a5f8c", "#6a7a38", "#7a4e8c", "#8c6a32", "#2f6d62", "#8c4e5c", "#4e6a8c", "#6a4e32"];

/**
 * Step cost for culture expansion. Lower = more native.
 * @param {import("../types.js").Cell} n
 * @param {string} type
 */
export function cultureStep(n, type) {
  if (n.ocean) return 7.2;
  let step = 1;
  if (n.mountain) step = 2.6;
  else if (n.lake) step = 2.1;
  else if (n.height > 0.4) step = 1.5;
  if (type === "river") {
    if (n.riverId >= 0) step *= 0.42;
    if (n.biome.includes("DESERT")) step *= 1.6;
  } else if (type === "naval") {
    if (n.coast) step *= 0.38;
    if (!n.coast && n.riverId < 0) step *= 1.55;
  } else if (type === "highland") {
    if (n.mountain || n.height > 0.32) step *= 0.45;
    if (n.coast) step *= 1.4;
  } else if (type === "nomad") {
    if (n.biome === "GRASSLAND" || n.biome === "SHRUBLAND") step *= 0.4;
    if (n.biome.includes("FOREST") || n.biome === "TAIGA") step *= 1.7;
  } else if (type === "hunting") {
    if (n.biome.includes("FOREST") || n.biome === "TAIGA") step *= 0.4;
    if (n.biome.includes("DESERT")) step *= 1.8;
  } else if (type === "desert") {
    if (n.biome.includes("DESERT") || n.biome === "SCORCHED") step *= 0.38;
    if (n.biome.includes("FOREST") || n.biome === "MARSH") step *= 1.9;
  }
  return step;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @param {{ width?: number, height?: number }} [extent]
 */
export function placeCultures(cells, rng, extent = {}) {
  for (const c of cells) c.cultureId = -1;
  /** @type {import("../types.js").Culture[]} */
  const cultures = [];
  const land = cells.filter((c) => !c.ocean && !c.lake && !c.border && !c.mountain);
  if (!land.length) return cultures;

  const scale = worldScale(extent.width ?? 1600, extent.height ?? 1000);
  const count = Math.max(3, Math.min(9, Math.round(4.2 * scale)));
  const minDist = 110 * scale;
  const usedTypes = new Set();
  /** @type {import("../types.js").Cell[]} */
  const origins = [];

  const shuffled = land.slice().sort(() => rng() - 0.5);
  for (const cell of shuffled) {
    if (origins.length >= count) break;
    if (origins.some((o) => (o.x - cell.x) ** 2 + (o.y - cell.y) ** 2 < minDist * minDist)) continue;
    origins.push(cell);
  }
  if (!origins.length) origins.push(land[(rng() * land.length) | 0]);

  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i];
    let type = CULTURE_TYPES[(rng() * CULTURE_TYPES.length) | 0];
    const unused = CULTURE_TYPES.filter((t) => !usedTypes.has(t.id));
    if (unused.length) type = unused[(rng() * unused.length) | 0];
    usedTypes.add(type.id);
    const pack = pickPhonology(rng);
    const names = createNameFactory(rng, pack);
    cultures.push({
      id: i,
      name: names.culture(),
      color: PALETTE[i % PALETTE.length],
      type: type.id,
      originId: origin.id,
      phonologyId: pack.id,
      note: "",
    });
  }

  assignCultures(cells, cultures);
  return cultures;
}

/**
 * Cost-distance flood from culture hearths.
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Culture[]} cultures
 */
export function assignCultures(cells, cultures) {
  for (const c of cells) c.cultureId = -1;
  if (!cultures.length) return;
  const heap = new MinHeap();
  const cost = new Array(cells.length).fill(Infinity);

  for (const cult of cultures) {
    let start = cult.originId;
    if (!cells[start] || cells[start].ocean) {
      const land = cells.find((c) => !c.ocean && !c.lake);
      if (!land) continue;
      start = land.id;
      cult.originId = start;
    }
    cost[start] = 0;
    cells[start].cultureId = cult.id;
    heap.push({ id: start, culture: cult.id }, 0);
  }

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const { id, culture } = popped.item;
    if (popped.key > cost[id] + 1e-9) continue;
    const cell = cells[id];
    const type = cultures[culture]?.type || "river";
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      const step = cultureStep(n, type);
      const next = cost[id] + step;
      if (next < cost[nid]) {
        cost[nid] = next;
        if (!n.ocean) n.cultureId = culture;
        heap.push({ id: nid, culture }, next);
      }
    }
  }
}
