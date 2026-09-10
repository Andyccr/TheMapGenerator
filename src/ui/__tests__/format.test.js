import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, rosterItems, rosterListHtml, searchHits, cellInspectHtml } from "../format.js";
import { MapGenerator } from "../../generators/mapGenerator.js";

test("escapeHtml encodes markup", () => {
  assert.equal(escapeHtml(`<a "b" c>`), "&lt;a &quot;b&quot; c&gt;");
});

test("rosterListHtml uses the empty copy when there are no items", () => {
  assert.match(rosterListHtml([], "空的。"), /空的。/);
  assert.match(rosterListHtml([{ label: "A", cellId: 1 }]), /data-cell="1"/);
});

test("roster and search include routes; inspect lists 过路", () => {
  const w = new MapGenerator().generate({
    seed: "format-n",
    width: 900,
    height: 600,
    cellSize: 24,
    plateCount: 8,
  });
  assert.ok((w.routes || []).length >= 1, "need a generated road");
  const items = rosterItems(w, "routes");
  assert.ok(items.length >= 1);
  const mid = w.routes[0].cellIds[0];
  assert.match(cellInspectHtml(w, mid), /过路/);
  const from = w.settlements.find((s) => s.id === w.routes[0].fromId);
  if (from?.name) {
    const hits = searchHits(w, from.name.slice(0, Math.min(2, from.name.length)));
    assert.ok(Array.isArray(hits));
  }
});
