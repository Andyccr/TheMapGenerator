/**
 * Places of interest: volcanoes on peaks, ruins in the wild, lights on capes.
 * These are the "play here" pins a GM actually uses.
 */

/** @type {Record<string, { label: string, glyph: string }>} */
export const MARKER_TYPES = {
  volcano: { label: "火山", glyph: "▲" },
  ruins: { label: "废墟", glyph: "⌂" },
  lighthouse: { label: "灯塔", glyph: "⚑" },
  mine: { label: "矿坑", glyph: "◆" },
  shrine: { label: "神祠", glyph: "✦" },
  dungeon: { label: "地下城", glyph: "▼" },
  dragon: { label: "龙巢", glyph: "⚔" },
  port: { label: "港口", glyph: "⚓" },
};

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").Settlement[]} settlements
 * @param {import("../types.js").Culture[]} cultures
 * @param {() => number} rng
 * @param {(cultureId: number) => { marker: () => string }} namesFor
 * @param {{ width?: number, height?: number }} [extent]
 */
export function placeMarkers(cells, settlements, cultures, rng, namesFor, extent = {}) {
  /** @type {import("../types.js").Marker[]} */
  const markers = [];
  const taken = new Set(settlements.map((s) => s.cellId));
  const span = Math.hypot(extent.width ?? 1600, extent.height ?? 1000);
  const scale = Math.max(0.45, span / 1887);

  const nameAt = (cellId) => {
    const cid = cells[cellId]?.cultureId ?? -1;
    const mill = namesFor(cid);
    return mill.marker();
  };

  const add = (cellId, type) => {
    if (cellId < 0 || taken.has(cellId)) return;
    const cell = cells[cellId];
    if (!cell || cell.ocean) return;
    taken.add(cellId);
    const label = MARKER_TYPES[type]?.label || type;
    markers.push({
      id: markers.length,
      cellId,
      type,
      name: `${nameAt(cellId)} · ${label}`,
      note: "",
    });
  };

  const farFromTowns = (cell, min) =>
    settlements.every((s) => {
      const t = cells[s.cellId];
      return (t.x - cell.x) ** 2 + (t.y - cell.y) ** 2 >= min * min;
    });

  const pick = (filter, n, minSep) => {
    const pool = cells.filter(filter).sort(() => rng() - 0.5);
    /** @type {import("../types.js").Cell[]} */
    const chosen = [];
    for (const c of pool) {
      if (chosen.length >= n) break;
      if (taken.has(c.id)) continue;
      if (chosen.some((o) => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < minSep * minSep)) continue;
      chosen.push(c);
    }
    return chosen;
  };

  const nVol = Math.max(1, Math.round(2 * scale));
  const nRuin = Math.max(3, Math.round(7 * scale));
  const nLight = Math.max(1, Math.round(3 * scale));
  const nMine = Math.max(2, Math.round(4 * scale));
  const nShrine = Math.max(2, Math.round(5 * scale));
  const nDun = Math.max(2, Math.round(4 * scale));
  const nDragon = Math.max(1, Math.round(1.4 * scale));

  for (const c of pick((c) => c.mountain && c.height > 0.45 && farFromTowns(c, 70 * scale), nVol, 160 * scale)) {
    add(c.id, "volcano");
  }
  for (const c of pick(
    (c) => !c.ocean && !c.lake && !c.coast && farFromTowns(c, 90 * scale) && (c.biome === "BARE" || c.biome === "SHRUBLAND" || c.biome === "GRASSLAND"),
    nRuin,
    90 * scale,
  )) {
    add(c.id, "ruins");
  }
  for (const c of pick((c) => c.coast && !c.lake && c.neighbors.filter((id) => cells[id].ocean).length >= 3, nLight, 140 * scale)) {
    add(c.id, "lighthouse");
  }
  for (const c of pick((c) => c.mountain && !farFromTowns(c, 120 * scale) && farFromTowns(c, 28 * scale), nMine, 80 * scale)) {
    add(c.id, "mine");
  }
  for (const c of pick(
    (c) => (c.biome.includes("FOREST") || c.biome === "TAIGA") && farFromTowns(c, 40 * scale),
    nShrine,
    100 * scale,
  )) {
    add(c.id, "shrine");
  }
  for (const c of pick((c) => !c.ocean && !c.lake && c.height > 0.22 && farFromTowns(c, 55 * scale), nDun, 110 * scale)) {
    add(c.id, "dungeon");
  }
  for (const c of pick((c) => c.mountain && c.height > 0.5 && farFromTowns(c, 110 * scale), nDragon, 200 * scale)) {
    add(c.id, "dragon");
  }
  for (const s of settlements) {
    if (s.type === "village") continue;
    const cell = cells[s.cellId];
    if (cell?.coast && rng() < 0.55) {
      const nb = cell.neighbors.find((id) => cells[id].coast && !taken.has(id) && !cells[id].ocean);
      if (nb !== undefined) add(nb, "port");
    }
  }
  void cultures;
  return markers;
}

/** @param {string} type */
export function markerLabel(type) {
  return MARKER_TYPES[type]?.label || type;
}

/** @param {string} type */
export function markerGlyph(type) {
  return MARKER_TYPES[type]?.glyph || "•";
}
