import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { buildRoadGraph, searchGraph } from "../navmesh.js";

/**
 * @param {number} w
 * @param {number} h
 * @param {(x: number, y: number) => boolean} oceanAt
 */
function grid(w, h, oceanAt) {
  /** @type {import("../../types.js").Cell[]} */
  const cells = [];
  const id = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ocean = oceanAt(x, y);
      /** @type {number[]} */
      const neighbors = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) neighbors.push(id(nx, ny));
      }
      cells.push({
        id: id(x, y),
        x: x * 10,
        y: y * 10,
        neighbors,
        polygon: [],
        border: false,
        plateId: 0,
        height: ocean ? -0.4 : 0.12,
        filledHeight: ocean ? -0.4 : 0.12,
        flux: 0,
        moisture: 0.4,
        temperature: 0.5,
        biome: ocean ? "OCEAN" : "GRASSLAND",
        ocean,
        lake: false,
        coast: false,
        mountain: false,
        downslope: -1,
        riverId: -1,
        regionId: -1,
        cultureId: -1,
        provinceId: -1,
        religionId: -1,
        featureId: -1,
        precipitation: 0.4,
      });
    }
  }
  return cells;
}

test("coarse roads go around a channel instead of chord across it", () => {
  const w = 10;
  const h = 7;
  const cells = grid(w, h, (x, y) => y === 3 && x > 0);
  const start = 0 * w + 9;
  const goal = 6 * w + 9;
  const graph = buildRoadGraph(cells, [start, goal]);
  const coarse = searchGraph(graph, start, goal);
  assert.ok(coarse && coarse.length > 2, "expected a detour, not a single chord");
  assert.ok(
    coarse.some((id) => cells[id].x === 0),
    "the only land bridge is the x = 0 column",
  );
  for (const id of coarse) assert.equal(cells[id].ocean, false);
});

test("generated highways stay on land and are neighbor-connected", () => {
  const gen = new MapGenerator();
  const world = gen.generate({
    seed: "nav-roads",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  assert.ok(world.routes.length > 4, "expected a road network");
  assert.ok(
    world.routes.some((r) => r.kind === "trunk" || r.kind === "primary"),
    "expected a trunk or primary road",
  );
  for (const route of world.routes) {
    assert.ok(route.cellIds.length >= 2);
    for (let i = 1; i < route.cellIds.length; i++) {
      const prev = world.cells[route.cellIds[i - 1]];
      const cell = world.cells[route.cellIds[i]];
      assert.ok(prev.neighbors.includes(cell.id), `${route.kind} ${route.id} skipped a cell`);
      if (route.kind === "sea") {
        assert.ok(cell.ocean || cell.coast || cell.lake);
      } else {
        assert.equal(cell.ocean, false);
      }
    }
  }
});
