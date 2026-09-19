/**
 * Settlements near water; realms grown by cost-distance from capitals.
 * O'Leary places cities on rivers and penalizes crowding — same here.
 * Names come from the local culture so neighboring towns sound related.
 */
import { MinHeap } from "../util/heap.js";
import { worldScale } from "../data/worldData.js";
import { estimatePopulation } from "../data/population.js";

const PALETTE = ["#8c3a3a", "#3a5f8c", "#6a7a38", "#7a4e8c", "#8c6a32", "#2f6d62", "#8c4e5c"];

/**
 * @param {import("../types.js").Cell} c
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 */
export function settlementScore(c, cells, rng) {
  if (c.ocean || c.lake || c.mountain || c.border) return -1e9;
  if (c.biome === "SNOW" || c.biome === "SCORCHED" || c.biome === "ICE") return -1e9;
  let s = 0;
  if (c.riverId >= 0) s += 3.4;
  if (c.coast) s += 2.2;
  if (c.neighbors.some((id) => cells[id].lake)) s += 1.6;
  s += c.moisture * 1.4;
  s += (0.35 - Math.abs(c.height - 0.12)) * 1.2;
  if (c.biome.includes("DESERT")) s -= 1.1;
  if (c.biome === "MARSH") s -= 0.6;
  return s + rng() * 0.15;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {() => number} rng
 * @param {(cultureId: number) => { settlement: () => string, realm: () => string }} namesFor
 * @param {{ width?: number, height?: number }} [extent]
 */
export function placeCivilizations(cells, rng, namesFor, extent = {}) {
  /** @type {import("../types.js").Settlement[]} */
  const settlements = [];
  /** @type {import("../types.js").Region[]} */
  const regions = [];

  const candidates = cells
    .map((c) => ({ id: c.id, s: settlementScore(c, cells, rng) }))
    .filter((x) => x.s > 0.8)
    .sort((a, b) => b.s - a.s);

  const scale = worldScale(extent.width ?? 1600, extent.height ?? 1000);
  const minDist = 48 * scale;
  const maxTowns = Math.min(90, Math.max(12, Math.round(28 * scale * scale)));
  const nCity = Math.max(3, Math.round(4 * scale));
  const nTown = Math.max(10, Math.round(12 * scale));
  const taken = [];
  for (const cand of candidates) {
    if (settlements.length >= maxTowns) break;
    const cell = cells[cand.id];
    if (taken.some((t) => (t.x - cell.x) ** 2 + (t.y - cell.y) ** 2 < minDist * minDist)) continue;
    taken.push(cell);
    const n = settlements.length;
    const type = n < nCity ? "city" : n < nTown ? "town" : "village";
    const cultureId = cell.cultureId ?? -1;
    settlements.push({
      id: n,
      cellId: cell.id,
      name: namesFor(cultureId).settlement(),
      type,
      regionId: -1,
      cultureId,
      population: estimatePopulation(cell, type),
      note: "",
    });
  }

  const capitalCount = Math.max(3, Math.min(14, Math.round(settlements.length / 4)));
  const capSep = 140 * scale;
  const capitals = [];
  for (const s of settlements) {
    if (capitals.length >= capitalCount) break;
    if (s.type === "village") continue;
    const cell = cells[s.cellId];
    if (capitals.some((c) => (cells[c.cellId].x - cell.x) ** 2 + (cells[c.cellId].y - cell.y) ** 2 < capSep * capSep)) {
      continue;
    }
    s.type = "capital";
    s.population = estimatePopulation(cells[s.cellId], "capital");
    capitals.push(s);
  }
  if (capitals.length === 0 && settlements[0]) {
    settlements[0].type = "capital";
    settlements[0].population = estimatePopulation(cells[settlements[0].cellId], "capital");
    capitals.push(settlements[0]);
  }

  for (let i = 0; i < capitals.length; i++) {
    const cap = capitals[i];
    regions.push({
      id: i,
      name: namesFor(cap.cultureId).realm(),
      color: PALETTE[i % PALETTE.length],
      capitalId: cap.id,
      cultureId: cap.cultureId,
      note: "",
    });
    cap.regionId = i;
  }

  assignRegions(cells, settlements, regions);
  for (const s of settlements) {
    if (s.regionId < 0) s.regionId = cells[s.cellId].regionId;
  }
  return { settlements, regions };
}

/**
 * Cost-distance flood from capitals. Ocean is impassable; mountains are expensive.
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {import("../types.js").Region[]} regions
 */
export function assignRegions(cells, settlements, regions) {
  for (const c of cells) c.regionId = -1;
  if (!regions.length) return;

  const heap = new MinHeap();
  /** @type {number[]} */
  const cost = new Array(cells.length).fill(Infinity);

  for (const r of regions) {
    const cap = settlements.find((s) => s.id === r.capitalId);
    if (!cap) continue;
    const start = cap.cellId;
    cost[start] = 0;
    cells[start].regionId = r.id;
    heap.push({ id: start, region: r.id }, 0);
  }

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const { id, region } = popped.item;
    if (popped.key > cost[id] + 1e-9) continue;
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      if (n.ocean) continue;
      let step = 1;
      if (n.mountain) step = 3.4;
      else if (n.lake) step = 2.2;
      else if (n.height > 0.35) step = 1.8;
      const next = cost[id] + step;
      if (next < cost[nid]) {
        cost[nid] = next;
        n.regionId = region;
        heap.push({ id: nid, region }, next);
      }
    }
  }
}
