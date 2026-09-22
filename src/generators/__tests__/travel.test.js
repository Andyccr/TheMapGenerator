import assert from "node:assert/strict";
import { test } from "node:test";
import { marchPath, planLeg } from "../travel.js";
import { corridorMask } from "../../data/journeys.js";

/** @param {number} id @param {number} x @param {number} y @param {number[]} neighbors @param {Partial<import("../../types.js").Cell>} extra */
function cell(id, x, y, neighbors, extra = {}) {
  return {
    id,
    x,
    y,
    neighbors,
    polygon: [],
    border: false,
    plateId: 0,
    height: 0.15,
    filledHeight: 0.15,
    flux: 0,
    moisture: 0.4,
    temperature: 0.5,
    biome: "GRASSLAND",
    ocean: false,
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
    ...extra,
  };
}

test("march prefers the road and refuses to cross ocean", () => {
  const cells = [
    cell(0, 0, 0, [1, 2]),
    cell(1, 10, 0, [0, 3]),
    cell(2, 0, 10, [0, 3], { mountain: true, height: 0.8, biome: "BARE" }),
    cell(3, 10, 10, [1, 2]),
  ];
  const world = {
    cells,
    routes: [{ id: 0, kind: "road", fromId: 0, toId: 0, cellIds: [0, 1, 3], points: [] }],
    settlements: [],
    markers: [],
    rivers: [],
  };
  const path = marchPath(cells, corridorMask(world), 0, 3);
  assert.deepEqual(path, [0, 1, 3]);

  const blocked = [
    cell(0, 0, 0, [1]),
    cell(1, 10, 0, [0, 2], { ocean: true, biome: "OCEAN" }),
    cell(2, 20, 0, [1]),
  ];
  const none = planLeg({ cells: blocked, routes: [], settlements: [], markers: [], rivers: [] }, 0, 2);
  assert.equal(none, null);
});

test("a coastal pair takes the sea when the mountains make the march slower", () => {
  const cells = [
    cell(0, 0, 0, [1, 2], { coast: true }),
    cell(1, 10, 0, [0, 3], { mountain: true, height: 0.9, biome: "BARE" }),
    cell(2, 0, 12, [0, 4], { ocean: true, biome: "OCEAN" }),
    cell(3, 20, 0, [1, 5], { mountain: true, height: 0.9, biome: "BARE" }),
    cell(4, 16, 12, [2, 5], { ocean: true, biome: "OCEAN" }),
    cell(5, 30, 0, [3, 4], { coast: true }),
  ];
  const world = { cells, routes: [], settlements: [], markers: [], rivers: [] };
  const leg = planLeg(world, 0, 5);
  assert.ok(leg);
  assert.equal(leg.mode, "voyage");
  assert.ok(leg.cellIds.includes(2));
  assert.equal(leg.cellIds[0], 0);
  assert.equal(leg.cellIds[leg.cellIds.length - 1], 5);
});
