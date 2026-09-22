/**
 * Click-to-extend a party route, then seal it into WorldData.journeys.
 * Path choice lives in generators/travel.js; the chronicle is data.
 */
import { chaikin } from "../util/geometry.js";
import { chronicle, formatDays } from "../data/journeys.js";
import { BIOME_LABELS } from "../data/catalogs.js";
import { planLeg } from "../generators/travel.js";

/**
 * @param {import("../types.js").WorldData} world
 * @param {number[]} cellIds
 * @param {string} name
 * @returns {import("../types.js").Journey | null}
 */
export function commitJourney(world, cellIds, name) {
  if (!cellIds || cellIds.length < 2) return null;
  if (!world.journeys) world.journeys = [];
  const stats = chronicle(world, cellIds);
  const points = chaikin(
    cellIds.map((id) => {
      const cell = world.cells[id];
      return [cell?.x ?? 0, cell?.y ?? 0];
    }),
    1,
  );
  const id = world.journeys.reduce((m, j) => Math.max(m, j.id), -1) + 1;
  /** @type {import("../types.js").Journey} */
  const journey = {
    id,
    name: String(name || "").trim() || "未命名行程",
    note: "",
    cellIds: cellIds.slice(),
    points,
    days: stats.days,
    leagues: stats.leagues,
    mode: stats.mode,
    legs: stats.legs,
  };
  world.journeys.push(journey);
  return journey;
}

export class JourneyTool {
  id = "journey";
  hint = "点下第一站，再点下一站。沿商路更省时；两岸可航时会改走更快的海路。回车封存，退格撤掉上一站。";
  constructor() {
    /** @type {number[]} */
    this.waypoints = [];
    /** @type {number[][]} */
    this.segments = [];
    /** @type {number[]} */
    this.path = [];
  }

  clear() {
    this.waypoints = [];
    this.segments = [];
    this.path = [];
  }

  pop() {
    if (this.waypoints.length <= 1) {
      this.clear();
      return;
    }
    const seg = this.segments.pop();
    this.waypoints.pop();
    const n = seg?.length || 0;
    this.path = this.path.slice(0, Math.max(0, this.path.length - n));
  }

  /**
   * @param {import("../types.js").WorldData} world
   */
  suggestedName(world) {
    const a = this.#placeName(world, this.waypoints[0]);
    const b = this.#placeName(world, this.waypoints[this.waypoints.length - 1]);
    if (a && b && a !== b) return `${a}至${b}`;
    return a || b || "战役行程";
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} cellId
   */
  #placeName(world, cellId) {
    const town = (world.settlements || []).find((s) => s.cellId === cellId);
    if (town) return town.name;
    const cell = world.cells[cellId];
    if (!cell) return "";
    return BIOME_LABELS[cell.biome] || "";
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {number} cellId
   * @returns {{ ok: boolean, added: boolean }}
   */
  extend(world, cellId) {
    const cell = world.cells[cellId];
    if (!cell) return { ok: false, added: false };
    if (!this.waypoints.length) {
      this.waypoints = [cellId];
      this.segments = [[cellId]];
      this.path = [cellId];
      return { ok: true, added: false };
    }
    const from = this.waypoints[this.waypoints.length - 1];
    if (from === cellId) return { ok: true, added: false };
    const leg = planLeg(world, from, cellId);
    if (!leg) return { ok: false, added: false };
    const rest = leg.cellIds[0] === from ? leg.cellIds.slice(1) : leg.cellIds.slice();
    if (!rest.length) return { ok: false, added: false };
    this.waypoints.push(cellId);
    this.segments.push(rest);
    this.path = this.path.concat(rest);
    return { ok: true, added: true };
  }

  /**
   * @param {import("../types.js").WorldData | null} world
   * @param {import("../types.js").EditorContext} ctx
   */
  seal(world, ctx) {
    if (!world || this.path.length < 2) {
      ctx.toast?.("行程至少要两个落点。", true);
      return;
    }
    const fallback = this.suggestedName(world);
    const done = (name) => {
      if (!name || !world) return;
      ctx.beginEdit?.();
      const journey = commitJourney(world, this.path, name);
      if (!journey) return;
      this.clear();
      ctx.commit?.(world);
      ctx.toast?.(`已封存「${journey.name}」：约 ${formatDays(journey.days)}，${journey.leagues} 里格。`);
    };
    if (ctx.askText) ctx.askText("行程名称", fallback, done);
    else done(ctx.promptText ? ctx.promptText("行程名称", fallback) : fallback);
  }

  /**
   * @param {import("../types.js").WorldData} world
   * @param {import("../types.js").PointerEventWorld} ev
   * @param {import("../types.js").EditorContext} ctx
   */
  apply(world, ev, ctx) {
    if (ev.phase !== "down" || ev.cellId < 0) return;
    const result = this.extend(world, ev.cellId);
    if (!result.ok) {
      ctx.toast?.("这里走不过去。", true);
      return;
    }
    if (!result.added) {
      ctx.toast?.("已放下这一站，再点下一站。");
      return;
    }
    const stats = chronicle(world, this.path);
    const via = stats.mode === "voyage" ? "海路" : stats.mode === "mixed" ? "水陆" : "陆路";
    ctx.toast?.(`已接到这里（${via}），累计约 ${formatDays(stats.days)}，${stats.leagues} 里格。回车封存。`);
  }
}
