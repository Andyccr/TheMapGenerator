import assert from "node:assert/strict";
import { test } from "node:test";
import { cellsInDisk, visitCellsInRect } from "../spatialIndex.js";
import { sculptElevation } from "../../editors/tools.js";

/** @param {number} id @param {number} x @param {number} y */
function cell(id, x, y) {
  return {
    id,
    x,
    y,
    neighbors: id === 0 ? [1] : [0],
    polygon: [
      [x, y],
      [x + 1, y],
      [x, y + 1],
    ],
    border: false,
    height: 0.2,
  };
}

test("disk query and sculpt ignore cells outside the brush", () => {
  const cells = [cell(0, 0, 0), cell(1, 400, 0)];
  const near = cellsInDisk(cells, 0, 0, 30);
  assert.deepEqual(near, [0]);
  const world = { cells, meta: { cellSize: 10 } };
  sculptElevation(world, 0, 0, 30, 0.2);
  assert.ok(cells[0].height > 0.2);
  assert.equal(cells[1].height, 0.2);
  /** @type {number[]} */
  const seen = [];
  visitCellsInRect(cells, -5, -5, 20, 20, (id) => seen.push(id));
  assert.deepEqual(seen, [0]);
});
