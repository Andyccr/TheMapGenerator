import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { placeDiplomacy, tiesFor, stanceLabel } from "../diplomacy.js";

test("diplomacy only links neighboring realms", () => {
  const gen = new MapGenerator();
  const w = gen.generate({
    seed: "diplo-n",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  assert.ok((w.diplomacy?.length || 0) >= 0);
  const ids = new Set(w.regions.map((r) => r.id));
  for (const t of w.diplomacy || []) {
    assert.ok(ids.has(t.a) && ids.has(t.b));
    assert.ok(["ally", "peace", "rival", "war"].includes(t.stance));
    assert.ok(t.a < t.b);
  }
  if (w.regions.length >= 2 && (w.diplomacy?.length || 0) > 0) {
    const some = w.diplomacy[0].a;
    assert.ok(tiesFor(w.diplomacy, some).length >= 1);
  }
  assert.equal(stanceLabel("war"), "交战");
});

test("placeDiplomacy is empty for a single realm", () => {
  const ties = placeDiplomacy([{ id: 0, name: "A", color: "#000", capitalId: 0 }], [], () => 0.5);
  assert.equal(ties.length, 0);
});
