/**
 * App controller. Wires the four layers together and owns the camera, undo
 * stack, and UI chrome. This is the only module allowed to touch both data
 * and the DOM.
 */
import { MapGenerator } from "../generators/mapGenerator.js";
import { CanvasRenderer } from "../renderers/canvasRenderer.js";
import { createTools } from "../editors/tools.js";
import { cloneWorld, parseWorld, summarizeWorld } from "../data/worldData.js";
import { saveAutosave, loadAutosave, downloadJson, downloadPng, readJsonFile, peekAutosave, saveSlot, loadSlot, listSlotMeta, SLOT_COUNT } from "../persistence/storage.js";
import { BIOME_LABELS } from "../renderers/styles.js";
import { cultureTypeLabel } from "../generators/cultures.js";
import { markerLabel } from "../generators/markers.js";
import { religionTypeLabel } from "../generators/religions.js";
import { featureTypeLabel } from "../generators/features.js";
import { landformLabel } from "../generators/landforms.js";
import { estimatePopulation } from "../generators/civilization.js";
import { stanceLabel, tiesFor, otherId } from "../generators/diplomacy.js";
import { APP_VERSION } from "../core/version.js";
import { runGeneratorJob, STAGE_LABELS } from "./generateClient.js";
import { parseShare, serializeShare, shareHasSeed } from "./share.js";

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
    this._toastTimer = 0;
    this._noteTarget = null;
    this._burgTarget = null;
    this._dialogDone = null;
    this._confirmDone = null;
    this.#bind();
  }

  start() {
    const seed = this.#el("seed-input");
    if (seed instanceof HTMLInputElement && !seed.value) {
      seed.value = randomSeed();
    }
    this.#fillLegend();
    const ver = this.#el("app-version");
    if (ver) ver.textContent = APP_VERSION;
    const helpVer = this.#el("help-version");
    if (helpVer) helpVer.textContent = `v${APP_VERSION}`;
    this.#fillSlotSelect();
    window.addEventListener("resize", () => {
      this.renderer.resize();
      if (this.world) this.redraw();
    });
    requestAnimationFrame(() => {
      this.renderer.resize();
      this.#boot();
    });
  }

  async #boot() {
    const share = parseShare(this.doc.defaultView?.location?.search || "");
    if (shareHasSeed(share)) {
      this.#applyShare(share);
      await this.generate({ force: true });
      this.#toast(`已从链接打开种子「${share.seed}」。`);
      return;
    }
    const saved = await loadAutosave();
    if (saved) {
      try {
        this.#applyWorld(parseWorld(saved), { fit: true });
        const peek = peekAutosave();
        const label = this.world?.meta.mapName || peek?.mapName || peek?.seed || "自动存档";
        this.#toast(`已恢复「${label}」。点「生成世界」可另开一张。`);
        return;
      } catch {
        /* corrupt autosave — generate fresh */
      }
    }
    this.generate();
  }

  /**
   * @param {{ force?: boolean }} [opts]
   */
  async generate(opts = {}) {
    if (this.world && !opts.force && this.undo.length) {
      const ok = await this.#askConfirm("生成会替换当前世界。撤销栈里的修改会丢掉。继续？");
      if (!ok) return;
    }
    this.#setLoading(true, "正在生成世界…范围越大、格网越密，可能需要数秒。");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const seedEl = this.#el("seed-input");
      const extentEl = this.#el("opt-extent");
      const detailEl = this.#el("opt-detail");
      const platesEl = this.#el("opt-plates");
      const seaEl = this.#el("opt-sea");
      const windEl = this.#el("opt-wind");
      const landEl = this.#el("opt-landform");
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
      const landform = landEl instanceof HTMLSelectElement ? landEl.value : "continents";
      const world = await runGeneratorJob(
        "generate",
        {
          config: {
            seed,
            width,
            height,
            cellSize,
            plateCount,
            seaLevel,
            wind: { x: wx, y: wy },
            landform,
          },
        },
        (stage) => this.#setLoading(true, STAGE_LABELS[stage] || "正在生成世界…"),
      );
      const styleEl = this.#el("opt-style");
      world.meta.style = styleEl instanceof HTMLSelectElement ? styleEl.value : "atlas";
      this.#applyWorld(world, { fit: true });
      this.#toast(`已生成「${world.meta.mapName || seed}」`);
    } catch (err) {
      this.#toast(err instanceof Error ? err.message : "生成失败。", true);
    } finally {
      this.#setLoading(false);
    }
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {{ fit?: boolean }} [opts]
   */
  #applyWorld(world, opts = {}) {
    this.world = world;
    this.undo = [];
    this.redo = [];
    this.measure = null;
    this.highlight = -1;
    this.renderer.resize();
    if (opts.fit) this.renderer.fit(world);
    const seed = this.#el("seed-input");
    if (seed instanceof HTMLInputElement) seed.value = world.meta.seed;
    const name = this.#el("map-name");
    if (name instanceof HTMLInputElement) name.value = world.meta.mapName || "";
    const styleEl = this.#el("opt-style");
    if (styleEl instanceof HTMLSelectElement && world.meta.style) styleEl.value = world.meta.style;
    const landEl = this.#el("opt-landform");
    if (landEl instanceof HTMLSelectElement && world.meta.landform) landEl.value = world.meta.landform;
    this.#syncTitle();
    this.#syncShareUrl();
    this.redraw();
    this.#scheduleAutosave();
    this.#inspect(-1);
    this.#fillLegend();
    this.#fillRoster();
    this.#syncZoomReadout();
    this.#setStatus(-1);
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
        this.#applyWorld(parseWorld(raw), { fit: true });
        this.#toast("存档已导入。");
      } catch (err) {
        this.#toast(err instanceof Error ? err.message : "导入失败。", true);
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
    this.#el("btn-autosave")?.addEventListener("click", async () => {
      const w = await loadAutosave();
      if (!w) {
        this.#toast("没有找到自动存档。", true);
        return;
      }
      try {
        this.#applyWorld(parseWorld(w), { fit: true });
        this.#toast("已读取自动存档。");
      } catch (err) {
        this.#toast(err instanceof Error ? err.message : "自动存档无法读取。", true);
      }
    });
    this.#el("btn-reroll-society")?.addEventListener("click", () => this.#reroll("society"));
    this.#el("btn-reroll-names")?.addEventListener("click", () => this.#reroll("names"));
    this.#el("btn-reroll-routes")?.addEventListener("click", () => this.#reroll("routes"));
    this.#el("btn-help")?.addEventListener("click", () => this.#openHelp());
    this.#el("btn-copy-seed")?.addEventListener("click", () => this.#copySeed());
    this.#el("btn-copy-link")?.addEventListener("click", () => this.#copyLink());
    this.#el("btn-fold-left")?.addEventListener("click", () => this.#togglePanel("left"));
    this.#el("btn-fold-right")?.addEventListener("click", () => this.#togglePanel("right"));
    this.#el("btn-panel-left")?.addEventListener("click", () => this.#togglePanel("left"));
    this.#el("btn-panel-right")?.addEventListener("click", () => this.#togglePanel("right"));
    this.#el("btn-save-slot")?.addEventListener("click", () => this.#saveToSlot());
    this.#el("btn-load-slot")?.addEventListener("click", () => this.#loadFromSlot());
    this.#el("map-name")?.addEventListener("change", (e) => {
      if (!this.world) return;
      this.world.meta.mapName = /** @type {HTMLInputElement} */ (e.target).value.trim();
      this.#syncTitle();
      this.#scheduleAutosave();
    });
    this.#el("entity-note")?.addEventListener("input", (e) => {
      if (!this._noteTarget) return;
      this._noteTarget.note = /** @type {HTMLTextAreaElement} */ (e.target).value;
      this.#scheduleAutosave();
    });
    this.#el("opt-burg-type")?.addEventListener("change", (e) => {
      if (!this._burgTarget || !this.world) return;
      this.#pushUndo();
      const type = /** @type {HTMLSelectElement} */ (e.target).value;
      this._burgTarget.type = /** @type {"capital"|"city"|"town"|"village"} */ (type);
      const cell = this.world.cells[this._burgTarget.cellId];
      if (cell) this._burgTarget.population = estimatePopulation(cell, this._burgTarget.type);
      this.#scheduleAutosave();
      this.#fillRoster();
      this.redraw();
      this.#inspect(this._burgTarget.cellId);
    });
    this.#el("confirm-form")?.addEventListener("submit", (e) => {
      const btn = /** @type {HTMLButtonElement | null} */ (e.submitter);
      this._confirmDone?.(btn?.value === "ok");
      this._confirmDone = null;
    });
    this.#el("confirm-dialog")?.addEventListener("close", () => {
      if (this._confirmDone) {
        this._confirmDone(false);
        this._confirmDone = null;
      }
    });
    this.#el("text-form")?.addEventListener("submit", (e) => {
      const btn = /** @type {HTMLButtonElement | null} */ (e.submitter);
      const input = this.#el("dialog-input");
      if (btn?.value === "ok" && input instanceof HTMLInputElement) {
        this._dialogDone?.(input.value.trim() || input.defaultValue || null);
      } else {
        this._dialogDone?.(null);
      }
      this._dialogDone = null;
    });
    this.#el("text-dialog")?.addEventListener("close", () => {
      if (this._dialogDone) {
        this._dialogDone(null);
        this._dialogDone = null;
      }
    });

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
      if (kind === "society") {
        this.world = await runGeneratorJob("society", { world: this.world }, (stage) =>
          this.#setLoading(true, STAGE_LABELS[stage] || "正在重掷文明…"),
        );
      } else if (kind === "names") this.generator.regenerateNames(this.world);
      else {
        this.world = await runGeneratorJob("routes", { world: this.world });
      }
      const name = this.#el("map-name");
      if (name instanceof HTMLInputElement) name.value = this.world.meta.mapName || "";
      this.#syncTitle();
      this.redraw();
      this.#inspect(-1);
      this.#fillLegend();
      this.#fillRoster();
      this.#scheduleAutosave();
      this.#toast(kind === "names" ? "地名已重掷。" : kind === "society" ? "文明已重掷，地形未动。" : "商路与地标已重掷。");
    } catch (err) {
      this.#toast(err instanceof Error ? err.message : "重掷失败。", true);
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
    if (ev.key === "Escape") {
      this.#closeHelp();
      this.#el("text-dialog")?.close?.();
      this.#el("confirm-dialog")?.close?.();
      return;
    }
    if (ev.key === "F1" || ev.key === "?") {
      ev.preventDefault();
      this.#openHelp();
      return;
    }
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
    if (ev.key === "[") {
      ev.preventDefault();
      this.#togglePanel("left");
      return;
    }
    if (ev.key === "]") {
      ev.preventDefault();
      this.#togglePanel("right");
      return;
    }
    if (ev.key.toLowerCase() === "h") {
      ev.preventDefault();
      const app = this.#el("app");
      if (app instanceof HTMLElement) {
        const both = app.classList.contains("hide-left") && app.classList.contains("hide-right");
        app.classList.toggle("hide-left", !both);
        app.classList.toggle("hide-right", !both);
        this.renderer.resize();
        this.redraw();
      }
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

    const clickOnce = this.toolId === "burg" || this.toolId === "erase" || this.toolId === "marker" || this.toolId === "rename";
    if (clickOnce) {
      if (this.toolId === "erase") this.#pushUndo();
      const ctx = this.#editorContext();
      this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "down", shiftKey: ev.shiftKey }, ctx);
      if (this.toolId === "erase") {
        this.generator.rebuildRoutes(this.world);
        this.#scheduleAutosave();
        this.#fillRoster();
      }
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
    this.#setStatus(cellId);
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
        if (this.world && (this.toolId === "burg" || this.toolId === "erase")) {
          this.generator.rebuildRoutes(this.world);
        }
        this.#scheduleAutosave();
        this.redraw();
        this.#fillRoster();
        this.#fillLegend();
      },
      promptRename: (s) => {
        this.#askText("重命名", s.name, (next) => {
          if (!next) return;
          this.#pushUndo();
          s.name = next;
          this.#scheduleAutosave();
          this.redraw();
          this.#fillRoster();
        });
      },
      promptText: (label, fallback) => fallback || "",
      beginEdit: () => this.#pushUndo(),
      askText: (label, fallback, done) => this.#askText(label, fallback, done),
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
      if (this.world) saveAutosave(this.world);
    }, 400);
  }

  /** @param {number} cellId */
  #inspect(cellId) {
    const box = this.#el("inspector");
    if (!box || !this.world) return;
    if (cellId < 0) {
      const sum = summarizeWorld(this.world);
      const mapName = this.world.meta.mapName || this.world.meta.seed;
      this._noteTarget = null;
      const noteWrap = this.#el("note-wrap");
      if (noteWrap instanceof HTMLElement) noteWrap.hidden = true;
      const burgWrap = this.#el("burg-wrap");
      if (burgWrap instanceof HTMLElement) burgWrap.hidden = true;
      box.innerHTML = `
        <dt>图名</dt><dd>${escapeHtml(mapName)}</dd>
        <dt>种子</dt><dd>${escapeHtml(this.world.meta.seed)}</dd>
        <dt>陆形</dt><dd>${escapeHtml(landformLabel(this.world.meta.landform))}</dd>
        <dt>画幅</dt><dd>${this.world.meta.width}×${this.world.meta.height} · 格距 ${this.world.meta.cellSize}</dd>
        <dt>绘制</dt><dd>${escapeHtml(this.renderer.lodLabel(this.world))}（格子不变）</dd>
        <dt>格子</dt><dd>${sum.cells} · 陆地 ${sum.land} · 海洋 ${sum.ocean}</dd>
        <dt>河流</dt><dd>${sum.rivers}</dd>
        <dt>聚落</dt><dd>${sum.settlements}</dd>
        <dt>国度</dt><dd>${sum.regions}</dd>
        <dt>文化</dt><dd>${sum.cultures}</dd>
        <dt>行省</dt><dd>${sum.provinces}</dd>
        <dt>信仰</dt><dd>${sum.religions}</dd>
        <dt>地貌</dt><dd>${sum.features}</dd>
        <dt>商路</dt><dd>${sum.routes}</dd>
        <dt>地标</dt><dd>${sum.markers}</dd>`;
      this.#setStatus(-1);
      return;
    }
    const c = this.world.cells[cellId];
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const realm = c.regionId >= 0 ? this.world.regions[c.regionId] : null;
    const cult = c.cultureId >= 0 ? this.world.cultures?.[c.cultureId] : null;
    const marker = (this.world.markers || []).find((m) => m.cellId === cellId);
    const river = c.riverId >= 0 ? this.world.rivers[c.riverId] : null;
    const province = c.provinceId >= 0 ? this.world.provinces?.[c.provinceId] : null;
    const religion = c.religionId >= 0 ? this.world.religions?.[c.religionId] : null;
    const feat = c.featureId >= 0 ? this.world.features?.[c.featureId] : null;
    const biomeName = BIOME_LABELS[c.biome] || c.biome;
    const typeName = town ? SETTLEMENT_TYPE[town.type] || town.type : "";
    this._noteTarget = town || marker || province || realm || cult || religion || feat || null;
    this._burgTarget = town || null;
    const noteWrap = this.#el("note-wrap");
    const noteEl = this.#el("entity-note");
    if (noteWrap instanceof HTMLElement) noteWrap.hidden = !this._noteTarget;
    if (noteEl instanceof HTMLTextAreaElement) noteEl.value = this._noteTarget?.note || "";
    const burgWrap = this.#el("burg-wrap");
    const burgType = this.#el("opt-burg-type");
    if (burgWrap instanceof HTMLElement) burgWrap.hidden = !town;
    if (town && burgType instanceof HTMLSelectElement) burgType.value = town.type;
    const diplo = realm
      ? tiesFor(this.world.diplomacy || [], realm.id)
          .map((t) => {
            const other = this.world.regions[otherId(t, realm.id)];
            return other ? `${other.name}（${stanceLabel(t.stance)}）` : "";
          })
          .filter(Boolean)
          .join(" · ")
      : "";
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
      <dt>外交</dt><dd>${diplo ? escapeHtml(diplo) : "—"}</dd>
      <dt>行省</dt><dd>${province ? escapeHtml(province.name) : "—"}</dd>
      <dt>信仰</dt><dd>${religion ? escapeHtml(`${religion.name}（${religionTypeLabel(religion.type)}）`) : "—"}</dd>
      <dt>地貌</dt><dd>${feat ? escapeHtml(`${feat.name}（${featureTypeLabel(feat.type)}）`) : "—"}</dd>
      <dt>聚落</dt><dd>${town ? escapeHtml(`${town.name}（${typeName} · ${town.population || "?"}人）`) : "—"}</dd>
      <dt>地标</dt><dd>${marker ? escapeHtml(marker.name) : "—"}</dd>`;
    this.#setStatus(cellId);
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
        const wars = tiesFor(this.world.diplomacy || [], r.id).filter((t) => t.stance === "war").length;
        const hint = [cap ? `都城 ${cap.name}` : "", wars ? `交战 ${wars}` : ""].filter(Boolean).join(" · ");
        return { label: r.name, hint, cellId: cap?.cellId ?? -1 };
      });
    } else if (this.rosterKind === "provinces") {
      items = (this.world.provinces || []).map((p) => {
        const seat = this.world.settlements.find((s) => s.id === p.seatId);
        return { label: p.name, hint: seat ? `治所 ${seat.name}` : "行省", cellId: seat?.cellId ?? -1 };
      });
    } else if (this.rosterKind === "cultures") {
      items = (this.world.cultures || []).map((c) => ({
        label: c.name,
        hint: cultureTypeLabel(c.type),
        cellId: c.originId,
      }));
    } else if (this.rosterKind === "religions") {
      items = (this.world.religions || []).map((r) => ({
        label: r.name,
        hint: religionTypeLabel(r.type),
        cellId: r.originId,
      }));
    } else if (this.rosterKind === "features") {
      items = (this.world.features || []).map((f) => ({
        label: f.name,
        hint: `${featureTypeLabel(f.type)} · ${f.size}格`,
        cellId: f.originId,
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
    for (const p of this.world.provinces || []) {
      if (p.name.toLowerCase().includes(q)) {
        const seat = this.world.settlements.find((s) => s.id === p.seatId);
        hits.push({ label: p.name, hint: "行省", cellId: seat?.cellId ?? -1 });
      }
    }
    for (const c of this.world.cultures || []) {
      if (c.name.toLowerCase().includes(q)) hits.push({ label: c.name, hint: "文化", cellId: c.originId });
    }
    for (const r of this.world.religions || []) {
      if (r.name.toLowerCase().includes(q)) hits.push({ label: r.name, hint: religionTypeLabel(r.type), cellId: r.originId });
    }
    for (const f of this.world.features || []) {
      if (f.name.toLowerCase().includes(q)) hits.push({ label: f.name, hint: featureTypeLabel(f.type), cellId: f.originId });
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
   * @param {string} label
   * @param {string} fallback
   * @param {(value: string | null) => void} done
   */
  #askText(label, fallback, done) {
    const dialog = this.#el("text-dialog");
    const lab = this.#el("dialog-label");
    const input = this.#el("dialog-input");
    if (!(dialog instanceof HTMLDialogElement) || !(input instanceof HTMLInputElement)) {
      done(window.prompt(label, fallback));
      return;
    }
    if (lab) lab.textContent = label;
    input.value = fallback || "";
    this._dialogDone = done;
    dialog.showModal();
    input.focus();
    input.select();
  }

  /** @param {"left"|"right"} side */
  #togglePanel(side) {
    const app = this.#el("app");
    if (!(app instanceof HTMLElement)) return;
    app.classList.toggle(side === "left" ? "hide-left" : "hide-right");
    this.renderer.resize();
    if (this.world) this.redraw();
  }

  async #copySeed() {
    const seed = this.#el("seed-input");
    const value = seed instanceof HTMLInputElement ? seed.value : this.world?.meta.seed;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.#toast("种子已复制。");
    } catch {
      this.#toast(value);
    }
  }

  async #copyLink() {
    this.#syncShareUrl();
    const href = this.doc.defaultView?.location?.href || "";
    try {
      await navigator.clipboard.writeText(href);
      this.#toast("分享链接已复制。别人打开会按同样的种子生成。");
    } catch {
      this.#toast(href);
    }
  }

  #shareState() {
    const seed = this.#el("seed-input");
    const land = this.#el("opt-landform");
    const extent = this.#el("opt-extent");
    const detail = this.#el("opt-detail");
    const style = this.#el("opt-style");
    const plates = this.#el("opt-plates");
    const sea = this.#el("opt-sea");
    return {
      seed: seed instanceof HTMLInputElement ? seed.value.trim() : this.world?.meta.seed,
      landform: land instanceof HTMLSelectElement ? land.value : this.world?.meta.landform,
      extent: extent instanceof HTMLSelectElement ? extent.value : "",
      detail: detail instanceof HTMLSelectElement ? detail.value : "",
      style: style instanceof HTMLSelectElement ? style.value : this.world?.meta.style,
      plates: plates instanceof HTMLInputElement ? plates.value : "",
      sea: sea instanceof HTMLInputElement ? sea.value : "",
    };
  }

  /** @param {import("./share.js").ShareState} share */
  #applyShare(share) {
    const setVal = (id, value) => {
      const el = this.#el(id);
      if (value == null || value === "") return;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
      if (id === "opt-plates") {
        const lab = this.#el("opt-plates-val");
        if (lab) lab.textContent = value;
      }
      if (id === "opt-sea") {
        const lab = this.#el("opt-sea-val");
        if (lab) lab.textContent = value;
      }
    };
    setVal("seed-input", share.seed);
    setVal("opt-landform", share.landform);
    setVal("opt-extent", share.extent);
    setVal("opt-detail", share.detail);
    setVal("opt-style", share.style);
    setVal("opt-plates", share.plates);
    setVal("opt-sea", share.sea);
  }

  #syncShareUrl() {
    const loc = this.doc.defaultView?.location;
    if (!loc || !this.doc.defaultView?.history?.replaceState) return;
    const qs = serializeShare(this.#shareState());
    const next = `${loc.pathname}${qs}${loc.hash || ""}`;
    if (`${loc.pathname}${loc.search}${loc.hash || ""}` === next) return;
    this.doc.defaultView.history.replaceState(null, "", next);
  }

  /**
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  #askConfirm(message) {
    const dialog = this.#el("confirm-dialog");
    const msg = this.#el("confirm-msg");
    if (msg) msg.textContent = message;
    if (!(dialog instanceof HTMLDialogElement)) {
      return Promise.resolve(this.doc.defaultView?.confirm(message) !== false);
    }
    return new Promise((resolve) => {
      this._confirmDone = resolve;
      try {
        dialog.showModal();
      } catch {
        resolve(this.doc.defaultView?.confirm(message) !== false);
      }
    });
  }

  #openHelp() {
    const d = this.#el("help-dialog");
    if (d instanceof HTMLDialogElement) {
      try {
        if (!d.open) d.showModal();
        return;
      } catch {
        /* some embedded browsers reject showModal */
      }
    }
    if (d instanceof HTMLElement) {
      d.setAttribute("open", "");
      d.classList.add("open");
    }
  }

  #closeHelp() {
    const d = this.#el("help-dialog");
    if (d instanceof HTMLDialogElement) {
      try {
        d.close();
      } catch {
        /* ignore */
      }
    }
    if (d instanceof HTMLElement) {
      d.removeAttribute("open");
      d.classList.remove("open");
    }
  }

  #syncTitle() {
    const name = this.world?.meta.mapName || this.world?.meta.seed;
    this.doc.title = name ? `${name} · 幻想世界地图生成器` : "幻想世界地图生成器";
  }

  /** @param {number} cellId */
  #setStatus(cellId) {
    const el = this.#el("map-status");
    if (!(el instanceof HTMLElement) || !this.world) return;
    if (cellId < 0) {
      const sum = summarizeWorld(this.world);
      el.textContent = `${this.world.meta.mapName || this.world.meta.seed} · ${landformLabel(this.world.meta.landform)} · 陆地 ${sum.land} · 聚落 ${sum.settlements}`;
      return;
    }
    const c = this.world.cells[cellId];
    if (!c) return;
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const cult = c.cultureId >= 0 ? this.world.cultures?.[c.cultureId] : null;
    const realm = c.regionId >= 0 ? this.world.regions[c.regionId] : null;
    const rel = c.religionId >= 0 ? this.world.religions?.[c.religionId] : null;
    const feat = c.featureId >= 0 ? this.world.features?.[c.featureId] : null;
    const bits = [
      `#${c.id}`,
      `海拔 ${c.height.toFixed(2)}`,
      BIOME_LABELS[c.biome] || c.biome,
      feat?.name,
      cult?.name,
      realm?.name,
      rel?.name,
      town?.name,
    ].filter(Boolean);
    el.textContent = bits.join(" · ");
  }

  #fillSlotSelect() {
    const sel = this.#el("opt-slot");
    if (!(sel instanceof HTMLSelectElement)) return;
    const meta = listSlotMeta();
    const current = sel.value;
    sel.innerHTML = meta
      .map((row, i) => {
        const label = row.empty ? `槽位 ${i + 1}（空）` : `槽位 ${i + 1} · ${row.mapName || row.seed}`;
        return `<option value="${i}">${escapeHtml(label)}</option>`;
      })
      .join("");
    if (current && Number(current) < SLOT_COUNT) sel.value = current;
  }

  async #saveToSlot() {
    if (!this.world) return;
    const sel = this.#el("opt-slot");
    const index = Number(sel instanceof HTMLSelectElement ? sel.value : 0);
    const ok = await saveSlot(index, this.world);
    this.#fillSlotSelect();
    this.#toast(ok ? `已写入槽位 ${index + 1}。` : "槽位写入失败：本机存储已满。", !ok);
  }

  async #loadFromSlot() {
    const sel = this.#el("opt-slot");
    const index = Number(sel instanceof HTMLSelectElement ? sel.value : 0);
    const w = await loadSlot(index);
    if (!w) {
      this.#toast(`槽位 ${index + 1} 是空的。`, true);
      return;
    }
    try {
      this.#applyWorld(parseWorld(w), { fit: true });
      this.#toast(`已读出槽位 ${index + 1}。`);
    } catch (err) {
      this.#toast(err instanceof Error ? err.message : "槽位无法读取。", true);
    }
  }

  /**
   * @param {string} msg
   * @param {boolean} [danger]
   */
  #toast(msg, danger) {
    const el = this.#el("toast");
    if (!(el instanceof HTMLElement)) return;
    el.hidden = false;
    el.textContent = msg;
    el.style.borderColor = danger ? "#a33b24" : "";
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      el.hidden = true;
    }, 6400);
  }

  /**
   * @param {boolean} on
   * @param {string} [msg]
   */
  #setLoading(on, msg) {
    const el = this.#el("loading");
    const text = this.#el("loading-msg");
    if (el instanceof HTMLElement) el.hidden = !on;
    if (on && msg) {
      if (text) text.textContent = msg;
      else if (el) el.textContent = msg;
    }
    const stages = this.#el("loading-stages");
    if (stages instanceof HTMLElement) {
      const active = Object.entries(STAGE_LABELS).find(([, label]) => label === msg)?.[0];
      stages.querySelectorAll("li").forEach((li) => {
        const stage = li.getAttribute("data-stage");
        if (on && stage && (stage === active || (msg && STAGE_LABELS[stage] === msg))) {
          li.setAttribute("aria-current", "step");
        } else {
          li.removeAttribute("aria-current");
        }
      });
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
