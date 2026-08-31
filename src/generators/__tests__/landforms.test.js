import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { LANDFORMS, landformById } from "../landforms.js";

function cfg(landform) {
  return {
    seed: "shape-compare",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
    seaLevel: 0,
    wind: { x: 1, y: 0 },
    landform,
  };
}

function landRatio(world) {
  const land = world.cells.filter((c) => !c.ocean).length;
  return land / world.cells.length;
}

test("landform catalog is complete and labeled", () => {
  assert.equal(LANDFORMS.length, 8);
  assert.equal(landformById("island").label, "大岛");
  assert.equal(landformById("nope").id, "continents");
});

test("island is wetter than pangea for the same seed", () => {
  const gen = new MapGenerator();
  const island = gen.generate(cfg("island"));
  const pangea = gen.generate(cfg("pangea"));
  assert.ok(landRatio(island) < landRatio(pangea) - 0.08, "island should leave more ocean than pangea");
  assert.equal(island.meta.landform, "island");
  assert.equal(pangea.meta.landform, "pangea");
});

test("archipelago breaks land into several named islands", () => {
  const gen = new MapGenerator();
  const w = gen.generate(cfg("archipelago"));
  const islands = (w.features || []).filter((f) => f.type === "island");
  const continents = (w.features || []).filter((f) => f.type === "continent");
  assert.ok(islands.length + continents.length >= 2, "expected several landmasses");
});
