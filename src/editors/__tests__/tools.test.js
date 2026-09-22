import assert from "node:assert/strict";
import { test } from "node:test";
import { createTools, RiverTool, StampTool } from "../tools.js";

test("every tool exposes a Chinese hint as the single source", () => {
  const tools = createTools();
  const ids = ["pan", "raise", "lower", "stamp", "paint", "river", "road", "burg", "erase", "marker", "move", "rename", "measure", "journey"];
  assert.deepEqual(Object.keys(tools).sort(), [...ids].sort());
  for (const id of ids) {
    const hint = tools[id].hint;
    assert.ok(hint && /[\u4e00-\u9fff]/.test(hint), id);
    assert.equal(/Click|Paint|Drag|Shift-click/i.test(hint), false, id);
  }
});

test("river tool carves through editor context instead of the App", () => {
  const river = new RiverTool();
  /** @type {number[] | null} */
  let carved = null;
  const ctx = {
    brush: 3,
    requestRecompute: () => {},
    commit: () => {},
    carveRiver: (path) => {
      carved = path.slice();
    },
  };
  const world = /** @type {any} */ ({});
  river.apply(world, { worldX: 0, worldY: 0, cellId: 1, phase: "down", shiftKey: false }, ctx);
  river.apply(world, { worldX: 0, worldY: 0, cellId: 2, phase: "move", shiftKey: false }, ctx);
  river.apply(world, { worldX: 0, worldY: 0, cellId: 3, phase: "up", shiftKey: false }, ctx);
  assert.deepEqual(carved, [1, 2]);
  assert.deepEqual(river.path, []);
});

test("stamp tool asks the context to recompute hydrology", () => {
  const stamp = new StampTool();
  let began = false;
  let recomputed = false;
  let committed = false;
  const ctx = {
    brush: 3,
    stampOp: "hill",
    requestRecompute: () => {},
    commit: () => {
      committed = true;
    },
    beginEdit: () => {
      began = true;
    },
    recomputeNow: () => {
      recomputed = true;
    },
  };
  const world = {
    cells: [{ id: 0, x: 50, y: 50, border: false, height: 0.2, neighbors: [] }],
    meta: { width: 100, height: 100, cellSize: 10 },
  };
  stamp.apply(world, { worldX: 50, worldY: 50, cellId: 0, phase: "down", shiftKey: false }, ctx);
  assert.equal(began, true);
  assert.equal(recomputed, true);
  assert.equal(committed, true);
});

