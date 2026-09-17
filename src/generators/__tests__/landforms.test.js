import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { LANDFORMS, landformById, recipeFor, parseRecipe, stepSummary, stampAt } from "../landforms.js";

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

test("archipelago breaks land into several masses", () => {
  const gen = new MapGenerator();
  const w = gen.generate(cfg("archipelago"));
  const landIds = w.cells.filter((c) => !c.ocean).map((c) => c.id);
  const seen = new Set();
  let parts = 0;
  for (const id of landIds) {
    if (seen.has(id)) continue;
    parts++;
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      for (const nid of w.cells[cur].neighbors) {
        if (seen.has(nid) || w.cells[nid].ocean) continue;
        seen.add(nid);
        stack.push(nid);
      }
    }
  }
  assert.ok(parts >= 2, `expected several landmasses, got ${parts}`);
});

test("recipes are data, parseRecipe drops unknown ops", () => {
  const arch = recipeFor("archipelago");
  assert.ok(arch.some((s) => s.op === "hill"));
  assert.equal(recipeFor("continents").length, 0);
  const parsed = parseRecipe([{ op: "hill", n: 2 }, { op: "laser" }, "nope"]);
  assert.equal(parsed?.length, 1);
  assert.ok(stepSummary({ op: "hill", n: 3 }).includes("丘"));
});

test("custom landformSteps are honored", () => {
  const gen = new MapGenerator();
  const extra = gen.generate({
    ...cfg("continents"),
    landformSteps: [{ op: "sink", amp: 0.35 }, { op: "hill", n: 4, rx: 0.08, ry: 0.07, amp: 0.45, jitter: true }],
  });
  assert.ok(Array.isArray(extra.meta.landformSteps));
  assert.ok(landRatio(extra) < 0.55);
});

test("empty landformSteps stay empty instead of falling back to the preset", () => {
  const gen = new MapGenerator();
  const w = gen.generate({ ...cfg("archipelago"), landformSteps: [] });
  assert.deepEqual(w.meta.landformSteps, []);
});

test("stampAt raises the clicked cell without a land-fraction reset", () => {
  const gen = new MapGenerator();
  const w = gen.generate(cfg("continents"));
  const mid = w.cells.reduce((best, c) => {
    const d = (c.x - w.meta.width / 2) ** 2 + (c.y - w.meta.height / 2) ** 2;
    const bd = (best.x - w.meta.width / 2) ** 2 + (best.y - w.meta.height / 2) ** 2;
    return d < bd ? c : best;
  });
  const before = mid.height;
  stampAt(w.cells, w.meta.width, w.meta.height, "hill", mid.x, mid.y, 0.12, 0.5);
  assert.ok(mid.height > before + 0.05, `expected stamp to raise ${before} -> ${mid.height}`);
});

test("applyLandformSteps overlays recipe then leaves hydrology to recompute", () => {
  const gen = new MapGenerator();
  const w = gen.generate(cfg("continents"));
  const land = w.cells.find((c) => !c.ocean && !c.border);
  assert.ok(land);
  const before = land.height;
  gen.applyLandformSteps(w, [{ op: "raise", amp: 0.2 }]);
  assert.ok(land.height > before);
  assert.equal(w.meta.landformSteps[0].op, "raise");
});
