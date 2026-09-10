import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../../generators/mapGenerator.js";
import { createCulture, createReligion, createRealm, nextColor } from "../entities.js";

function smallWorld() {
  return new MapGenerator().generate({
    seed: "entity-n",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
}

test("nextColor skips used palette entries", () => {
  assert.equal(nextColor(new Set()), "#8c3a3a");
  assert.equal(nextColor(new Set(["#8c3a3a"])), "#3a5f8c");
});

test("createCulture paints only the origin cell", () => {
  const w = smallWorld();
  const land = w.cells.find((c) => !c.ocean && !c.border);
  assert.ok(land);
  const before = land.cultureId;
  const painted = w.cells.filter((c) => c.cultureId === before).length;
  const cult = createCulture(w, land.id, "试族", "highland");
  assert.ok(cult);
  assert.equal(land.cultureId, cult.id);
  assert.equal(w.cells.filter((c) => c.cultureId === cult.id).length, 1);
  assert.ok(painted >= 1);
});

test("createReligion paints only the origin cell", () => {
  const w = smallWorld();
  const land = w.cells.find((c) => !c.ocean && !c.border);
  assert.ok(land);
  const rel = createReligion(w, land.id, "试宗");
  assert.ok(rel);
  assert.equal(land.religionId, rel.id);
  assert.equal(w.cells.filter((c) => c.religionId === rel.id).length, 1);
});

test("createRealm requires a town and does not flood", () => {
  const w = smallWorld();
  const empty = w.cells.find((c) => !c.ocean && !c.border && !w.settlements.some((s) => s.cellId === c.id));
  assert.ok(empty);
  assert.equal(createRealm(w, empty.id, "空国"), null);
  const town = w.settlements.find((s) => !w.cells[s.cellId].ocean);
  assert.ok(town);
  const before = w.cells.filter((c) => c.regionId === town.regionId).length;
  const realm = createRealm(w, town.cellId, "新国");
  assert.ok(realm);
  assert.equal(town.type, "capital");
  assert.equal(w.cells[town.cellId].regionId, realm.id);
  assert.equal(w.cells.filter((c) => c.regionId === realm.id).length, 1);
  assert.ok(before >= 1);
});
