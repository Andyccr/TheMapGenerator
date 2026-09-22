import assert from "node:assert/strict";
import { test } from "node:test";
import { JourneyTool, commitJourney } from "../journeys.js";

/** @param {number} id @param {number} x @param {number[]} neighbors */
function cell(id, x, neighbors) {
  return {
    id,
    x,
    y: 0,
    neighbors,
    polygon: [],
    border: false,
    plateId: 0,
    height: 0.2,
    filledHeight: 0.2,
    flux: 0,
    moisture: 0.5,
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
    precipitation: 0.5,
  };
}

function world() {
  return {
    cells: [cell(0, 0, [1]), cell(1, 12, [0, 2]), cell(2, 24, [1])],
    settlements: [
      { id: 0, cellId: 0, name: "河湾", type: "town", regionId: -1, cultureId: -1, population: 1 },
      { id: 1, cellId: 2, name: "关城", type: "town", regionId: -1, cultureId: -1, population: 1 },
    ],
    markers: [],
    routes: [],
    rivers: [],
    journeys: [],
  };
}

test("journey tool extends, pops a stop, and seals a chronicle", () => {
  const tool = new JourneyTool();
  const map = world();
  /** @type {string[]} */
  const toasts = [];
  const ctx = {
    brush: 1,
    requestRecompute() {},
    commit() {},
    beginEdit() {},
    toast(msg) {
      toasts.push(msg);
    },
    askText(_label, fallback, done) {
      done(fallback);
    },
  };
  tool.apply(map, { worldX: 0, worldY: 0, cellId: 0, phase: "down", shiftKey: false }, ctx);
  tool.apply(map, { worldX: 24, worldY: 0, cellId: 2, phase: "down", shiftKey: false }, ctx);
  assert.deepEqual(tool.path, [0, 1, 2]);
  assert.equal(tool.suggestedName(map), "河湾至关城");
  tool.pop();
  assert.deepEqual(tool.path, [0]);
  tool.extend(map, 2);
  tool.seal(map, ctx);
  assert.equal(map.journeys.length, 1);
  assert.equal(map.journeys[0].name, "河湾至关城");
  assert.ok(map.journeys[0].days > 0);
  assert.equal(map.journeys[0].legs[0].kind, "start");
  assert.equal(map.journeys[0].legs.at(-1)?.kind, "end");
  assert.equal(tool.path.length, 0);
  assert.ok(toasts.some((t) => t.includes("已封存")));
  assert.equal(commitJourney(map, [0], "短"), null);
});
