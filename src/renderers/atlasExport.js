/**
 * Folio chrome around an exported map: title, seed, legend. Pure layout helpers
 * are testable in Node; painting needs a Canvas 2D context.
 */

/**
 * @param {number} mapW
 * @param {number} mapH
 * @param {number} legendCount
 */
export function layoutAtlasChrome(mapW, mapH, legendCount) {
  const pad = 36;
  const header = 64;
  const footer = 28;
  const n = Math.max(0, Math.min(Number(legendCount) || 0, 16));
  const legendW = n ? Math.min(240, Math.max(148, Math.round(mapW * 0.16))) : 0;
  const gap = n ? 20 : 0;
  const legendH = n ? 22 + n * 22 : 0;
  const width = Math.round(mapW + pad * 2 + legendW + gap);
  const height = Math.round(Math.max(mapH + header + footer + pad * 0.4, header + pad + legendH + footer));
  return {
    pad,
    header,
    footer,
    legendW,
    gap,
    width,
    height,
    mapX: pad,
    mapY: header,
    legendX: pad + mapW + gap,
    legendY: header,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   width: number, height: number, pad: number, header: number, mapX: number, mapY: number,
 *   legendX: number, legendY: number, legendW: number,
 *   title: string, subtitle: string,
 *   legend: { label: string, color: string }[],
 *   mapCanvas: HTMLCanvasElement,
 * }} spec
 */
export function paintAtlasChrome(ctx, spec) {
  const { width, height, pad, header, mapX, mapY, legendX, legendY, legendW, title, subtitle, legend, mapCanvas } = spec;
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#c4a574";
  ctx.fillRect(0, 0, width, 3);
  ctx.fillStyle = "#ead9c1";
  ctx.font = `600 ${Math.max(18, Math.min(28, header * 0.38))}px "Iowan Old Style", Palatino, serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(title || "未命名世界", pad, header * 0.42);
  ctx.fillStyle = "#b0894a";
  ctx.font = `13px "Iowan Old Style", Palatino, serif`;
  ctx.fillText(subtitle || "", pad, header * 0.72);
  ctx.drawImage(mapCanvas, mapX, mapY);
  if (legendW && legend?.length) {
    ctx.fillStyle = "#ead9c1";
    ctx.font = `600 13px "Iowan Old Style", Palatino, serif`;
    ctx.fillText("图例", legendX, legendY);
    legend.slice(0, 16).forEach((item, i) => {
      const y = legendY + 18 + i * 22;
      ctx.fillStyle = item.color || "#888";
      ctx.fillRect(legendX, y, 14, 14);
      ctx.strokeStyle = "#3a2e22";
      ctx.strokeRect(legendX, y, 14, 14);
      ctx.fillStyle = "#dccbb4";
      ctx.font = `12px "Iowan Old Style", Palatino, serif`;
      ctx.textBaseline = "top";
      const label = String(item.label || "").slice(0, 16);
      ctx.fillText(label, legendX + 20, y);
    });
  }
}
