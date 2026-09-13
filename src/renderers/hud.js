/**
 * Screen-space and world-space HUD overlays for the canvas renderer.
 * Compass and scale bar are CSS-pixel chrome; the rest draw in world space.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../types.js").WorldData} world
 * @param {{ text: string }} ink
 * @param {(n: number) => number} px
 */
export function drawGrid(ctx, world, ink, px) {
  ctx.strokeStyle = ink.text;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = px(0.6);
  const step = 100;
  ctx.beginPath();
  for (let x = 0; x <= world.meta.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.meta.height);
  }
  for (let y = 0; y <= world.meta.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(world.meta.width, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x0: number, y0: number, x1: number, y1: number }} measure
 * @param {{ text: string }} ink
 * @param {(n: number) => number} px
 */
export function drawMeasure(ctx, measure, ink, px) {
  const dist = Math.hypot(measure.x1 - measure.x0, measure.y1 - measure.y0);
  ctx.strokeStyle = "#c45c2a";
  ctx.fillStyle = ink.text;
  ctx.lineWidth = px(1.8);
  ctx.setLineDash([px(4), px(3)]);
  ctx.beginPath();
  ctx.moveTo(measure.x0, measure.y0);
  ctx.lineTo(measure.x1, measure.y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(measure.x0, measure.y0, px(3), 0, Math.PI * 2);
  ctx.arc(measure.x1, measure.y1, px(3), 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${px(11)}px Palatino, Georgia, serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(dist)} 里格`, (measure.x0 + measure.x1) / 2, (measure.y0 + measure.y1) / 2 - px(8));
  ctx.textAlign = "left";
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../types.js").WorldData} world
 * @param {number[]} path
 * @param {(n: number) => number} px
 */
export function drawDraft(ctx, world, path, px) {
  if (path.length < 1) return;
  ctx.strokeStyle = "#c45c2a";
  ctx.lineWidth = px(2.2);
  ctx.setLineDash([px(5), px(4)]);
  ctx.beginPath();
  const p0 = world.cells[path[0]];
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.length; i++) {
    const c = world.cells[path[i]];
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../types.js").WorldData} world
 * @param {number} id
 * @param {(n: number) => number} px
 */
export function drawHighlight(ctx, world, id, px) {
  const cell = world.cells[id];
  if (!cell || cell.polygon.length < 3) return;
  ctx.strokeStyle = "#f2e6c4";
  ctx.lineWidth = px(1.8);
  ctx.beginPath();
  ctx.moveTo(cell.polygon[0][0], cell.polygon[0][1]);
  for (let i = 1; i < cell.polygon.length; i++) ctx.lineTo(cell.polygon[i][0], cell.polygon[i][1]);
  ctx.closePath();
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {{ text: string }} ink
 * @param {string} style
 */
export function drawCompass(ctx, canvas, ink, style) {
  const x = 36;
  const y = canvas.clientHeight - 36;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = style === "night" ? "#d4c4a0" : "#3a2a18";
  ctx.fillStyle = ink.text;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 16);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(5, 0);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.font = "10px Palatino, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -20);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {import("../types.js").WorldData} world
 * @param {{ text: string }} ink
 */
export function drawScaleBar(ctx, canvas, world, ink) {
  const scale = world.view.scale || 1;
  const candidates = [50, 100, 200, 400, 800];
  let worldLen = 100;
  for (const c of candidates) {
    if (c * scale >= 48 && c * scale <= 140) {
      worldLen = c;
      break;
    }
    worldLen = c;
  }
  const px = worldLen * scale;
  const x = 58;
  const y = canvas.clientHeight - 18;
  ctx.strokeStyle = ink.text;
  ctx.fillStyle = ink.text;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + px, y - 4);
  ctx.lineTo(x + px, y + 4);
  ctx.stroke();
  ctx.font = "10px Palatino, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(`${worldLen} 里格`, x + px / 2, y - 8);
}
