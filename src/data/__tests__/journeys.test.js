import assert from "node:assert/strict";
import { test } from "node:test";
import { chronicle, formatDays, paceLeaguesPerDay, removeJourney, renameJourney } from "../journeys.js";

/** @param {Partial<import("../../types.js").Cell>} extra */
function cell(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    neighbors: [],
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
    ...extra,
  };
}

test("mountains and fords cost more days than open grass", () => {
  const grass = cell(0, 0, 0);
  const peak = cell(1, 0, 0, { mountain: true, biome: "BARE" });
  assert.ok(paceLeaguesPerDay(peak, 0) < paceLeaguesPerDay(grass, 0));
  assert.ok(paceLeaguesPerDay(grass, 2) > paceLeaguesPerDay(grass, 0));

  const open = chronicle(
    { cells: [cell(0, 0, 0), cell(1, 20, 0)], settlements: [], markers: [], routes: [], rivers: [] },
    [0, 1],
  );
  const slow = chronicle(
    {
      cells: [cell(0, 0, 0), cell(1, 20, 0, { mountain: true, biome: "BARE" })],
      settlements: [],
      markers: [],
      routes: [],
      rivers: [],
    },
    [0, 1],
  );
  const ford = chronicle(
    {
      cells: [cell(0, 0, 0), cell(1, 20, 0, { riverId: 0 })],
      settlements: [],
      markers: [],
      routes: [],
      rivers: [{ id: 0, name: "青河", cellIds: [1], points: [], width: 1 }],
    },
    [0, 1],
  );
  assert.ok(slow.days > open.days);
  assert.ok(ford.days > open.days);
  assert.equal(ford.legs.some((leg) => leg.kind === "ford" && leg.label === "青河"), true);
  assert.match(formatDays(open.days), /日/);
});

test("chronicle stops at a town and remove/rename keep the save consistent", () => {
  const world = {
    cells: [cell(0, 0, 0), cell(1, 10, 0), cell(2, 20, 0)],
    settlements: [{ id: 0, cellId: 2, name: "渡口", type: "town", regionId: -1, cultureId: -1, population: 10 }],
    markers: [],
    routes: [],
    rivers: [],
    journeys: [],
  };
  const stats = chronicle(world, [0, 1, 2]);
  assert.equal(stats.legs[0].kind, "start");
  assert.equal(stats.legs[stats.legs.length - 1].kind, "end");
  assert.equal(stats.legs[stats.legs.length - 1].label, "渡口");
  world.journeys.push({
    id: 3,
    name: "北上",
    note: "",
    cellIds: [0, 1, 2],
    points: [],
    days: stats.days,
    leagues: stats.leagues,
    mode: stats.mode,
    legs: stats.legs,
  });
  assert.equal(renameJourney(world, 3, "南下"), true);
  assert.equal(world.journeys[0].name, "南下");
  assert.equal(removeJourney(world, 3), 1);
  assert.equal(world.journeys.length, 0);
});
