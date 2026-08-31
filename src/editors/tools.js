import { addSettlement, removeSettlement } from "../generators/civilization.js";
import { MARKER_TYPES } from "../generators/markers.js";

/**
 * Raise or lower a gaussian brush of cells.
 * @param {import("../types.js").WorldData} world
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} delta
 */
export function sculptElevation(world, cx, cy, radius, delta) {
  const r2 = radius * radius;
  for (const cell of world.cells) {
    if (cell.border) continue;
    const d2 = (cell.x - cx) ** 2 + (cell.y - cy) ** 2;
    if (d2 > r2) continue;
    const w = 1 - Math.sqrt(d2) / radius;
    cell.height = Math.max(-0.95, Math.min(1.15, cell.height + delta * w * w));
  }
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 */
export function settlementAt(world, cellId) {
  return world.settlements.find((s) => s.cellId === cellId) || null;
}

export class PanTool {
  id = "pan";
  hint = "Drag to pan. Scroll to zoom. Click a cell to inspect it.";
  /**
   * @param {import("../types.js").WorldData} _world
   * @param {import("../types.js").PointerEventWorld} _ev
   * @param {import("../types.js").EditorContext} _ctx
   */
  apply(_world, _ev, _ctx) {
    /* Camera is owned by the App / renderer. */
  }
}

export class RaiseTool {
  id = "raise";
  hint = "Paint to raise land and grow mountain ridges. Hydrology updates on release.";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" && ev.phase !== "move") return;
    const radius = (12 + ctx.brush * 10) * ((world.meta.cellSize || 10) / 10);
    sculptElevation(world, ev.worldX, ev.worldY, radius, 0.045);
  }
}

export class LowerTool {
  id = "lower";
  hint = "Paint to sink valleys or open seas. Hydrology updates on release.";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" && ev.phase !== "move") return;
    const radius = (12 + ctx.brush * 10) * ((world.meta.cellSize || 10) / 10);
    sculptElevation(world, ev.worldX, ev.worldY, radius, -0.045);
  }
}

export class RiverTool {
  id = "river";
  hint = "Click-drag from highland toward the sea. The channel is forced downhill, then rivers re-route.";
  constructor() {
    /** @type {number[]} */
    this.path = [];
  }
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase === "down") {
      this.path = ev.cellId >= 0 ? [ev.cellId] : [];
      return;
    }
    if (ev.phase === "move" && ev.cellId >= 0) {
      const last = this.path[this.path.length - 1];
      if (last !== ev.cellId) this.path.push(ev.cellId);
      return;
    }
    if (ev.phase === "up") {
      if (this.path.length >= 2) ctx.commit(world);
      this.path = [];
    }
  }
}

export class MoveSettlementTool {
  id = "move";
  hint = "Drag a town onto another land cell. Towns cannot sit in the ocean.";
  constructor() {
    /** @type {number | null} */
    this.held = null;
  }
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase === "down") {
      const s = ev.cellId >= 0 ? settlementAt(world, ev.cellId) : null;
      this.held = s ? s.id : null;
      return;
    }
    if ((ev.phase === "move" || ev.phase === "up") && this.held != null && ev.cellId >= 0) {
      const cell = world.cells[ev.cellId];
      if (cell && !cell.ocean) {
        const s = world.settlements.find((x) => x.id === this.held);
        if (s) {
          s.cellId = cell.id;
          s.regionId = cell.regionId;
        }
      }
    }
    if (ev.phase === "up") this.held = null;
  }
}

export class RenameTool {
  id = "rename";
  hint = "Click a settlement, marker, or realm capital to rename it. Names are stored in the JSON save.";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    if (s && ctx.askText) {
      ctx.askText("重命名", s.name, (next) => {
        if (!next) return;
        ctx.beginEdit?.();
        s.name = next;
        ctx.commit(world);
      });
      return;
    }
    const marker = (world.markers || []).find((m) => m.cellId === ev.cellId);
    if (marker && ctx.askText) {
      ctx.askText("重命名地标", marker.name, (next) => {
        if (!next) return;
        ctx.beginEdit?.();
        marker.name = next;
        ctx.commit(world);
      });
      return;
    }
    if (s && ctx.promptRename) ctx.promptRename(s);
  }
}

export class BurgTool {
  id = "burg";
  hint = "Click land to found a town. Shift-click founds a city.";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const cell = world.cells[ev.cellId];
    if (!cell || cell.ocean || cell.lake) return;
    if (settlementAt(world, ev.cellId)) return;
    const fallback = "新城";
    if (ctx.askText) {
      ctx.askText("新聚落名称", fallback, (name) => {
        if (!name) return;
        ctx.beginEdit?.();
        addSettlement(world, ev.cellId, name, ev.shiftKey ? "city" : "town");
        ctx.commit(world);
      });
      return;
    }
    const name = ctx.promptText ? ctx.promptText("新聚落名称", fallback) : fallback;
    if (!name) return;
    ctx.beginEdit?.();
    addSettlement(world, ev.cellId, name, ev.shiftKey ? "city" : "town");
    ctx.commit(world);
  }
}

export class EraseTool {
  id = "erase";
  hint = "Click a town or marker to remove it. The last capital cannot be deleted.";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const s = settlementAt(world, ev.cellId);
    if (s) {
      removeSettlement(world, s.id);
      ctx.commit(world);
      return;
    }
    const before = world.markers?.length || 0;
    world.markers = (world.markers || []).filter((m) => m.cellId !== ev.cellId);
    if ((world.markers?.length || 0) !== before) ctx.commit(world);
  }
}

export class MarkerTool {
  id = "marker";
  hint = "Click land to plant a place of interest (type chosen in the panel).";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const cell = world.cells[ev.cellId];
    if (!cell || cell.ocean) return;
    if ((world.markers || []).some((m) => m.cellId === ev.cellId)) return;
    const type = ctx.markerType || "ruins";
    const label = MARKER_TYPES[type]?.label || type;
    const fallback = `${label}`;
    const place = (name) => {
      if (!name) return;
      ctx.beginEdit?.();
      if (!world.markers) world.markers = [];
      const id = world.markers.reduce((m, x) => Math.max(m, x.id), -1) + 1;
      world.markers.push({ id, cellId: ev.cellId, type, name, note: "" });
      ctx.commit(world);
    };
    if (ctx.askText) {
      ctx.askText("地标名称", fallback, place);
      return;
    }
    place(ctx.promptText ? ctx.promptText("地标名称", fallback) : fallback);
  }
}

export class MeasureTool {
  id = "measure";
  hint = "Click two points to measure leagues. Shift+drag still pans.";
  apply() {
    /* Camera/measure overlay is owned by the App. */
  }
}

/** @returns {Record<string, import("../types.js").EditorTool>} */
export function createTools() {
  const river = new RiverTool();
  return {
    pan: new PanTool(),
    raise: new RaiseTool(),
    lower: new LowerTool(),
    river,
    burg: new BurgTool(),
    erase: new EraseTool(),
    marker: new MarkerTool(),
    move: new MoveSettlementTool(),
    rename: new RenameTool(),
    measure: new MeasureTool(),
  };
}
