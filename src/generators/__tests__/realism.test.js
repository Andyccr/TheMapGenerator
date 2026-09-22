import assert from "node:assert/strict";
import { test } from "node:test";
import { latitudeBand, climateBeltLabel } from "../../data/climate.js";
import { assignClimate } from "../climate.js";
import { assignStreamOrder, riverWidth } from "../hydrology.js";
import { slumpSlopes } from "../relief.js";

/** @param {number} id @param {number} x @param {number} y @param {number[]} neighbors @param {Partial<import("../../types.js").Cell>} extra */
function cell(id, x, y, neighbors, extra = {}) {
  return {
    id,
    x,
    y,
    neighbors,
    height: 0.2,
    filledHeight: 0.2,
    ocean: false,
    lake: false,
    coast: false,
    mountain: false,
    border: false,
    riverId: -1,
    downslope: -1,
    ...extra,
  };
}

test("subtropical latitudes are drier than the equatorial band", () => {
  assert.ok(latitudeBand(0.08) > latitudeBand(0.34) + 0.35);
  assert.ok(latitudeBand(0.58) > latitudeBand(0.34));
  assert.equal(climateBeltLabel(0.1), "赤道带");
  assert.equal(climateBeltLabel(0.34), "副热带");
  assert.equal(climateBeltLabel(0.9), "极地带");

  const eq = cell(0, 10, 92, [], { height: 0.15 });
  const horse = cell(1, 10, 66, [], { height: 0.15 });
  assignClimate([eq, horse], 100, { x: 1, y: 0 }, 160);
  assert.ok(eq.precipitation > horse.precipitation + 0.25);
  assert.ok(eq.temperature > horse.temperature);
});

test("inland seasonal range exceeds the coast at the same latitude", () => {
  const sea = cell(0, 0, 40, [1], { ocean: true, height: -0.3 });
  const coast = cell(1, 10, 40, [0, 2], { coast: true, height: 0.08 });
  const inland = cell(2, 20, 40, [1, 3], { height: 0.2 });
  const deep = cell(3, 30, 40, [2], { height: 0.2 });
  assignClimate([sea, coast, inland, deep], 100, { x: 1, y: 0 }, 80);
  assert.ok(deep.tempRange > coast.tempRange);
  assert.ok(coast.precipitation >= 0.32);
});

test("stream order rises where two tributaries meet, and width follows the mouth", () => {
  const cells = [
    cell(0, 0, 0, [2], { filledHeight: 0.6, downslope: 2 }),
    cell(1, 10, 0, [2], { filledHeight: 0.55, downslope: 2 }),
    cell(2, 5, 10, [0, 1, 3], { filledHeight: 0.3, downslope: 3 }),
    cell(3, 5, 20, [2], { ocean: true, height: -0.2, filledHeight: -0.2 }),
  ];
  const order = assignStreamOrder(cells);
  assert.equal(order[0], 1);
  assert.equal(order[1], 1);
  assert.equal(order[2], 2);
  assert.ok(riverWidth(80, 3) > riverWidth(4, 1));
});

test("one slump pass lowers a spike without erasing it", () => {
  const peak = cell(0, 0, 0, [1], { height: 0.9 });
  const foot = cell(1, 8, 0, [0], { height: 0.15 });
  const before = peak.height;
  slumpSlopes([peak, foot]);
  assert.ok(peak.height < before);
  assert.ok(peak.height > 0.7);
  assert.ok(foot.height > 0.15);
});
