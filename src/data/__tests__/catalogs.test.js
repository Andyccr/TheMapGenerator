import assert from "node:assert/strict";
import { test } from "node:test";
import { BIOMES, BIOME_LABELS, LAND_BIOMES, MARKER_TYPES, markerGlyph, cultureTypeLabel, religionTypeLabel, featureTypeLabel, landformLabel, LANDFORM_LABELS, stanceLabel, STANCE_LABELS, stepSummary, stepOpLabel, routeKindLabel, GENERATION_STAGE_LABELS, STYLE_IDS } from "../catalogs.js";
import { BIOMES as ClimateBiomes } from "../../generators/climate.js";

test("biome catalogs share one id set", () => {
  assert.deepEqual(Object.keys(BIOMES), Object.keys(BIOME_LABELS));
  assert.equal(ClimateBiomes, BIOMES);
  assert.ok(!LAND_BIOMES.includes("OCEAN"));
  assert.ok(!LAND_BIOMES.includes("LAKE"));
  assert.ok(LAND_BIOMES.includes("GRASSLAND"));
  assert.equal(LAND_BIOMES.length, Object.keys(BIOME_LABELS).length - 2);
});

test("type labels cover cultures, faiths, features, and markers", () => {
  assert.equal(cultureTypeLabel("naval"), "沿海");
  assert.equal(religionTypeLabel("organized"), "建制");
  assert.equal(featureTypeLabel("continent"), "大陆");
  assert.equal(markerGlyph("volcano"), "▲");
  assert.ok(MARKER_TYPES.ruins.label);
});

test("landform, stance, route, and recipe labels live in catalogs", () => {
  assert.equal(landformLabel("island"), "大岛");
  assert.equal(landformLabel("nope"), LANDFORM_LABELS.continents);
  assert.equal(stanceLabel("war"), "交战");
  assert.ok(STANCE_LABELS.ally);
  assert.ok(stepSummary({ op: "hill", n: 3 }).includes("丘"));
  assert.equal(stepOpLabel("strait"), "海峡");
  assert.equal(routeKindLabel("sea"), "海路");
  assert.equal(routeKindLabel("trail"), "小径");
  assert.equal(routeKindLabel("road"), "商路");
  assert.ok(GENERATION_STAGE_LABELS.mesh);
  assert.ok(STYLE_IDS.includes("population"));
  assert.ok(Object.keys(LANDFORM_LABELS).includes("archipelago"));
});
