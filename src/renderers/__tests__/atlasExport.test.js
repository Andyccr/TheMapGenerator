import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutAtlasChrome } from "../atlasExport.js";

test("layoutAtlasChrome is larger than the map and reserves a legend column", () => {
  const m = layoutAtlasChrome(800, 500, 8);
  assert.ok(m.width > 800);
  assert.ok(m.height >= 500);
  assert.ok(m.legendW > 100);
  assert.equal(m.mapX, m.pad);
  assert.ok(m.legendX > m.mapX + 800);
});

test("layoutAtlasChrome skips the legend column when empty", () => {
  const m = layoutAtlasChrome(400, 300, 0);
  assert.equal(m.legendW, 0);
  assert.equal(m.width, 400 + m.pad * 2);
});
