import assert from "node:assert/strict";
import { test } from "node:test";
import { removeRoutesThrough, pruneRoutes } from "../routes.js";

test("pruneRoutes drops links to missing towns and keeps the rest", () => {
  const w = {
    settlements: [
      { id: 0, cellId: 1 },
      { id: 1, cellId: 2 },
    ],
    routes: [
      { id: 0, kind: "road", fromId: 0, toId: 1, cellIds: [1, 2], points: [] },
      { id: 1, kind: "road", fromId: 9999, toId: 0, cellIds: [1], points: [] },
    ],
  };
  assert.equal(pruneRoutes(w), 1);
  assert.equal(w.routes.length, 1);
  assert.equal(w.routes[0].fromId, 0);
});

test("pruneRoutes drops a road that now crosses ocean and keeps a coastal sea lane", () => {
  const w = {
    cells: [
      { id: 0, ocean: false, coast: true, lake: false },
      { id: 1, ocean: true, coast: false, lake: false },
      { id: 2, ocean: false, coast: false, lake: false },
    ],
    settlements: [
      { id: 0, cellId: 0 },
      { id: 1, cellId: 2 },
    ],
    routes: [
      { id: 0, kind: "road", fromId: 0, toId: 1, cellIds: [0, 1, 2], points: [] },
      { id: 1, kind: "sea", fromId: 0, toId: 1, cellIds: [0, 1], points: [] },
    ],
  };
  assert.equal(pruneRoutes(w), 1);
  assert.equal(w.routes.length, 1);
  assert.equal(w.routes[0].kind, "sea");
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
