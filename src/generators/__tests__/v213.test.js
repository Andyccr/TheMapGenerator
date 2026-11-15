import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignSheet, realmBrief, settlementSite } from "../../data/gazette.js";
import { inciseThalweg } from "../hydrology.js";
import { MapGenerator } from "../mapGenerator.js";
import { createNameFactory, phonologyById } from "../names.js";

const PLACE = /(港|津|湾|澳|渡|堡|关|城|都|镇|村)$| (haven|port|vik|ness|ford|bridge|burg|hold|stad|gard|ton|by|thorpe)$/i;

test("place names follow the site and the culture", () => {
  const zh = createNameFactory(() => 0, phonologyById("harsh"));
  const en = createNameFactory(() => 0, phonologyById("nordic"));
  assert.match(zh.settlement("port", "city"), /港|津/);
  assert.match(zh.settlement("ford", "town"), /渡/);
  assert.match(zh.settlement("town", "village"), /村/);
  assert.match(zh.settlement("town", "capital"), /城/);
  assert.match(en.settlement("port", "city"), /haven|port/);
  assert.match(en.settlement("ford", "town"), /ford/);
  assert.match(en.settlement("highland", "town"), /burg|hold/);
  assert.match(en.settlement("town", "village"), /thorpe/);
});

test("a generated town name carries a place suffix", () => {
  const w = new MapGenerator().generate({
    seed: "place-names",
    width: 720,
    height: 480,
    cellSize: 28,
    plateCount: 6,
    seaLevel: 0,
    wind: { x: 1, y: 0 },
  });
  assert.ok(w.settlements.length > 3);
  for (const s of w.settlements) assert.match(s.name, PLACE, s.name);
  const coast = w.settlements.find((s) => w.cells[s.cellId].coast && s.type !== "village");
  if (coast) assert.equal(settlementSite(w.cells[coast.cellId]) === "port" || settlementSite(w.cells[coast.cellId]) === "haven", true);
});

test("realm brief names the capital and the town count", () => {
  const world = {
    cells: [
      { regionId: 0, ocean: false, lake: false, religionId: 0 },
      { regionId: 0, ocean: false, lake: false, religionId: 0 },
      { regionId: 0, ocean: true, lake: false, religionId: -1 },
    ],
    settlements: [
      { id: 1, regionId: 0, name: "河津", type: "capital" },
      { id: 2, regionId: 0, name: "渡口", type: "town" },
    ],
    cultures: [{ id: 0, name: "滨民", type: "naval" }],
    religions: [{ id: 0, name: "海祠" }],
    diplomacy: [{ a: 0, b: 1, stance: "war" }],
    regions: [],
  };
  const region = { id: 0, name: "北海", capitalId: 1, cultureId: 0 };
  const line = realmBrief(world, region);
  assert.match(line, /都城 河津/);
  assert.match(line, /2座聚落/);
  assert.match(line, /2格/);
  assert.match(line, /滨民/);
  assert.match(line, /海祠/);
  assert.match(line, /交战1/);
  const sheet = campaignSheet({ ...world, meta: { mapName: "北海图", seed: "n" }, regions: [region], rivers: [{ name: "霜江", width: 3, cellIds: [0], points: [] }] });
  assert.match(sheet, /北海图/);
  assert.match(sheet, /都城 河津/);
  assert.match(sheet, /霜江/);
});

test("thalweg incision stays downhill and cuts a wet channel more than a dry one", () => {
  /** @param {number} precip */
  const chain = (precip) => {
    const cells = [];
    for (let i = 0; i < 5; i++) {
      cells.push({
        id: i,
        ocean: i === 4,
        lake: false,
        border: false,
        riverId: i === 4 ? -1 : 0,
        downslope: i === 4 ? -1 : i + 1,
        height: i === 4 ? -0.2 : 0.5 - i * 0.04,
        filledHeight: i === 4 ? -0.2 : 0.5 - i * 0.04,
        flux: 30,
        precipitation: precip,
        neighbors: [],
      });
    }
    return cells;
  };
  const wet = chain(0.95);
  const dry = chain(0.12);
  const wetBefore = wet[0].height;
  const dryBefore = dry[0].height;
  inciseThalweg(wet);
  inciseThalweg(dry);
  for (let i = 1; i < 4; i++) {
    assert.ok(wet[i].height <= wet[i - 1].height + 1e-9);
    assert.ok(dry[i].height <= dry[i - 1].height + 1e-9);
  }
  assert.ok(wet[0].height < wetBefore);
  assert.ok(wetBefore - wet[0].height > dryBefore - dry[0].height);
  const once = wet[0].height;
  inciseThalweg(wet);
  assert.ok(wetBefore - wet[0].height < 0.05, "a second pass must not gut the valley");
  assert.ok(wet[0].height <= once);
});
