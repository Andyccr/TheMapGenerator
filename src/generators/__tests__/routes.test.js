import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { addRouteBetween } from "../routes.js";

test("addRouteBetween links two towns and refuses duplicates", () => {
  const gen = new MapGenerator();
  const w = gen.generate({
    seed: "road-link",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  const towns = w.settlements.filter((s) => !w.cells[s.cellId]?.ocean);
  assert.ok(towns.length >= 2, "need two land towns");
  const before = w.routes.length;
  const route = addRouteBetween(w, towns[0].id, towns[1].id, "road");
  assert.ok(route, "expected a path");
  assert.equal(w.routes.length, before + 1);
  assert.ok(route.cellIds.length >= 2);
  assert.equal(addRouteBetween(w, towns[1].id, towns[0].id, "road"), null);
  assert.equal(w.routes.length, before + 1);
});
