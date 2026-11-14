/**
 * UI shell charter. Regions, workshop focus, and which tools stay in the
 * primary rail. No generators — App and bindings call these helpers.
 */

export const SHELL_CHARTER = "生成 → 查看 → 编辑 → 检视";

/** @type {readonly { id: string, job: string }[]} */
export const SHELL_REGIONS = [
  { id: "masthead", job: "identity and generate" },
  { id: "panel-left", job: "workshop: generate and save" },
  { id: "stage", job: "view the map and run tools" },
  { id: "panel-right", job: "search, inspect, roster" },
];

export const PRIMARY_TOOLS = ["pan", "raise", "lower", "paint", "burg", "erase"];
export const MORE_TOOLS = ["stamp", "river", "road", "marker", "move", "rename", "measure", "journey"];
export const BRUSH_TOOLS = ["raise", "lower", "stamp", "paint", "river"];

/**
 * First visit keeps generate open. After a world exists the map is the job,
 * so both workshop steps close.
 * @param {Document} doc
 * @param {{ hasWorld: boolean }} state
 */
let workshopLock = false;

export function focusWorkshop(doc, state) {
  const gen = doc.getElementById("step-generate");
  const save = doc.getElementById("step-save");
  workshopLock = true;
  try {
    if (gen instanceof HTMLDetailsElement) gen.open = !state.hasWorld;
    if (save instanceof HTMLDetailsElement) save.open = false;
  } finally {
    workshopLock = false;
  }
}

/**
 * Only one left-panel step open at a time.
 * @param {Document} doc
 */
export function bindExclusiveSteps(doc) {
  const steps = [...doc.querySelectorAll(".panel-left details.step")];
  for (const step of steps) {
    step.addEventListener("toggle", () => {
      if (workshopLock) return;
      if (!(step instanceof HTMLDetailsElement) || !step.open) return;
      for (const other of steps) {
        if (other !== step && other instanceof HTMLDetailsElement) other.open = false;
      }
    });
  }
}

/**
 * Reveal overflow tools and the floating option card for the active tool.
 * The 更多 summary names the active overflow tool so the rail stays six buttons.
 * @param {Document} doc
 * @param {string} toolId
 */
export function syncToolChrome(doc, toolId) {
  const more = doc.getElementById("tool-rail-more");
  if (more instanceof HTMLDetailsElement) {
    more.open = MORE_TOOLS.includes(toolId);
    const sum = more.querySelector("summary");
    const btn = more.querySelector(`[data-tool="${toolId}"]`);
    if (sum) sum.textContent = btn ? (btn.textContent || "").trim() : "更多";
  }
  const hint = doc.getElementById("tool-hint");
  if (hint instanceof HTMLElement) hint.hidden = !(hint.textContent || "").trim();
  const ctx = doc.getElementById("tool-context");
  if (!(ctx instanceof HTMLElement)) return;
  const visible = [...ctx.children].some((el) => el instanceof HTMLElement && !el.hidden);
  ctx.hidden = !visible;
  const rail = doc.getElementById("tool-rail");
  const active = rail instanceof HTMLElement ? rail.querySelector(`.tool[data-tool="${toolId}"]`) : null;
  const horizontal = rail instanceof HTMLElement && rail.ownerDocument.defaultView?.getComputedStyle(rail).flexDirection === "row";
  if (visible && active instanceof HTMLElement && rail instanceof HTMLElement && !horizontal) {
    ctx.style.top = `${active.getBoundingClientRect().top - rail.getBoundingClientRect().top}px`;
  } else {
    ctx.style.top = "";
  }
}

/**
 * Close the overflow list when the pointer leaves the rail, unless a tool
 * inside it is still being chosen.
 * @param {Document} doc
 */
export function bindToolRail(doc) {
  const more = doc.getElementById("tool-rail-more");
  const rail = doc.getElementById("tool-rail");
  if (!(more instanceof HTMLDetailsElement) || !(rail instanceof HTMLElement)) return;
  doc.addEventListener("pointerdown", (ev) => {
    if (!more.open) return;
    if (ev.target instanceof Node && rail.contains(ev.target)) return;
    more.open = false;
  });
}

/**
 * @param {Document} doc
 */
export function readDualHemisphere(doc) {
  const el = doc.getElementById("opt-dual-hemisphere");
  return el instanceof HTMLInputElement && el.checked;
}

/**
 * @param {Document} doc
 * @param {boolean} on
 */
export function syncDualHemisphere(doc, on) {
  const el = doc.getElementById("opt-dual-hemisphere");
  if (el instanceof HTMLInputElement) el.checked = Boolean(on);
}

/**
 * One control hides the map chrome (rail, status strip, style dock) so a
 * narrow stage is not a stack of overlapping bars. The button itself stays.
 * @param {Document} doc
 * @param {() => void} [onToggle]
 */
export function bindChromeToggle(doc, onToggle) {
  const btn = doc.getElementById("btn-chrome");
  const stage = doc.querySelector(".stage");
  if (!(btn instanceof HTMLButtonElement) || !(stage instanceof HTMLElement)) return;
  btn.addEventListener("click", () => {
    const hidden = stage.classList.toggle("chrome-hidden");
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    btn.textContent = hidden ? "显示" : "界面";
    onToggle?.();
  });
}
