import assert from "node:assert/strict";
import { test } from "node:test";
import { tiesFor, otherId, pruneDiplomacy, setStance } from "../diplomacy.js";

test("tiesFor and otherId read pairwise JSON", () => {
  const ties = [
    { a: 0, b: 2, stance: "war" },
    { a: 1, b: 2, stance: "peace" },
  ];
  assert.equal(tiesFor(ties, 2).length, 2);
  assert.equal(otherId(ties[0], 0), 2);
  assert.equal(otherId(ties[0], 2), 0);
});

test("setStance upserts a canonical a<b tie", () => {
  /** @type {import("../../types.js").DiplomacyTie[]} */
  const ties = [];
  const made = setStance(ties, 3, 1, "ally");
  assert.deepEqual(made, { a: 1, b: 3, stance: "ally" });
  assert.equal(setStance(ties, 1, 3, "war")?.stance, "war");
  assert.equal(ties.length, 1);
  assert.equal(setStance(ties, 1, 1, "peace"), null);
  assert.equal(setStance(ties, 0, 1, "nope"), null);
});

test("pruneDiplomacy drops missing realms", () => {
  const regions = [{ id: 0 }, { id: 2 }];
  const kept = pruneDiplomacy(
    [
      { a: 0, b: 2, stance: "peace" },
      { a: 0, b: 1, stance: "war" },
      { a: 2, b: 2, stance: "ally" },
    ],
    regions,
  );
  assert.deepEqual(kept, [{ a: 0, b: 2, stance: "peace" }]);
});
