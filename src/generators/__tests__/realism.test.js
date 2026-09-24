import assert from "node:assert/strict";
import { test } from "node:test";
import { latitudeBand, climateBeltLabel, circulationWind } from "../../data/climate.js";
import { assignClimate, spreadMoisture } from "../climate.js";
import { clearForeignProvinces } from "../provinces.js";
import { assignStreamOrder, riverWidth, assignBasins } from "../hydrology.js";
import { slumpSlopes, glaciateColdHighlands } from "../relief.js";
import { shapeHypsometry } from "../tectonics.js";

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
  assignBasins(cells);
  assert.equal(cells[0].basinId, cells[1].basinId);
  assert.ok(cells[0].basinId >= 0);
  assert.equal(cells[3].basinId, -1);
});

test("trades blow toward the west and the storm track blows toward the east", () => {
  const trades = circulationWind(0.16, { x: 0, y: 0 });
  const storm = circulationWind(0.55, { x: 0, y: 0 });
  assert.ok(trades.x < 0);
  assert.ok(storm.x > 0);
});

test("river moisture is applied before it diffuses to the banks", () => {
  const river = cell(0, 0, 0, [1], { precipitation: 0.12, moisture: 0.12, riverId: 0 });
  const bank = cell(1, 10, 0, [0], { precipitation: 0.12, moisture: 0.12 });
  spreadMoisture([river, bank]);
  const dry = cell(0, 0, 20, [1], { precipitation: 0.12, moisture: 0.12 });
  const other = cell(1, 10, 20, [0], { precipitation: 0.12, moisture: 0.12 });
  spreadMoisture([dry, other]);
  assert.ok(river.moisture > dry.moisture);
  assert.ok(bank.moisture > other.moisture);
});

test("a province id is cleared when the cell leaves that realm", () => {
  const cells = [
    cell(0, 0, 0, [], { regionId: 1, provinceId: 0 }),
    cell(1, 10, 0, [], { regionId: 0, provinceId: 0 }),
  ];
  const provinces = [{ id: 0, name: "东", color: "#ccc", regionId: 0, seatId: 1, note: "" }];
  assert.equal(clearForeignProvinces(cells, provinces), 1);
  assert.equal(cells[0].provinceId, -1);
  assert.equal(cells[1].provinceId, 0);
});

test("hypsometry keeps low land low and a high tail", () => {
  assert.ok(shapeHypsometry(0.12) < 0.12);
  assert.ok(shapeHypsometry(0.9) > 0.7);
  assert.ok(shapeHypsometry(0.9) > shapeHypsometry(0.2));
});

test("glaciers carve cold highlands and leave warm lowlands", () => {
  const peak = cell(0, 10, 8, [1], { height: 0.72 });
  const foot = cell(1, 18, 8, [0], { height: 0.4 });
  const warm = cell(2, 10, 90, [3], { height: 0.72 });
  const warmFoot = cell(3, 18, 90, [2], { height: 0.4 });
  const before = peak.height;
  glaciateColdHighlands([peak, foot, warm, warmFoot], 100);
  assert.ok(peak.height < before);
  assert.ok(peak.height > 0.55);
  assert.equal(warm.height, 0.72);
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
