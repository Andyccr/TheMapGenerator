/**
 * On-map style select and layer details. Native controls in index.html are the
 * source of truth; this module only closes the layer popover when the pointer
 * leaves the dock.
 */
export function mountViewDock(app) {
  const dock = app.el("view-dock");
  const layers = app.el("dock-layers");
  if (!(dock instanceof HTMLElement) || !(layers instanceof HTMLDetailsElement)) return;
  app.doc.addEventListener("pointerdown", (ev) => {
    if (!layers.open) return;
    if (ev.target instanceof Node && dock.contains(ev.target)) return;
    layers.open = false;
  });
}

/** @param {import("./app.js").App} _app */
export function syncViewDock(_app) {
  /* Style and layer inputs are the live state; nothing else to mirror. */
}
