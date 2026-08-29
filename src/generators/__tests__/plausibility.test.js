import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { MAX_CELLS, clampGrid, createWorldShell, estimateCellCount } from "../../data/worldData.js";

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

test("mesh is populated and serializable", () => {
  const w = world("alpha-mesh");
  assert.ok(w.cells.length > 500, "expected hundreds of cells");
  assert.equal(w.version, 1);
  const json = JSON.stringify(w);
  const copy = JSON.parse(json);
  assert.equal(copy.cells.length, w.cells.length);
});

test("rivers only flow downhill and never climb ridges", () => {
  const w = world("river-downhill");
  assert.ok(w.rivers.length > 0, "expected at least one river");
  for (const river of w.rivers) {
    for (let i = 1; i < river.cellIds.length; i++) {
      const a = w.cells[river.cellIds[i - 1]];
      const b = w.cells[river.cellIds[i]];
      assert.ok(
        b.filledHeight <= a.filledHeight + 1e-6,
        `river ${river.id} climbed at step ${i}`,
      );
    }
    const last = w.cells[river.cellIds[river.cellIds.length - 1]];
    assert.ok(last.ocean || last.lake || last.downslope >= 0);
  }
});

test("settlements sit on land near water when possible", () => {
  const w = world("towns-water");
  assert.ok(w.settlements.length > 0, "expected settlements");
  for (const s of w.settlements) {
    const c = w.cells[s.cellId];
    assert.equal(c.ocean, false, `${s.name} placed in ocean`);
  }
  const watered = w.settlements.filter((s) => {
    const c = w.cells[s.cellId];
    return c.riverId >= 0 || c.coast || c.neighbors.some((id) => w.cells[id].lake);
  });
  assert.ok(watered.length >= Math.min(3, w.settlements.length));
});

test("high northern land is cold, not tropical", () => {
  const w = world("latitude-climate");
  const northLand = w.cells.filter((c) => !c.ocean && !c.lake && c.y < w.meta.height * 0.18);
  const tropical = northLand.filter((c) => c.biome.startsWith("TROPICAL"));
  assert.equal(tropical.length, 0, "tropical biome leaked into the far north");
});

test("editing height then recomputing keeps drainage valid", () => {
  const gen = new MapGenerator();
  const w = gen.generate({ seed: "sculpt-1", width: 800, height: 520, cellSize: 24, plateCount: 7 });
  const land = w.cells.find((c) => !c.ocean && !c.border);
  assert.ok(land);
  land.height += 0.4;
  gen.recomputeFromElevation(w);
  for (const c of w.cells) {
    if (c.ocean || c.downslope < 0) continue;
    assert.ok(w.cells[c.downslope].filledHeight <= c.filledHeight + 1e-6);
  }
});

test("default shell is a wide atlas and stays under the cell cap", () => {
  const shell = createWorldShell({ seed: "defaults" });
  assert.equal(shell.meta.width, 2560);
  assert.equal(shell.meta.height, 1600);
  assert.ok(shell.meta.cellSize <= 7);
  assert.ok(estimateCellCount(shell.meta.width, shell.meta.height, shell.meta.cellSize) <= MAX_CELLS);
});

test("clampGrid coarsens maps that would exceed the cell cap", () => {
  const size = clampGrid(5120, 3200, 4);
  assert.ok(size > 4);
  assert.ok(estimateCellCount(5120, 3200, size) <= MAX_CELLS);
  assert.equal(clampGrid(2560, 1600, 4), 4, "wide + extra-fine should stay at cell size 4");
  assert.equal(clampGrid(2560, 1600, 5), 5, "wide + fine should stay at cell size 5");
});
