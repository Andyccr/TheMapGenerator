import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE_WORLDS } from "../examples.js";
import { parseShare, shareHasSeed } from "../share.js";

test("example worlds are shareable queries with a seed and known landform", () => {
  assert.ok(EXAMPLE_WORLDS.length >= 4);
  const ids = new Set();
  for (const ex of EXAMPLE_WORLDS) {
    assert.ok(ex.title);
    assert.ok(ex.blurb);
    const share = parseShare(ex.query);
    assert.equal(shareHasSeed(share), true, ex.id);
    assert.ok(share.landform, ex.id);
    assert.equal(ids.has(ex.id), false);
    ids.add(ex.id);
  }
});
