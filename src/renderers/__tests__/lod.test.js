import assert from "node:assert/strict";
import { test } from "node:test";
import { lodFromZoom, lodConfig, macroBiome, LOD_LABELS } from "../lod.js";
import { chainPolylines, edgeBetween, buildContours } from "../contours.js";
import { simplifyPolyline } from "../../util/geometry.js";
import { MapGenerator } from "../../generators/mapGenerator.js";

test("lod bands are overview, regional, then local", () => {
  assert.equal(lodFromZoom(0.8), "overview");
  assert.equal(lodFromZoom(1), "overview");
  assert.equal(lodFromZoom(1.8), "regional");
  assert.equal(lodFromZoom(3), "local");
  assert.equal(LOD_LABELS.overview, "全图");
});

test("overview paint generalizes biomes and hides hillshade", () => {
  const cfg = lodConfig(1, 30000, 30000);
  assert.equal(cfg.level, "overview");
  assert.equal(cfg.generalize, true);
  assert.equal(cfg.hillshade, false);
  assert.equal(cfg.useRaster, true);
  assert.ok(cfg.riverMinWidth > 1);
  assert.equal(cfg.labels.village, false);
  assert.equal(macroBiome("TROPICAL_RAIN_FOREST"), "FOREST");
  assert.equal(macroBiome("SUBTROPICAL_DESERT"), "DESERT");
  assert.equal(macroBiome("TUNDRA"), "COLD");
});

test("local paint keeps cell biomes and can hillshade", () => {
  const cfg = lodConfig(3.4, 30000, 4000);
  assert.equal(cfg.level, "local");
  assert.equal(cfg.useRaster, false);
  assert.equal(cfg.hillshade, true);
  assert.equal(cfg.riverMinWidth, 0);
  assert.equal(cfg.labels.village, true);
});

test("simplifyPolyline keeps endpoints", () => {
  const pts = [
    [0, 0],
    [1, 0],
    [2, 0],
    [10, 0],
  ];
  const out = simplifyPolyline(pts, 3);
  assert.equal(out[0][0], 0);
  assert.equal(out[out.length - 1][0], 10);
  assert.ok(out.length < pts.length);
});

test("chainPolylines joins touching segments", () => {
  const lines = chainPolylines([
    [
      [0, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [2, 0],
    ],
    [
      [2, 0],
      [3, 0],
    ],
  ]);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length >= 3);
});

test("coast contours do not mutate cell data", () => {
  const gen = new MapGenerator();
  const w = gen.generate({
    seed: "lod-coasts",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  const h0 = w.cells[0].height;
  const biome0 = w.cells[0].biome;
  const n = w.cells.length;
  const contours = buildContours(w);
  assert.ok(contours.coasts.length > 0, "expected coastline polylines");
  assert.equal(w.cells.length, n);
  assert.equal(w.cells[0].height, h0);
  assert.equal(w.cells[0].biome, biome0);
  const a = w.cells.find((c) => !c.ocean && c.polygon.length >= 3);
  const b = a && w.cells[a.neighbors.find((id) => w.cells[id].ocean) ?? -1];
  if (a && b) {
    const e = edgeBetween(a, b, w.meta.cellSize);
    assert.ok(e && e.length === 2);
  }
});
