/**
 * Canvas 2D renderer.
 *
 * Chosen over SVG because thousands of polygons plus pan/zoom plus live sculpting
 * would thrash the DOM. The renderer never mutates WorldData (view pan/zoom is
 * written by the App controller onto world.view, which is session camera state).
 */
import { pointInPolygon } from "../util/geometry.js";
import { buildSpatialIndex } from "../generators/mesh.js";
import { fillFor, inkFor, BIOME_LABELS, ATLAS_BIOME } from "./styles.js";

export class CanvasRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    /** @type {{ cellSize: number, buckets: Map<string, number[]> } | null} */
    this.index = null;
    this._indexSeed = "";
    this.dpr = 1;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, w * this.dpr);
    this.canvas.height = Math.max(1, h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").RenderOptions} [options]
   */
  draw(world, options = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.#ensureIndex(world);
    const style = world.meta.style || "atlas";
    const ink = inkFor(style);
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ink.paper;
    ctx.fillRect(0, 0, w, h);

    const { x, y, scale } = world.view;
    ctx.setTransform(scale * this.dpr, 0, 0, scale * this.dpr, x * this.dpr, y * this.dpr);

    this.#drawCells(world, style);
    if (options.grid) this.#drawGrid(world, ink);
    this.#drawCoast(world, ink, style);
    this.#drawRivers(world, ink, style);
    if (options.borders !== false) this.#drawBorders(world, ink);
    this.#drawMountains(world, style);
    if (options.draftPath?.length) this.#drawDraft(world, options.draftPath);
    if (options.labels !== false) this.#drawSettlements(world, ink, style);
    if (options.highlightCell >= 0) this.#drawHighlight(world, options.highlightCell);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.#drawCompass(ink, style);
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} exportScale
   */
  renderExport(world, exportScale) {
    const off = document.createElement("canvas");
    off.width = Math.floor(world.meta.width * exportScale);
    off.height = Math.floor(world.meta.height * exportScale);
    const tmp = new CanvasRenderer(off);
    tmp.dpr = 1;
    const saved = { ...world.view };
    world.view.x = 0;
    world.view.y = 0;
    world.view.scale = exportScale;
    tmp.draw(world, { labels: true, borders: true, grid: false });
    world.view.x = saved.x;
    world.view.y = saved.y;
    world.view.scale = saved.scale;
    return off;
  }

  /**
   * @param {number} screenX
   * @param {number} screenY
   */
  screenToWorld(screenX, screenY) {
    const v = this._view || { x: 0, y: 0, scale: 1 };
    return { x: (screenX - v.x) / v.scale, y: (screenY - v.y) / v.scale };
  }

  /**
   * @param {number} worldX
   * @param {number} worldY
   */
  worldToScreen(worldX, worldY) {
    const v = this._view || { x: 0, y: 0, scale: 1 };
    return { x: worldX * v.scale + v.x, y: worldY * v.scale + v.y };
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} worldX
   * @param {number} worldY
   */
  hitTest(world, worldX, worldY) {
    this.#ensureIndex(world);
    if (!this.index) return -1;
    const gx = Math.floor(worldX / this.index.cellSize);
    const gy = Math.floor(worldY / this.index.cellSize);
    const bucket = this.index.buckets.get(`${gx},${gy}`);
    if (!bucket) return -1;
    let best = -1;
    let bestD = Infinity;
    for (const id of bucket) {
      const c = world.cells[id];
      if (c.polygon.length < 3) continue;
      if (pointInPolygon(worldX, worldY, c.polygon)) {
        const d = (c.x - worldX) ** 2 + (c.y - worldY) ** 2;
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best;
  }

  /** @param {import("../types.js").WorldData} world */
  fit(world) {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 500;
    const pad = 28;
    const sx = (w - pad * 2) / world.meta.width;
    const sy = (h - pad * 2) / world.meta.height;
    world.view.scale = Math.min(sx, sy);
    world.view.x = (w - world.meta.width * world.view.scale) / 2;
    world.view.y = (h - world.meta.height * world.view.scale) / 2;
    this._view = world.view;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} dx
   * @param {number} dy
   */
  pan(world, dx, dy) {
    world.view.x += dx;
    world.view.y += dy;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} factor
   * @param {number} cx
   * @param {number} cy
   */
  zoomAt(world, factor, cx, cy) {
    const v = world.view;
    const next = Math.max(0.25, Math.min(8, v.scale * factor));
    const wx = (cx - v.x) / v.scale;
    const wy = (cy - v.y) / v.scale;
    v.scale = next;
    v.x = cx - wx * v.scale;
    v.y = cy - wy * v.scale;
  }

  legendItems() {
    return Object.entries(BIOME_LABELS).map(([k, label]) => ({ key: k, label, color: ATLAS_BIOME[k] }));
  }

  /** @param {import("../types.js").WorldData} world */
  #ensureIndex(world) {
    this._view = world.view;
    const key = `${world.meta.seed}:${world.cells.length}:${world.generatedAt}`;
    if (this._indexSeed !== key) {
      this.index = buildSpatialIndex(world.cells, world.meta.cellSize);
      this._indexSeed = key;
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   */
  #drawCells(world, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const cell of world.cells) {
      if (cell.polygon.length < 3) continue;
      ctx.beginPath();
      const p = cell.polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillFor(cell, world, style);
      ctx.fill();
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ coast: string }} ink
   * @param {string} style
   */
  #drawCoast(world, ink, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.coast;
    ctx.lineWidth = style === "parchment" ? 1.35 : 0.9;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const cell of world.cells) {
      if (!cell.coast || cell.ocean || cell.polygon.length < 3) continue;
      const p = cell.polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
    }
    ctx.stroke();
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ river: string }} ink
   * @param {string} style
   */
  #drawRivers(world, ink, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.river;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = style === "night" ? 0.9 : 0.85;
    for (const river of world.rivers) {
      if (river.points.length < 2) continue;
      ctx.lineWidth = river.width;
      ctx.beginPath();
      ctx.moveTo(river.points[0][0], river.points[0][1]);
      for (let i = 1; i < river.points.length; i++) {
        const prev = river.points[i - 1];
        const cur = river.points[i];
        const mx = (prev[0] + cur[0]) / 2;
        const my = (prev[1] + cur[1]) / 2;
        ctx.quadraticCurveTo(prev[0], prev[1], mx, my);
      }
      const last = river.points[river.points.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ border: string }} ink
   */
  #drawBorders(world, ink) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.border;
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (const cell of world.cells) {
      if (cell.ocean || cell.regionId < 0) continue;
      for (const nid of cell.neighbors) {
        if (nid < cell.id) continue;
        const n = world.cells[nid];
        if (n.ocean || n.regionId === cell.regionId) continue;
        ctx.moveTo(cell.x, cell.y);
        ctx.lineTo(n.x, n.y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   */
  #drawMountains(world, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = style === "night" ? "#c4b8a0" : "#3a2c22";
    ctx.fillStyle = style === "parchment" ? "#6a5640" : "rgba(40,28,18,0.15)";
    ctx.lineWidth = 0.7;
    for (const cell of world.cells) {
      if (!cell.mountain) continue;
      const s = 4.5 + cell.height * 5;
      ctx.beginPath();
      ctx.moveTo(cell.x, cell.y - s);
      ctx.lineTo(cell.x - s * 0.7, cell.y + s * 0.35);
      ctx.lineTo(cell.x + s * 0.7, cell.y + s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ text: string }} ink
   * @param {string} style
   */
  #drawSettlements(world, ink, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.font = "6.5px Palatino, Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const s of world.settlements) {
      const c = world.cells[s.cellId];
      if (!c) continue;
      const r = s.type === "capital" ? 3.2 : s.type === "city" ? 2.6 : 2;
      ctx.beginPath();
      ctx.fillStyle = style === "night" ? "#f0d78c" : "#1a120c";
      ctx.strokeStyle = style === "night" ? "#1a120c" : "#f4ead4";
      ctx.lineWidth = 0.8;
      if (s.type === "capital") {
        ctx.rect(c.x - r, c.y - r, r * 2, r * 2);
      } else {
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink.text;
      ctx.fillText(s.name, c.x + r + 2.5, c.y);
    }
  }

  /** @param {import("../types.js").WorldData} world @param {number[]} path */
  #drawDraft(world, path) {
    const ctx = this.ctx;
    if (!ctx || path.length < 1) return;
    ctx.strokeStyle = "#c45c2a";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const p0 = world.cells[path[0]];
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < path.length; i++) {
      const c = world.cells[path[i]];
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** @param {import("../types.js").WorldData} world @param {number} id */
  #drawHighlight(world, id) {
    const ctx = this.ctx;
    if (!ctx) return;
    const cell = world.cells[id];
    if (!cell || cell.polygon.length < 3) return;
    ctx.strokeStyle = "#f2e6c4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cell.polygon[0][0], cell.polygon[0][1]);
    for (let i = 1; i < cell.polygon.length; i++) ctx.lineTo(cell.polygon[i][0], cell.polygon[i][1]);
    ctx.closePath();
    ctx.stroke();
  }

  /** @param {import("../types.js").WorldData} world @param {{ text: string }} ink */
  #drawGrid(world, ink) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.text;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 0.4;
    const step = 100;
    ctx.beginPath();
    for (let x = 0; x <= world.meta.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.meta.height);
    }
    for (let y = 0; y <= world.meta.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(world.meta.width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** @param {{ text: string }} ink @param {string} style */
  #drawCompass(ink, style) {
    const ctx = this.ctx;
    if (!ctx) return;
    const x = 36;
    const y = this.canvas.clientHeight - 36;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = style === "night" ? "#d4c4a0" : "#3a2a18";
    ctx.fillStyle = ink.text;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.font = "10px Palatino, Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, -20);
    ctx.restore();
  }
}
