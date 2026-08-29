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

const HINTS = {
  pan: "Drag to pan. Scroll to zoom. Click a cell to inspect it.",
  raise: "Paint to raise land and grow mountain ridges. Hydrology updates as you paint.",
  lower: "Paint to sink valleys or open seas. Hydrology updates as you paint.",
  river: "Click-drag from highland toward the sea. The channel is forced downhill.",
  move: "Drag a town onto another land cell. Towns cannot sit in the ocean.",
  rename: "Click a settlement to rename it. Names live in the JSON save.",
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

  generate() {
    const seedEl = this.#el("seed-input");
    const detailEl = this.#el("opt-detail");
    const platesEl = this.#el("opt-plates");
    const seaEl = this.#el("opt-sea");
    const windEl = this.#el("opt-wind");
    const seed = seedEl instanceof HTMLInputElement ? seedEl.value.trim() || randomSeed() : randomSeed();
    if (seedEl instanceof HTMLInputElement) seedEl.value = seed;
    const cellSize = Number(detailEl instanceof HTMLSelectElement ? detailEl.value : 18);
    const plateCount = Number(platesEl instanceof HTMLInputElement ? platesEl.value : 10);
    const seaLevel = Number(seaEl instanceof HTMLInputElement ? seaEl.value : 0);
    const windRaw = windEl instanceof HTMLSelectElement ? windEl.value : "1,0";
    const [wx, wy] = windRaw.split(",").map(Number);
    const world = this.generator.generate({
      seed,
      cellSize,
      plateCount,
      seaLevel,
      wind: { x: wx, y: wy },
    });
    const styleEl = this.#el("opt-style");
    world.meta.style = styleEl instanceof HTMLSelectElement ? styleEl.value : "atlas";
    this.world = world;
    this.undo = [];
    this.renderer.resize();
    this.renderer.fit(world);
    this.redraw();
    this.#scheduleAutosave();
    this.#inspect(-1);
  }

  redraw() {
    if (!this.world) return;
    const draft =
      this.toolId === "river" ? /** @type {any} */ (this.tools.river).path || [] : [];
    this.renderer.draw(this.world, {
      labels: this.labels,
      borders: this.borders,
      grid: this.grid,
      highlightCell: this.highlight,
      draftPath: draft,
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
    this.#el("opt-grid")?.addEventListener("change", (e) => {
      this.grid = /** @type {HTMLInputElement} */ (e.target).checked;
      this.redraw();
    });

    this.doc.querySelectorAll(".tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.doc.querySelectorAll(".tool").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.toolId = String(btn.getAttribute("data-tool") || "pan");
        const hint = this.#el("tool-hint");
        if (hint) hint.textContent = HINTS[this.toolId] || HINTS.pan;
        canvas.style.cursor = this.toolId === "pan" ? "grab" : "crosshair";
      });
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
        const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.renderer.zoomAt(this.world, factor, ev.clientX - rect.left, ev.clientY - rect.top);
        this.redraw();
      },
      { passive: false },
    );

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
        this.renderer.resize();
        this.renderer.fit(this.world);
        this.redraw();
        const seed = this.#el("seed-input");
        if (seed instanceof HTMLInputElement) seed.value = this.world.meta.seed;
      } catch (err) {
        alert(err instanceof Error ? err.message : "Import failed.");
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
    this.#el("btn-autosave")?.addEventListener("click", () => {
      const w = loadLocal();
      if (!w) {
        alert("No autosave found.");
        return;
      }
      try {
        this.world = parseWorld(w);
        this.renderer.fit(this.world);
        this.redraw();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Autosave is unreadable.");
      }
    });
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

    this.#pushUndo();
    this.painting = true;
    const ctx = this.#editorContext();
    this.tools[this.toolId]?.apply(this.world, { worldX, worldY, cellId, phase: "down", shiftKey: ev.shiftKey }, ctx);
    if (this.toolId === "raise" || this.toolId === "lower") this.#scheduleRecompute();
    this.redraw();
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
    return {
      brush,
      requestRecompute: () => this.#scheduleRecompute(),
      commit: () => {},
      promptRename: (s) => {
        const next = window.prompt("Rename settlement", s.name);
        if (next && next.trim()) {
          s.name = next.trim();
          this.#scheduleAutosave();
          this.redraw();
        }
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
    if (this.undo.length > 16) this.undo.shift();
  }

  #undo() {
    const prev = this.undo.pop();
    if (!prev) return;
    this.world = prev;
    this.redraw();
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
      box.innerHTML = `
        <dt>Seed</dt><dd>${escapeHtml(this.world.meta.seed)}</dd>
        <dt>Cells</dt><dd>${sum.cells} · land ${sum.land} · ocean ${sum.ocean}</dd>
        <dt>Rivers</dt><dd>${sum.rivers}</dd>
        <dt>Settlements</dt><dd>${sum.settlements}</dd>
        <dt>Realms</dt><dd>${sum.regions}</dd>`;
      return;
    }
    const c = this.world.cells[cellId];
    const town = this.world.settlements.find((s) => s.cellId === cellId);
    const realm = c.regionId >= 0 ? this.world.regions[c.regionId] : null;
    box.innerHTML = `
      <dt>Cell</dt><dd>#${c.id}</dd>
      <dt>Height</dt><dd>${c.height.toFixed(2)}</dd>
      <dt>Biome</dt><dd>${escapeHtml(c.biome)}</dd>
      <dt>Moisture</dt><dd>${c.moisture.toFixed(2)}</dd>
      <dt>Temperature</dt><dd>${c.temperature.toFixed(2)}</dd>
      <dt>Flux</dt><dd>${c.flux.toFixed(1)}</dd>
      <dt>Flags</dt><dd>${[
        c.ocean && "ocean",
        c.lake && "lake",
        c.coast && "coast",
        c.mountain && "mountain",
        c.riverId >= 0 && "river",
      ]
        .filter(Boolean)
        .join(" · ") || "—"}</dd>
      <dt>Realm</dt><dd>${realm ? escapeHtml(realm.name) : "—"}</dd>
      <dt>Town</dt><dd>${town ? escapeHtml(town.name + " (" + town.type + ")") : "—"}</dd>`;
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
    card.hidden = false;
    card.style.left = `${x + 14}px`;
    card.style.top = `${y + 14}px`;
    card.textContent = town ? `${town.name} · ${c.biome}` : c.biome.replaceAll("_", " ");
    this.#inspect(cellId);
  }

  #fillLegend() {
    const list = this.#el("biome-legend");
    if (!list) return;
    list.innerHTML = this.renderer
      .legendItems()
      .map(
        (item) =>
          `<li><span class="swatch" style="background:${item.color}"></span>${escapeHtml(item.label)}</li>`,
      )
      .join("");
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
