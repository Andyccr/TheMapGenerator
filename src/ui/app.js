/**
 * App controller. Wires the four layers together and owns the camera, undo
 * stack, and UI chrome. This is the only module allowed to touch both data
 * and the DOM.
 */
import { MapGenerator } from "../generators/mapGenerator.js";
import { CanvasRenderer } from "../renderers/canvasRenderer.js";
import { createTools } from "../editors/tools.js";
import { cloneWorld, parseWorld, summarizeWorld } from "../data/worldData.js";
import { saveLocal, loadLocal, downloadJson, downloadPng, readJsonFile } from "../persistence/storage.js";
import { BIOME_LABELS } from "../renderers/styles.js";
import { cultureTypeLabel } from "../generators/cultures.js";
import { markerLabel } from "../generators/markers.js";

const HINTS = {
  pan: "滚轮缩放：全图合并色块与干流，近景晕渲、细河与村落。格子数据不变。双击放大，拖动平移。",
  raise: "涂抹以抬升陆地、堆出山脊。水文会在绘制过程中更新。",
  lower: "涂抹以沉陷谷地或开辟海洋。水文会在绘制过程中更新。",
  river: "从高地拖向大海。河道会被强制改为顺流而下。",
  burg: "在陆地上点击以建立城镇。按住 Shift 建立城市。",
  erase: "点击聚落或地标以删除。最后一个都城不能删。",
  marker: "在陆地上点击放置兴趣点。种类在左侧选择。",
  move: "把城镇拖到另一块陆地上。不能放进海里。",
  rename: "点击聚落或地标即可改名。名称保存在 JSON 存档里。",
  measure: "点击两点测量里格。比例尺与地图单位一致。",
};

const SETTLEMENT_TYPE = {
  capital: "都城",
  city: "城市",
  town: "城镇",
  village: "村落",
};

const TOOL_KEYS = {
  v: "pan",
  r: "raise",
  f: "lower",
  i: "river",
  b: "burg",
  x: "erase",
  k: "marker",
  m: "move",
  n: "rename",
  g: "measure",
};

export class App {
  /** @param {Document} doc */
  constructor(doc) {
    this.doc = doc;
    this.generator = new MapGenerator();
    const canvas = /** @type {HTMLCanvasElement} */ (doc.getElementById("map"));
    this.renderer = new CanvasRenderer(canvas);
    this.tools = createTools();
    this.toolId = "pan";
    /** @type {import("../types.js").WorldData | null} */
    this.world = null;
    /** @type {import("../types.js").WorldData[]} */
    this.undo = [];
    /** @type {import("../types.js").WorldData[]} */
    this.redo = [];
    this.painting = false;
    this.panning = false;
    this.lastX = 0;
    this.lastY = 0;
    this.highlight = -1;
    this.recomputeTimer = 0;
    this.autosaveTimer = 0;
    this.labels = true;
    this.borders = true;
    this.grid = false;
    this.showRivers = true;
    this.showRoutes = true;
    this.showMarkers = true;
    this.showRelief = true;
    this.rosterKind = "settlements";
    /** @type {{ x0: number, y0: number, x1: number, y1: number } | null} */
    this.measure = null;
    this._zoomRaf = 0;
    this.#bind();
  }

  start() {
    const seed = this.#el("seed-input");
    if (seed instanceof HTMLInputElement && !seed.value) {
      seed.value = randomSeed();
    }
    this.#fillLegend();
    window.addEventListener("resize", () => {
      this.renderer.resize();
      if (this.world) this.redraw();
    });
    requestAnimationFrame(() => {
      this.renderer.resize();
      this.generate();
    });
  }

  async generate() {
    this.#setLoading(true, "正在生成世界…范围越大、格网越密，可能需要数秒。");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const seedEl = this.#el("seed-input");
      const extentEl = this.#el("opt-extent");
      const detailEl = this.#el("opt-detail");
      const platesEl = this.#el("opt-plates");
      const seaEl = this.#el("opt-sea");
      const windEl = this.#el("opt-wind");
      const seed = seedEl instanceof HTMLInputElement ? seedEl.value.trim() || randomSeed() : randomSeed();
      if (seedEl instanceof HTMLInputElement) seedEl.value = seed;
      const extentRaw = extentEl instanceof HTMLSelectElement ? extentEl.value : "2560,1600";
      const [ew, eh] = extentRaw.split(",").map(Number);
      const width = Number.isFinite(ew) && ew > 200 ? ew : 2560;
      const height = Number.isFinite(eh) && eh > 200 ? eh : 1600;
      const cellSize = Number(detailEl instanceof HTMLSelectElement ? detailEl.value : 7);
      const plateCount = Number(platesEl instanceof HTMLInputElement ? platesEl.value : 12);
      const seaLevel = Number(seaEl instanceof HTMLInputElement ? seaEl.value : 0);
      const windRaw = windEl instanceof HTMLSelectElement ? windEl.value : "1,0";
      const [wx, wy] = windRaw.split(",").map(Number);
      const world = this.generator.generate({
        seed,
        width,
        height,
        cellSize,
        plateCount,
        seaLevel,
        wind: { x: wx, y: wy },
      });
      const styleEl = this.#el("opt-style");
      world.meta.style = styleEl instanceof HTMLSelectElement ? styleEl.value : "atlas";
      this.world = world;
      this.undo = [];
      this.redo = [];
      this.measure = null;
      this.renderer.resize();
      this.renderer.fit(world);
      this.redraw();
      this.#scheduleAutosave();
      this.#inspect(-1);
      this.#fillLegend();
      this.#fillRoster();
      this.#syncZoomReadout();
    } finally {
      this.#setLoading(false);
    }
  }

  redraw() {
    if (!this.world) return;
    const draft =
      this.toolId === "river" ? /** @type {any} */ (this.tools.river).path || [] : [];
    this.renderer.draw(this.world, {
      labels: this.labels,
      borders: this.borders,
      grid: this.grid,
      rivers: this.showRivers,
      routes: this.showRoutes,
      markers: this.showMarkers,
      relief: this.showRelief,
      highlightCell: this.highlight,
      draftPath: draft,
      measure: this.measure,
    });
  }

  #bind() {
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    this.#el("btn-generate")?.addEventListener("click", () => this.generate());
    this.#el("btn-random")?.addEventListener("click", () => {
      const seed = this.#el("seed-input");
      if (seed instanceof HTMLInputElement) seed.value = randomSeed();
      this.generate();
    });
    this.#el("opt-plates")?.addEventListener("input", (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const val = this.#el("opt-plates-val");
      if (val) val.textContent = t.value;
    });
    this.#el("opt-sea")?.addEventListener("input", (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const val = this.#el("opt-sea-val");
      if (val) val.textContent = t.value;
    });
    this.#el("opt-brush")?.addEventListener("input", (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const val = this.#el("opt-brush-val");
      if (val) val.textContent = t.value;
    });
    this.#el("opt-style")?.addEventListener("change", (e) => {
      if (!this.world) return;
      this.world.meta.style = /** @type {HTMLSelectElement} */ (e.target).value;
      this.#fillLegend();
      this.redraw();
    });
    this.#el("opt-labels")?.addEventListener("change", (e) => {
      this.labels = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-borders")?.addEventListener("change", (e) => {
      this.borders = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-rivers")?.addEventListener("change", (e) => {
      this.showRivers = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-routes")?.addEventListener("change", (e) => {
      this.showRoutes = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-markers")?.addEventListener("change", (e) => {
      this.showMarkers = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-relief")?.addEventListener("change", (e) => {
      this.showRelief = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });
    this.#el("opt-grid")?.addEventListener("change", (e) => {
      this.grid = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });

    this.doc.querySelectorAll(".tool").forEach((btn) => {
      btn.addEventListener("click", () => this.#setTool(String(btn.getAttribute("data-tool") || "pan")));
    });

    this.doc.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.doc.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.rosterKind = String(btn.getAttribute("data-roster") || "settlements");
        this.#fillRoster();
      });
    });

    this.#el("opt-search")?.addEventListener("input", () => this.#fillSearch());
    this.#el("opt-search")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = this.#el("search-results")?.querySelector("button");
        if (first instanceof HTMLElement) first.click();
      }
    });

    canvas.addEventListener("pointerdown", (ev) => this.#onDown(ev));
    canvas.addEventListener("pointermove", (ev) => this.#onMove(ev));
    window.addEventListener("pointerup", (ev) => this.#onUp(ev));
    canvas.addEventListener(
      "wheel",
      (ev) => {
        if (!this.world) return;
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        let dy = ev.deltaY;
        if (ev.deltaMode === 1) dy *= 16;
        else if (ev.deltaMode === 2) dy *= rect.height;
        const factor = Math.exp(-dy * 0.0016);
        this.renderer.zoomAt(this.world, factor, ev.clientX - rect.left, ev.clientY - rect.top);
        this.#syncZoomReadout();
        if (!this._zoomRaf) {
          this._zoomRaf = requestAnimationFrame(() => {
            this._zoomRaf = 0;
            this.redraw();
          });
        }
      },
      { passive: false },
    );
    canvas.addEventListener("dblclick", (ev) => {
      if (!this.world) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.renderer.zoomAt(this.world, ev.shiftKey ? 0.5 : 1.85, ev.clientX - rect.left, ev.clientY - rect.top);
      this.#syncZoomReadout();
      this.redraw();
    });
    this.#el("btn-zoom-in")?.addEventListener("click", () => this.#zoomButton(1.25));
    this.#el("btn-zoom-out")?.addEventListener("click", () => this.#zoomButton(0.8));
    this.#el("btn-zoom-fit")?.addEventListener("click", () => {
      if (!this.world) return;
      this.renderer.fit(this.world);
      this.#syncZoomReadout();
      this.redraw();
    });

    this.#el("btn-export-json")?.addEventListener("click", () => {
      if (!this.world) return;
      downloadJson(this.world, `world-${this.world.meta.seed}.json`);
    });
    this.#el("btn-import-json")?.addEventListener("click", () => this.#el("file-import")?.click());
    this.#el("file-import")?.addEventListener("change", async (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await readJsonFile(file);
        this.world = parseWorld(raw);
        this.undo = [];
        this.redo = [];
        this.renderer.resize();
        this.renderer.fit(this.world);
        this.redraw();
        this.#fillLegend();
        this.#fillRoster();
        const seed = this.#el("seed-input");
        if (seed instanceof HTMLInputElement) seed.value = this.world.meta.seed;
      } catch (err) {
        alert(err instanceof Error ? err.message : "导入失败。");
      }
      input.value = "";
    });
    this.#el("btn-export-png")?.addEventListener("click", () => {
      if (!this.world) return;
      const scaleEl = this.#el("opt-png-scale");
      const scale = Number(scaleEl instanceof HTMLSelectElement ? scaleEl.value : 2);
      const off = this.renderer.renderExport(this.world, scale);
      downloadPng(off, `world-${this.world.meta.seed}.png`);
    });
    this.#el("btn-undo")?.addEventListener("click", () => this.#undo());
    this.#el("btn-redo")?.addEventListener("click", () => this.#redo());
    this.#el("btn-autosave")?.addEventListener("click", () => {
      const w = loadLocal();
      if (!w) {
        alert("没有找到自动存档。");
        return;
      }
      try {
        this.world = parseWorld(w);
        this.renderer.fit(this.world);
        this.redraw();
        this.#fillLegend();
        this.#fillRoster();
      } catch (err) {
        alert(err instanceof Error ? err.message : "自动存档无法读取。");
      }
    });
    this.#el("btn-reroll-society")?.addEventListener("click", () => this.#reroll("society"));
    this.#el("btn-reroll-names")?.addEventListener("click", () => this.#reroll("names"));
    this.#el("btn-reroll-routes")?.addEventListener("click", () => this.#reroll("routes"));

    window.addEventListener("keydown", (ev) => this.#onKey(ev));
  }

  /** @param {string} id */
  #setTool(id) {
    this.toolId = id;
    this.doc.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tool") === id));
    const hint = this.#el("tool-hint");
    if (hint) hint.textContent = HINTS[this.toolId] || HINTS.pan;
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    canvas.style.cursor = this.toolId === "pan" ? "grab" : "crosshair";
  }

  /**
   * @param {"society"|"names"|"routes"} kind
   */
  async #reroll(kind) {
    if (!this.world) return;
    this.#pushUndo();
    this.#setLoading(true, kind === "society" ? "正在重掷文明…" : "正在重掷名称与路线…");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      if (kind === "society") this.generator.regenerateSociety(this.world);
      else if (kind === "names") this.generator.regenerateNames(this.world);
      else this.generator.rebuildRoutesAndMarkers(this.world);
      this.redraw();
      this.#inspect(-1);
      this.#fillLegend();
      this.#fillRoster();
      this.#scheduleAutosave();
    } finally {
      this.#setLoading(false);
    }
  }

  /** @param {KeyboardEvent} ev */
  #onKey(ev) {
    const t = /** @type {HTMLElement} */ (ev.target);
    const typing = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
    if (ev.key === "/" && !typing) {
      ev.preventDefault();
      const search = this.#el("opt-search");
      if (search instanceof HTMLInputElement) search.focus();
      return;
    }
    if (typing) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (ev.shiftKey) this.#redo();
      else this.#undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
      ev.preventDefault();
      this.#redo();
      return;
    }
    const tool = TOOL_KEYS[ev.key.toLowerCase()];
    if (tool) {
      ev.preventDefault();
      this.#setTool(tool);
    }
  }

  /** @param {PointerEvent} ev */
  #onDown(ev) {
    if (!this.world) return;
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    canvas.setPointerCapture(ev.pointerId);
    const { worldX, worldY, cellId, x, y } = this.#pointer(ev);
    this.lastX = x;
    this.lastY = y;
    this.highlight = cellId;
    this.#inspect(cellId);

    if (this.toolId === "pan" || ev.button === 1 || ev.shiftKey) {
      this.panning = true;
      canvas.style.cursor = "grabbing";
      return;
    }
    if (this.toolId === "measure") {
      this.measure = { x0: worldX, y0: worldY, x1: worldX, y1: worldY };
      this.redraw();
      return;
    }

    this.#pushUndo();
    this.painting = true;
    const ctx = this.#editorContext();
    this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "down", shiftKey: ev.shiftKey }, ctx);
    if (this.toolId === "raise" || this.toolId === "lower") this.#scheduleRecompute();
    this.redraw();
    this.#fillRoster();
  }

  /** @param {PointerEvent} ev */
  #onMove(ev) {
    if (!this.world) return;
    const { worldX, worldY, cellId, x, y } = this.#pointer(ev);
    if (this.panning) {
      this.renderer.pan(this.world, x - this.lastX, y - this.lastY);
      this.lastX = x;
      this.lastY = y;
      this.redraw();
      return;
    }
    if (this.toolId === "measure" && this.measure && ev.buttons) {
      this.measure.x1 = worldX;
      this.measure.y1 = worldY;
      this.redraw();
      return;
    }
    this.highlight = cellId;
    this.#hover(cellId, x, y);
    if (!this.painting) {
      this.redraw();
      return;
    }
    const ctx = this.#editorContext();
    this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "move", shiftKey: ev.shiftKey }, ctx);
    if (this.toolId === "raise" || this.toolId === "lower") this.#scheduleRecompute();
    this.redraw();
  }

  /** @param {PointerEvent} ev */
  #onUp(ev) {
    if (!this.world) return;
    const { worldX, worldY, cellId } = this.#pointer(ev);
    if (this.panning) {
      this.panning = false;
      const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
      canvas.style.cursor = this.toolId === "pan" ? "grab" : "crosshair";
    }
    if (this.toolId === "measure" && this.measure) {
      this.measure.x1 = worldX;
      this.measure.y1 = worldY;
      this.redraw();
      return;
    }
    if (this.painting) {
      const ctx = this.#editorContext();
      if (this.toolId === "river") {
        const river = /** @type {any} */ (this.tools.river);
        const path = river.path?.slice() || [];
        river.apply(this.world, { worldX, worldY, cellId, phase: "up", shiftKey: ev.shiftKey }, ctx);
        if (path.length >= 2) this.generator.carveRiver(this.world, path);
      } else {
        this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "up", shiftKey: ev.shiftKey }, ctx);
        if (this.toolId === "raise" || this.toolId === "lower") {
          this.generator.recomputeFromElevation(this.world);
        } else if (this.toolId === "burg" || this.toolId === "erase") {
          this.generator.rebuildRoutes(this.world);
        }
      }
      this.painting = false;
      this.#scheduleAutosave();
      this.#fillRoster();
      this.#fillLegend();
    }
    this.redraw();
  }

  /** @param {PointerEvent} ev */
  #pointer(ev) {
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (this.world) this.renderer._view = this.world.view;
    const wpt = this.renderer.screenToWorld(x, y);
    const cellId = this.world ? this.renderer.hitTest(this.world, wpt.x, wpt.y) : -1;
    return { x, y, worldX: wpt.x, worldY: wpt.y, cellId };
  }

  #editorContext() {
    const brushEl = this.#el("opt-brush");
    const brush = Number(brushEl instanceof HTMLInputElement ? brushEl.value : 3);
    const markerEl = this.#el("opt-marker-type");
    const markerType = markerEl instanceof HTMLSelectElement ? markerEl.value : "ruins";
    return {
      brush,
      markerType,
      requestRecompute: () => this.#scheduleRecompute(),
      commit: () => {
        this.#scheduleAutosave();
      },
      promptRename: (s) => {
        const next = window.prompt("重命名", s.name);
        if (next && next.trim()) {
          s.name = next.trim();
          this.#scheduleAutosave();
          this.redraw();
          this.#fillRoster();
        }
      },
      promptText: (label, fallback) => {
        const next = window.prompt(label, fallback || "");
        if (next == null) return null;
        const t = next.trim();
        return t || fallback || "";
      },
    };
  }

  #scheduleRecompute() {
    if (this.recomputeTimer) return;
    this.recomputeTimer = window.setTimeout(() => {
      this.recomputeTimer = 0;
      if (this.world && (this.toolId === "raise" || this.toolId === "lower")) {
        this.generator.recomputeFromElevation(this.world);
        this.redraw();
      }
    }, 90);
  }

  #pushUndo() {
    if (!this.world) return;
    this.undo.push(cloneWorld(this.world));
    if (this.undo.length > 8) this.undo.shift();
    this.redo = [];
  }

  #undo() {
    const prev = this.undo.pop();
    if (!prev || !this.world) return;
    this.redo.push(cloneWorld(this.world));
    this.world = prev;
    this.redraw();
    this.#fillLegend();
    this.#fillRoster();
    this.#scheduleAutosave();
  }

  #redo() {
    const next = this.redo.pop();
    if (!next || !this.world) return;
    this.undo.push(cloneWorld(this.world));
    this.world = next;
    this.redraw();
    this.#fillLegend();
    this.#fillRoster();
    this.#scheduleAutosave();
  }

  #scheduleAutosave() {
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      if (this.world) saveLocal(this.world);
    }, 400);
  }

  /** @param {number} cellId */
  #inspect(cellId) {
    const box = this.#el("inspector");
    if (!box || !this.world) return;
    if (cellId < 0) {
      const sum = summarizeWorld(this.world);
      const mapName = this.world.meta.mapName || this.world.meta.seed;
      box.innerHTML = `
        <dt>图名</dt><dd>${escapeHtml(mapName)}</dd>
        <dt>种子</dt><dd>${escapeHtml(this.world.meta.seed)}</dd>
        <dt>画幅</dt><dd>${this.world.meta.width}×${this.world.meta.height} · 格距 ${this.world.meta.cellSize}</dd>
        <dt>绘制</dt><dd>${escapeHtml(this.renderer.lodLabel(this.world))}（格子不变）</dd>
        <dt>格子</dt><dd>${sum.cells} · 陆地 ${sum.land} · 海洋 ${sum.ocean}</dd>
        <dt>河流</dt><dd>${sum.rivers}</dd>
        <dt>聚落</dt><dd>${sum.settlements}</dd>
        <dt>国度</dt><dd>${sum.regions}</dd>
        <dt>文化</dt><dd>${sum.cultures}</dd>
        <dt>商路</dt><dd>${sum.routes}</dd>
        <dt>地标</dt><dd>${sum.markers}</dd>`;
      return;
    }
    const c = this.world.cells[cellId];
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const realm = c.regionId >= 0 ? this.world.regions[c.regionId] : null;
    const cult = c.cultureId >= 0 ? this.world.cultures?.[c.cultureId] : null;
    const marker = (this.world.markers || []).find((m) => m.cellId === cellId);
    const river = c.riverId >= 0 ? this.world.rivers[c.riverId] : null;
    const biomeName = BIOME_LABELS[c.biome] || c.biome;
    const typeName = town ? SETTLEMENT_TYPE[town.type] || town.type : "";
    box.innerHTML = `
      <dt>格子</dt><dd>#${c.id}</dd>
      <dt>海拔</dt><dd>${c.height.toFixed(2)}</dd>
      <dt>生物群系</dt><dd>${escapeHtml(biomeName)}</dd>
      <dt>湿度</dt><dd>${c.moisture.toFixed(2)}</dd>
      <dt>温度</dt><dd>${c.temperature.toFixed(2)}</dd>
      <dt>径流量</dt><dd>${c.flux.toFixed(1)}</dd>
      <dt>河流</dt><dd>${river?.name ? escapeHtml(river.name) : c.riverId >= 0 ? "有" : "—"}</dd>
      <dt>标记</dt><dd>${[
        c.ocean && "海洋",
        c.lake && "湖泊",
        c.coast && "海岸",
        c.mountain && "山脉",
      ]
        .filter(Boolean)
        .join(" · ") || "—"}</dd>
      <dt>文化</dt><dd>${cult ? escapeHtml(`${cult.name}（${cultureTypeLabel(cult.type)}）`) : "—"}</dd>
      <dt>国度</dt><dd>${realm ? escapeHtml(realm.name) : "—"}</dd>
      <dt>聚落</dt><dd>${town ? escapeHtml(`${town.name}（${typeName} · ${town.population || "?"}人）`) : "—"}</dd>
      <dt>地标</dt><dd>${marker ? escapeHtml(marker.name) : "—"}</dd>`;
  }

  /**
   * @param {number} cellId
   * @param {number} x
   * @param {number} y
   */
  #hover(cellId, x, y) {
    const card = this.#el("hover-card");
    if (!(card instanceof HTMLElement) || !this.world) return;
    if (cellId < 0) {
      card.hidden = true;
      return;
    }
    const c = this.world.cells[cellId];
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const marker = (this.world.markers || []).find((m) => m.cellId === cellId);
    const cult = c.cultureId >= 0 ? this.world.cultures?.[c.cultureId] : null;
    card.hidden = false;
    card.style.left = `${x + 14}px`;
    card.style.top = `${y + 14}px`;
    if (town) card.textContent = `${town.name} · ${SETTLEMENT_TYPE[town.type] || town.type}`;
    else if (marker) card.textContent = marker.name;
    else card.textContent = [BIOME_LABELS[c.biome] || c.biome.replaceAll("_", " "), cult?.name].filter(Boolean).join(" · ");
    this.#inspect(cellId);
  }

  #fillLegend() {
    const list = this.#el("biome-legend");
    if (!list) return;
    list.innerHTML = this.renderer
      .legendItems(this.world || undefined)
      .map(
        (item) =>
          `<li><span class="swatch" style="background:${item.color}"></span>${escapeHtml(item.label)}</li>`,
      )
      .join("");
  }

  #fillRoster() {
    const list = this.#el("roster-list");
    if (!list || !this.world) return;
    /** @type {{ label: string, cellId: number, hint?: string }[]} */
    let items = [];
    if (this.rosterKind === "settlements") {
      items = this.world.settlements.map((s) => ({
        label: s.name,
        hint: `${SETTLEMENT_TYPE[s.type] || s.type} · ${(s.population || 0).toLocaleString("zh-CN")}人`,
        cellId: s.cellId,
      }));
    } else if (this.rosterKind === "regions") {
      items = this.world.regions.map((r) => {
        const cap = this.world.settlements.find((s) => s.id === r.capitalId);
        return { label: r.name, hint: cap ? `都城 ${cap.name}` : "", cellId: cap?.cellId ?? -1 };
      });
    } else if (this.rosterKind === "cultures") {
      items = (this.world.cultures || []).map((c) => ({
        label: c.name,
        hint: cultureTypeLabel(c.type),
        cellId: c.originId,
      }));
    } else {
      items = (this.world.markers || []).map((m) => ({
        label: m.name,
        hint: markerLabel(m.type),
        cellId: m.cellId,
      }));
    }
    list.innerHTML = items
      .map(
        (it) =>
          `<li><button type="button" data-cell="${it.cellId}">${escapeHtml(it.label)}${it.hint ? `<span>${escapeHtml(it.hint)}</span>` : ""}</button></li>`,
      )
      .join("");
    list.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this.#flyTo(Number(btn.getAttribute("data-cell"))));
    });
  }

  #fillSearch() {
    const box = this.#el("search-results");
    const input = this.#el("opt-search");
    if (!box || !this.world || !(input instanceof HTMLInputElement)) return;
    const q = input.value.trim().toLowerCase();
    if (!q) {
      box.innerHTML = "";
      return;
    }
    /** @type {{ label: string, hint: string, cellId: number }[]} */
    const hits = [];
    for (const s of this.world.settlements) {
      if (s.name.toLowerCase().includes(q)) hits.push({ label: s.name, hint: SETTLEMENT_TYPE[s.type] || s.type, cellId: s.cellId });
    }
    for (const r of this.world.regions) {
      if (r.name.toLowerCase().includes(q)) {
        const cap = this.world.settlements.find((s) => s.id === r.capitalId);
        hits.push({ label: r.name, hint: "国度", cellId: cap?.cellId ?? -1 });
      }
    }
    for (const c of this.world.cultures || []) {
      if (c.name.toLowerCase().includes(q)) hits.push({ label: c.name, hint: "文化", cellId: c.originId });
    }
    for (const m of this.world.markers || []) {
      if (m.name.toLowerCase().includes(q)) hits.push({ label: m.name, hint: markerLabel(m.type), cellId: m.cellId });
    }
    box.innerHTML = hits
      .slice(0, 12)
      .map((it) => `<li><button type="button" data-cell="${it.cellId}">${escapeHtml(it.label)}<span>${escapeHtml(it.hint)}</span></button></li>`)
      .join("");
    box.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this.#flyTo(Number(btn.getAttribute("data-cell"))));
    });
  }

  /** @param {number} cellId */
  #flyTo(cellId) {
    if (!this.world || cellId < 0) return;
    const cell = this.world.cells[cellId];
    if (!cell) return;
    this.renderer.centerOn(this.world, cell.x, cell.y);
    this.highlight = cellId;
    this.#inspect(cellId);
    this.#syncZoomReadout();
    this.redraw();
  }

  #zoomButton(factor) {
    if (!this.world) return;
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    this.renderer.zoomAt(this.world, factor, canvas.clientWidth / 2, canvas.clientHeight / 2);
    this.#syncZoomReadout();
    this.redraw();
  }

  #syncZoomReadout() {
    const el = this.#el("zoom-readout");
    if (!el || !this.world) return;
    el.textContent = `${this.renderer.zoomPercent(this.world)}% · ${this.renderer.lodLabel(this.world)}`;
  }

  /**
   * @param {boolean} on
   * @param {string} [msg]
   */
  #setLoading(on, msg) {
    const el = this.#el("loading");
    if (el instanceof HTMLElement) {
      el.hidden = !on;
      if (on && msg) el.textContent = msg;
    }
  }

  /** @param {string} id */
  #el(id) {
    return this.doc.getElementById(id);
  }
}

function randomSeed() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
}
