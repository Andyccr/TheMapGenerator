/**
 * Baked terrain bitmap.
 *
 * One fill per color (and a handful of hillshade buckets) instead of a
 * draw call per cell. The bitmap is the landcover underlay; coasts, rivers,
 * and highways stay vectors on top, so the fit view reads as a map while
 * pan and zoom only blit.
 */
import { fillFor } from "./styles.js";

const CHUNK = 3500;

/**
 * Northwest light. Ocean and lakes stay flat so bathymetry keeps its own ramp.
 * @param {import("../types.js").Cell} cell
 * @param {import("../types.js").Cell[]} cells
 */
export function hillshadeAmount(cell, cells) {
  if (cell.ocean || cell.lake) return 0;
  let shade = 0;
  let w = 0;
  for (const nid of cell.neighbors) {
    const n = cells[nid];
    if (!n || cell.x - n.x + (cell.y - n.y) <= 0) continue;
    shade += (cell.height - n.height) * 2.4;
    w += 1;
  }
  if (!w) return 0;
  shade = Math.max(-0.28, Math.min(0.22, shade / w));
  if (Math.abs(shade) < 0.02) return 0;
  return shade;
}

/**
 * Snap smooth ramps onto a short palette so a height or climate bake
 * still fills in a few dozen paths instead of one path per cell.
 * @param {string} color
 */
function bucketColor(color) {
  if (!color || color.charCodeAt(0) === 35) return color;
  const match = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
  if (!match) return color;
  const q = (n) => Math.min(255, (Math.round(Number(n) / 12) * 12) | 0);
  return `rgb(${q(match[1])},${q(match[2])},${q(match[3])})`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../types.js").Cell[]} list
 * @param {string} color
 */
function fillPolys(ctx, list, color, weld) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  if (weld) ctx.lineWidth = weld;
  for (let i = 0; i < list.length; i += CHUNK) {
    const end = Math.min(list.length, i + CHUNK);
    ctx.beginPath();
    for (let j = i; j < end; j++) {
      const p = list[j].polygon;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
      ctx.closePath();
    }
    ctx.fill();
    if (weld) ctx.stroke();
  }
}

/**
 * @param {import("../types.js").WorldData} world
 * @param {string} style
 * @param {"overview"|"regional"|"local"} level
 * @param {boolean} withShade
 * @returns {{ canvas: HTMLCanvasElement, scale: number } | null}
 */
export function bakeCellRaster(world, style, level, withShade) {
  const maxDim = level === "overview" ? 2400 : 2800;
  const sx = Math.min(1, maxDim / world.meta.width);
  const sy = Math.min(1, maxDim / world.meta.height);
  const bakeScale = Math.max(0.18, Math.min(sx, sy));
  const w = Math.max(1, Math.round(world.meta.width * bakeScale));
  const h = Math.max(1, Math.round(world.meta.height * bakeScale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(bakeScale, 0, 0, bakeScale, 0, 0);
  const lodPaint = level === "overview" ? "overview" : "regional";
  /** @type {Map<string, import("../types.js").Cell[]>} */
  const groups = new Map();
  /** @type {Map<number, import("../types.js").Cell[]>} */
  const shadeGroups = new Map();
  const cells = world.cells;
  for (const cell of cells) {
    if (cell.polygon.length < 3) continue;
    const color = bucketColor(fillFor(cell, world, style, lodPaint));
    let group = groups.get(color);
    if (!group) groups.set(color, (group = []));
    group.push(cell);
    if (!withShade || cell.ocean || cell.lake) continue;
    const amount = hillshadeAmount(cell, cells);
    if (!amount) continue;
    const bucket = Math.max(-3, Math.min(3, Math.round(amount * 12)));
    if (!bucket) continue;
    let shade = shadeGroups.get(bucket);
    if (!shade) shadeGroups.set(bucket, (shade = []));
    shade.push(cell);
  }
  const weld = Math.max(0.8, (world.meta.cellSize || 8) * 0.34);
  for (const [color, list] of groups) fillPolys(ctx, list, color, weld);
  const gentle = style === "osm" || style === "nautical" || style === "survey" || style === "dusk";
  for (const [bucket, list] of shadeGroups) {
    const alpha = Math.min(0.2, Math.abs(bucket) * (gentle ? 0.016 : 0.045));
    const color = bucket > 0 ? `rgba(255,248,230,${alpha})` : `rgba(24,28,36,${alpha})`;
    fillPolys(ctx, list, color);
  }
  return { canvas, scale: bakeScale };
}
