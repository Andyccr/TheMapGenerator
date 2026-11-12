import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../../generators/mapGenerator.js";
import { addRouteBetween } from "../routes.js";
import { removeRoutesThrough, pruneRoutes } from "../../data/routes.js";

test("addRouteBetween links two towns and refuses duplicates", () => {
  const gen = new MapGenerator();
  const w = gen.generate({
    seed: "road-link",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  const towns = w.settlements.filter((s) => !w.cells[s.cellId]?.ocean);
  assert.ok(towns.length >= 2, "need two land towns");
  const linked = new Set(
    (w.routes || []).map((r) => (r.fromId < r.toId ? `${r.fromId}-${r.toId}` : `${r.toId}-${r.fromId}`)),
  );
  let from = null;
  let to = null;
  for (const a of towns) {
    for (const b of towns) {
      if (a.id >= b.id) continue;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (!linked.has(key)) {
        from = a;
        to = b;
        break;
      }
    }
    if (from) break;
  }
  assert.ok(from && to, "need an unlinked pair");
  const before = w.routes.length;
  const route = addRouteBetween(w, from.id, to.id, "road");
  assert.ok(route, "expected a path");
  assert.equal(w.routes.length, before + 1);
  assert.ok(route.cellIds.length >= 2);
  assert.equal(addRouteBetween(w, to.id, from.id, "road"), null);
  assert.equal(w.routes.length, before + 1);
});
