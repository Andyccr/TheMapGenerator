/**
 * Place or remove map markers. Types and glyphs live in catalogs.
 */

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 * @param {string} type
 * @param {string} name
 */
export function addMarker(world, cellId, type, name) {
  const cell = world.cells[cellId];
  if (!cell || cell.ocean) return null;
  if (!world.markers) world.markers = [];
  if (world.markers.some((m) => m.cellId === cellId)) return null;
  const id = world.markers.reduce((m, x) => Math.max(m, x.id), -1) + 1;
  const marker = { id, cellId, type, name, note: "" };
  world.markers.push(marker);
  return marker;
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {number} cellId
 */
export function removeMarkersAt(world, cellId) {
  const before = world.markers?.length || 0;
  world.markers = (world.markers || []).filter((m) => m.cellId !== cellId);
  return before - (world.markers.length || 0);
}
