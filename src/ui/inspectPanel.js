/**
 * Inspector chrome: cell layer selects, diplomacy stances, routes through a cell,
 * and paint-pigment options. No undo — App owns mutations via callbacks.
 */
import { BIOME_LABELS, LAND_BIOMES, STANCE_LABELS, routeKindLabel, journeyLegLabel } from "../data/catalogs.js";
import { tiesFor, otherId } from "../data/diplomacy.js";
import { formatDays, formatJourneySummary, journeysThrough } from "../data/journeys.js";
import { escapeHtml } from "./format.js";

/**
 * @param {Document} doc
 * @param {import("../types.js").WorldData} world
 * @param {import("../types.js").Cell} cell
 */
export function fillCellEdit(doc, world, cell) {
  const wrap = doc.getElementById("cell-edit");
  if (!(wrap instanceof HTMLElement)) return;
  if (cell.ocean) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const fill = (id, options, current) => {
    const sel = doc.getElementById(id);
    if (!(sel instanceof HTMLSelectElement)) return;
    sel.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
    sel.value = current;
  };
  fill(
    "opt-cell-biome",
    LAND_BIOMES.map((k) => ({ value: k, label: BIOME_LABELS[k] || k })),
    LAND_BIOMES.includes(cell.biome) ? cell.biome : LAND_BIOMES[0],
  );
  fill(
    "opt-cell-culture",
    [{ value: "", label: "—" }, ...(world.cultures || []).map((c) => ({ value: String(c.id), label: c.name }))],
    cell.cultureId >= 0 ? String(cell.cultureId) : "",
  );
  fill(
    "opt-cell-realm",
    [{ value: "", label: "—" }, ...world.regions.map((r) => ({ value: String(r.id), label: r.name }))],
    cell.regionId >= 0 ? String(cell.regionId) : "",
  );
  const realmId = cell.regionId;
  fill(
    "opt-cell-province",
    [
      { value: "", label: "—" },
      ...(world.provinces || [])
        .filter((p) => realmId < 0 || p.regionId === realmId)
        .map((p) => ({ value: String(p.id), label: p.name })),
    ],
    cell.provinceId >= 0 ? String(cell.provinceId) : "",
  );
  fill(
    "opt-cell-religion",
    [{ value: "", label: "—" }, ...(world.religions || []).map((r) => ({ value: String(r.id), label: r.name }))],
    cell.religionId >= 0 ? String(cell.religionId) : "",
  );
}

/**
 * @param {Document} doc
 * @param {import("../types.js").WorldData} world
 * @param {import("../types.js").Region | null} realm
 * @param {(otherId: number, stance: string) => void} onStance
 */
export function fillDiploEdit(doc, world, realm, onStance) {
  const list = doc.getElementById("diplo-edit");
  if (!(list instanceof HTMLElement)) return;
  if (!realm) {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }
  const ties = tiesFor(world.diplomacy || [], realm.id);
  if (!ties.length) {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }
  list.hidden = false;
  const stances = Object.entries(STANCE_LABELS);
  list.innerHTML = ties
    .map((t) => {
      const other = world.regions[otherId(t, realm.id)];
      if (!other) return "";
      const opts = stances
        .map(([k, lab]) => `<option value="${k}"${k === t.stance ? " selected" : ""}>${lab}</option>`)
        .join("");
      return `<li><label>${escapeHtml(other.name)} <select data-diplo-other="${other.id}">${opts}</select></label></li>`;
    })
    .join("");
  list.querySelectorAll("[data-diplo-other]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const other = Number(/** @type {HTMLSelectElement} */ (e.target).getAttribute("data-diplo-other"));
      const stance = /** @type {HTMLSelectElement} */ (e.target).value;
      onStance(other, stance);
    });
  });
}

/**
 * @param {Document} doc
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {(routeId: number) => void} onDropRoute
 */
export function fillRouteEdit(doc, world, cellId, onDropRoute) {
  const wrap = doc.getElementById("route-edit");
  if (!(wrap instanceof HTMLElement)) return;
  const roads = (world.routes || []).filter((r) => r.cellIds.includes(cellId));
  if (!roads.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = roads
    .map((r) => {
      const a = world.settlements.find((s) => s.id === r.fromId);
      const b = world.settlements.find((s) => s.id === r.toId);
      return `<li><span>${escapeHtml(routeKindLabel(r.kind))} ${escapeHtml(a?.name || "?")}–${escapeHtml(b?.name || "?")}</span><button type="button" data-drop-route="${r.id}">删</button></li>`;
    })
    .join("");
  wrap.querySelectorAll("[data-drop-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onDropRoute(Number(btn.getAttribute("data-drop-route")));
    });
  });
}

/**
 * Journeys crossing this cell, with the chronicle and rename/delete.
 * @param {Document} doc
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {{ onDrop: (id: number) => void, onRename: (id: number, name: string) => void }} handlers
 */
export function fillJourneyEdit(doc, world, cellId, handlers) {
  const wrap = doc.getElementById("journey-edit");
  if (!(wrap instanceof HTMLElement)) return;
  const trips = journeysThrough(world, cellId);
  if (!trips.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = trips
    .map((j) => {
      const legs = (j.legs || [])
        .slice(0, 12)
        .map((leg) => `<li>${escapeHtml(formatDays(leg.day))} ${escapeHtml(journeyLegLabel(leg.kind))} · ${escapeHtml(leg.label)}</li>`)
        .join("");
      const more = (j.legs || []).length > 12 ? `<li>…</li>` : "";
      return `<li class="journey-card"><div class="journey-head"><span>${escapeHtml(j.name)} · ${escapeHtml(formatJourneySummary(j))}</span><span class="journey-actions-inline"><button type="button" data-rename-journey="${j.id}">改名</button><button type="button" data-drop-journey="${j.id}">删</button></span></div><ol class="journey-legs">${legs}${more}</ol></li>`;
    })
    .join("");
  wrap.querySelectorAll("[data-drop-journey]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handlers.onDrop(Number(btn.getAttribute("data-drop-journey")));
    });
  });
  wrap.querySelectorAll("[data-rename-journey]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-rename-journey"));
      const journey = (world.journeys || []).find((j) => j.id === id);
      handlers.onRename(id, journey?.name || "");
    });
  });
}

/**
 * @param {Document} doc
 * @param {import("../types.js").WorldData | null} world
 */
export function syncPaintPigment(doc, world) {
  const layerEl = doc.getElementById("opt-paint-layer");
  const valueEl = doc.getElementById("opt-paint-value");
  if (!(layerEl instanceof HTMLSelectElement) || !(valueEl instanceof HTMLSelectElement)) return;
  const layer = layerEl.value;
  const prev = valueEl.value;
  /** @type {{ value: string, label: string }[]} */
  const opts = [{ value: "", label: "（点击吸取）" }];
  if (layer === "biome") {
    for (const key of LAND_BIOMES) opts.push({ value: key, label: BIOME_LABELS[key] || key });
  } else if (world) {
    if (layer === "culture") {
      for (const c of world.cultures || []) opts.push({ value: String(c.id), label: c.name });
    } else if (layer === "religion") {
      for (const r of world.religions || []) opts.push({ value: String(r.id), label: r.name });
    } else if (layer === "realm") {
      for (const r of world.regions) opts.push({ value: String(r.id), label: r.name });
    } else if (layer === "province") {
      for (const p of world.provinces || []) opts.push({ value: String(p.id), label: p.name });
    }
  }
  valueEl.innerHTML = opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  if (opts.some((o) => o.value === prev)) valueEl.value = prev;
}
