/**
 * Landform recipe list in the left panel. Algorithms stay in generators;
 * this module only renders the step list and default-step presets.
 */
import { stepSummary } from "../data/catalogs.js";
import { escapeHtml } from "./format.js";

/** @param {string} op */
export function defaultStep(op) {
  if (op === "pit") return { op: "pit", n: 1, rx: 0.08, ry: 0.07, amp: 0.28, jitter: true };
  if (op === "range") return { op: "range", n: 1, rx: 0.22, ry: 0.08, amp: 0.4, jitter: true };
  if (op === "strait") return { op: "strait", amp: 0.55 };
  if (op === "sink") return { op: "sink", amp: 0.12 };
  if (op === "raise") return { op: "raise", amp: 0.08 };
  if (op === "mask") return { op: "mask", edge: 0.12, amp: 2 };
  return { op: "hill", n: 1, rx: 0.12, ry: 0.1, amp: 0.35, jitter: true };
}

/**
 * @param {HTMLElement | null} list
 * @param {{ op: string, n?: number|number[], amp?: number|number[] }[]} steps
 * @param {(index: number) => void} onDrop
 */
export function renderRecipeList(list, steps, onDrop) {
  if (!list) return;
  if (!steps.length) {
    list.innerHTML = `<li class="empty">无额外步骤（纯板块轮廓）</li>`;
    return;
  }
  list.innerHTML = steps
    .map(
      (step, i) =>
        `<li><span>${escapeHtml(stepSummary(step))}</span><button type="button" data-drop-step="${i}">删</button></li>`,
    )
    .join("");
  list.querySelectorAll("[data-drop-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onDrop(Number(btn.getAttribute("data-drop-step")));
    });
  });
}
