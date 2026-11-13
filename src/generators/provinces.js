/**
 * Provinces: subdivisions of realms, seated at secondary towns.
 * Flood stays inside the parent region so borders never cross a kingdom.
 */
import { MinHeap } from "../util/heap.js";
import { mixHex } from "../data/color.js";

const TINTS = ["#d9c4a0", "#a0b8c8", "#b8c8a0", "#c8a0b0", "#c8b890", "#90b8b0", "#b0a0c8"];

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {import("../types.js").Region[]} regions
 * @param {() => number} rng
 * @param {(cultureId: number) => { settlement: () => string }} namesFor
 */
export function placeProvinces(cells, settlements, regions, rng, namesFor) {
  /** @type {import("../types.js").Province[]} */
  const provinces = [];
  for (const c of cells) c.provinceId = -1;
  if (!regions.length) return provinces;

  for (const region of regions) {
    const burgs = settlements
      .filter((s) => s.regionId === region.id && s.type !== "village")
      .sort((a, b) => {
        const rank = { capital: 0, city: 1, town: 2 };
        return (rank[a.type] ?? 3) - (rank[b.type] ?? 3);
      });
    if (!burgs.length) continue;
    const want = Math.max(1, Math.min(burgs.length, 1 + Math.round(burgs.length / 2.2)));
    const seats = burgs.slice(0, want);
    for (const seat of seats) {
      const id = provinces.length;
      provinces.push({
        id,
        name: namesFor(seat.cultureId).settlement(),
        color: mixHex(region.color, TINTS[id % TINTS.length], 0.35),
        regionId: region.id,
        seatId: seat.id,
        note: "",
      });
    }
  }

  assignProvinces(cells, settlements, provinces);
  return provinces;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {import("../types.js").Province[]} provinces
 */
export function assignProvinces(cells, settlements, provinces) {
  for (const c of cells) c.provinceId = -1;
  if (!provinces.length) return;
  const heap = new MinHeap();
  const cost = new Array(cells.length).fill(Infinity);

  for (const p of provinces) {
    const seat = settlements.find((s) => s.id === p.seatId);
    if (!seat) continue;
    const start = seat.cellId;
    const regionId = cells[start]?.regionId ?? p.regionId;
    cost[start] = 0;
    cells[start].provinceId = p.id;
    heap.push({ id: start, province: p.id, region: regionId }, 0);
  }

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const { id, province, region } = popped.item;
    if (popped.key > cost[id] + 1e-9) continue;
    const cell = cells[id];
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      if (n.ocean) continue;
      if (n.regionId !== region) continue;
      let step = 1;
      if (n.mountain) step = 2.8;
      else if (n.lake) step = 2.0;
      const next = cost[id] + step;
      if (next < cost[nid]) {
        cost[nid] = next;
        n.provinceId = province;
        heap.push({ id: nid, province, region }, next);
      }
    }
  }
}

/**
 * Drop a province id when the cell's realm no longer owns that province.
 * Hand-painted provinces inside the same realm stay.
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Province[]} provinces
 * @returns {number}
 */
export function clearForeignProvinces(cells, provinces) {
  let dropped = 0;
  for (const c of cells) {
    if (c.provinceId < 0) continue;
    const p = provinces?.[c.provinceId];
    if (p && p.regionId === c.regionId) continue;
    c.provinceId = -1;
    dropped += 1;
  }
  return dropped;
}
