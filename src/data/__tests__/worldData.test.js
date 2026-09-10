import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorld, hydrateWorld } from "../worldData.js";

test("parseWorld hydrates missing playability arrays on version 1 saves", () => {
  const w = parseWorld({
    version: 1,
    meta: { seed: "old", width: 100, height: 80, cellSize: 20, plateCount: 8, seaLevel: 0, wind: { x: 1, y: 0 }, style: "atlas" },
    cells: [{ id: 0, x: 0, y: 0, neighbors: [], height: 0.2, biome: "GRASSLAND" }],
    plates: [],
    rivers: [],
    settlements: [],
    regions: [],
    view: { x: 0, y: 0, scale: 1 },
    generatedAt: "2020-01-01T00:00:00.000Z",
  });
  assert.deepEqual(w.cultures, []);
  assert.deepEqual(w.routes, []);
  assert.deepEqual(w.markers, []);
  assert.deepEqual(w.provinces, []);
  assert.deepEqual(w.religions, []);
  assert.deepEqual(w.features, []);
  assert.deepEqual(w.diplomacy, []);
  assert.equal(w.cells[0].cultureId, -1);
  assert.equal(w.meta.landform, "continents");
});

test("parseWorld rejects unknown versions", () => {
  assert.throws(() => parseWorld({ version: 2, meta: {}, cells: [] }), /不支持的世界版本/);
});

test("hydrateWorld is idempotent on a complete save", () => {
  const w = {
    version: 1,
    meta: { seed: "n", societySeed: "n", mapName: "图", landform: "island" },
    cells: [{ id: 0, cultureId: 1, provinceId: 0, religionId: 0, featureId: 0 }],
    cultures: [{ note: "a" }],
    routes: [{}],
    markers: [{ note: "" }],
    provinces: [{ note: "" }],
    religions: [{ note: "" }],
    features: [{ originId: 0, cx: 1, cy: 2, note: "" }],
    diplomacy: [],
    settlements: [],
    rivers: [],
    regions: [],
  };
  hydrateWorld(w);
  hydrateWorld(w);
  assert.equal(w.cultures.length, 1);
  assert.equal(w.features[0].cx, 1);
});
