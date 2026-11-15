/**
 * Read-only atlas lines. Computed from WorldData; nothing here is stored,
 * so an edit to a capital or a faith shows up the next time the inspector draws.
 */
import { tiesFor } from "./diplomacy.js";
import { cultureTypeLabel } from "./catalogs.js";

/**
 * Where a town sits, for the culture's place-name table.
 * @param {import("../types.js").Cell | null | undefined} cell
 * @returns {"port"|"haven"|"ford"|"highland"|"town"}
 */
export function settlementSite(cell) {
  if (!cell) return "town";
  if (cell.coast && cell.riverId >= 0) return "port";
  if (cell.coast) return "haven";
  if (cell.riverId >= 0) return "ford";
  if (cell.mountain || cell.height > 0.32) return "highland";
  return "town";
}

/**
 * One line a game master can read without opening every layer.
 * @param {import("../types.js").WorldData} world
 * @param {import("../types.js").Region} region
 */
export function realmBrief(world, region) {
  if (!region) return "";
  const towns = (world.settlements || []).filter((s) => s.regionId === region.id);
  const cap = (world.settlements || []).find((s) => s.id === region.capitalId);
  const land = (world.cells || []).filter((c) => c.regionId === region.id && !c.ocean && !c.lake);
  const cult = region.cultureId != null && region.cultureId >= 0 ? world.cultures?.[region.cultureId] : null;
  /** @type {Map<number, number>} */
  const faithCounts = new Map();
  for (const c of land) {
    if (c.religionId == null || c.religionId < 0) continue;
    faithCounts.set(c.religionId, (faithCounts.get(c.religionId) || 0) + 1);
  }
  let faithId = -1;
  let faithN = 0;
  for (const [id, n] of faithCounts) {
    if (n > faithN) {
      faithId = id;
      faithN = n;
    }
  }
  const faith = faithId >= 0 ? world.religions?.[faithId] : null;
  const wars = tiesFor(world.diplomacy || [], region.id).filter((t) => t.stance === "war").length;
  const bits = [];
  if (cap) bits.push(`都城 ${cap.name}`);
  bits.push(`${towns.length}座聚落`);
  bits.push(`${land.length}格`);
  if (cult) bits.push(`${cult.name}·${cultureTypeLabel(cult.type)}`);
  if (faith) bits.push(faith.name);
  if (wars) bits.push(`交战${wars}`);
  return bits.join(" · ");
}

/**
 * Plain-text handout for the table. Not stored on the save.
 * @param {import("../types.js").WorldData} world
 */
export function campaignSheet(world) {
  if (!world?.meta) return "";
  /** @type {Map<number, number>} */
  const land = new Map();
  for (const c of world.cells || []) {
    if (c.ocean || c.lake || c.regionId == null || c.regionId < 0) continue;
    land.set(c.regionId, (land.get(c.regionId) || 0) + 1);
  }
  const lines = [world.meta.mapName || world.meta.seed || "未命名世界", `种子 ${world.meta.seed}`];
  const realms = [...(world.regions || [])].sort((a, b) => (land.get(b.id) || 0) - (land.get(a.id) || 0));
  for (const region of realms.slice(0, 8)) lines.push(`${region.name} — ${realmBrief(world, region)}`);
  const rivers = [...(world.rivers || [])].filter((r) => r.name).sort((a, b) => (b.width || 0) - (a.width || 0)).slice(0, 8);
  if (rivers.length) lines.push(`河流 ${rivers.map((r) => r.name).join("、")}`);
  return lines.join("\n");
}
