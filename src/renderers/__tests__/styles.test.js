import assert from "node:assert/strict";
import { test } from "node:test";
import { fillFor, inkFor, routePaint } from "../styles.js";

/** @param {Partial<import("../../types.js").Cell>} over */
function cell(over) {
  return {
    id: 0,
    x: 10,
    y: 10,
    neighbors: [],
    polygon: [],
    border: false,
    plateId: 1,
    height: 0.4,
    filledHeight: 0.4,
    flux: 1,
    moisture: 0.5,
    temperature: 0.5,
    biome: "GRASSLAND",
    ocean: false,
    lake: false,
    coast: false,
    mountain: false,
    downslope: -1,
    riverId: -1,
    regionId: -1,
    cultureId: -1,
    provinceId: -1,
    religionId: -1,
    featureId: -1,
    precipitation: 0.5,
    basinId: 2,
    ...over,
  };
}

const world = { meta: { width: 100, height: 200, style: "atlas" }, cells: [], regions: [], cultures: [], provinces: [], religions: [], settlements: [] };

/** @param {string} color */
function lum(color) {
  const rgb = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (rgb) return 0.3 * Number(rgb[1]) + 0.5 * Number(rgb[2]) + 0.2 * Number(rgb[3]);
  const s = color.replace("#", "");
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return 0.3 * r + 0.5 * g + 0.2 * b;
}

test("new styles recolor from cell fields and stay distinct", () => {
  const land = cell({});
  const deep = cell({ ocean: true, height: -0.75, biome: "OCEAN" });
  const shoal = cell({ ocean: true, height: -0.05, biome: "OCEAN" });
  assert.ok(lum(fillFor(deep, world, "bathymetry")) < lum(fillFor(shoal, world, "bathymetry")));
  assert.notEqual(fillFor(land, world, "basins"), fillFor(cell({ basinId: 9 }), world, "basins"));
  assert.notEqual(fillFor(cell({ y: 4 }), world, "belts"), fillFor(cell({ y: 190 }), world, "belts"));
  assert.notEqual(fillFor(cell({ flux: 0.2 }), world, "runoff"), fillFor(cell({ flux: 80 }), world, "runoff"));
  assert.notEqual(fillFor(cell({ plateId: 1 }), world, "plates"), fillFor(cell({ plateId: 6 }), world, "plates"));
  const copper = fillFor(land, world, "copper").match(/rgb\((\d+),(\d+),(\d+)\)/);
  assert.ok(copper);
  const r = Number(copper[1]);
  const g = Number(copper[2]);
  const b = Number(copper[3]);
  assert.ok(Math.abs(r - g) < 28 && Math.abs(g - b) < 28);
  assert.notEqual(fillFor(land, world, "satellite"), fillFor(cell({ biome: "SUBTROPICAL_DESERT" }), world, "satellite"));
  const atlasLand = fillFor(land, world, "atlas", "overview");
  const atlasSea = fillFor(cell({ ocean: true, height: -0.3, biome: "OCEAN" }), world, "atlas", "overview");
  assert.ok(lum(atlasLand) > 180, atlasLand);
  assert.ok(lum(atlasSea) > 150, atlasSea);
  assert.ok(lum(atlasLand) > lum(atlasSea));
  assert.equal(inkFor("atlas").paper, "#f2efe9");
  const trunk = routePaint("trunk", "atlas", "overview");
  assert.equal(trunk.show, true);
  assert.ok(trunk.casingWidth > trunk.width);
  assert.equal(routePaint("trail", "atlas", "overview").show, true);
  assert.ok(routePaint("trail", "atlas", "overview").width < trunk.width);
  assert.equal(inkFor("satellite").marks, "light");
  assert.equal(inkFor("night").marks, "light");
  assert.equal(inkFor("copper").paper, "#e4dcc8");
});

test("street, chart, survey, and dusk fills stay distinct", () => {
  const town = cell({ id: 0, x: 10, y: 10, biome: "GRASSLAND" });
  const wood = cell({ id: 1, x: 800, y: 800, biome: "TEMPERATE_DECIDUOUS" });
  const sea = cell({ id: 2, x: 40, y: 40, ocean: true, height: -0.55, biome: "OCEAN" });
  const sheet = {
    ...world,
    meta: { ...world.meta, cellSize: 8, surfaceRev: 1 },
    cells: [town, wood, sea],
    settlements: [{ id: 0, cellId: 0, type: "capital", population: 4000 }],
    generatedAt: "street-test",
  };
  assert.equal(fillFor(town, sheet, "osm"), "#e0dfdf");
  assert.equal(fillFor(wood, sheet, "osm"), "#add19e");
  assert.notEqual(fillFor(sea, sheet, "osm"), fillFor(wood, sheet, "osm"));
  assert.ok(lum(fillFor(town, sheet, "dusk")) > lum(fillFor(wood, sheet, "dusk")));
  assert.notEqual(fillFor(cell({ height: 0.05 }), world, "survey"), fillFor(cell({ height: 0.6 }), world, "survey"));
  assert.equal(routePaint("trunk", "osm", "overview").stroke, "#e892a2");
  assert.ok(routePaint("trunk", "osm", "overview").casingWidth > routePaint("trunk", "osm", "overview").width);
  assert.equal(routePaint("trail", "osm", "overview").show, false);
  assert.equal(routePaint("trail", "osm", "local").show, true);
  assert.equal(inkFor("dusk").marks, "light");
  assert.equal(inkFor("osm").paper, "#f2efe9");
});
