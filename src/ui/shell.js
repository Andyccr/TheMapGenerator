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
/** Tools that actually read `ctx.brush`. River carve does not. */
export const BRUSH_TOOLS = ["raise", "lower", "stamp", "paint"];

/** @type {Readonly<Record<string, string>>} */
export const TOOL_LABELS = {
  pan: "平移",
  raise: "抬升",
  lower: "降低",
  paint: "涂色",
  burg: "建城",
  erase: "擦除",
  stamp: "印戳",
  river: "河流",
  road: "连路",
  marker: "地标",
  move: "移动",
  rename: "命名",
  measure: "测距",
  journey: "行程",
};

/**
 * Option cards belong on tools that have settings. Pan must not cover the map.
 * @param {string} toolId
 */
export function toolHasOptions(toolId) {
  return BRUSH_TOOLS.includes(toolId) || toolId === "marker" || toolId === "journey";
}

/**
 * Overflow list is a picker. It must not stay open while you draw.
 * @param {string} [_toolId]
 */
export function shouldKeepOverflowOpen(_toolId) {
  return false;
}

/**
 * @param {string} toolId
 * @param {string} [fallback]
 */
export function overflowLabel(toolId, fallback = "更多") {
  return MORE_TOOLS.includes(toolId) ? TOOL_LABELS[toolId] || fallback : fallback;
}

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
    more.open = shouldKeepOverflowOpen(toolId);
    more.classList.toggle("active", MORE_TOOLS.includes(toolId));
    const sum = more.querySelector("summary");
    if (sum) {
      sum.textContent = overflowLabel(toolId);
      sum.setAttribute("title", MORE_TOOLS.includes(toolId) ? "换一件更多里的工具" : "更多工具");
    }
  }
  const hasOpts = toolHasOptions(toolId);
  const hint = doc.getElementById("tool-hint");
  if (hint instanceof HTMLElement) hint.hidden = !hasOpts || !(hint.textContent || "").trim();
  const ctx = doc.getElementById("tool-context");
  if (!(ctx instanceof HTMLElement)) return;
  ctx.hidden = !hasOpts;
  const rail = doc.getElementById("tool-rail");
  const active = rail instanceof HTMLElement ? rail.querySelector(`.tool[data-tool="${toolId}"]`) : null;
  const horizontal =
    rail instanceof HTMLElement && rail.ownerDocument.defaultView?.getComputedStyle(rail).flexDirection === "row";
  if (hasOpts && active instanceof HTMLElement && rail instanceof HTMLElement && !horizontal) {
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
 * Hide or show map chrome (rail, status strip, style dock). The 「界面」
 * button itself stays so you can get the controls back.
 * @param {Document} doc
 * @param {boolean} hidden
 */
export function setStageChrome(doc, hidden) {
  const stage = doc.querySelector(".stage");
  const btn = doc.getElementById("btn-chrome");
  if (stage instanceof HTMLElement) stage.classList.toggle("chrome-hidden", hidden);
  if (btn instanceof HTMLButtonElement) {
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    btn.textContent = hidden ? "显示" : "界面";
  }
}

/**
 * @param {Document} doc
 */
export function isStageChromeHidden(doc) {
  const stage = doc.querySelector(".stage");
  return stage instanceof HTMLElement && stage.classList.contains("chrome-hidden");
}

/**
 * One control hides the map chrome (rail, status strip, style dock) so a
 * narrow stage is not a stack of overlapping bars. The button itself stays.
 * @param {Document} doc
 * @param {() => void} [onToggle]
 */
export function bindChromeToggle(doc, onToggle) {
  const btn = doc.getElementById("btn-chrome");
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener("click", () => {
    setStageChrome(doc, !isStageChromeHidden(doc));
    onToggle?.();
  });
}
