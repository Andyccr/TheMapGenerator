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

/** @param {string} s */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {string} lodLabel
 */
export function overviewInspectHtml(world, lodLabel) {
  const sum = summarizeWorld(world);
  const mapName = world.meta.mapName || world.meta.seed;
  return `
        <dt>图名</dt><dd>${escapeHtml(mapName)}</dd>
        <dt>种子</dt><dd>${escapeHtml(world.meta.seed)}</dd>
        <dt>陆形</dt><dd>${escapeHtml(landformLabel(world.meta.landform))}</dd>
        <dt>画幅</dt><dd>${world.meta.width}×${world.meta.height} · 格距 ${world.meta.cellSize}</dd>
        <dt>绘制</dt><dd>${escapeHtml(lodLabel)}（格子不变）</dd>
        <dt>格子</dt><dd>${sum.cells} · 陆地 ${sum.land} · 海洋 ${sum.ocean}</dd>
        <dt>河流</dt><dd>${sum.rivers}</dd>
        <dt>聚落</dt><dd>${sum.settlements}</dd>
        <dt>国度</dt><dd>${sum.regions}</dd>
        <dt>文化</dt><dd>${sum.cultures}</dd>
        <dt>行省</dt><dd>${sum.provinces}</dd>
        <dt>信仰</dt><dd>${sum.religions}</dd>
        <dt>地貌</dt><dd>${sum.features}</dd>
        <dt>商路</dt><dd>${sum.routes}</dd>
        <dt>地标</dt><dd>${sum.markers}</dd>`;
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
  return `
      <dt>格子</dt><dd>#${c.id}</dd>
      <dt>海拔</dt><dd>${c.height.toFixed(2)}</dd>
      <dt>生物群系</dt><dd>${escapeHtml(biomeName)}</dd>
      <dt>湿度</dt><dd>${c.moisture.toFixed(2)}</dd>
      <dt>温度</dt><dd>${c.temperature.toFixed(2)}</dd>
      <dt>径流量</dt><dd>${c.flux.toFixed(1)}</dd>
      <dt>河流</dt><dd>${river?.name ? escapeHtml(river.name) : c.riverId >= 0 ? "有" : "—"}</dd>
      <dt>标记</dt><dd>${[
        c.ocean && "海洋",
        c.lake && "湖泊",
        c.coast && "海岸",
        c.mountain && "山脉",
      ]
        .filter(Boolean)
        .join(" · ") || "—"}</dd>
      <dt>文化</dt><dd>${cult ? escapeHtml(`${cult.name}（${cultureTypeLabel(cult.type)}）`) : "—"}</dd>
      <dt>国度</dt><dd>${realm ? escapeHtml(realm.name) : "—"}</dd>
      <dt>外交</dt><dd>${diplo ? escapeHtml(diplo) : "—"}</dd>
      <dt>行省</dt><dd>${province ? escapeHtml(province.name) : "—"}</dd>
      <dt>信仰</dt><dd>${religion ? escapeHtml(`${religion.name}（${religionTypeLabel(religion.type)}）`) : "—"}</dd>
      <dt>地貌</dt><dd>${feat ? escapeHtml(`${feat.name}（${featureTypeLabel(feat.type)}）`) : "—"}</dd>
      <dt>聚落</dt><dd>${town ? escapeHtml(`${town.name}（${typeName} · ${town.population || "?"}人）`) : "—"}</dd>
      <dt>地标</dt><dd>${marker ? escapeHtml(marker.name) : "—"}</dd>
      <dt>过路</dt><dd>${escapeHtml(roadHint)}</dd>`;
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
        hint: `河流 · ${r.cellIds.length}格`,
        cellId: r.cellIds[Math.floor(r.cellIds.length / 2)] ?? r.cellIds[0] ?? -1,
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
