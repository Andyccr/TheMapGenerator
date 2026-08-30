/**
 * Canvas 2D renderer.
 *
 * Chosen over SVG because thousands of polygons plus pan/zoom plus live sculpting
 * would thrash the DOM. The renderer never mutates WorldData (view pan/zoom is
 * written by the App controller onto world.view, which is session camera state).
 */
import { pointInPolygon, simplifyPolyline } from "../util/geometry.js";
import { buildSpatialIndex } from "../generators/mesh.js";
import { fillFor, inkFor, BIOME_LABELS, ATLAS_BIOME } from "./styles.js";
import { lodConfig, lodFromZoom, LOD_LABELS } from "./lod.js";
import { buildContours } from "./contours.js";
import { markerGlyph } from "../generators/markers.js";

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
    /** @type {Map<string, { canvas: HTMLCanvasElement, scale: number }>} */
    this._rasters = new Map();
    this._rasterWorld = "";
    /** @type {{ coasts: number[][][], shores: number[][][], borders: number[][][], cultures: number[][][] } | null} */
    this._contours = null;
    this._contourKey = "";
    this._lod = "overview";
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
    const relZoom = scale / (this._fitScale || scale || 1);
    const visibleEst = this.#visibleEstimate(world, bounds);
    const lod = lodConfig(relZoom, world.cells.length, visibleEst);
    if (options.lod === "local") {
      Object.assign(lod, lodConfig(3.4, world.cells.length, 4000));
      lod.useRaster = false;
      lod.cellEdges = false;
      lod.hillshade = true;
    } else if (options.lod === "overview" || options.lod === "regional") {
      const forced = lodConfig(options.lod === "overview" ? 1 : 1.8, world.cells.length, visibleEst);
      Object.assign(lod, forced);
    }
    this._lod = lod.level;

    this.#ensureContours(world);
    this.#drawTerrain(world, style, bounds, lod);
    if (options.grid) this.#drawGrid(world, ink);
    this.#drawCoast(world, ink, style, bounds, lod);
    if (options.rivers !== false) this.#drawRivers(world, ink, style, bounds, lod);
    if (options.routes !== false) this.#drawRoutes(world, ink, style, bounds, lod);
    if (options.borders !== false) {
      if (style === "cultural") this.#drawCultureBorders(world, ink, bounds, lod);
      else this.#drawBorders(world, ink, bounds, lod);
    }
    if (options.relief !== false) this.#drawMountains(world, style, bounds, scale, lod);
    if (options.draftPath?.length) this.#drawDraft(world, options.draftPath);
    if (options.measure) this.#drawMeasure(world, options.measure, ink);
    if (options.labels !== false) this.#drawSettlements(world, ink, style, bounds, scale, lod);
    if (options.markers !== false) this.#drawMarkers(world, ink, style, bounds, scale, lod);
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
    tmp.draw(world, { labels: true, borders: true, grid: false, rivers: true, routes: true, markers: true, relief: true, lod: "local" });
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

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} wx
   * @param {number} wy
   */
  centerOn(world, wx, wy) {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 500;
    world.view.x = w / 2 - wx * world.view.scale;
    world.view.y = h / 2 - wy * world.view.scale;
    this.clampView(world);
  }

  /**
   * Cartographic band for the HUD. Does not change WorldData.
   * @param {import("../types.js").WorldData} world
   */
  lodLabel(world) {
    const fit = this._fitScale || world.view.scale || 1;
    const level = lodFromZoom((world.view.scale || 1) / fit);
    return LOD_LABELS[level] || LOD_LABELS.overview;
  }

  /**
   * @param {import("../types.js").WorldData} [world]
   */
  legendItems(world) {
    const style = world?.meta.style || "atlas";
    if (style === "political" && world?.regions?.length) {
      return world.regions.map((r) => ({ key: `r${r.id}`, label: r.name, color: r.color }));
    }
    if (style === "cultural" && world?.cultures?.length) {
      return world.cultures.map((c) => ({ key: `c${c.id}`, label: c.name, color: c.color }));
    }
    if (style === "temperature") {
      return [
        { key: "cold", label: "寒冷", color: "#9bb4d8" },
        { key: "mild", label: "温凉", color: "#e8eef2" },
        { key: "warm", label: "温暖", color: "#e8d07a" },
        { key: "hot", label: "炎热", color: "#c44a28" },
      ];
    }
    if (style === "precipitation") {
      return [
        { key: "dry", label: "干旱", color: "#c4a05a" },
        { key: "mid", label: "适中", color: "#c4c46a" },
        { key: "wet", label: "湿润", color: "#5a9e6a" },
        { key: "rain", label: "多雨", color: "#1a6a78" },
      ];
    }
    if (style === "physical" || style === "height") {
      return [
        { key: "deep", label: "深海", color: "#0b2a3c" },
        { key: "shelf", label: "浅海", color: "#3c7a96" },
        { key: "low", label: "低地", color: "#6b8f46" },
        { key: "hill", label: "丘陵", color: "#c49a5c" },
        { key: "peak", label: "高山", color: "#9a6b46" },
      ];
    }
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
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   */
  #visibleEstimate(world, bounds) {
    const vw = Math.max(1, bounds.x1 - bounds.x0);
    const vh = Math.max(1, bounds.y1 - bounds.y0);
    const cs = world.meta.cellSize || 10;
    return (vw * vh) / (cs * cs * 2.6);
  }

  /** @param {import("../types.js").WorldData} world @param {string} style */
  #paintKey(world, style) {
    const cells = world.cells;
    let acc = world.rivers.length;
    const step = Math.max(1, (cells.length / 180) | 0);
    for (let i = 0; i < cells.length; i += step) acc += cells[i].height;
    return `${world.meta.seed}:${world.generatedAt}:${style}:${cells.length}:${acc.toFixed(3)}`;
  }

  /** @param {import("../types.js").WorldData} world */
  #ensureContours(world) {
    const key = this.#paintKey(world, world.meta.style || "atlas");
    if (this._contourKey === key && this._contours) return;
    this._contours = buildContours(world);
    this._contourKey = key;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   * @param {"overview"|"regional"|"local"} level
   */
  #ensureRaster(world, style, level) {
    const worldKey = this.#paintKey(world, style);
    if (this._rasterWorld !== worldKey) {
      this._rasters.clear();
      this._rasterWorld = worldKey;
    }
    const slot = level === "overview" ? "overview" : "regional";
    const hit = this._rasters.get(slot);
    if (hit) return hit;
    const maxDim = slot === "overview" ? 1280 : 2048;
    const sx = Math.min(1, maxDim / world.meta.width);
    const sy = Math.min(1, maxDim / world.meta.height);
    const bakeScale = Math.max(0.12, Math.min(sx, sy));
    const w = Math.max(1, Math.round(world.meta.width * bakeScale));
    const h = Math.max(1, Math.round(world.meta.height * bakeScale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(bakeScale, 0, 0, bakeScale, 0, 0);
    const lodPaint = slot === "overview" ? "overview" : "regional";
    for (const cell of world.cells) {
      if (cell.polygon.length < 3) continue;
      ctx.beginPath();
      const p = cell.polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillFor(cell, world, style, lodPaint);
      ctx.fill();
    }
    const rec = { canvas, scale: bakeScale };
    this._rasters.set(slot, rec);
    return rec;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawTerrain(world, style, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (lod.useRaster) {
      const rec = this.#ensureRaster(world, style, lod.level);
      if (rec) {
        ctx.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = lod.level === "overview" ? "high" : "medium";
        ctx.drawImage(rec.canvas, 0, 0, world.meta.width, world.meta.height);
        ctx.imageSmoothingEnabled = false;
        return;
      }
    }
    this.#drawCells(world, style, bounds, lod);
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawCells(world, style, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const cell of world.cells) {
      if (cell.polygon.length < 3 || !this.#inView(cell, bounds)) continue;
      ctx.beginPath();
      const p = cell.polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillFor(cell, world, style, lod.level);
      ctx.fill();
      if (lod.cellEdges) {
        ctx.strokeStyle = "rgba(36,26,16,0.16)";
        ctx.lineWidth = this.#px(0.45);
        ctx.stroke();
      }
      if (!lod.hillshade || cell.ocean || cell.lake) continue;
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
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawCoast(world, ink, style, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx || !this._contours) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = ink.coast;
    ctx.lineWidth = this.#px(lod.coastWidth * (style === "parchment" ? 1.25 : 1));
    this.#strokeLines(this._contours.coasts, bounds);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = this.#px(Math.max(0.7, lod.coastWidth * 0.55));
    this.#strokeLines(this._contours.shores, bounds);
    ctx.globalAlpha = 1;
  }

  /**
   * @param {number[][][]} lines
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   */
  #strokeLines(lines, bounds) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.beginPath();
    for (const line of lines) {
      if (line.length < 2 || !this.#lineInView(line, bounds)) continue;
      ctx.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
    }
    ctx.stroke();
  }

  /**
   * @param {number[][]} line
   * @param {{ x0: number, y0: number, x1: number, y1: number }} b
   */
  #lineInView(line, b) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of line) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    return maxX >= b.x0 && minX <= b.x1 && maxY >= b.y0 && minY <= b.y1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ river: string }} ink
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawRivers(world, ink, style, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.strokeStyle = ink.river;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = style === "night" ? 0.9 : 0.88;
    const minW = lod.riverMinWidth;
    const simp = lod.riverSimplify;
    for (const river of world.rivers) {
      if (river.points.length < 2 || river.width < minW) continue;
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
      const pts = simp > 0 ? simplifyPolyline(river.points, simp) : river.points;
      const widthScale = lod.level === "overview" ? 1.35 : 1;
      ctx.lineWidth = Math.max(this.#px(lod.level === "overview" ? 1.6 : 1.05), river.width * widthScale);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (lod.level !== "overview") this.#drawRiverNames(world, ink, bounds, lod);
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ text: string, river: string }} ink
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawRiverNames(world, ink, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx) return;
    const ranked = world.rivers.slice().sort((a, b) => b.width - a.width).slice(0, lod.level === "local" ? 12 : 6);
    ctx.fillStyle = ink.river;
    ctx.font = `${this.#px(9)}px Palatino, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.85;
    for (const river of ranked) {
      if (!river.name || river.points.length < 4) continue;
      const mid = river.points[(river.points.length * 0.45) | 0];
      if (mid[0] < bounds.x0 || mid[0] > bounds.x1 || mid[1] < bounds.y0 || mid[1] > bounds.y1) continue;
      ctx.fillText(river.name, mid[0], mid[1] - this.#px(6));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ border: string }} ink
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawBorders(world, ink, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx || !this._contours) return;
    ctx.strokeStyle = ink.border;
    ctx.lineWidth = this.#px(lod.level === "overview" ? 1.55 : 1);
    ctx.lineJoin = "round";
    ctx.globalAlpha = lod.borderAlpha;
    this.#strokeLines(this._contours.borders, bounds);
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ border: string }} ink
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawCultureBorders(world, ink, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx || !this._contours?.cultures) return;
    ctx.strokeStyle = ink.border;
    ctx.lineWidth = this.#px(lod.level === "overview" ? 1.7 : 1.15);
    ctx.setLineDash([this.#px(5), this.#px(3)]);
    ctx.globalAlpha = lod.borderAlpha + 0.12;
    this.#strokeLines(this._contours.cultures, bounds);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ river: string }} ink
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawRoutes(world, ink, style, bounds, lod) {
    const ctx = this.ctx;
    if (!ctx || !world.routes?.length) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const minLen = lod.level === "overview" ? 8 : 2;
    for (const route of world.routes) {
      if (!route.points || route.points.length < minLen) continue;
      if (!this.#lineInView(route.points, bounds)) continue;
      if (route.kind === "sea") {
        ctx.strokeStyle = style === "night" ? "#6ec8ff" : ink.river;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([this.#px(7), this.#px(5)]);
        ctx.lineWidth = this.#px(lod.level === "overview" ? 1.4 : 1.15);
      } else if (route.kind === "trail") {
        ctx.strokeStyle = style === "night" ? "#c4b090" : "#6a4a28";
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([this.#px(3), this.#px(4)]);
        ctx.lineWidth = this.#px(0.9);
      } else {
        ctx.strokeStyle = style === "night" ? "#d4b07a" : "#5a3418";
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([]);
        ctx.lineWidth = this.#px(lod.level === "overview" ? 1.6 : 1.25);
      }
      ctx.beginPath();
      ctx.moveTo(route.points[0][0], route.points[0][1]);
      for (let i = 1; i < route.points.length; i++) ctx.lineTo(route.points[i][0], route.points[i][1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {number} scale
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawMountains(world, style, bounds, scale, lod) {
    const ctx = this.ctx;
    if (!ctx || !lod.mountainMarks) return;
    ctx.strokeStyle = style === "night" ? "#c4b8a0" : "#3a2c22";
    ctx.fillStyle = style === "parchment" ? "#6a5640" : "rgba(40,28,18,0.2)";
    ctx.lineWidth = this.#px(0.9);
    const step = lod.mountainStep || 1;
    const minPx = lod.level === "regional" ? 5.8 : 4.2;
    for (const cell of world.cells) {
      if (!cell.mountain || cell.id % step !== 0 || !this.#inView(cell, bounds)) continue;
      const s = Math.max(this.#px(4.5), Math.min(9 + cell.height * 7, this.#px(16)));
      if (s * scale < minPx) continue;
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
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {number} scale
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawSettlements(world, ink, style, bounds, scale, lod) {
    const ctx = this.ctx;
    if (!ctx) return;
    const fit = this._fitScale || scale;
    const zoom = scale / fit;
    const fs = this.#px(lod.level === "overview" ? 11.5 : zoom < 1.15 ? 10 : 11.5);
    ctx.font = `${fs}px Palatino, Georgia, serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const show = lod.labels;
    for (const s of world.settlements) {
      if (s.type === "village" && !show.village) continue;
      if (s.type === "town" && !show.town) continue;
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
      if (!show.name[s.type]) continue;
      ctx.fillStyle = ink.text;
      ctx.fillText(s.name, c.x + r + this.#px(4), c.y);
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ text: string }} ink
   * @param {string} style
   * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
   * @param {number} scale
   * @param {ReturnType<typeof lodConfig>} lod
   */
  #drawMarkers(world, ink, style, bounds, scale, lod) {
    const ctx = this.ctx;
    if (!ctx || !world.markers?.length) return;
    if (lod.level === "overview" && world.markers.length > 18) {
      /* still draw, just skip names */
    }
    const fs = this.#px(lod.level === "overview" ? 9 : 11);
    ctx.font = `${fs}px Palatino, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of world.markers) {
      const c = world.cells[m.cellId];
      if (!c || !this.#inView(c, bounds)) continue;
      ctx.fillStyle = style === "night" ? "#f0d78c" : "#3a1c10";
      ctx.strokeStyle = style === "night" ? "#1a120c" : "#f4ead4";
      ctx.lineWidth = this.#px(0.8);
      ctx.beginPath();
      ctx.arc(c.x, c.y, this.#px(4.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style === "night" ? "#1a120c" : "#f4ead4";
      ctx.fillText(markerGlyph(m.type), c.x, c.y + this.#px(0.5));
      if (lod.level === "local" || (lod.level === "regional" && scale / (this._fitScale || scale) > 1.6)) {
        ctx.fillStyle = ink.text;
        ctx.fillText(m.name, c.x, c.y + this.#px(11));
      }
    }
    ctx.textAlign = "left";
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ x0: number, y0: number, x1: number, y1: number }} measure
   * @param {{ text: string }} ink
   */
  #drawMeasure(world, measure, ink) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dist = Math.hypot(measure.x1 - measure.x0, measure.y1 - measure.y0);
    ctx.strokeStyle = "#c45c2a";
    ctx.fillStyle = ink.text;
    ctx.lineWidth = this.#px(1.8);
    ctx.setLineDash([this.#px(4), this.#px(3)]);
    ctx.beginPath();
    ctx.moveTo(measure.x0, measure.y0);
    ctx.lineTo(measure.x1, measure.y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(measure.x0, measure.y0, this.#px(3), 0, Math.PI * 2);
    ctx.arc(measure.x1, measure.y1, this.#px(3), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${this.#px(11)}px Palatino, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(dist)} 里格`, (measure.x0 + measure.x1) / 2, (measure.y0 + measure.y1) / 2 - this.#px(8));
    ctx.textAlign = "left";
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
    ctx.fillText(`${worldLen} 里格`, x + px / 2, y - 8);
  }
}
