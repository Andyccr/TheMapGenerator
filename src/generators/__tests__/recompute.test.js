import assert from "node:assert/strict";
import { test } from "node:test";
import { MapGenerator } from "../mapGenerator.js";
import { paintCell } from "../../editors/paint.js";
import { runOnMain } from "../../ui/generateClient.js";

const small = {
  seed: "recompute-n",
  width: 900,
  height: 600,
  cellSize: 24,
  plateCount: 8,
};

test("recomputeFromElevation keeps extra routes, markers, names, paint, and diplomacy", () => {
  const gen = new MapGenerator();
  const w = gen.generate(small);
  const named = w.rivers.reduce((a, b) => ((a?.cellIds.length || 0) >= b.cellIds.length ? a : b), w.rivers[0]);
  assert.ok(named?.name);
  named.name = "专名长河";
  const riverName = named.name;
  const towns = w.settlements.filter((s) => !w.cells[s.cellId]?.ocean);
  assert.ok(towns.length >= 2);
  const extraId = w.routes.reduce((m, r) => Math.max(m, r.id), -1) + 1;
  w.routes.push({
    id: extraId,
    kind: "trail",
    fromId: towns[0].id,
    toId: towns[1].id,
    cellIds: [towns[0].cellId, towns[1].cellId],
    points: [],
  });
  const land = w.cells.find((c) => !c.ocean && !c.border && c.cultureId >= 0);
  assert.ok(land);
  const paintedCulture = land.cultureId;
  paintCell(w, land.id, "biome", "GRASSLAND");
  w.markers.push({
    id: (w.markers.reduce((m, x) => Math.max(m, x.id), -1) + 1),
    cellId: land.id,
    type: "ruins",
    name: "自定义废墟",
    note: "",
  });
  const routeCount = w.routes.length;
  const diplo = JSON.stringify(w.diplomacy);
  const markerName = "自定义废墟";
  gen.recomputeFromElevation(w);
  assert.equal(w.routes.length, routeCount);
  assert.ok(w.markers.some((m) => m.name === markerName));
  assert.equal(JSON.stringify(w.diplomacy), diplo);
  assert.ok(w.rivers.some((r) => r.name === riverName));
  assert.equal(w.cells[land.id].cultureId, paintedCulture);
});

test("recomputeClimate restamps biomes without moving towns", () => {
  const gen = new MapGenerator();
  const w = gen.generate(small);
  const towns = w.settlements.map((s) => s.cellId);
  const routes = w.routes.length;
  w.meta.wind = { x: -1, y: 0 };
  const out = runOnMain("climate", { world: w });
  assert.equal(out, w);
  assert.deepEqual(
    w.settlements.map((s) => s.cellId),
    towns,
  );
  assert.equal(w.routes.length, routes);
});
