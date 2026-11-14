import assert from "node:assert/strict";
import { test } from "node:test";
import { mapLatitude } from "../../data/climate.js";
import { parseWorld } from "../../data/worldData.js";
import { assignClimate } from "../climate.js";
import { placeCivilizations, rankSettlementTypes, settlementScore } from "../civilization.js";
import { extractRivers, markLakesFromFill, markMountains } from "../hydrology.js";
import { MapGenerator } from "../mapGenerator.js";
import { createNameFactory, phonologyById } from "../names.js";
import { diffuseMarginStrain, setLandFraction } from "../tectonics.js";

/** @param {number} id @param {number} x @param {number} y @param {number[]} neighbors @param {Partial<import("../../types.js").Cell>} extra */
function cell(id, x, y, neighbors, extra = {}) {
  return {
    id,
    x,
    y,
    neighbors,
    polygon: [
      [x - 4, y - 4],
      [x + 4, y - 4],
      [x + 4, y + 4],
      [x - 4, y + 4],
    ],
    height: 0.2,
    filledHeight: 0.2,
    ocean: false,
    lake: false,
    coast: false,
    mountain: false,
    border: false,
    riverId: -1,
    downslope: -1,
    flux: 0,
    precipitation: 0.5,
    basinId: 0,
    biome: "GRASSLAND",
    moisture: 0.4,
    tempRange: 0.08,
    cultureId: -1,
    ...extra,
  };
}

test("convergent strain stays a chain instead of a blob", () => {
  const w = 16;
  const h = 12;
  const id = (x, y) => y * w + x;
  /** @type {import("../../types.js").Cell[]} */
  const cells = [];
  const bound = new Float64Array(w * h);
  const strain = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const neighbors = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) neighbors.push(id(nx, ny));
      }
      const i = id(x, y);
      cells.push(/** @type {import("../../types.js").Cell} */ ({ id: i, x, y, neighbors }));
      bound[i] = Math.abs(x - 8);
      if (x === 8) strain[i] = 1;
    }
  }
  const field = diffuseMarginStrain(cells, strain, bound);
  const max = Math.max(...field);
  assert.ok(max > 0.4);
  const hot = field
    .map((v, i) => ({ v, x: cells[i].x, y: cells[i].y, d: bound[i] }))
    .filter((row) => row.v > max * 0.25);
  const thickness = new Set(hot.map((row) => row.x)).size;
  const span = new Set(hot.map((row) => row.y)).size;
  assert.ok(Math.max(...hot.map((row) => row.d)) <= 1, "strain leaked off the margin");
  assert.ok(thickness <= 3, `belt is ${thickness} cells thick`);
  assert.ok(span >= h - 1, "the margin should still be a continuous chain");
  assert.ok(hot.length >= h);
});

test("a high border cell is not forced underwater", () => {
  /** @type {import("../../types.js").Cell[]} */
  const cells = [];
  for (let i = 0; i < 20; i++) {
    cells.push(
      /** @type {import("../../types.js").Cell} */ ({
        id: i,
        border: i === 0,
        height: i === 0 || i === 4 ? 0.9 : 0.05,
        neighbors: [],
      }),
    );
  }
  cells[0].neighbors = [4];
  cells[4].neighbors = [0];
  setLandFraction(cells, 0.5, 0);
  assert.ok(cells[0].height >= 0, "a border cell backed by land was clamped below sea level");
});

test("meander points stay on downhill river cells", () => {
  /** @type {import("../../types.js").Cell[]} */
  const cells = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const neighbors = [];
    if (i) neighbors.push(i - 1);
    if (i < n - 1) neighbors.push(i + 1);
    neighbors.push(n + i);
    const y = i * 8;
    cells.push(
      cell(i, 0, y, neighbors, {
        height: 0.4 - i * 0.01,
        filledHeight: 0.4 - i * 0.01,
        flux: 40,
        downslope: i < n - 1 ? i + 1 : -1,
        precipitation: 0.8,
        polygon: [
          [-0.7, y - 3],
          [0.7, y - 3],
          [0.7, y + 3],
          [-0.7, y + 3],
        ],
      }),
    );
  }
  cells.push(
    cell(n, 0, n * 8, [n - 1], {
      ocean: true,
      height: -0.2,
      filledHeight: -0.2,
      flux: 0,
      downslope: -1,
    }),
  );
  cells[n - 1].downslope = n;
  cells[n - 1].neighbors = [n - 2, n, n + (n - 1)];
  for (let i = 0; i < n; i++) {
    cells.push(
      cell(n + 1 + i, 2.4, i * 8, [i], {
        height: 0.7,
        filledHeight: 0.7,
        flux: 0,
        downslope: -1,
        polygon: [
          [1.4, i * 8 - 3],
          [3.6, i * 8 - 3],
          [3.6, i * 8 + 3],
          [1.4, i * 8 + 3],
        ],
      }),
    );
  }
  const rivers = extractRivers(cells, 4);
  assert.ok(rivers.length >= 1);
  const river = rivers[0];
  const onPath = new Set(river.cellIds.filter((id) => !cells[id].ocean));
  const body = river.points.slice(1, -1);
  for (const pt of body) {
    let best = cells[0];
    let bestD = Infinity;
    for (const c of cells) {
      const d = (c.x - pt[0]) ** 2 + (c.y - pt[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    assert.ok(onPath.has(best.id), `meander drifted onto cell ${best.id}`);
    assert.equal(best.ocean, false);
    const idx = river.cellIds.indexOf(best.id);
    if (idx > 0) {
      const prev = cells[river.cellIds[idx - 1]];
      assert.ok(best.filledHeight <= prev.filledHeight + 1e-6);
    }
  }
});

test("river cuts are local, so a wet basin keeps more channel than an arid one", () => {
  /** @param {number} basin @param {number} precip @param {number} x0 */
  const chain = (basin, precip, x0) => {
    /** @type {import("../../types.js").Cell[]} */
    const rows = [];
    for (let i = 0; i < 18; i++) {
      rows.push(
        cell(0, x0, i * 6, [], {
          flux: i + 1,
          precipitation: precip,
          basinId: basin,
          filledHeight: 0.5 - i * 0.02,
          height: 0.5 - i * 0.02,
          downslope: -1,
        }),
      );
    }
    return rows;
  };
  const wet = chain(0, 0.92, 0);
  const dry = chain(1, 0.08, 40);
  const cells = [...wet, ...dry];
  for (let i = 0; i < cells.length; i++) {
    cells[i].id = i;
    cells[i].neighbors = [];
    if (i % 18 !== 0) cells[i].neighbors.push(i - 1);
    if (i % 18 !== 17) cells[i].neighbors.push(i + 1);
    if (i % 18 !== 17) cells[i].downslope = i + 1;
  }
  cells[17].ocean = true;
  cells[17].downslope = -1;
  cells[35].ocean = true;
  cells[35].downslope = -1;
  extractRivers(cells, 8);
  const count = (basin) => cells.filter((c) => c.basinId === basin && !c.ocean && c.riverId >= 0).length;
  assert.ok(count(0) > count(1), `wet ${count(0)} should exceed arid ${count(1)}`);
});

test("plateaus are not mountains; a steep ridge is", () => {
  const plateau = [
    cell(0, 0, 0, [1, 2], { height: 0.82 }),
    cell(1, 10, 0, [0], { height: 0.8 }),
    cell(2, 0, 10, [0], { height: 0.79 }),
  ];
  markMountains(plateau);
  assert.equal(plateau[0].mountain, false);
  const ridge = [cell(0, 0, 0, [1], { height: 0.42 }), cell(1, 10, 0, [0], { height: 0.22 })];
  markMountains(ridge);
  assert.equal(ridge[0].mountain, true);
});

test("a subtropical coast can stay dry", () => {
  const sea = cell(0, 0, 66, [1], { ocean: true, height: -0.3, coast: false });
  const coast = cell(1, 14, 66, [0], { coast: true, height: 0.06 });
  assignClimate([sea, coast], 100, { x: 1, y: 0 }, 160);
  assert.ok(coast.precipitation < 0.22, `coast precip ${coast.precipitation}`);
});

test("windward foot is wetter than the summit peak term", () => {
  const ocean = cell(0, 0, 50, [1], { ocean: true, height: -0.3 });
  const foot = cell(1, 18, 50, [0, 2], { height: 0.18, coast: true });
  const summit = cell(2, 36, 50, [1, 3], { height: 0.74 });
  const lee = cell(3, 54, 50, [2], { height: 0.2 });
  assignClimate([ocean, foot, summit, lee], 100, { x: 1, y: 0 }, 90, 8);
  assert.ok(
    foot.precipitation > summit.precipitation,
    `foot ${foot.precipitation} summit ${summit.precipitation}`,
  );
});

test("dual hemisphere is cold on both edges; the default is not", () => {
  assert.ok(mapLatitude(0, 100, false) > mapLatitude(90, 100, false));
  assert.equal(mapLatitude(0, 100, true), mapLatitude(100, 100, true));
  assert.ok(mapLatitude(50, 100, true) < 0.05);
  const north = cell(0, 10, 2, [], { height: 0.12 });
  const mid = cell(1, 10, 50, [], { height: 0.12 });
  const south = cell(2, 10, 98, [], { height: 0.12 });
  assignClimate([north, mid, south], 100, { x: 1, y: 0 }, 160, 10, true);
  assert.ok(mid.temperature > north.temperature + 0.2);
  assert.ok(mid.temperature > south.temperature + 0.2);
  const singleSouth = cell(0, 10, 98, [], { height: 0.12 });
  const singleNorth = cell(1, 10, 2, [], { height: 0.12 });
  assignClimate([singleSouth, singleNorth], 100, { x: 1, y: 0 }, 160, 10, false);
  assert.ok(singleSouth.temperature > singleNorth.temperature + 0.25);
});

test("generated dual hemisphere keeps cold edges and default seeds do not flip", () => {
  const gen = new MapGenerator();
  const base = { width: 640, height: 420, cellSize: 30, plateCount: 6, seaLevel: 0, wind: { x: 1, y: 0 } };
  const single = gen.generate({ ...base, seed: "hemi-plain" });
  assert.equal(single.meta.dualHemisphere, false);
  const avg = (rows) => rows.reduce((s, c) => s + c.temperature, 0) / rows.length;
  const north = single.cells.filter((c) => !c.ocean && !c.lake && c.y < single.meta.height * 0.16);
  const south = single.cells.filter((c) => !c.ocean && !c.lake && c.y > single.meta.height * 0.84);
  if (north.length && south.length) assert.ok(avg(south) > avg(north));
  const dual = gen.generate({ ...base, seed: "hemi-plain", dualHemisphere: true });
  assert.equal(dual.meta.dualHemisphere, true);
  const dNorth = dual.cells.filter((c) => !c.ocean && !c.lake && c.y < dual.meta.height * 0.14);
  const dSouth = dual.cells.filter((c) => !c.ocean && !c.lake && c.y > dual.meta.height * 0.86);
  const dMid = dual.cells.filter((c) => !c.ocean && !c.lake && Math.abs(c.y / dual.meta.height - 0.5) < 0.08);
  assert.ok(dNorth.length && dSouth.length && dMid.length);
  assert.ok(avg(dMid) > avg(dNorth) + 0.12);
  assert.ok(avg(dMid) > avg(dSouth) + 0.12);
  assert.equal(dNorth.filter((c) => String(c.biome).startsWith("TROPICAL")).length, 0);
  assert.equal(dSouth.filter((c) => String(c.biome).startsWith("TROPICAL")).length, 0);
});

test("city rank follows settlement score, not a lucky placement order", () => {
  const cells = [
    cell(0, 0, 0, [], { moisture: 0.3, riverId: -1, coast: false }),
    cell(1, 80, 0, [], { moisture: 0.95, riverId: 2, coast: true }),
    cell(2, 160, 0, [], { moisture: 0.35, riverId: -1, coast: false }),
  ];
  const settlements = cells.map((c, i) => ({
    id: i,
    cellId: c.id,
    name: "N",
    type: i === 0 ? "city" : "village",
    regionId: -1,
    cultureId: -1,
    population: 1,
    note: "",
  }));
  rankSettlementTypes(settlements, cells, 1, 2);
  assert.equal(settlements[1].type, "city");
  assert.equal(settlements[0].type, "village");
  assert.ok(settlementScore(cells[1], cells, () => 0) > settlementScore(cells[0], cells, () => 0));

  let n = 0;
  const rng = () => {
    n += 1;
    return n <= 4 ? 0.999 : 0;
  };
  const spaced = [0, 1, 2, 3, 4].map((i) =>
    cell(i, i * 22, 0, [], { moisture: i === 4 ? 0.5 : 0.42, riverId: -1, coast: false }),
  );
  const placed = placeCivilizations(spaced, rng, () => ({ settlement: () => "城", realm: () => "国" }), {
    width: 400,
    height: 250,
  });
  const rich = placed.settlements.find((s) => s.cellId === 4);
  assert.ok(rich);
  assert.ok(rich.type === "city" || rich.type === "capital");
  const lesser = placed.settlements.filter((s) => s.type === "town" || s.type === "village");
  for (const low of lesser) {
    assert.ok(settlementScore(cellsOf(spaced, rich.cellId), spaced, () => 0) >= settlementScore(cellsOf(spaced, low.cellId), spaced, () => 0));
  }
});

/** @param {import("../../types.js").Cell[]} cells @param {number} id */
function cellsOf(cells, id) {
  return cells[id];
}

test("hydronyms come from the local phonology", () => {
  const zh = createNameFactory(() => 0, phonologyById("harsh"));
  const en = createNameFactory(() => 0, phonologyById("nordic"));
  assert.match(zh.river(), /江|河/);
  assert.match(zh.lake(), /湖|泊/);
  assert.match(en.river(), /River|Beck/);
  assert.match(en.lake(), /Lake|Vatn/);
  assert.doesNotMatch(zh.lake(), /湖湖$/);
});

test("a 2.11 save hydrates the new hemisphere flag", () => {
  const w = parseWorld({
    version: 1,
    meta: {
      seed: "v211",
      width: 120,
      height: 80,
      cellSize: 20,
      plateCount: 8,
      seaLevel: 0,
      wind: { x: 1, y: 0 },
      style: "atlas",
    },
    cells: [{ id: 0, x: 1, y: 2, neighbors: [], height: 0.2, biome: "GRASSLAND" }],
    plates: [],
    rivers: [{ id: 0, cellIds: [0], points: [[1, 2]], width: 1 }],
    settlements: [],
    regions: [],
    view: { x: 0, y: 0, scale: 1 },
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(w.meta.dualHemisphere, false);
  assert.equal(w.rivers[0].name, "");
  assert.ok(Array.isArray(w.journeys));
});

test("six-cell puddles are not lakes", () => {
  const puddle = [];
  for (let i = 0; i < 6; i++) {
    const neighbors = [];
    if (i) neighbors.push(i - 1);
    if (i < 5) neighbors.push(i + 1);
    puddle.push(cell(i, i * 6, 0, neighbors, { height: -0.15, filledHeight: -0.05, ocean: false }));
  }
  markLakesFromFill(puddle);
  assert.ok(puddle.every((c) => c.lake === false));
});
