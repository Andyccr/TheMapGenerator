import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATOR_OPS, STAGE_LABELS, runOnMain } from "../generateClient.js";
import { MapGenerator } from "../../generators/mapGenerator.js";

const small = {
  seed: "arch-job",
  width: 900,
  height: 600,
  cellSize: 24,
  plateCount: 8,
};

test("worker ops and progress stages stay in lockstep", () => {
  assert.deepEqual([...GENERATOR_OPS], ["generate", "society", "routes", "recompute", "names", "climate"]);
  for (const stage of ["mesh", "tectonics", "hydrology", "climate", "society", "routes"]) {
    assert.ok(STAGE_LABELS[stage], stage);
  }
});

test("generate emits climate as its own stage", () => {
  const stages = [];
  new MapGenerator().generate(small, (s) => stages.push(s));
  assert.deepEqual(stages, ["mesh", "tectonics", "hydrology", "climate", "society", "routes"]);
});

test("runOnMain recompute and names return the same world object", () => {
  const world = new MapGenerator().generate(small);
  const recomputed = runOnMain("recompute", { world });
  assert.equal(recomputed, world);
  const named = runOnMain("names", { world });
  assert.equal(named, world);
  assert.ok(world.settlements[0]?.name);
});
