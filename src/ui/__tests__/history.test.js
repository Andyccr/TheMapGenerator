import assert from "node:assert/strict";
import { test } from "node:test";
import { EditHistory } from "../history.js";

test("EditHistory push, undo, redo, and discard", () => {
  const h = new EditHistory(2);
  const a = { meta: { seed: "a" } };
  const b = { meta: { seed: "b" } };
  const c = { meta: { seed: "c" } };
  h.push(a);
  const back = h.popUndo(b);
  assert.equal(back.meta.seed, "a");
  const forth = h.popRedo(back);
  assert.equal(forth.meta.seed, "b");
  h.clear();
  h.push(a);
  h.push(b);
  h.push(c);
  assert.equal(h.length, 2);
  assert.equal(h.popUndo(c).meta.seed, "c");
  h.push(a);
  h.discardLast();
  assert.equal(h.length, 1);
});
