/**
 * Run heavy generator jobs off the UI thread when module workers exist.
 * The returned promise has `.cancel()` which terminates the worker (no main-thread fallback).
 */
import { MapGenerator } from "../generators/mapGenerator.js";

/** @typedef {import("../types.js").WorldData} WorldData */
/** @typedef {import("../types.js").GenerateConfig} GenerateConfig */

/** @param {string} [stage] */
export const STAGE_LABELS = {
  mesh: "正在铺格网…",
  tectonics: "正在推板块、堆山链…",
  hydrology: "正在填洼、布河网…",
  climate: "正在算气候与生物群系…",
  society: "正在安置文化与聚落…",
  routes: "正在连商路、放地标…",
};

/** Operations the worker and the main-thread fallback both implement. */
export const GENERATOR_OPS = /** @type {const} */ (["generate", "society", "routes", "recompute", "names", "climate"]);

export function cancelledError() {
  const err = new Error("已取消生成。");
  err.cancelled = true;
  return err;
}

/** @param {unknown} err */
export function isJobCancelled(err) {
  return Boolean(err && typeof err === "object" && /** @type {{ cancelled?: boolean, message?: string }} */ (err).cancelled);
}

/**
 * @typedef {Promise<WorldData> & { cancel: () => void }} GeneratorJob
 */

/**
 * @param {typeof GENERATOR_OPS[number]} op
 * @param {{ config?: GenerateConfig, world?: WorldData, societySeed?: string }} payload
 * @param {(stage: string) => void} [onProgress]
 * @returns {GeneratorJob}
 */
export function runGeneratorJob(op, payload, onProgress) {
  /** @type {Worker | null} */
  let worker = null;
  let settled = false;
  let cancelled = false;
  /** @type {(reason?: Error) => void} */
  let rejectFn = () => {};

  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    const done = (world) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      resolve(world);
    };
    const failHard = (err) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    try {
      worker = new Worker(new URL("../workers/generateWorker.js", import.meta.url), { type: "module" });
    } catch {
      try {
        done(runOnMain(op, payload, onProgress));
      } catch (e) {
        failHard(e);
      }
      return;
    }
    worker.onmessage = (ev) => {
      if (cancelled) return;
      const data = ev.data || {};
      if (data.type === "progress") {
        onProgress?.(data.stage);
        return;
      }
      if (data.type === "done") done(data.world);
      else failHard(new Error(data.message || "生成失败"));
    };
    worker.onerror = (ev) => {
      if (cancelled || settled) return;
      worker?.terminate();
      try {
        done(runOnMain(op, payload, onProgress));
      } catch (fallbackErr) {
        failHard(ev.error || fallbackErr || new Error(ev.message || "Worker 无法启动"));
      }
    };
    worker.postMessage({ op, ...payload });
  });

  const job = /** @type {GeneratorJob} */ (promise);
  job.cancel = () => {
    if (settled) return;
    cancelled = true;
    settled = true;
    worker?.terminate();
    rejectFn(cancelledError());
  };
  return job;
}

/**
 * @param {typeof GENERATOR_OPS[number]} op
 * @param {{ config?: GenerateConfig, world?: WorldData, societySeed?: string }} payload
 * @param {(stage: string) => void} [onProgress]
 */
export function runOnMain(op, payload, onProgress) {
  const gen = new MapGenerator();
  if (op === "generate") return gen.generate(payload.config || { seed: "terra" }, onProgress);
  if (op === "society" && payload.world) return gen.regenerateSociety(payload.world, payload.societySeed);
  if (op === "routes" && payload.world) return gen.rebuildRoutesAndMarkers(payload.world);
  if (op === "recompute" && payload.world) return gen.recomputeFromElevation(payload.world, onProgress);
  if (op === "names" && payload.world) return gen.regenerateNames(payload.world);
  if (op === "climate" && payload.world) return gen.recomputeClimate(payload.world);
  throw new Error("无法在主线程执行该操作。");
}
