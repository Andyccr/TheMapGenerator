import assert from "node:assert/strict";
import { test } from "node:test";
import { addSettlement, moveSettlement, settlementAt } from "../settlements.js";

function landWorld() {
  return {
    cells: [
      { id: 0, ocean: false, lake: false, regionId: 0, cultureId: 0, height: 0.2, moisture: 0.4, biome: "GRASSLAND", riverId: -1, coast: false },
      { id: 1, ocean: false, lake: false, regionId: 1, cultureId: 0, height: 0.2, moisture: 0.4, biome: "GRASSLAND", riverId: -1, coast: false },
      { id: 2, ocean: true, lake: false, regionId: -1, cultureId: -1, height: -0.4, moisture: 1, biome: "OCEAN", riverId: -1, coast: true },
    ],
    settlements: [],
    regions: [{ id: 0, name: "A", color: "#000", capitalId: 0 }],
  };
}

test("moveSettlement stays on land and updates region", () => {
  const w = landWorld();
  const s = addSettlement(w, 0, "港埠", "town");
  assert.ok(s);
  assert.equal(settlementAt(w, 0)?.id, s.id);
  assert.equal(moveSettlement(w, s.id, 2), false);
  assert.equal(s.cellId, 0);
  assert.equal(moveSettlement(w, s.id, 1), true);
  assert.equal(s.cellId, 1);
  assert.equal(s.regionId, 1);
  assert.equal(settlementAt(w, 0), null);
});
