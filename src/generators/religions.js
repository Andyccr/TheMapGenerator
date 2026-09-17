/**
 * Religions: folk faiths bound to cultures, plus a few organized creeds that
 * expand from great cities (Azgaar-style, simplified). Ocean is never claimed.
 */
import { MinHeap } from "../util/heap.js";

const ORGANIZED_TINTS = ["#c4a24a", "#8c6ab0", "#b05040", "#4a7a9a", "#6a8c4a", "#a07050"];

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Culture[]} cultures
 * @param {import("../types.js").Settlement[]} settlements
 * @param {() => number} rng
 * @param {(cultureId: number) => { religion: () => string, religionFolk: (name: string) => string }} mills
 */
export function placeReligions(cells, cultures, settlements, rng, mills) {
  for (const c of cells) c.religionId = -1;
  /** @type {import("../types.js").Religion[]} */
  const religions = [];
  if (!cultures.length) return religions;

  for (const cult of cultures) {
    religions.push({
      id: religions.length,
      name: mills(cult.id).religionFolk(cult.name),
      type: "folk",
      cultureId: cult.id,
      color: mixToward(cult.color, "#c4b070", 0.35),
      originId: cult.originId,
      note: "",
    });
  }

  const burgs = settlements
    .filter((s) => s.type === "capital" || s.type === "city")
    .sort((a, b) => (b.population || 0) - (a.population || 0));
  const want = Math.max(1, Math.min(4, Math.round(burgs.length / 2.8) || 1));
  const used = new Set();
  for (const burg of burgs) {
    if (religions.filter((r) => r.type === "organized").length >= want) break;
    if (used.has(burg.cultureId) && rng() < 0.55) continue;
    used.add(burg.cultureId);
    const nOrg = religions.filter((r) => r.type === "organized").length;
    religions.push({
      id: religions.length,
      name: mills(burg.cultureId).religion(),
      type: "organized",
      cultureId: burg.cultureId ?? -1,
      color: ORGANIZED_TINTS[nOrg % ORGANIZED_TINTS.length],
      originId: burg.cellId,
      note: "",
    });
  }

  assignReligions(cells, religions);
  return religions;
}

/**
 * Folk paints every land cell of its culture; organized creeds then overwrite
 * a limited radius so they read as state churches, not a second culture map.
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Religion[]} religions
 */
export function assignReligions(cells, religions) {
  for (const c of cells) c.religionId = -1;
  if (!religions.length) return;

  const folk = religions.filter((r) => r.type === "folk");
  /** @type {Map<number, number>} */
  const byCulture = new Map();
  for (const r of folk) byCulture.set(r.cultureId, r.id);
  for (const c of cells) {
    if (c.ocean) continue;
    const fid = byCulture.get(c.cultureId);
    if (fid != null) c.religionId = fid;
  }

  const organized = religions.filter((r) => r.type === "organized");
  if (!organized.length) return;

  const heap = new MinHeap();
  const cost = new Array(cells.length).fill(Infinity);
  for (const rel of organized) {
    const start = rel.originId;
    if (!cells[start] || cells[start].ocean) continue;
    cost[start] = 0;
    cells[start].religionId = rel.id;
    heap.push({ id: start, rel: rel.id }, 0);
  }

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const { id, rel } = popped.item;
    if (popped.key > cost[id] + 1e-9) continue;
    if (cost[id] > 72) continue;
    const cell = cells[id];
    const creed = religions[rel];
    for (const nid of cell.neighbors) {
      const n = cells[nid];
      if (n.ocean) continue;
      let step = 1;
      if (n.mountain) step = 2.2;
      else if (n.lake) step = 1.6;
      if (creed && n.cultureId !== creed.cultureId) step *= 1.7;
      const next = cost[id] + step;
      if (next < cost[nid] && next <= 72) {
        cost[nid] = next;
        n.religionId = rel;
        heap.push({ id: nid, rel }, next);
      }
    }
  }
}

/** @param {string} a @param {string} b @param {number} t */
function mixToward(a, b, t) {
  const ha = hex(a);
  const hb = hex(b);
  const u = Math.max(0, Math.min(1, t));
  const r = (ha[0] + (hb[0] - ha[0]) * u) | 0;
  const g = (ha[1] + (hb[1] - ha[1]) * u) | 0;
  const bl = (ha[2] + (hb[2] - ha[2]) * u) | 0;
  return `rgb(${r},${g},${bl})`;
}

/** @param {string} c */
function hex(c) {
  const s = String(c || "").replace("#", "");
  if (s.length === 3) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
  }
  if (s.length < 6) return [128, 112, 80];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
