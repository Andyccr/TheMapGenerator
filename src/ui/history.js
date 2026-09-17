/**
 * Undo/redo snapshots of WorldData. App owns when to push; this module
 * only stores clones.
 */
import { cloneWorld } from "../data/worldData.js";

export class EditHistory {
  /** @param {number} [limit] */
  constructor(limit = 8) {
    /** @type {import("../types.js").WorldData[]} */
    this.undo = [];
    /** @type {import("../types.js").WorldData[]} */
    this.redo = [];
    this.limit = limit;
  }

  /** @param {import("../types.js").WorldData} world */
  push(world) {
    this.undo.push(cloneWorld(world));
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo = [];
  }

  /**
   * @param {import("../types.js").WorldData} current
   * @returns {import("../types.js").WorldData | null}
   */
  popUndo(current) {
    const prev = this.undo.pop();
    if (!prev) return null;
    this.redo.push(cloneWorld(current));
    return prev;
  }

  /**
   * @param {import("../types.js").WorldData} current
   * @returns {import("../types.js").WorldData | null}
   */
  popRedo(current) {
    const next = this.redo.pop();
    if (!next) return null;
    this.undo.push(cloneWorld(current));
    return next;
  }

  discardLast() {
    this.undo.pop();
  }

  clear() {
    this.undo = [];
    this.redo = [];
  }

  get length() {
    return this.undo.length;
  }
}
