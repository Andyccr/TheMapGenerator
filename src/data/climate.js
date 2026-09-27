/**
 * Latitude climate bands for a north-up atlas.
 * lat 0 is the equatorial (south) edge, lat 1 is poleward (north).
 * Pure numbers — generators apply them, the inspector only reads the label.
 */

/**
 * Relative precipitation before rain shadow and continentality.
 * Equator and the storm track are wet; the subtropical belt and the pole are dry.
 * @param {number} lat
 */
export function latitudeBand(lat) {
  const itcz = Math.exp(-((lat - 0.08) ** 2) / 0.014);
  const horse = Math.exp(-((lat - 0.34) ** 2) / 0.009);
  const storm = Math.exp(-((lat - 0.58) ** 2) / 0.02);
  const polar = Math.max(0, lat - 0.78);
  return 0.58 + itcz * 0.5 - horse * 0.46 + storm * 0.26 - polar * 0.4;
}

/**
 * 0 equator, 1 subtropics, 2 storm track, 3 pole.
 * @param {number} lat
 */
export function climateBeltIndex(lat) {
  if (lat < 0.2) return 0;
  if (lat < 0.46) return 1;
  if (lat < 0.74) return 2;
  return 3;
}

const BELT_LABELS = ["赤道带", "副热带", "西风带", "极地带"];

/**
 * @param {number} lat
 */
export function climateBeltLabel(lat) {
  return BELT_LABELS[climateBeltIndex(lat)];
}

/**
 * Hadley / Ferrel / polar surface wind on a north-up map.
 * lat 0 is the equatorial edge. Returns a unit vector in map space
 * (+x east, +y south). The user's wind setting biases the whole field
 * so "应用风向" still steers rain shadows.
 * @param {number} lat
 * @param {{ x: number, y: number }} user
 */
export function circulationWind(lat, user) {
  const trades = Math.exp(-((lat - 0.16) ** 2) / 0.018);
  const horse = Math.exp(-((lat - 0.34) ** 2) / 0.01);
  const wester = Math.exp(-((lat - 0.55) ** 2) / 0.03);
  const polar = Math.exp(-((lat - 0.86) ** 2) / 0.016);
  let mx = wester * 1.05 - trades * 0.9 - polar * 0.6;
  let my = trades * 0.42 + polar * 0.22 - wester * 0.06;
  const calm = 1 - horse * 0.5;
  mx *= calm;
  my *= calm;
  const ulen = Math.hypot(user.x, user.y) || 1;
  mx = mx * 0.7 + (user.x / ulen) * 0.8;
  my = my * 0.7 + (user.y / ulen) * 0.45;
  const len = Math.hypot(mx, my) || 1;
  return { x: mx / len, y: my / len };
}
