import assert from "node:assert/strict";
import { test } from "node:test";
import { saveLocal, loadLocal, peekAutosave, saveSlot, loadSlot, listSlotMeta, SLOT_COUNT } from "../storage.js";

const mem = new Map();
globalThis.localStorage = {
  getItem(key) {
    return mem.has(key) ? mem.get(key) : null;
  },
  setItem(key, value) {
    mem.set(key, String(value));
  },
  removeItem(key) {
    mem.delete(key);
  },
};

const world = {
  version: 1,
  meta: { seed: "slot-a", mapName: "试存", landform: "island" },
  cells: [],
  generatedAt: "2026-01-01T00:00:00.000Z",
};

test("autosave round-trips through localStorage", () => {
  assert.equal(loadLocal(), null);
  assert.equal(saveLocal(world), true);
  const loaded = loadLocal();
  assert.equal(loaded.meta.seed, "slot-a");
  const peek = peekAutosave();
  assert.equal(peek.mapName, "试存");
  assert.equal(peek.seed, "slot-a");
});

test("named slots write an index and load back", async () => {
  assert.equal(SLOT_COUNT, 6);
  const empty = listSlotMeta();
  assert.equal(empty.length, 6);
  assert.equal(empty[0].empty, true);
  const ok = await saveSlot(0, world);
  assert.equal(ok, true);
  const meta = listSlotMeta();
  assert.equal(meta[0].empty, false);
  assert.equal(meta[0].mapName, "试存");
  const loaded = await loadSlot(0);
  assert.equal(loaded.meta.seed, "slot-a");
});
