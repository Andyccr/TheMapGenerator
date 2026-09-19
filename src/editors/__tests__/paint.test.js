import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../../generators/mapGenerator.js";
import { paintCell, paintCells, cellsInBrush, eyedrop } from "../paint.js";
import { PaintTool } from "../tools.js";
import { setStance, tiesFor } from "../../data/diplomacy.js";
import { applyStepsOnly } from "../../generators/landforms.js";
import { addRouteBetween } from "../routes.js";
import { removeRoutesThrough } from "../../data/routes.js";
import { LAND_BIOMES } from "../../data/catalogs.js";

function smallWorld(seed = "paint-n") {
  return new MapGenerator().generate({
    seed,
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
}

test("paintCell writes biome and culture on land, never ocean", () => {
  const w = smallWorld();
  const land = w.cells.find((c) => !c.ocean && !c.border);
  const sea = w.cells.find((c) => c.ocean);
  assert.ok(land && sea);
  assert.equal(paintCell(w, sea.id, "biome", "GRASSLAND"), false);
  assert.equal(paintCell(w, land.id, "biome", "GRASSLAND"), true);
  assert.equal(land.biome, "GRASSLAND");
  const cult = w.cultures[0];
  assert.equal(paintCell(w, land.id, "culture", String(cult.id)), true);
  assert.equal(land.cultureId, cult.id);
  assert.ok(LAND_BIOMES.includes("GRASSLAND"));
});

test("eyedrop and brush collect land cells", () => {
  const w = smallWorld("brush-n");
  const land = w.cells.find((c) => !c.ocean && c.cultureId >= 0);
  assert.ok(land);
  assert.equal(eyedrop(w, land.id, "culture"), String(land.cultureId));
  const ids = cellsInBrush(w, land.x, land.y, 80);
  assert.ok(ids.length >= 1);
  assert.ok(ids.every((id) => !w.cells[id].ocean));
  const n = paintCells(w, ids, "biome", "TAIGA");
  assert.ok(n >= 1);
  assert.equal(w.cells[ids[0]].biome, "TAIGA");
});

test("setStance updates or inserts a neighbor pair", () => {
  const ties = [{ a: 0, b: 1, stance: "peace" }];
  setStance(ties, 1, 0, "war");
  assert.equal(ties.length, 1);
  assert.equal(ties[0].stance, "war");
  setStance(ties, 0, 2, "ally");
  assert.equal(ties.length, 2);
  assert.equal(tiesFor(ties, 2)[0].stance, "ally");
});

test("paintCell reassigns realm and snaps province, or clears a layer", () => {
  const w = smallWorld("realm-n");
  const land = w.cells.find((c) => !c.ocean && !c.border && c.regionId >= 0);
  assert.ok(land);
  const other = w.regions.find((r) => r.id !== land.regionId);
  if (other) {
    assert.equal(paintCell(w, land.id, "realm", String(other.id)), true);
    assert.equal(land.regionId, other.id);
    const p = land.provinceId >= 0 ? w.provinces[land.provinceId] : null;
    if (p) assert.equal(p.regionId, other.id);
  }
  assert.equal(paintCell(w, land.id, "culture", ""), true);
  assert.equal(land.cultureId, -1);
  assert.equal(paintCell(w, land.id, "biome", ""), false);
});

test("applyStepsOnly raises land without requiring a full generate", () => {
  const w = smallWorld("steps-n");
  const mid = w.cells.reduce((best, c) => {
    const d = (c.x - w.meta.width / 2) ** 2 + (c.y - w.meta.height / 2) ** 2;
    const bd = (best.x - w.meta.width / 2) ** 2 + (best.y - w.meta.height / 2) ** 2;
    return d < bd ? c : best;
  });
  const before = mid.height;
  applyStepsOnly(w.cells, () => 0.5, w.meta.width, w.meta.height, [
    { op: "hill", n: 1, x: 0.5, y: 0.5, rx: 0.2, ry: 0.18, amp: 0.45, jitter: false },
  ]);
  assert.ok(mid.height > before, `${before} -> ${mid.height}`);
});

test("PaintTool eyedrops empty pigment then paints without touching ocean", () => {
  const w = smallWorld("tool-n");
  const land = w.cells.find((c) => !c.ocean && !c.border && LAND_BIOMES.includes(c.biome));
  const sea = w.cells.find((c) => c.ocean);
  assert.ok(land && sea);
  /** @type {string} */
  let pigment = "";
  let began = 0;
  const ctx = {
    brush: 2,
    paintLayer: "biome",
    get paintValue() {
      return pigment;
    },
    setPaintValue: (v) => {
      pigment = v;
    },
    toast: () => {},
    beginEdit: () => {
      began += 1;
    },
    commit: () => {},
    requestRecompute: () => {},
  };
  const tool = new PaintTool();
  tool.apply(w, { worldX: land.x, worldY: land.y, cellId: land.id, phase: "down", shiftKey: false }, ctx);
  assert.equal(pigment, land.biome);
  assert.equal(began, 0);
  pigment = "TAIGA";
  tool.apply(w, { worldX: land.x, worldY: land.y, cellId: land.id, phase: "down", shiftKey: false }, ctx);
  assert.equal(began, 1);
  assert.equal(land.biome, "TAIGA");
  const seaBiome = sea.biome;
  tool.apply(w, { worldX: sea.x, worldY: sea.y, cellId: sea.id, phase: "move", shiftKey: false }, ctx);
  assert.equal(sea.biome, seaBiome);
});

test("removeRoutesThrough drops paths that include the cell", () => {
  const w = smallWorld("erase-road");
  const towns = w.settlements.filter((s) => !w.cells[s.cellId]?.ocean);
  assert.ok(towns.length >= 2);
  const route = w.routes[0] || addRouteBetween(w, towns[0].id, towns[1].id, "road");
  assert.ok(route && route.cellIds.length);
  const hop = route.cellIds[1] ?? route.cellIds[0];
  const n = removeRoutesThrough(w, hop);
  assert.ok(n >= 1);
  assert.ok(!(w.routes || []).some((r) => r.cellIds.includes(hop)));
});
