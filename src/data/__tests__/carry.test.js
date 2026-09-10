import assert from "node:assert/strict";
import { test } from "node:test";
import { carryNames } from "../carry.js";

test("carryNames copies a river name when cells overlap", () => {
  const prev = [{ cellIds: [1, 2, 3, 4], name: "试河" }];
  const next = [{ cellIds: [3, 4, 5], name: "" }];
  assert.equal(carryNames(prev, next, "river"), 1);
  assert.equal(next[0].name, "试河");
});

test("carryNames copies a river name from a single shared cell", () => {
  const prev = [{ cellIds: [1, 2, 3], name: "短河" }];
  const next = [{ cellIds: [3, 9, 10], name: "" }];
  assert.equal(carryNames(prev, next, "river"), 1);
  assert.equal(next[0].name, "短河");
});

test("carryNames does not give the same old name to two rivers", () => {
  const prev = [{ cellIds: [1, 2, 3], name: "独名" }];
  const next = [
    { cellIds: [1, 8], name: "" },
    { cellIds: [2, 9], name: "" },
  ];
  assert.equal(carryNames(prev, next, "river"), 1);
  const named = next.filter((r) => r.name === "独名");
  assert.equal(named.length, 1);
});

test("carryNames matches features by origin then proximity", () => {
  const prev = [{ name: "北洲", type: "continent", originId: 4, cx: 10, cy: 10 }];
  const next = [{ name: "", type: "continent", originId: 4, cx: 12, cy: 11 }];
  assert.equal(carryNames(prev, next, "feature"), 1);
  assert.equal(next[0].name, "北洲");
});
