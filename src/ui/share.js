/**
 * Shareable atlas query. Pure URL helpers — no DOM — so Node tests can run them.
 *
 * Example: ?seed=terra&landform=archipelago&extent=2560,1600&detail=7&style=political
 */

const LANDFORMS = new Set([
  "continents",
  "pangea",
  "archipelago",
  "island",
  "peninsula",
  "isthmus",
  "inland-sea",
  "lakes",
]);

const EXTENTS = new Set(["1920,1200", "2560,1600", "3840,2400", "5120,3200"]);
const DETAILS = new Set(["10", "7", "5", "4"]);
const STYLES = new Set([
  "atlas",
  "physical",
  "height",
  "political",
  "cultural",
  "provinces",
  "religions",
  "temperature",
  "precipitation",
  "population",
  "parchment",
  "night",
]);

/**
 * @typedef {Object} ShareState
 * @property {string} [seed]
 * @property {string} [landform]
 * @property {string} [extent]
 * @property {string} [detail]
 * @property {string} [style]
 * @property {string} [plates]
 * @property {string} [sea]
 */

/**
 * @param {string} [search] location.search or a query without '?'
 * @returns {ShareState}
 */
export function parseShare(search = "") {
  let raw = String(search || "");
  if (raw.startsWith("http")) {
    try {
      raw = new URL(raw).search;
    } catch {
      raw = "";
    }
  }
  if (raw.startsWith("?")) raw = raw.slice(1);
  const q = new URLSearchParams(raw);
  /** @type {ShareState} */
  const out = {};
  const seed = (q.get("seed") || "").trim();
  if (seed) out.seed = seed.slice(0, 64);
  const landform = q.get("landform") || "";
  if (LANDFORMS.has(landform)) out.landform = landform;
  const extent = q.get("extent") || "";
  if (EXTENTS.has(extent)) out.extent = extent;
  const detail = q.get("detail") || "";
  if (DETAILS.has(detail)) out.detail = detail;
  const style = q.get("style") || "";
  if (STYLES.has(style)) out.style = style;
  const plates = q.get("plates");
  if (plates && /^\d+$/.test(plates)) {
    const n = Number(plates);
    if (n >= 8 && n <= 20) out.plates = String(n);
  }
  const sea = q.get("sea");
  if (sea && /^-?\d+$/.test(sea)) {
    const n = Number(sea);
    if (n >= -20 && n <= 20) out.sea = String(n);
  }
  return out;
}

/**
 * @param {ShareState} state
 * @returns {string} query including leading '?' or empty string
 */
export function serializeShare(state) {
  const q = new URLSearchParams();
  if (state.seed) q.set("seed", state.seed);
  if (state.landform && state.landform !== "continents") q.set("landform", state.landform);
  if (state.extent && state.extent !== "2560,1600") q.set("extent", state.extent);
  if (state.detail && state.detail !== "7") q.set("detail", state.detail);
  if (state.style && state.style !== "atlas") q.set("style", state.style);
  if (state.plates && state.plates !== "12") q.set("plates", state.plates);
  if (state.sea && state.sea !== "0") q.set("sea", state.sea);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** @param {ShareState} state */
export function shareHasSeed(state) {
  return Boolean(state.seed);
}
