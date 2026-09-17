import { addSettlement, removeSettlement } from "./settlements.js";
import { MARKER_TYPES } from "../data/catalogs.js";
import { stampAt } from "../generators/landforms.js";
import { addRouteBetween } from "./routes.js";
import { removeRoutesThrough, pruneRoutes } from "../data/routes.js";
import { cellsInBrush, eyedrop, paintCells } from "./paint.js";

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
  hint = "滚轮缩放：全图合并色块与干流，近景晕渲、细河与村落。格子数据不变。双击放大，拖动平移。";
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
  hint = "涂抹以抬升陆地、堆出山脊。绘制中会预览水文，松手后再算完整河流。";
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
  hint = "涂抹以沉陷谷地或开辟海洋。绘制中会预览水文，松手后再算完整河流。";
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
  hint = "从高地拖向大海。河道会被强制改为顺流而下。";
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
  hint = "把城镇拖到另一块陆地上。不能放进海里。";
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
  hint = "点击聚落、地标、河流或地貌改名。右侧检视也可以改名称与图层。";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const s = settlementAt(world, ev.cellId);
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
    if (s && ctx.promptRename) {
      ctx.promptRename(s);
      return;
    }
    const cell = world.cells[ev.cellId];
    const river = cell?.riverId >= 0 ? world.rivers[cell.riverId] : null;
    if (river && ctx.askText) {
      ctx.askText("重命名河流", river.name || "河流", (next) => {
        if (!next) return;
        ctx.beginEdit?.();
        river.name = next;
        ctx.commit(world);
      });
      return;
    }
    const feat = cell?.featureId >= 0 ? world.features?.[cell.featureId] : null;
    if (feat && ctx.askText) {
      ctx.askText("重命名地貌", feat.name, (next) => {
        if (!next) return;
        ctx.beginEdit?.();
        feat.name = next;
        ctx.commit(world);
      });
    }
  }
}

export class BurgTool {
  id = "burg";
  hint = "在陆地上点击以建立城镇。按住 Shift 建立城市。";
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
  hint = "点击聚落、地标或商路格子以删除。最后一个都城不能删。";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const s = settlementAt(world, ev.cellId);
    if (s) {
      const lastCap = s.type === "capital" && world.settlements.filter((x) => x.type === "capital").length <= 1;
      if (lastCap) {
        ctx.toast?.("最后一个都城不能删。", true);
        return;
      }
      ctx.beginEdit?.();
      removeSettlement(world, s.id);
      pruneRoutes(world);
      ctx.commit(world);
      return;
    }
    const before = world.markers?.length || 0;
    const kept = (world.markers || []).filter((m) => m.cellId !== ev.cellId);
    if (kept.length !== before) {
      ctx.beginEdit?.();
      world.markers = kept;
      ctx.commit(world);
      return;
    }
    if (!(world.routes || []).some((r) => r.cellIds.includes(ev.cellId))) return;
    ctx.beginEdit?.();
    const dropped = removeRoutesThrough(world, ev.cellId);
    if (dropped) {
      ctx.commit(world);
      ctx.toast?.(`已删去 ${dropped} 条经过这里的路。`);
    }
  }
}

export class MarkerTool {
  id = "marker";
  hint = "在陆地上点击放置兴趣点。种类在左侧选择。";
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
  hint = "点击两点测量里格。比例尺与地图单位一致。";
  apply() {
    /* Camera/measure overlay is owned by the App. */
  }
}

export class StampTool {
  id = "stamp";
  hint = "点击放下丘、洼或岭。松手后按重力重算河流。笔刷控制印戳大小。";
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down") return;
    const op = ctx.stampOp || "hill";
    const size = 0.045 + (ctx.brush || 3) * 0.018;
    stampAt(world.cells, world.meta.width, world.meta.height, op, ev.worldX, ev.worldY, size, 0.42);
  }
}

export class RoadTool {
  id = "road";
  hint = "先点一座聚落，再点另一座连商路。第二次按住 Shift 则走海路。";
  constructor() {
    /** @type {number | null} */
    this.fromId = null;
  }
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const s = settlementAt(world, ev.cellId);
    if (!s) {
      this.fromId = null;
      ctx.toast?.("请点在聚落上连路。");
      return;
    }
    if (this.fromId == null) {
      this.fromId = s.id;
      ctx.toast?.(`已选「${s.name}」，再点另一个聚落。`);
      return;
    }
    if (this.fromId === s.id) return;
    ctx.beginEdit?.();
    const kind = ev.shiftKey ? "sea" : "road";
    const route = addRouteBetween(world, this.fromId, s.id, kind);
    this.fromId = null;
    if (!route) {
      ctx.toast?.("这两座城之间已经有路，或无法通行。", true);
      return;
    }
    ctx.commit(world);
    ctx.toast?.(`已连${kind === "sea" ? "海路" : "商路"}。`);
  }
}

export class PaintTool {
  id = "paint";
  hint = "涂抹改群系、文化、信仰、国度或行省。颜料留空时点击吸取。不会重算水文。";
  constructor() {
    this.dirty = false;
  }
  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase === "down") this.dirty = false;
    if (ev.phase !== "down" && ev.phase !== "move") return;
    if (ev.cellId < 0) return;
    const layer = ctx.paintLayer || "biome";
    const value = ctx.paintValue;
    if (value == null || value === "") {
      if (ev.phase === "down") {
        const sampled = eyedrop(world, ev.cellId, layer);
        ctx.setPaintValue?.(sampled);
        ctx.toast?.(sampled ? "已吸取这一格的颜料。" : "这一格没有可吸取的颜料。");
      }
      return;
    }
    if (!this.dirty) {
      ctx.beginEdit?.();
      this.dirty = true;
    }
    const radius = (12 + ctx.brush * 10) * ((world.meta.cellSize || 10) / 10);
    const ids = cellsInBrush(world, ev.worldX, ev.worldY, radius);
    paintCells(world, ids, layer, value);
  }
}

/** @returns {Record<string, import("../types.js").EditorTool>} */
export function createTools() {
  const river = new RiverTool();
  return {
    pan: new PanTool(),
    raise: new RaiseTool(),
    lower: new LowerTool(),
    stamp: new StampTool(),
    paint: new PaintTool(),
    river,
    road: new RoadTool(),
    burg: new BurgTool(),
    erase: new EraseTool(),
    marker: new MarkerTool(),
    move: new MoveSettlementTool(),
    rename: new RenameTool(),
    measure: new MeasureTool(),
  };
}
