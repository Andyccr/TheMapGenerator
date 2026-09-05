import assert from "node:assert/strict";
import { test } from "node:test";
import { BIOMES, BIOME_LABELS, LAND_BIOMES, MARKER_TYPES, markerGlyph, cultureTypeLabel, religionTypeLabel, featureTypeLabel } from "../catalogs.js";
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
