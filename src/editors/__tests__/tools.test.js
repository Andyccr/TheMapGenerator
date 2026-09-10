import assert from "node:assert/strict";
import { test } from "node:test";
import { createTools } from "../tools.js";

test("every tool exposes a Chinese hint as the single source", () => {
  const tools = createTools();
  const ids = ["pan", "raise", "lower", "stamp", "paint", "river", "road", "burg", "erase", "marker", "move", "rename", "measure"];
  assert.deepEqual(Object.keys(tools).sort(), [...ids].sort());
  for (const id of ids) {
    const hint = tools[id].hint;
    assert.ok(hint && /[\u4e00-\u9fff]/.test(hint), id);
    assert.equal(/Click|Paint|Drag|Shift-click/i.test(hint), false, id);
  }
});
