/**
 * Named geographic features: continents, islands, lakes, seas.
 * Flood-fill connected components after hydrology so names track the land.
 */

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {(cultureId: number) => { realm: () => string, river: () => string, feature: () => string }} mills
 * @param {{ width?: number, height?: number }} [extent]
 */
export function placeFeatures(cells, mills, extent = {}) {
  for (const c of cells) c.featureId = -1;
  /** @type {import("../types.js").GeoFeature[]} */
  const features = [];
  const seen = new Uint8Array(cells.length);
  const landMin = Math.max(18, Math.round(cells.length * 0.002));
  const continentMin = Math.max(80, Math.round(cells.length * 0.045));

  const lakeMin = Math.max(8, Math.round(cells.length * 0.001));
  for (const start of cells) {
    if (seen[start.id] || start.ocean || !start.lake) continue;
    const ids = flood(cells, start.id, seen, (c) => c.lake && !c.ocean);
    if (ids.length < lakeMin) {
      for (const id of ids) cells[id].featureId = -1;
      continue;
    }
    pushFeature(cells, features, mills, ids, "lake");
  }

  for (const start of cells) {
    if (seen[start.id] || start.ocean || start.lake) continue;
    const ids = flood(cells, start.id, seen, (c) => !c.ocean && !c.lake);
    const type = ids.length >= continentMin ? "continent" : "island";
    if (type === "island" && ids.length < landMin) {
      for (const id of ids) cells[id].featureId = -1;
      continue;
    }
    pushFeature(cells, features, mills, ids, type);
  }

  const seaMin = Math.max(40, Math.round(cells.length * 0.03));
  for (const start of cells) {
    if (seen[start.id] || !start.ocean) continue;
    const ids = flood(cells, start.id, seen, (c) => c.ocean);
    if (ids.length < seaMin) continue;
    const originId = ids[(ids.length / 2) | 0];
    const mill = mills(-1);
    const enclosed = ids.every((id) => {
      const c = cells[id];
      return c.x > (extent.width || 0) * 0.08 && c.x < (extent.width || 1) * 0.92;
    });
    const name = enclosed && ids.length < cells.length * 0.35 ? `${mill.feature()}海` : `${mill.realm()}洋`;
    let sx = 0;
    let sy = 0;
    for (const id0 of ids) {
      sx += cells[id0].x;
      sy += cells[id0].y;
    }
    const id = features.length;
    features.push({
      id,
      name,
      type: "sea",
      size: ids.length,
      originId,
      cx: sx / ids.length,
      cy: sy / ids.length,
      note: "",
    });
    for (const cid0 of ids) cells[cid0].featureId = id;
  }

  return features;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {import("../types.js").GeoFeature[]} features
 * @param {(cultureId: number) => { realm: () => string, river: () => string, feature: () => string }} mills
 * @param {number[]} ids
 * @param {import("../types.js").GeoFeature["type"]} type
 */
function pushFeature(cells, features, mills, ids, type) {
  const originId = ids[0];
  const mill = mills(cells[originId].cultureId ?? -1);
  const name = type === "lake" ? `${mill.river()}湖` : type === "island" ? `${mill.feature()}岛` : mill.realm();
  let sx = 0;
  let sy = 0;
  for (const id0 of ids) {
    sx += cells[id0].x;
    sy += cells[id0].y;
  }
  const id = features.length;
  features.push({
    id,
    name,
    type,
    size: ids.length,
    originId,
    cx: sx / ids.length,
    cy: sy / ids.length,
    note: "",
  });
  for (const cid0 of ids) cells[cid0].featureId = id;
}

/**
 * @param {import("../types.js").Cell[]} cells
 * @param {number} startId
 * @param {Uint8Array} seen
 * @param {(c: import("../types.js").Cell) => boolean} pred
 */
function flood(cells, startId, seen, pred) {
  /** @type {number[]} */
  const ids = [];
  const stack = [startId];
  seen[startId] = 1;
  while (stack.length) {
    const id = stack.pop();
    const cell = cells[id];
    ids.push(id);
    for (const nid of cell.neighbors) {
      if (seen[nid]) continue;
      if (!pred(cells[nid])) continue;
      seen[nid] = 1;
      stack.push(nid);
    }
  }
  return ids;
}
