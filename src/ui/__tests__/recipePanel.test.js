import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultStep } from "../recipePanel.js";
import { stepSummary } from "../../data/catalogs.js";

test("defaultStep presets stay within catalog ops", () => {
  assert.equal(defaultStep("pit").op, "pit");
  assert.equal(defaultStep("hill").op, "hill");
  assert.equal(defaultStep("mask").op, "mask");
  assert.match(stepSummary(defaultStep("range")), /岭/);
});
