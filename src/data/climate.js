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
 * @param {number} lat
 */
export function climateBeltLabel(lat) {
  if (lat < 0.2) return "赤道带";
  if (lat < 0.46) return "副热带";
  if (lat < 0.74) return "西风带";
  return "极地带";
}
