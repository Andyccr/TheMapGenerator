/**
 * Loading overlay and busy-button chrome. App owns job promises.
 */
import { GENERATION_STAGE_LABELS } from "../data/catalogs.js";

const BUSY_BUTTONS = [
  "btn-generate",
  "btn-random",
  "btn-reroll-society",
  "btn-reroll-names",
  "btn-reroll-routes",
  "btn-apply-wind",
  "btn-recipe-apply",
];

/**
 * @param {Document} doc
 * @param {boolean} on
 * @param {string} [msg]
 */
export function setLoadingOverlay(doc, on, msg) {
  const el = doc.getElementById("loading");
  const text = doc.getElementById("loading-msg");
  if (el instanceof HTMLElement) el.hidden = !on;
  if (on && msg) {
    if (text) text.textContent = msg;
    else if (el) el.textContent = msg;
  }
  const stages = doc.getElementById("loading-stages");
  if (!(stages instanceof HTMLElement)) return;
  const active = Object.entries(GENERATION_STAGE_LABELS).find(([, label]) => label === msg)?.[0];
  stages.querySelectorAll("li").forEach((li) => {
    const stage = li.getAttribute("data-stage");
    if (on && stage && (stage === active || (msg && GENERATION_STAGE_LABELS[stage] === msg))) {
      li.setAttribute("aria-current", "step");
    } else {
      li.removeAttribute("aria-current");
    }
  });
}

/**
 * @param {Document} doc
 * @param {boolean} on
 */
export function setBusyChrome(doc, on) {
  for (const id of BUSY_BUTTONS) {
    const btn = doc.getElementById(id);
    if (btn instanceof HTMLButtonElement) btn.disabled = on;
  }
  const app = doc.getElementById("app");
  if (app instanceof HTMLElement) app.setAttribute("aria-busy", on ? "true" : "false");
}
