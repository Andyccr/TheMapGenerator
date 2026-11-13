/**
 * CSS colors for saves and <input type="color">. Generators mix in hex;
 * old rgb() strings still parse.
 */

/**
 * @param {string} color
 * @returns {[number, number, number]}
 */
export function parseRgb(color) {
  const s = String(color || "").trim();
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) return [clampByte(rgb[1]), clampByte(rgb[2]), clampByte(rgb[3])];
  const hex = s.replace(/^#/, "");
  if (hex.length === 3) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (hex.length >= 6) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return [128, 128, 128];
}

/** @param {string} color */
export function toCssHex(color) {
  return `#${parseRgb(color)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * @param {string} a
 * @param {string} b
 * @param {number} t
 */
export function mixHex(a, b, t) {
  const ha = parseRgb(a);
  const hb = parseRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return toCssHex(
    `rgb(${(ha[0] + (hb[0] - ha[0]) * u) | 0},${(ha[1] + (hb[1] - ha[1]) * u) | 0},${(ha[2] + (hb[2] - ha[2]) * u) | 0})`,
  );
}

/** @param {string | number} n */
function clampByte(n) {
  return Math.max(0, Math.min(255, Number(n) | 0));
}
