import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShare, serializeShare, shareHasSeed } from "../share.js";

test("parseShare reads seed and known landform", () => {
  const s = parseShare("?seed=terra&landform=archipelago&style=political");
  assert.equal(s.seed, "terra");
  assert.equal(s.landform, "archipelago");
  assert.equal(s.style, "political");
  assert.equal(shareHasSeed(s), true);
});

test("parseShare accepts the population layer", () => {
  const s = parseShare("?seed=p&style=population");
  assert.equal(s.style, "population");
});

test("parseShare drops unknown keys and out-of-range numbers", () => {
  const s = parseShare("seed=ok&landform=mars&plates=99&sea=-40&detail=3");
  assert.equal(s.seed, "ok");
  assert.equal(s.landform, undefined);
  assert.equal(s.plates, undefined);
  assert.equal(s.sea, undefined);
  assert.equal(s.detail, undefined);
});

test("serializeShare omits defaults and round-trips", () => {
  const q = serializeShare({
    seed: "abc",
    landform: "island",
    extent: "3840,2400",
    detail: "5",
    style: "atlas",
    plates: "12",
    sea: "0",
  });
  assert.equal(q, "?seed=abc&landform=island");
  const back = parseShare(q);
  assert.equal(back.seed, "abc");
  assert.equal(back.landform, "island");
});
