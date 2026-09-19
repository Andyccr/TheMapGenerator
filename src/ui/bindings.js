/**
 * DOM event wiring for the workshop shell. App owns the methods; this file
 * only attaches listeners. Must not import generators.
 */
import { recipeFor } from "../data/landforms.js";
import { parseWorld } from "../data/worldData.js";
import { landformLabel } from "../data/catalogs.js";
import { estimatePopulation } from "../data/population.js";
import { downloadJson, downloadPng, loadAutosave } from "../persistence/storage.js";
import { defaultStep } from "./recipePanel.js";

/**
 * @param {import("./app.js").App} app
 */
export function bindWorkshop(app) {
  const el = (id) => app.el(id);
  const canvas = /** @type {HTMLCanvasElement} */ (el("map"));

  el("btn-generate")?.addEventListener("click", () => app.generate());
  el("btn-random")?.addEventListener("click", () => {
    app.randomizeSeed();
    app.generate();
  });
  el("opt-plates")?.addEventListener("input", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const val = el("opt-plates-val");
    if (val) val.textContent = t.value;
  });
  el("opt-sea")?.addEventListener("input", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const val = el("opt-sea-val");
    if (val) val.textContent = t.value;
  });
  el("opt-brush")?.addEventListener("input", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const val = el("opt-brush-val");
    if (val) val.textContent = t.value;
  });
  el("opt-style")?.addEventListener("change", (e) => {
    if (!app.world) return;
    app.world.meta.style = /** @type {HTMLSelectElement} */ (e.target).value;
    app.fillLegend();
    app.redraw();
  });
  el("opt-landform")?.addEventListener("change", (e) => {
    const id = /** @type {HTMLSelectElement} */ (e.target).value;
    app.landformSteps = recipeFor(id);
    app.syncRecipeList();
  });
  app.doc.querySelectorAll("[data-add-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const op = String(btn.getAttribute("data-add-step") || "hill");
      if (!app.landformSteps) app.landformSteps = recipeFor(app.currentLandform());
      app.landformSteps.push(defaultStep(op));
      app.syncRecipeList();
    });
  });
  el("btn-recipe-reset")?.addEventListener("click", () => {
    app.landformSteps = recipeFor(app.currentLandform());
    app.syncRecipeList();
  });
  el("btn-recipe-apply")?.addEventListener("click", () => app.applyRecipeToWorld());
  el("btn-apply-wind")?.addEventListener("click", () => app.applyWind());
  el("btn-cancel-job")?.addEventListener("click", () => app.cancelJob());
  el("btn-welcome-quick")?.addEventListener("click", () => app.quickStart());
  el("btn-welcome-examples")?.addEventListener("click", () => {
    app.dialogs.closeWelcome();
    app.dialogs.openExamples();
  });
  el("btn-welcome-settings")?.addEventListener("click", () => {
    app.dialogs.closeWelcome();
    app.generate({ force: true });
  });
  el("btn-empty-generate")?.addEventListener("click", () => app.quickStart());
  el("btn-empty-examples")?.addEventListener("click", () => app.dialogs.openExamples());
  el("opt-paint-layer")?.addEventListener("change", () => {
    app.syncPaintPigment();
    app.matchStyleToPaint();
  });
  el("opt-labels")?.addEventListener("change", (e) => {
    app.labels = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-borders")?.addEventListener("change", (e) => {
    app.borders = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-rivers")?.addEventListener("change", (e) => {
    app.showRivers = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-routes")?.addEventListener("change", (e) => {
    app.showRoutes = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-markers")?.addEventListener("change", (e) => {
    app.showMarkers = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-relief")?.addEventListener("change", (e) => {
    app.showRelief = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });
  el("opt-grid")?.addEventListener("change", (e) => {
    app.grid = /** @type {HTMLInputElement} */ (e.target).checked;
    app.redraw();
  });

  app.doc.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => app.setTool(String(btn.getAttribute("data-tool") || "pan")));
  });

  app.doc.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.doc.querySelectorAll(".tab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      app.rosterKind = String(btn.getAttribute("data-roster") || "settlements");
      app.fillRoster();
    });
  });
  app.doc.querySelectorAll("[data-create]").forEach((btn) => {
    btn.addEventListener("click", () => app.createEntity(String(btn.getAttribute("data-create") || "")));
  });
  el("entity-color")?.addEventListener("change", (e) => {
    if (!app._noteTarget || !app._noteTarget.color) return;
    app.pushUndo();
    app._noteTarget.color = /** @type {HTMLInputElement} */ (e.target).value;
    app.scheduleAutosave();
    app.fillLegend();
    app.redraw();
  });

  el("opt-search")?.addEventListener("input", () => app.fillSearch());
  el("opt-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = el("search-results")?.querySelector("button");
      if (first instanceof HTMLElement) first.click();
    }
  });

  canvas.addEventListener("pointerdown", (ev) => app.onDown(ev));
  canvas.addEventListener("pointermove", (ev) => app.onMove(ev));
  window.addEventListener("pointerup", (ev) => app.onUp(ev));
  canvas.addEventListener(
    "wheel",
    (ev) => {
      if (!app.world) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= rect.height;
      const factor = Math.exp(-dy * 0.0016);
      app.renderer.zoomAt(app.world, factor, ev.clientX - rect.left, ev.clientY - rect.top);
      app.syncZoomReadout();
      if (!app._zoomRaf) {
        app._zoomRaf = requestAnimationFrame(() => {
          app._zoomRaf = 0;
          app.redraw();
        });
      }
    },
    { passive: false },
  );
  canvas.addEventListener("dblclick", (ev) => {
    if (!app.world) return;
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    app.renderer.zoomAt(app.world, ev.shiftKey ? 0.5 : 1.85, ev.clientX - rect.left, ev.clientY - rect.top);
    app.syncZoomReadout();
    app.redraw();
  });
  el("btn-zoom-in")?.addEventListener("click", () => app.zoomButton(1.25));
  el("btn-zoom-out")?.addEventListener("click", () => app.zoomButton(0.8));
  el("btn-zoom-fit")?.addEventListener("click", () => {
    if (!app.world) return;
    app.renderer.fit(app.world);
    app.syncZoomReadout();
    app.redraw();
  });

  el("btn-export-json")?.addEventListener("click", () => {
    if (!app.world) return;
    downloadJson(app.world, `world-${app.world.meta.seed}.json`);
  });
  el("btn-import-json")?.addEventListener("click", () => el("file-import")?.click());
  el("file-import")?.addEventListener("change", async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    if (!file) return;
    await app.importWorldFile(file);
    input.value = "";
  });
  el("btn-export-png")?.addEventListener("click", async () => {
    if (!app.world) return;
    const scaleEl = el("opt-png-scale");
    const scale = Number(scaleEl instanceof HTMLSelectElement ? scaleEl.value : 2);
    const land = landformLabel(app.world.meta.landform);
    try {
      const off = app.renderer.renderExport(app.world, scale, {
        folio: true,
        title: app.world.meta.mapName || app.world.meta.seed,
        subtitle: `种子 ${app.world.meta.seed} · ${land} · ${app.world.meta.width}×${app.world.meta.height}`,
      });
      await downloadPng(off, `world-${app.world.meta.seed}.png`);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "导出 PNG 失败。", true);
    }
  });
  el("btn-undo")?.addEventListener("click", () => app.undo());
  el("btn-redo")?.addEventListener("click", () => app.redo());
  el("btn-autosave")?.addEventListener("click", async () => {
    const w = await loadAutosave();
    if (!w) {
      app.toast("没有找到自动存档。", true);
      return;
    }
    try {
      app.applyWorld(parseWorld(w), { fit: true });
      app.toast("已读取自动存档。");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "自动存档无法读取。", true);
    }
  });
  el("btn-reroll-society")?.addEventListener("click", () => app.reroll("society"));
  el("btn-reroll-names")?.addEventListener("click", () => app.reroll("names"));
  el("btn-reroll-routes")?.addEventListener("click", () => app.reroll("routes"));
  el("btn-help")?.addEventListener("click", () => app.dialogs.openHelp());
  el("btn-examples")?.addEventListener("click", () => app.dialogs.openExamples());
  el("btn-copy-seed")?.addEventListener("click", () => app.copySeed());
  el("btn-copy-link")?.addEventListener("click", () => app.copyLink());
  el("btn-fold-left")?.addEventListener("click", () => app.togglePanel("left"));
  el("btn-fold-right")?.addEventListener("click", () => app.togglePanel("right"));
  el("btn-panel-left")?.addEventListener("click", () => app.togglePanel("left"));
  el("btn-panel-right")?.addEventListener("click", () => app.togglePanel("right"));
  el("btn-save-slot")?.addEventListener("click", () => app.saveToSlot());
  el("btn-load-slot")?.addEventListener("click", () => app.loadFromSlot());
  el("map-name")?.addEventListener("change", (e) => {
    if (!app.world) return;
    app.world.meta.mapName = /** @type {HTMLInputElement} */ (e.target).value.trim();
    app.syncTitle();
    app.scheduleAutosave();
  });
  el("entity-note")?.addEventListener("input", (e) => {
    if (!app._noteTarget) return;
    app._noteTarget.note = /** @type {HTMLTextAreaElement} */ (e.target).value;
    app.scheduleAutosave();
  });
  el("entity-name")?.addEventListener("change", (e) => {
    if (!app._noteTarget || app._noteTarget.name == null) return;
    app.pushUndo();
    app._noteTarget.name = /** @type {HTMLInputElement} */ (e.target).value.trim() || app._noteTarget.name;
    app.scheduleAutosave();
    app.fillRoster();
    app.redraw();
    if (app._inspectCellId >= 0) app.inspect(app._inspectCellId);
  });
  el("opt-cell-biome")?.addEventListener("change", (e) => app.editInspected("biome", /** @type {HTMLSelectElement} */ (e.target).value));
  el("opt-cell-culture")?.addEventListener("change", (e) => app.editInspected("culture", /** @type {HTMLSelectElement} */ (e.target).value));
  el("opt-cell-realm")?.addEventListener("change", (e) => app.editInspected("realm", /** @type {HTMLSelectElement} */ (e.target).value));
  el("opt-cell-province")?.addEventListener("change", (e) => app.editInspected("province", /** @type {HTMLSelectElement} */ (e.target).value));
  el("opt-cell-religion")?.addEventListener("change", (e) => app.editInspected("religion", /** @type {HTMLSelectElement} */ (e.target).value));
  el("opt-burg-type")?.addEventListener("change", (e) => {
    if (!app._burgTarget || !app.world) return;
    app.pushUndo();
    const type = /** @type {HTMLSelectElement} */ (e.target).value;
    app._burgTarget.type = /** @type {"capital"|"city"|"town"|"village"} */ (type);
    const cell = app.world.cells[app._burgTarget.cellId];
    if (cell) app._burgTarget.population = estimatePopulation(cell, app._burgTarget.type);
    app.scheduleAutosave();
    app.fillRoster();
    app.redraw();
    app.inspect(app._burgTarget.cellId);
  });

  window.addEventListener("keydown", (ev) => app.onKey(ev));
  window.addEventListener("beforeunload", (ev) => {
    if (app._busy || app._dirty || app.history.length) {
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
    app.importWorldFile(file);
  });
}
