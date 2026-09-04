import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { addRouteBetween, removeRoutesThrough, pruneRoutes } from "../routes.js";

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

test("pruneRoutes drops links to missing towns and keeps the rest", () => {
  const gen = new MapGenerator();
  const w = gen.generate({
    seed: "road-link",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  const towns = w.settlements.filter((s) => !w.cells[s.cellId]?.ocean);
  assert.ok(towns.length >= 2);
  w.routes = [
    { id: 0, kind: "road", fromId: towns[0].id, toId: towns[1].id, cellIds: [towns[0].cellId, towns[1].cellId], points: [] },
    { id: 1, kind: "road", fromId: 9999, toId: towns[0].id, cellIds: [towns[0].cellId], points: [] },
  ];
  assert.equal(pruneRoutes(w), 1);
  assert.equal(w.routes.length, 1);
  assert.equal(w.routes[0].fromId, towns[0].id);
});

test("removeRoutesThrough only drops routes that contain the cell", () => {
  const world = {
    routes: [
      { id: 0, kind: "road", fromId: 0, toId: 1, cellIds: [10, 11, 12], points: [] },
      { id: 1, kind: "road", fromId: 1, toId: 2, cellIds: [12, 13], points: [] },
    ],
  };
  assert.equal(removeRoutesThrough(world, 11), 1);
  assert.equal(world.routes.length, 1);
  assert.equal(world.routes[0].id, 1);
  assert.equal(removeRoutesThrough(world, 12), 1);
  assert.equal(world.routes.length, 0);
});
