/**
 * Pure HTML/text helpers for inspect, roster, and search.
 * No DOM writes — App binds clicks and owns undo.
 */
import { summarizeWorld } from "../data/worldData.js";
import {
  BIOME_LABELS,
  SETTLEMENT_TYPE_LABELS,
  cultureTypeLabel,
  markerLabel,
  religionTypeLabel,
  featureTypeLabel,
  landformLabel,
  stanceLabel,
  routeKindLabel,
} from "../data/catalogs.js";
import { tiesFor, otherId } from "../data/diplomacy.js";
import { formatJourneySummary, journeysThrough } from "../data/journeys.js";
import { climateBeltLabel } from "../data/climate.js";

/** @param {string} s */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
}

/**
 * @param {[string, string][]} rows
 */
function inspectGroup(title, rows) {
  const body = rows
    .filter(([, v]) => v != null && v !== "" && v !== "—")
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");
  if (!body) return "";
  return `<div class="inspect-group"><h3>${escapeHtml(title)}</h3><dl class="inspector">${body}</dl></div>`;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {string} lodLabel
 */
export function overviewInspectHtml(world, lodLabel) {
  const sum = summarizeWorld(world);
  const mapName = world.meta.mapName || world.meta.seed;
  return (
    inspectGroup("世界", [
      ["图名", escapeHtml(mapName)],
      ["种子", escapeHtml(world.meta.seed)],
      ["陆形", escapeHtml(landformLabel(world.meta.landform))],
      ["画幅", `${world.meta.width}×${world.meta.height} · 格距 ${world.meta.cellSize}`],
      ["绘制", `${escapeHtml(lodLabel)}（格子不变）`],
      ["格子", `${sum.cells} · 陆地 ${sum.land} · 海洋 ${sum.ocean}`],
    ]) +
    inspectGroup("名册", [
      ["河流", String(sum.rivers)],
      ["聚落", String(sum.settlements)],
      ["国度", String(sum.regions)],
      ["文化", String(sum.cultures)],
      ["行省", String(sum.provinces)],
      ["信仰", String(sum.religions)],
      ["地貌", String(sum.features)],
      ["商路", String(sum.routes)],
      ["行程", String(sum.journeys)],
      ["地标", String(sum.markers)],
    ])
  );
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 */
export function cellInspectHtml(world, cellId) {
  const c = world.cells[cellId];
  if (!c) return "";
  const town = world.settlements.find((s) => s.cellId === cellId);
  const realm = c.regionId >= 0 ? world.regions[c.regionId] : null;
  const cult = c.cultureId >= 0 ? world.cultures?.[c.cultureId] : null;
  const marker = (world.markers || []).find((m) => m.cellId === cellId);
  const river = c.riverId >= 0 ? world.rivers[c.riverId] : null;
  const province = c.provinceId >= 0 ? world.provinces?.[c.provinceId] : null;
  const religion = c.religionId >= 0 ? world.religions?.[c.religionId] : null;
  const feat = c.featureId >= 0 ? world.features?.[c.featureId] : null;
  const biomeName = BIOME_LABELS[c.biome] || c.biome;
  const lat = world.meta?.height ? 1 - c.y / world.meta.height : 0.5;
  const belt = climateBeltLabel(lat);
  const tempText =
    typeof c.tempRange === "number"
      ? `${c.temperature.toFixed(2)} ±${c.tempRange.toFixed(2)}`
      : c.temperature.toFixed(2);
  const riverText = river?.name
    ? `${river.name}${river.order ? ` · ${river.order}级` : ""}`
    : c.riverId >= 0
      ? "有"
      : "—";
  const typeName = town ? SETTLEMENT_TYPE_LABELS[town.type] || town.type : "";
  const diplo = realm
    ? tiesFor(world.diplomacy || [], realm.id)
        .map((t) => {
          const other = world.regions[otherId(t, realm.id)];
          return other ? `${other.name}（${stanceLabel(t.stance)}）` : "";
        })
        .filter(Boolean)
        .join(" · ")
    : "";
  const roads = (world.routes || []).filter((r) => r.cellIds.includes(cellId));
  const roadHint = roads.length
    ? roads.map((r) => `${routeKindLabel(r.kind)} #${r.id}`).join(" · ")
    : "—";
  const trips = journeysThrough(world, cellId);
  const tripHint = trips.length ? trips.map((j) => `${j.name}（${formatJourneySummary(j)}）`).join(" · ") : "—";
  const marks = [c.ocean && "海洋", c.lake && "湖泊", c.coast && "海岸", c.mountain && "山脉"].filter(Boolean).join(" · ");
  return (
    inspectGroup("地理", [
      ["格子", `#${c.id}`],
      ["海拔", c.height.toFixed(2)],
      ["生物群系", escapeHtml(biomeName)],
      ["气候带", escapeHtml(belt)],
      ["湿度", c.moisture.toFixed(2)],
      ["温度", escapeHtml(tempText)],
      ["径流量", c.flux.toFixed(1)],
      ["流域", escapeHtml(drainageLabel(world, c))],
      ["河流", escapeHtml(riverText)],
      ["标记", marks],
    ]) +
    inspectGroup("人文", [
      ["文化", cult ? escapeHtml(`${cult.name}（${cultureTypeLabel(cult.type)}）`) : ""],
      ["国度", realm ? escapeHtml(realm.name) : ""],
      ["外交", diplo ? escapeHtml(diplo) : ""],
      ["行省", province ? escapeHtml(province.name) : ""],
      ["信仰", religion ? escapeHtml(`${religion.name}（${religionTypeLabel(religion.type)}）`) : ""],
      ["地貌", feat ? escapeHtml(`${feat.name}（${featureTypeLabel(feat.type)}）`) : ""],
      ["聚落", town ? escapeHtml(`${town.name}（${typeName} · ${town.population || "?"}人）`) : ""],
      ["地标", marker ? escapeHtml(marker.name) : ""],
      ["过路", roadHint === "—" ? "" : escapeHtml(roadHint)],
      ["行程", tripHint === "—" ? "" : escapeHtml(tripHint)],
    ])
  );
}

/**
 * Follow the thalweg to the outlet. Named rivers label the basin.
 * @param {import("../types.js").WorldData} world
 * @param {import("../types.js").Cell} cell
 */
function drainageLabel(world, cell) {
  if (cell.ocean) return "—";
  let id = cell.id;
  let lake = cell.lake;
  let guard = 0;
  while (guard++ < 4000) {
    const c = world.cells[id];
    if (!c) break;
    if (c.lake) lake = true;
    const n = c.downslope >= 0 ? world.cells[c.downslope] : null;
    if (!n || n.ocean || c.downslope < 0) break;
    id = n.id;
  }
  const outlet = world.cells[id];
  const river = outlet?.riverId >= 0 ? world.rivers?.[outlet.riverId] : null;
  if (river?.name) return `${river.name}流域`;
  if (lake) return "内流盆地";
  return "入海流域";
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {string} kind
 * @returns {{ label: string, cellId: number, hint?: string }[]}
 */
export function rosterItems(world, kind) {
  if (kind === "settlements") {
    return world.settlements.map((s) => ({
      label: s.name,
      hint: `${SETTLEMENT_TYPE_LABELS[s.type] || s.type} · ${(s.population || 0).toLocaleString("zh-CN")}人`,
      cellId: s.cellId,
    }));
  }
  if (kind === "regions") {
    return world.regions.map((r) => {
      const cap = world.settlements.find((s) => s.id === r.capitalId);
      const wars = tiesFor(world.diplomacy || [], r.id).filter((t) => t.stance === "war").length;
      const hint = [cap ? `都城 ${cap.name}` : "", wars ? `交战 ${wars}` : ""].filter(Boolean).join(" · ");
      return { label: r.name, hint, cellId: cap?.cellId ?? -1 };
    });
  }
  if (kind === "provinces") {
    return (world.provinces || []).map((p) => {
      const seat = world.settlements.find((s) => s.id === p.seatId);
      return { label: p.name, hint: seat ? `治所 ${seat.name}` : "行省", cellId: seat?.cellId ?? -1 };
    });
  }
  if (kind === "cultures") {
    return (world.cultures || []).map((c) => ({
      label: c.name,
      hint: cultureTypeLabel(c.type),
      cellId: c.originId,
    }));
  }
  if (kind === "religions") {
    return (world.religions || []).map((r) => ({
      label: r.name,
      hint: religionTypeLabel(r.type),
      cellId: r.originId,
    }));
  }
  if (kind === "features") {
    return (world.features || []).map((f) => ({
      label: f.name,
      hint: `${featureTypeLabel(f.type)} · ${f.size}格`,
      cellId: f.originId,
    }));
  }
  if (kind === "rivers") {
    return (world.rivers || [])
      .filter((r) => r.name)
      .map((r) => ({
        label: r.name,
        hint: `河流 · ${r.cellIds.length}格${r.order ? ` · ${r.order}级` : ""}`,
        cellId: r.cellIds[Math.floor(r.cellIds.length / 2)] ?? r.cellIds[0] ?? -1,
      }));
  }
  if (kind === "journeys") {
    return (world.journeys || []).map((j) => ({
      label: j.name,
      hint: formatJourneySummary(j),
      cellId: j.cellIds[Math.floor(j.cellIds.length / 2)] ?? j.cellIds[0] ?? -1,
    }));
  }
  if (kind === "routes") {
    return (world.routes || []).map((r) => {
      const a = world.settlements.find((s) => s.id === r.fromId);
      const b = world.settlements.find((s) => s.id === r.toId);
      const kindLabel = routeKindLabel(r.kind);
      return {
        label: `${a?.name || "?"}–${b?.name || "?"}`,
        hint: kindLabel,
        cellId: r.cellIds[Math.floor(r.cellIds.length / 2)] ?? a?.cellId ?? -1,
      };
    });
  }
  return (world.markers || []).map((m) => ({
    label: m.name,
    hint: markerLabel(m.type),
    cellId: m.cellId,
  }));
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {string} query
 */
export function searchHits(world, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  /** @type {{ label: string, hint: string, cellId: number }[]} */
  const hits = [];
  for (const s of world.settlements) {
    if (s.name.toLowerCase().includes(q)) hits.push({ label: s.name, hint: SETTLEMENT_TYPE_LABELS[s.type] || s.type, cellId: s.cellId });
  }
  for (const r of world.regions) {
    if (r.name.toLowerCase().includes(q)) {
      const cap = world.settlements.find((s) => s.id === r.capitalId);
      hits.push({ label: r.name, hint: "国度", cellId: cap?.cellId ?? -1 });
    }
  }
  for (const p of world.provinces || []) {
    if (p.name.toLowerCase().includes(q)) {
      const seat = world.settlements.find((s) => s.id === p.seatId);
      hits.push({ label: p.name, hint: "行省", cellId: seat?.cellId ?? -1 });
    }
  }
  for (const c of world.cultures || []) {
    if (c.name.toLowerCase().includes(q)) hits.push({ label: c.name, hint: "文化", cellId: c.originId });
  }
  for (const r of world.religions || []) {
    if (r.name.toLowerCase().includes(q)) hits.push({ label: r.name, hint: religionTypeLabel(r.type), cellId: r.originId });
  }
  for (const f of world.features || []) {
    if (f.name.toLowerCase().includes(q)) hits.push({ label: f.name, hint: featureTypeLabel(f.type), cellId: f.originId });
  }
  for (const rv of world.rivers || []) {
    if ((rv.name || "").toLowerCase().includes(q)) {
      const mid = rv.cellIds[Math.floor(rv.cellIds.length / 2)] ?? rv.cellIds[0];
      hits.push({ label: rv.name || "河流", hint: "河流", cellId: mid ?? -1 });
    }
  }
  for (const m of world.markers || []) {
    if (m.name.toLowerCase().includes(q)) hits.push({ label: m.name, hint: markerLabel(m.type), cellId: m.cellId });
  }
  for (const j of world.journeys || []) {
    if ((j.name || "").toLowerCase().includes(q)) {
      hits.push({
        label: j.name,
        hint: formatJourneySummary(j),
        cellId: j.cellIds[Math.floor(j.cellIds.length / 2)] ?? j.cellIds[0] ?? -1,
      });
    }
  }
  for (const r of world.routes || []) {
    const a = world.settlements.find((s) => s.id === r.fromId);
    const b = world.settlements.find((s) => s.id === r.toId);
    const label = `${a?.name || "?"}–${b?.name || "?"}`;
    if (label.toLowerCase().includes(q) || (a?.name || "").toLowerCase().includes(q) || (b?.name || "").toLowerCase().includes(q)) {
      hits.push({
        label,
        hint: routeKindLabel(r.kind),
        cellId: r.cellIds[Math.floor(r.cellIds.length / 2)] ?? a?.cellId ?? -1,
      });
    }
  }
  return hits.slice(0, 12);
}

/**
 * @param {{ label: string, cellId: number, hint?: string }[]} items
 * @param {string} [empty]
 */
export function rosterListHtml(items, empty = "这一栏是空的。") {
  if (!items.length) return `<li class="empty">${escapeHtml(empty)}</li>`;
  return items
    .map(
      (it) =>
        `<li><button type="button" data-cell="${it.cellId}">${escapeHtml(it.label)}${it.hint ? `<span>${escapeHtml(it.hint)}</span>` : ""}</button></li>`,
    )
    .join("");
}
