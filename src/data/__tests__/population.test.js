import assert from "node:assert/strict";
import { test } from "node:test";
import { hinterlandPressure } from "../population.js";

test("hinterlandPressure is zero on ocean and peaks near a town", () => {
  const townCell = {
    id: 1,
    x: 50,
    y: 50,
    ocean: false,
    lake: false,
    moisture: 0.4,
  };
  const near = { id: 2, x: 55, y: 50, ocean: false, lake: false, moisture: 0.2 };
  const far = { id: 3, x: 400, y: 400, ocean: false, lake: false, moisture: 0.2 };
  const sea = { id: 0, x: 10, y: 10, ocean: true, lake: false, moisture: 1 };
  const world = {
    cells: [sea, townCell, near, far],
    settlements: [{ id: 0, cellId: 1, name: "A", type: "city", regionId: 0, cultureId: 0, population: 8000 }],
  };
  assert.equal(hinterlandPressure(sea, world), 0);
  assert.ok(hinterlandPressure(near, world) > hinterlandPressure(far, world));
  assert.ok(hinterlandPressure(townCell, world) > hinterlandPressure(near, world));
});
