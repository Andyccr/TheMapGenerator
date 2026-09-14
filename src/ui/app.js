/**
 * App controller. Wires the four layers together and owns the camera, undo
 * stack, and UI chrome. Dialogs, inspect HTML, and recipe list live in sibling
 * modules; this file is the only UI entry that may import generators.
 */
import { MapGenerator } from "../generators/mapGenerator.js";
import { CanvasRenderer } from "../renderers/canvasRenderer.js";
import { createTools } from "../editors/tools.js";
import { cloneWorld, parseWorld, summarizeWorld } from "../data/worldData.js";
import { saveAutosave, loadAutosave, downloadJson, downloadPng, readJsonFile, peekAutosave, saveSlot, loadSlot, listSlotMeta, SLOT_COUNT } from "../persistence/storage.js";
import { BIOME_LABELS, SETTLEMENT_TYPE_LABELS, landformLabel } from "../data/catalogs.js";
import { recipeFor, parseRecipe, applyStepsOnly } from "../generators/landforms.js";
import { estimatePopulation } from "../generators/civilization.js";
import { setStance } from "../data/diplomacy.js";
import { APP_VERSION } from "../core/version.js";
import { runGeneratorJob, STAGE_LABELS, isJobCancelled } from "./generateClient.js";
import { parseShare, serializeShare, shareHasSeed } from "./share.js";
import { EXAMPLE_WORLDS } from "./examples.js";
import { PAINT_LAYERS, paintCell } from "../editors/paint.js";
import { createCulture, createReligion, createRealm } from "../editors/entities.js";
import { makeRng } from "../generators/rng.js";
import { escapeHtml, overviewInspectHtml, cellInspectHtml, rosterItems, searchHits, rosterListHtml } from "./format.js";
import { FolioDialogs } from "./dialogs.js";
import { fillCellEdit, fillDiploEdit, fillRouteEdit, syncPaintPigment } from "./inspectPanel.js";
import { defaultStep, renderRecipeList } from "./recipePanel.js";

const SETTLEMENT_TYPE = SETTLEMENT_TYPE_LABELS;

const TOOL_KEYS = {
  v: "pan",
  r: "raise",
  f: "lower",
  t: "stamp",
  p: "paint",
  i: "river",
  l: "road",
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
    this._inspectCellId = -1;
    this.dialogs = new FolioDialogs(doc);
    this.landformSteps = null;
    this._busy = false;
    /** @type {(Promise<import("../types.js").WorldData> & { cancel?: () => void }) | null} */
    this._job = null;
    this._dirty = false;
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
    this.#syncRecipeList();
    this.#syncPaintPigment();
    this.#setTool(this.toolId);
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
        /* corrupt autosave — offer a fresh start */
      }
    }
    this.#syncEmptyStage();
    this.dialogs.openWelcome();
  }

  /**
   * @param {{ force?: boolean }} [opts]
   */
  async generate(opts = {}) {
    if (this._busy) {
      this.#toast("正在处理上一件工作。", true);
      return;
    }
    if (this.world && !opts.force) {
      const ok = await this.dialogs.askConfirm("生成会替换当前世界。未导出的修改会丢掉。继续？", "继续生成");
      if (!ok) return;
    }
    this.dialogs.closeWelcome();
    this.#setBusy(true, "正在生成世界…范围越大、格网越密，可能需要数秒。");
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
      const steps = this.landformSteps;
      const world = await this.#awaitJob(
        runGeneratorJob(
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
              landformSteps: steps || undefined,
            },
          },
          (stage) => this.#setLoading(true, STAGE_LABELS[stage] || "正在生成世界…"),
        ),
      );
      if (!world) return;
      const styleEl = this.#el("opt-style");
      world.meta.style = styleEl instanceof HTMLSelectElement ? styleEl.value : "atlas";
      this.#applyWorld(world, { fit: true });
      this.#toast(`已生成「${world.meta.mapName || seed}」`);
    } catch (err) {
      if (!isJobCancelled(err)) this.#toast(err instanceof Error ? err.message : "生成失败。", true);
    } finally {
      this.#setBusy(false);
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
    const windEl = this.#el("opt-wind");
    if (windEl instanceof HTMLSelectElement && world.meta.wind) {
      const key = `${world.meta.wind.x},${world.meta.wind.y}`;
      if ([...windEl.options].some((o) => o.value === key)) windEl.value = key;
    }
    if (Array.isArray(world.meta.landformSteps)) {
      this.landformSteps = parseRecipe(world.meta.landformSteps) || [];
    } else {
      this.landformSteps = recipeFor(world.meta.landform || "continents");
    }
    this.#syncRecipeList();
    this.#syncTitle();
    this.#syncShareUrl();
    this.redraw();
    this.#scheduleAutosave();
    this.#inspect(-1);
    this.#fillLegend();
    this.#fillRoster();
    this.#syncPaintPigment();
    this.#syncZoomReadout();
    this.#setStatus(-1);
    this._dirty = false;
    this.#syncEmptyStage();
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
      highlightCell: this.#highlightCell(),
      draftPath: draft,
      measure: this.measure,
    });
  }

  #bind() {
    this.dialogs.bind();
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
    this.#el("opt-landform")?.addEventListener("change", (e) => {
      const id = /** @type {HTMLSelectElement} */ (e.target).value;
      this.landformSteps = recipeFor(id);
      this.#syncRecipeList();
    });
    this.doc.querySelectorAll("[data-add-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const op = String(btn.getAttribute("data-add-step") || "hill");
        if (!this.landformSteps) this.landformSteps = recipeFor(this.#currentLandform());
        this.landformSteps.push(defaultStep(op));
        this.#syncRecipeList();
      });
    });
    this.#el("btn-recipe-reset")?.addEventListener("click", () => {
      this.landformSteps = recipeFor(this.#currentLandform());
      this.#syncRecipeList();
    });
    this.#el("btn-recipe-apply")?.addEventListener("click", () => this.#applyRecipeToWorld());
    this.#el("btn-apply-wind")?.addEventListener("click", () => this.#applyWind());
    this.#el("btn-cancel-job")?.addEventListener("click", () => this.#cancelJob());
    this.#el("btn-welcome-quick")?.addEventListener("click", () => this.#quickStart());
    this.#el("btn-welcome-examples")?.addEventListener("click", () => {
      this.dialogs.closeWelcome();
      this.dialogs.openExamples();
    });
    this.#el("btn-welcome-settings")?.addEventListener("click", () => {
      this.dialogs.closeWelcome();
      this.generate({ force: true });
    });
    this.#el("btn-empty-generate")?.addEventListener("click", () => this.#quickStart());
    this.#el("btn-empty-examples")?.addEventListener("click", () => this.dialogs.openExamples());
    this.#el("opt-paint-layer")?.addEventListener("change", () => {
      this.#syncPaintPigment();
      this.#matchStyleToPaint();
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
        this.doc.querySelectorAll(".tab").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        this.rosterKind = String(btn.getAttribute("data-roster") || "settlements");
        this.#fillRoster();
      });
    });
    this.doc.querySelectorAll("[data-create]").forEach((btn) => {
      btn.addEventListener("click", () => this.#createEntity(String(btn.getAttribute("data-create") || "")));
    });
    this.#el("entity-color")?.addEventListener("change", (e) => {
      if (!this._noteTarget || !this._noteTarget.color) return;
      this.#pushUndo();
      this._noteTarget.color = /** @type {HTMLInputElement} */ (e.target).value;
      this.#scheduleAutosave();
      this.#fillLegend();
      this.redraw();
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
      await this.#importWorldFile(file);
      input.value = "";
    });
    this.#el("btn-export-png")?.addEventListener("click", async () => {
      if (!this.world) return;
      const scaleEl = this.#el("opt-png-scale");
      const scale = Number(scaleEl instanceof HTMLSelectElement ? scaleEl.value : 2);
      const land = landformLabel(this.world.meta.landform);
      try {
        const off = this.renderer.renderExport(this.world, scale, {
          folio: true,
          title: this.world.meta.mapName || this.world.meta.seed,
          subtitle: `种子 ${this.world.meta.seed} · ${land} · ${this.world.meta.width}×${this.world.meta.height}`,
        });
        await downloadPng(off, `world-${this.world.meta.seed}.png`);
      } catch (err) {
        this.#toast(err instanceof Error ? err.message : "导出 PNG 失败。", true);
      }
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
    this.#el("btn-help")?.addEventListener("click", () => this.dialogs.openHelp());
    this.#el("btn-examples")?.addEventListener("click", () => this.dialogs.openExamples());
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
    this.#el("entity-name")?.addEventListener("change", (e) => {
      if (!this._noteTarget || this._noteTarget.name == null) return;
      this.#pushUndo();
      this._noteTarget.name = /** @type {HTMLInputElement} */ (e.target).value.trim() || this._noteTarget.name;
      this.#scheduleAutosave();
      this.#fillRoster();
      this.redraw();
      if (this._inspectCellId >= 0) this.#inspect(this._inspectCellId);
    });
    this.#el("opt-cell-biome")?.addEventListener("change", (e) => this.#editInspected("biome", /** @type {HTMLSelectElement} */ (e.target).value));
    this.#el("opt-cell-culture")?.addEventListener("change", (e) => this.#editInspected("culture", /** @type {HTMLSelectElement} */ (e.target).value));
    this.#el("opt-cell-realm")?.addEventListener("change", (e) => this.#editInspected("realm", /** @type {HTMLSelectElement} */ (e.target).value));
    this.#el("opt-cell-province")?.addEventListener("change", (e) => this.#editInspected("province", /** @type {HTMLSelectElement} */ (e.target).value));
    this.#el("opt-cell-religion")?.addEventListener("change", (e) => this.#editInspected("religion", /** @type {HTMLSelectElement} */ (e.target).value));
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

    window.addEventListener("keydown", (ev) => this.#onKey(ev));
    window.addEventListener("beforeunload", (ev) => {
      if (this._busy || this._dirty || this.undo.length) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    });
    const onDragOver = (ev) => {
      if (ev.dataTransfer?.types?.includes("Files")) ev.preventDefault();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", (ev) => {
      const file = ev.dataTransfer?.files?.[0];
      if (!file) return;
      const json = /json$/i.test(file.type) || /\.json$/i.test(file.name);
      if (!json) return;
      ev.preventDefault();
      this.#importWorldFile(file);
    });
  }

  /** @param {string} id */
  #setTool(id) {
    this.toolId = id;
    this.doc.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tool") === id));
    const hint = this.#el("tool-hint");
    if (hint) hint.textContent = this.tools[this.toolId]?.hint || this.tools.pan?.hint || "";
    const canvas = /** @type {HTMLCanvasElement} */ (this.#el("map"));
    canvas.style.cursor = this.toolId === "pan" ? "grab" : "crosshair";
    if (id === "paint") this.#matchStyleToPaint();
  }

  /**
   * @param {"society"|"names"|"routes"} kind
   */
  async #reroll(kind) {
    if (!this.world) return;
    if (this._busy) {
      this.#toast("正在处理上一件工作。", true);
      return;
    }
    this.#pushUndo();
    this.#setBusy(true, kind === "society" ? "正在重掷文明…" : "正在重掷名称与路线…");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      let world = null;
      if (kind === "society") {
        world = await this.#awaitJob(
          runGeneratorJob("society", { world: this.world }, (stage) =>
            this.#setLoading(true, STAGE_LABELS[stage] || "正在重掷文明…"),
          ),
        );
      } else if (kind === "names") {
        world = await this.#awaitJob(runGeneratorJob("names", { world: this.world }));
      } else {
        world = await this.#awaitJob(runGeneratorJob("routes", { world: this.world }));
      }
      if (!world) return;
      this.world = world;
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
      if (!isJobCancelled(err)) this.#toast(err instanceof Error ? err.message : "重掷失败。", true);
    } finally {
      this.#setBusy(false);
    }
  }

  /** @param {KeyboardEvent} ev */
  #onKey(ev) {
    const t = /** @type {HTMLElement} */ (ev.target);
    const typing = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      if (!this.world) return;
      if (ev.shiftKey) {
        downloadJson(this.world, `world-${this.world.meta.seed}.json`);
        this.#toast("已导出 JSON。");
        return;
      }
      this.#flushAutosave();
      return;
    }
    if (ev.key === "/" && !typing) {
      ev.preventDefault();
      const search = this.#el("opt-search");
      if (search instanceof HTMLInputElement) search.focus();
      return;
    }
    if (typing) return;
    if (ev.key === "Escape") {
      if (this._job) {
        ev.preventDefault();
        this.#cancelJob();
        return;
      }
      this.dialogs.closeHelp();
      this.dialogs.closeExamples();
      this.dialogs.closeWelcome();
      this.#el("text-dialog")?.close?.();
      this.#el("confirm-dialog")?.close?.();
      return;
    }
    if (ev.key === "F1" || ev.key === "?") {
      ev.preventDefault();
      this.dialogs.openHelp();
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

    const clickOnce =
      this.toolId === "burg" ||
      this.toolId === "erase" ||
      this.toolId === "marker" ||
      this.toolId === "rename" ||
      this.toolId === "stamp" ||
      this.toolId === "road";
    if (clickOnce) {
      if (this.toolId === "stamp") this.#pushUndo();
      const ctx = this.#editorContext();
      this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "down", shiftKey: ev.shiftKey }, ctx);
      if (this.toolId === "erase") {
        this.#scheduleAutosave();
        this.#fillRoster();
      }
      if (this.toolId === "stamp") {
        this.generator.recomputeFromElevation(this.world);
        this.#scheduleAutosave();
        this.#fillRoster();
        this.#fillLegend();
      }
      this.redraw();
      return;
    }

    if (this.toolId !== "paint") this.#pushUndo();
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
        }
      }
      this.painting = false;
      this.#scheduleAutosave();
      this.#fillRoster();
      this.#fillLegend();
      if (this._inspectCellId >= 0) this.#inspect(this._inspectCellId);
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
    const stampEl = this.#el("opt-stamp-op");
    const stampOp = stampEl instanceof HTMLSelectElement ? stampEl.value : "hill";
    const paintLayerEl = this.#el("opt-paint-layer");
    const paintValueEl = this.#el("opt-paint-value");
    return {
      brush,
      markerType,
      stampOp,
      paintLayer: paintLayerEl instanceof HTMLSelectElement ? paintLayerEl.value : "biome",
      paintValue: paintValueEl instanceof HTMLSelectElement ? paintValueEl.value : "",
      setPaintValue: (v) => {
        const sel = this.#el("opt-paint-value");
        if (sel instanceof HTMLSelectElement) {
          if (v && ![...sel.options].some((o) => o.value === v)) return;
          sel.value = v || "";
        }
      },
      toast: (msg, danger) => this.#toast(msg, danger),
      requestRecompute: () => this.#scheduleRecompute(),
      commit: () => {
        this.#scheduleAutosave();
        this.redraw();
        this.#fillRoster();
        this.#fillLegend();
        if (this._inspectCellId >= 0) this.#inspect(this._inspectCellId);
      },
      promptRename: (s) => {
        this.dialogs.askText("重命名", s.name, (next) => {
          if (!next) return;
          this.#pushUndo();
          s.name = next;
          this.#scheduleAutosave();
          this.redraw();
          this.#fillRoster();
          if (this._inspectCellId >= 0) this.#inspect(this._inspectCellId);
        });
      },
      promptText: (label, fallback) => fallback || "",
      beginEdit: () => this.#pushUndo(),
      askText: (label, fallback, done) => this.dialogs.askText(label, fallback, done),
    };
  }

  #scheduleRecompute() {
    if (this.recomputeTimer) return;
    this.recomputeTimer = window.setTimeout(() => {
      this.recomputeTimer = 0;
      if (this.world && (this.toolId === "raise" || this.toolId === "lower" || this.toolId === "stamp")) {
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
    this._dirty = true;
  }

  #undo() {
    const prev = this.undo.pop();
    if (!prev || !this.world) return;
    this.redo.push(cloneWorld(this.world));
    this.world = prev;
    this.redraw();
    this.#fillLegend();
    this.#fillRoster();
    this.#inspect(this._inspectCellId);
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
    this.#inspect(this._inspectCellId);
    this.#scheduleAutosave();
  }

  #scheduleAutosave() {
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.#setSaveState("保存中…");
    this.autosaveTimer = window.setTimeout(() => this.#flushAutosave(), 400);
  }

  async #flushAutosave() {
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = 0;
    if (!this.world) return;
    const ok = await saveAutosave(this.world);
    this._dirty = !ok;
    this.#setSaveState(ok ? "已自动保存" : "未能保存（本机存储已满）");
    if (!ok) this.#toast("自动存档失败：本机存储已满。请导出 JSON。", true);
  }

  /** @param {number} cellId */
  #inspect(cellId) {
    const box = this.#el("inspector");
    if (!box || !this.world) return;
    if (cellId < 0) {
      this._noteTarget = null;
      this._burgTarget = null;
      this._inspectCellId = -1;
      this.#hideInspect("note-wrap", true);
      this.#hideInspect("name-wrap", true);
      this.#hideInspect("burg-wrap", true);
      this.#hideInspect("cell-edit", true);
      this.#hideInspect("diplo-edit", true);
      this.#hideInspect("color-wrap", true);
      this.#hideInspect("create-edit", true);
      this.#hideInspect("route-edit", true);
      box.innerHTML = overviewInspectHtml(this.world, this.renderer.lodLabel(this.world));
      this.#setStatus(-1);
      return;
    }
    const c = this.world.cells[cellId];
    if (!c) return;
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const realm = c.regionId >= 0 ? this.world.regions[c.regionId] : null;
    const cult = c.cultureId >= 0 ? this.world.cultures?.[c.cultureId] : null;
    const marker = (this.world.markers || []).find((m) => m.cellId === cellId);
    const river = c.riverId >= 0 ? this.world.rivers[c.riverId] : null;
    const province = c.provinceId >= 0 ? this.world.provinces?.[c.provinceId] : null;
    const religion = c.religionId >= 0 ? this.world.religions?.[c.religionId] : null;
    const feat = c.featureId >= 0 ? this.world.features?.[c.featureId] : null;
    this._inspectCellId = cellId;
    this._noteTarget = town || marker || province || realm || cult || religion || feat || river || null;
    this._burgTarget = town || null;
    const noteEl = this.#el("entity-note");
    if (noteEl instanceof HTMLTextAreaElement) noteEl.value = this._noteTarget?.note || "";
    this.#hideInspect("note-wrap", !this._noteTarget);
    const nameEl = this.#el("entity-name");
    const named = Boolean(this._noteTarget && this._noteTarget.name != null);
    this.#hideInspect("name-wrap", !named);
    if (named && nameEl instanceof HTMLInputElement) nameEl.value = this._noteTarget.name || "";
    const burgType = this.#el("opt-burg-type");
    this.#hideInspect("burg-wrap", !town);
    if (town && burgType instanceof HTMLSelectElement) burgType.value = town.type;
    const hasColor = Boolean(this._noteTarget?.color);
    const colorEl = this.#el("entity-color");
    this.#hideInspect("color-wrap", !hasColor);
    if (hasColor && colorEl instanceof HTMLInputElement) colorEl.value = this._noteTarget.color;
    this.#hideInspect("create-edit", Boolean(c.ocean || c.border));
    fillCellEdit(this.doc, this.world, c);
    fillDiploEdit(this.doc, this.world, realm, (other, stance) => {
      if (!this.world || !realm) return;
      this.#pushUndo();
      if (!this.world.diplomacy) this.world.diplomacy = [];
      setStance(this.world.diplomacy, realm.id, other, stance);
      this.#scheduleAutosave();
      this.#inspect(this._inspectCellId);
    });
    fillRouteEdit(this.doc, this.world, cellId, (id) => {
      if (!this.world) return;
      this.#pushUndo();
      this.world.routes = (this.world.routes || []).filter((r) => r.id !== id);
      this.#scheduleAutosave();
      this.#fillRoster();
      this.#inspect(this._inspectCellId);
      this.redraw();
      this.#toast("已删去这条路。");
    });
    box.innerHTML = cellInspectHtml(this.world, cellId);
    this.#setStatus(cellId);
  }

  /** @param {string} id @param {boolean} hidden */
  #hideInspect(id, hidden) {
    const el = this.#el(id);
    if (el instanceof HTMLElement) el.hidden = hidden;
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
    const items = rosterItems(this.world, this.rosterKind);
    list.innerHTML = rosterListHtml(items);
    list.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this.#flyTo(Number(btn.getAttribute("data-cell"))));
    });
  }

  #fillSearch() {
    const box = this.#el("search-results");
    const input = this.#el("opt-search");
    if (!box || !this.world || !(input instanceof HTMLInputElement)) return;
    const q = input.value.trim();
    if (!q) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = rosterListHtml(searchHits(this.world, q), "没有匹配。");
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
    if (share.landform) {
      this.landformSteps = recipeFor(share.landform);
      this.#syncRecipeList();
    }
  }

  #syncShareUrl() {
    const loc = this.doc.defaultView?.location;
    if (!loc || !this.doc.defaultView?.history?.replaceState) return;
    const qs = serializeShare(this.#shareState());
    const next = `${loc.pathname}${qs}${loc.hash || ""}`;
    if (`${loc.pathname}${loc.search}${loc.hash || ""}` === next) return;
    this.doc.defaultView.history.replaceState(null, "", next);
  }

  #fillExamples() {
    const list = this.#el("example-list");
    if (!list) return;
    list.innerHTML = EXAMPLE_WORLDS.map(
      (ex) =>
        `<li><button type="button" data-example="${escapeHtml(ex.id)}"><strong>${escapeHtml(ex.title)}</strong><span>${escapeHtml(ex.blurb)}</span></button></li>`,
    ).join("");
    list.querySelectorAll("[data-example]").forEach((btn) => {
      btn.addEventListener("click", () => this.#loadExample(String(btn.getAttribute("data-example") || "")));
    });
  }

  /** @param {string} id */
  async #loadExample(id) {
    const ex = EXAMPLE_WORLDS.find((e) => e.id === id);
    if (!ex) return;
    if (this.world) {
      const ok = await this.dialogs.askConfirm("打开范例会替换当前世界。继续？", "打开范例");
      if (!ok) return;
    }
    this.dialogs.closeExamples();
    this.#applyShare(parseShare(ex.query));
    await this.generate({ force: true });
    this.#toast(`已打开范例「${ex.title}」。`);
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
    const meta = listSlotMeta()[index];
    if (meta && !meta.empty) {
      const ok = await this.dialogs.askConfirm(`槽位 ${index + 1} 已有「${meta.mapName || meta.seed}」。覆盖吗？`, "覆盖");
      if (!ok) return;
    }
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

  /**
   * @param {boolean} on
   * @param {string} [msg]
   */
  #setBusy(on, msg) {
    this._busy = on;
    this.#setLoading(on, msg);
    for (const id of ["btn-generate", "btn-random", "btn-reroll-society", "btn-reroll-names", "btn-reroll-routes", "btn-apply-wind", "btn-recipe-apply"]) {
      const btn = this.#el(id);
      if (btn instanceof HTMLButtonElement) btn.disabled = on;
    }
    const app = this.#el("app");
    if (app instanceof HTMLElement) app.setAttribute("aria-busy", on ? "true" : "false");
    this.#syncEmptyStage();
  }

  /**
   * @param {Promise<import("../types.js").WorldData> & { cancel?: () => void }} job
   */
  async #awaitJob(job) {
    this._job = job;
    try {
      return await job;
    } catch (err) {
      if (isJobCancelled(err)) {
        this.#toast("已取消。");
        return null;
      }
      throw err;
    } finally {
      this._job = null;
    }
  }

  #cancelJob() {
    this._job?.cancel?.();
  }

  #syncEmptyStage() {
    const empty = this.#el("stage-empty");
    if (empty instanceof HTMLElement) empty.hidden = Boolean(this.world) || this._busy;
  }

  async #quickStart() {
    this.dialogs.closeWelcome();
    const extent = this.#el("opt-extent");
    const detail = this.#el("opt-detail");
    if (extent instanceof HTMLSelectElement) extent.value = "1920,1200";
    if (detail instanceof HTMLSelectElement) detail.value = "10";
    const seed = this.#el("seed-input");
    if (seed instanceof HTMLInputElement && !seed.value) seed.value = randomSeed();
    await this.generate({ force: true });
  }

  /** @param {File} file */
  async #importWorldFile(file) {
    if (this._busy) {
      this.#toast("正在处理上一件工作。", true);
      return;
    }
    try {
      const raw = await readJsonFile(file);
      this.dialogs.closeWelcome();
      this.#applyWorld(parseWorld(raw), { fit: true });
      this.#toast("存档已导入。");
    } catch (err) {
      this.#toast(err instanceof Error ? err.message : "导入失败。", true);
    }
  }

  #setSaveState(text) {
    const el = this.#el("save-state");
    if (el) el.textContent = text;
  }

  #highlightCell() {
    if (this.toolId === "road") {
      const fromId = /** @type {any} */ (this.tools.road)?.fromId;
      if (fromId != null && this.world) {
        const s = this.world.settlements.find((x) => x.id === fromId);
        if (s) return s.cellId;
      }
    }
    return this.highlight;
  }

  #syncPaintPigment() {
    syncPaintPigment(this.doc, this.world);
  }

  #matchStyleToPaint() {
    const layerEl = this.#el("opt-paint-layer");
    const styleEl = this.#el("opt-style");
    if (!(layerEl instanceof HTMLSelectElement) || !(styleEl instanceof HTMLSelectElement) || !this.world) return;
    const spec = PAINT_LAYERS.find((l) => l.id === layerEl.value);
    if (!spec) return;
    styleEl.value = spec.style;
    this.world.meta.style = spec.style;
    this.#fillLegend();
    this.redraw();
  }

  /**
   * @param {string} layer
   * @param {string} value
   */
  #editInspected(layer, value) {
    if (!this.world || this._inspectCellId < 0) return;
    this.#pushUndo();
    paintCell(this.world, this._inspectCellId, layer, value);
    this.#scheduleAutosave();
    this.#fillLegend();
    this.#fillRoster();
    this.redraw();
    this.#inspect(this._inspectCellId);
  }

  /** @param {string} kind */
  #createEntity(kind) {
    if (!this.world || this._inspectCellId < 0) {
      this.#toast("请先点选一块陆地。", true);
      return;
    }
    const cellId = this._inspectCellId;
    const cell = this.world.cells[cellId];
    if (!cell || cell.ocean) {
      this.#toast("请点在陆地上创建。", true);
      return;
    }
    if (kind === "realm" && !this.world.settlements.some((s) => s.cellId === cellId)) {
      this.#toast("请点在聚落上立国。", true);
      return;
    }
    const titles = { culture: "新文化名称", religion: "新信仰名称", realm: "新国度名称" };
    const fallbacks = { culture: "新族", religion: "新宗", realm: "新国" };
    this.dialogs.askText(titles[kind] || "名称", fallbacks[kind] || "未命名", (name) => {
      if (!name || !this.world) return;
      this.#pushUndo();
      const made =
        kind === "culture"
          ? createCulture(this.world, cellId, name)
          : kind === "religion"
            ? createReligion(this.world, cellId, name)
            : createRealm(this.world, cellId, name);
      if (!made) {
        this.undo.pop();
        this.#toast("无法创建。", true);
        return;
      }
      this.#syncPaintPigment();
      this.#scheduleAutosave();
      this.#fillRoster();
      this.#fillLegend();
      this.#inspect(cellId);
      this.redraw();
      this.#toast(`已创建「${made.name}」。用涂色工具扩张。`);
    });
  }

  async #applyWind() {
    if (!this.world) return;
    if (this._busy) {
      this.#toast("正在处理上一件工作。", true);
      return;
    }
    const windEl = this.#el("opt-wind");
    const raw = windEl instanceof HTMLSelectElement ? windEl.value : "1,0";
    const [wx, wy] = raw.split(",").map(Number);
    this.#pushUndo();
    this.world.meta.wind = { x: Number.isFinite(wx) ? wx : 1, y: Number.isFinite(wy) ? wy : 0 };
    this.#setBusy(true, STAGE_LABELS.climate);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const world = await this.#awaitJob(runGeneratorJob("climate", { world: this.world }));
      if (!world) return;
      this.world = world;
      this.redraw();
      this.#fillLegend();
      this.#fillRoster();
      if (this._inspectCellId >= 0) this.#inspect(this._inspectCellId);
      this.#scheduleAutosave();
      this.#toast("气候已按新风向重算。群系会变，高度与聚落不动。");
    } catch (err) {
      if (!isJobCancelled(err)) this.#toast(err instanceof Error ? err.message : "气候重算失败。", true);
    } finally {
      this.#setBusy(false);
    }
  }

  async #applyRecipeToWorld() {
    if (!this.world) return;
    if (this._busy) {
      this.#toast("正在处理上一件工作。", true);
      return;
    }
    const steps = this.landformSteps || [];
    if (!steps.length) {
      this.#toast("没有可应用的陆形步骤。", true);
      return;
    }
    this.#pushUndo();
    this.#setBusy(true, "正在把陆形步骤盖到当前图上…");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      applyStepsOnly(
        this.world.cells,
        makeRng(`${this.world.meta.seed}:recipe-apply`),
        this.world.meta.width,
        this.world.meta.height,
        steps,
      );
      const world = await this.#awaitJob(
        runGeneratorJob("recompute", { world: this.world }, (stage) =>
          this.#setLoading(true, STAGE_LABELS[stage] || "正在把陆形步骤盖到当前图上…"),
        ),
      );
      if (!world) return;
      this.world = world;
      this.redraw();
      this.#fillLegend();
      this.#fillRoster();
      this.#inspect(this._inspectCellId >= 0 ? this._inspectCellId : -1);
      this.#scheduleAutosave();
      this.#toast(`已应用 ${steps.length} 步陆形并重算河流。手绘商路与地标会留下。`);
    } catch (err) {
      if (!isJobCancelled(err)) this.#toast(err instanceof Error ? err.message : "应用陆形失败。", true);
    } finally {
      this.#setBusy(false);
    }
  }

  #currentLandform() {
    const el = this.#el("opt-landform");
    return el instanceof HTMLSelectElement ? el.value : "continents";
  }

  #syncRecipeList() {
    const steps = this.landformSteps || recipeFor(this.#currentLandform());
    this.landformSteps = steps;
    renderRecipeList(this.#el("landform-recipe"), steps, (i) => {
      if (!this.landformSteps) return;
      this.landformSteps.splice(i, 1);
      this.#syncRecipeList();
    });
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
