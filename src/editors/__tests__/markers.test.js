import assert from "node:assert/strict";
import { test } from "node:test";
import { addMarker, removeMarkersAt } from "../markers.js";

function world() {
  return {
    cells: [
      { id: 0, ocean: true },
      { id: 1, ocean: false },
    ],
    markers: [],
  };
}

test("addMarker skips ocean, duplicates, and missing cells", () => {
  const w = world();
  assert.equal(addMarker(w, 0, "ruins", "海墟"), null);
  assert.equal(addMarker(w, 9, "ruins", "无格"), null);
  const m = addMarker(w, 1, "ruins", "废墟");
  assert.ok(m);
  assert.equal(m.cellId, 1);
  assert.equal(m.type, "ruins");
  assert.equal(addMarker(w, 1, "volcano", "火山"), null);
  assert.equal(w.markers.length, 1);
});

test("removeMarkersAt drops only that cell", () => {
  const w = world();
  addMarker(w, 1, "ruins", "废墟");
  assert.equal(removeMarkersAt(w, 0), 0);
  assert.equal(removeMarkersAt(w, 1), 1);
  assert.equal(w.markers.length, 0);
});
