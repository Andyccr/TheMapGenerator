/**
 * On-map style and view-effect controls. They drive the same inputs as the
 * sidebar, so share links, paint matching, and export stay on one state.
 */
import { STYLE_CHOICES } from "../data/catalogs.js";

/** @type {readonly [string, string][]} */
const EFFECTS = [
  ["opt-labels", "地名"],
  ["opt-borders", "国境"],
  ["opt-rivers", "河流"],
  ["opt-routes", "商路"],
  ["opt-journeys", "行程"],
  ["opt-markers", "地标"],
  ["opt-relief", "山纹"],
  ["opt-grid", "经纬"],
  ["opt-shade", "晕渲"],
  ["opt-contours", "等高"],
  ["opt-vignette", "暗角"],
  ["opt-mesh", "格界"],
];

/**
 * @param {import("./app.js").App} app
 */
export function mountViewDock(app) {
  const styleRow = app.el("style-picks");
  const effectRow = app.el("effect-picks");
  if (!(styleRow instanceof HTMLElement) || !(effectRow instanceof HTMLElement)) return;

  let group = "";
  for (const choice of STYLE_CHOICES) {
    if (choice.group !== group) {
      group = choice.group;
      const label = app.doc.createElement("span");
      label.className = "pick-group";
      label.textContent = group;
      styleRow.appendChild(label);
    }
    const btn = app.doc.createElement("button");
    btn.type = "button";
    btn.className = "pick";
    btn.dataset.style = choice.id;
    btn.textContent = choice.label;
    btn.title = choice.label;
    btn.addEventListener("click", () => {
      const select = app.el("opt-style");
      if (!(select instanceof HTMLSelectElement)) return;
      select.value = choice.id;
      select.dispatchEvent(new Event("change"));
      syncViewDock(app);
    });
    styleRow.appendChild(btn);
  }

  for (const [id, label] of EFFECTS) {
    const btn = app.doc.createElement("button");
    btn.type = "button";
    btn.className = "pick";
    btn.dataset.effect = id;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const input = app.el(id);
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
      syncViewDock(app);
    });
    effectRow.appendChild(btn);
  }

  app.el("opt-style")?.addEventListener("change", () => syncViewDock(app));
  for (const [id] of EFFECTS) {
    app.el(id)?.addEventListener("change", () => syncViewDock(app));
  }
  syncViewDock(app);
}

/** @param {import("./app.js").App} app */
export function syncViewDock(app) {
  const select = app.el("opt-style");
  const current = select instanceof HTMLSelectElement ? select.value : "atlas";
  app.doc.querySelectorAll("#style-picks .pick").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    const on = btn.dataset.style === current;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  app.doc.querySelectorAll("#effect-picks .pick").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    const input = app.el(btn.dataset.effect || "");
    const on = input instanceof HTMLInputElement && input.checked;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
