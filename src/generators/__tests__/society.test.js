import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { parseWorld, hydrateWorld } from "../../data/worldData.js";
import { cultureStep } from "../cultures.js";

function world(seed) {
  const gen = new MapGenerator();
  return gen.generate({
    seed,
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
    seaLevel: 0,
    wind: { x: 1, y: 0 },
  });
}

test("cultures cover land and have distinct hearths", () => {
  const w = world("culture-hearths");
  assert.ok((w.cultures?.length || 0) >= 3, "expected several cultures");
  const land = w.cells.filter((c) => !c.ocean && !c.lake);
  const painted = land.filter((c) => c.cultureId >= 0);
  assert.ok(painted.length > land.length * 0.8, "most land should belong to a culture");
  assert.ok(w.cells.filter((c) => c.ocean).every((c) => c.cultureId < 0));
  const ids = new Set(w.cultures.map((c) => c.originId));
  assert.equal(ids.size, w.cultures.length);
});

test("roads stay on land and connect existing towns", () => {
  const w = world("roads-land");
  assert.ok((w.routes?.length || 0) > 0, "expected routes");
  const ids = new Set(w.settlements.map((s) => s.id));
  for (const route of w.routes) {
    assert.ok(ids.has(route.fromId) && ids.has(route.toId));
    if (route.kind === "sea") continue;
    for (const cid of route.cellIds) {
      assert.equal(w.cells[cid].ocean, false, `road ${route.id} entered ocean at ${cid}`);
    }
  }
});

test("markers sit on land and regenerateSociety keeps terrain", () => {
  const gen = new MapGenerator();
  const w = gen.generate({ seed: "poi-keep", width: 900, height: 600, cellSize: 24, plateCount: 8 });
  assert.ok((w.markers?.length || 0) > 0, "expected markers");
  for (const m of w.markers) {
    assert.equal(w.cells[m.cellId].ocean, false);
  }
  const heights = w.cells.map((c) => c.height);
  const seed0 = w.meta.seed;
  gen.regenerateSociety(w, "poi-keep-society-b");
  assert.equal(w.meta.seed, seed0);
  for (let i = 0; i < heights.length; i++) {
    assert.equal(w.cells[i].height, heights[i]);
  }
  assert.ok(w.settlements.length > 0);
  assert.ok(w.cultures.length >= 3);
});

test("older saves hydrate playability fields", () => {
  const raw = {
    version: 1,
    meta: { seed: "old", width: 100, height: 80, cellSize: 20, plateCount: 8, seaLevel: 0, wind: { x: 1, y: 0 }, style: "atlas" },
    cells: [{ id: 0, x: 0, y: 0, neighbors: [], polygon: [], ocean: false, cultureId: undefined }],
    plates: [],
    rivers: [{ id: 0, cellIds: [], points: [], width: 1 }],
    settlements: [{ id: 0, cellId: 0, name: "A", type: "town", regionId: 0 }],
    regions: [{ id: 0, name: "R", color: "#000", capitalId: 0 }],
    view: { x: 0, y: 0, scale: 1 },
    generatedAt: "2020-01-01",
  };
  const w = parseWorld(raw);
  assert.ok(Array.isArray(w.cultures));
  assert.ok(Array.isArray(w.routes));
  assert.ok(Array.isArray(w.markers));
  assert.equal(w.cells[0].cultureId, -1);
  assert.equal(w.settlements[0].population, 0);
  hydrateWorld(w);
  assert.equal(w.meta.societySeed, "old");
});

test("provinces stay inside their parent realm", () => {
  const w = world("province-bounds");
  assert.ok((w.provinces?.length || 0) > 0, "expected provinces");
  for (const p of w.provinces) {
    const seat = w.settlements.find((s) => s.id === p.seatId);
    assert.ok(seat, `province ${p.name} missing seat`);
    assert.equal(seat.regionId, p.regionId);
  }
  for (const c of w.cells) {
    if (c.provinceId < 0) continue;
    assert.equal(c.ocean, false);
    const p = w.provinces[c.provinceId];
    assert.ok(p);
    if (c.regionId >= 0) assert.equal(c.regionId, p.regionId);
  }
});

test("culture step treats ocean as expensive, not a homeland", () => {
  const ocean = { ocean: true, mountain: false, lake: false, height: -0.2, riverId: -1, coast: false, biome: "OCEAN" };
  assert.ok(cultureStep(ocean, "naval") > 5);
  const land = { ocean: false, mountain: false, lake: false, height: 0.1, riverId: 0, coast: true, biome: "GRASSLAND" };
  assert.ok(cultureStep(land, "naval") < cultureStep(ocean, "naval"));
});
