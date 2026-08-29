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
    this._fitScale = 1;
  }

  /** Convert CSS pixels into world units at the current zoom. @param {number} n */
  #px(n) {
    const scale = this._view?.scale || 1;
    return n / scale;
  }

  /**
   * Visible world-space rectangle plus a cell-sized pad.
   * @param {import("../types.js").WorldData} world
   */
  #viewBounds(world) {
    const v = world.view;
    const pad = (world.meta.cellSize || 12) * 3;
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    return {
      x0: -v.x / v.scale - pad,
      y0: -v.y / v.scale - pad,
      x1: (w - v.x) / v.scale + pad,
      y1: (h - v.y) / v.scale + pad,
    };
  }

  /**
   * @param {import("../types.js").Cell} cell
   * @param {{ x0: number, y0: number, x1: number, y1: number }} b
   */
  #inView(cell, b) {
    return cell.x >= b.x0 && cell.x <= b.x1 && cell.y >= b.y0 && cell.y <= b.y1;
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
    const bounds = this.#viewBounds(world);

    this.#drawCells(world, style, bounds);
    if (options.grid) this.#drawGrid(world, ink);
    this.#drawCoast(world, ink, style, bounds);
    this.#drawRivers(world, ink, style, bounds);
    if (options.borders !== false) this.#drawBorders(world, ink, bounds);
    this.#drawMountains(world, style, bounds, scale);
    if (options.draftPath?.length) this.#drawDraft(world, options.draftPath);
    if (options.labels !== false) this.#drawSettlements(world, ink, style, bounds, scale);
    if (options.highlightCell >= 0) this.#drawHighlight(world, options.highlightCell);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.#drawCompass(ink, style);
    this.#drawScaleBar(world, ink);
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
    tmp._fitScale = exportScale;
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
    this._fitScale = world.view.scale;
    this._view = world.view;
  }

  /**
   * @param {import("../types.js").WorldData} world
   */
  clampView(world) {
    const vw = this.canvas.clientWidth || 1;
    const vh = this.canvas.clientHeight || 1;
    const mw = world.meta.width * world.view.scale;
    const mh = world.meta.height * world.view.scale;
    const m = 72;
    world.view.x = Math.min(vw - m, Math.max(m - mw, world.view.x));
    world.view.y = Math.min(vh - m, Math.max(m - mh, world.view.y));
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} dx
   * @param {number} dy
   */
  pan(world, dx, dy) {
    world.view.x += dx;
    world.view.y += dy;
    this.clampView(world);
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} factor
   * @param {number} cx
   * @param {number} cy
   */
  zoomAt(world, factor, cx, cy) {
    const v = world.view;
    const fit = this._fitScale || v.scale || 0.5;
    const min = fit * 0.4;
    const max = Math.max(fit * 28, 16);
    const next = Math.max(min, Math.min(max, v.scale * factor));
    if (next === v.scale) return;
    const wx = (cx - v.x) / v.scale;
    const wy = (cy - v.y) / v.scale;
    v.scale = next;
    v.x = cx - wx * v.scale;
    v.y = cy - wy * v.scale;
    this.clampView(world);
  }

  /** @param {import("../types.js").WorldData} world */
  zoomPercent(world) {
    const fit = this._fitScale || world.view.scale || 1;
    return Math.round((world.view.scale / fit) * 100);
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
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   */
  #drawCells(world, style, bounds) {
    const ctx = this.ctx;
    if (!ctx) return;
    const relZoom = (world.view.scale || 1) / (this._fitScale || world.view.scale || 1);
    const hillshade = world.cells.length < 8000 || relZoom >= 1.35 || (world.view.scale || 0) >= 0.9;
    for (const cell of world.cells) {
      if (cell.polygon.length < 3 || !this.#inView(cell, bounds)) continue;
      ctx.beginPath();
      const p = cell.polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillFor(cell, world, style);
      ctx.fill();
      if (!hillshade || cell.ocean || cell.lake) continue;
      let shade = 0;
      let w = 0;
      for (const nid of cell.neighbors) {
        const n = world.cells[nid];
        if (cell.x - n.x + (cell.y - n.y) <= 0) continue;
        shade += (cell.height - n.height) * 2.4;
        w += 1;
      }
      if (!w) continue;
      shade = Math.max(-0.28, Math.min(0.22, shade / w));
      if (Math.abs(shade) < 0.02) continue;
      ctx.fillStyle = shade > 0 ? `rgba(255,246,220,${shade})` : `rgba(12,16,28,${-shade * 1.15})`;
      ctx.fill();
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ coast: string }} ink
   * @param {string} style
   */
  #drawCoast(world, ink, style, bounds) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.coast;
    ctx.lineWidth = this.#px(style === "parchment" ? 1.7 : 1.2);
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const cell of world.cells) {
      if (!cell.coast || cell.ocean || cell.polygon.length < 3 || !this.#inView(cell, bounds)) continue;
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
  #drawRivers(world, ink, style, bounds) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.river;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = style === "night" ? 0.9 : 0.88;
    for (const river of world.rivers) {
      if (river.points.length < 2) continue;
      const last = river.points[river.points.length - 1];
      const first = river.points[0];
      if (
        (first[0] < bounds.x0 && last[0] < bounds.x0) ||
        (first[0] > bounds.x1 && last[0] > bounds.x1) ||
        (first[1] < bounds.y0 && last[1] < bounds.y0) ||
        (first[1] > bounds.y1 && last[1] > bounds.y1)
      ) {
        continue;
      }
      ctx.lineWidth = Math.max(this.#px(1.15), river.width);
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < river.points.length; i++) {
        const prev = river.points[i - 1];
        const cur = river.points[i];
        ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
      }
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ border: string }} ink
   */
  #drawBorders(world, ink, bounds) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.border;
    ctx.lineWidth = this.#px(1);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (const cell of world.cells) {
      if (cell.ocean || cell.regionId < 0 || !this.#inView(cell, bounds)) continue;
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
  #drawMountains(world, style, bounds, scale) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = style === "night" ? "#c4b8a0" : "#3a2c22";
    ctx.fillStyle = style === "parchment" ? "#6a5640" : "rgba(40,28,18,0.2)";
    ctx.lineWidth = this.#px(0.9);
    for (const cell of world.cells) {
      if (!cell.mountain || !this.#inView(cell, bounds)) continue;
      const s = Math.max(this.#px(4.5), Math.min(9 + cell.height * 7, this.#px(16)));
      if (s * scale < (world.cells.length > 12000 ? 5.5 : 3.2)) continue;
      ctx.beginPath();
      ctx.moveTo(cell.x, cell.y - s);
      ctx.lineTo(cell.x - s * 0.72, cell.y + s * 0.38);
      ctx.lineTo(cell.x + s * 0.72, cell.y + s * 0.38);
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
  #drawSettlements(world, ink, style, bounds, scale) {
    const ctx = this.ctx;
    if (!ctx) return;
    const fit = this._fitScale || scale;
    const zoom = scale / fit;
    const fs = this.#px(zoom < 1.15 ? 10 : 11.5);
    ctx.font = `${fs}px Palatino, Georgia, serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const s of world.settlements) {
      if (zoom < 0.9 && s.type === "village") continue;
      if (zoom < 1.25 && s.type === "town") continue;
      const c = world.cells[s.cellId];
      if (!c || !this.#inView(c, bounds)) continue;
      const r = this.#px(s.type === "capital" ? 4.4 : s.type === "city" ? 3.5 : 2.7);
      ctx.beginPath();
      ctx.fillStyle = style === "night" ? "#f0d78c" : "#1a120c";
      ctx.strokeStyle = style === "night" ? "#1a120c" : "#f4ead4";
      ctx.lineWidth = this.#px(1);
      if (s.type === "capital") {
        ctx.rect(c.x - r, c.y - r, r * 2, r * 2);
      } else {
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      if (zoom < 0.75 && s.type !== "capital") continue;
      ctx.fillStyle = ink.text;
      ctx.fillText(s.name, c.x + r + this.#px(4), c.y);
    }
  }

  /** @param {import("../types.js").WorldData} world @param {number[]} path */
  #drawDraft(world, path) {
    const ctx = this.ctx;
    if (!ctx || path.length < 1) return;
    ctx.strokeStyle = "#c45c2a";
    ctx.lineWidth = this.#px(2.2);
    ctx.setLineDash([this.#px(5), this.#px(4)]);
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
    ctx.lineWidth = this.#px(1.8);
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
    ctx.lineWidth = this.#px(0.6);
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

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ text: string }} ink
   */
  #drawScaleBar(world, ink) {
    const ctx = this.ctx;
    if (!ctx) return;
    const scale = world.view.scale || 1;
    const candidates = [50, 100, 200, 400, 800];
    let worldLen = 100;
    for (const c of candidates) {
      if (c * scale >= 48 && c * scale <= 140) {
        worldLen = c;
        break;
      }
      worldLen = c;
    }
    const px = worldLen * scale;
    const x = 58;
    const y = this.canvas.clientHeight - 18;
    ctx.strokeStyle = ink.text;
    ctx.fillStyle = ink.text;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + px, y - 4);
    ctx.lineTo(x + px, y + 4);
    ctx.stroke();
    ctx.font = "10px Palatino, Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(`${worldLen}`, x + px / 2, y - 8);
  }
}
