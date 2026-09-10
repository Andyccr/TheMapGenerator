/**
 * Run heavy generator jobs off the UI thread when module workers exist.
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

/**
 * @param {typeof GENERATOR_OPS[number]} op
 * @param {{ config?: GenerateConfig, world?: WorldData, societySeed?: string }} payload
 * @param {(stage: string) => void} [onProgress]
 * @returns {Promise<WorldData>}
 */
export function runGeneratorJob(op, payload, onProgress) {
  return new Promise((resolve, reject) => {
    /** @type {Worker | null} */
    let worker = null;
    try {
      worker = new Worker(new URL("../workers/generateWorker.js", import.meta.url), { type: "module" });
    } catch {
      resolve(runOnMain(op, payload, onProgress));
      return;
    }
    const fail = (err) => {
      worker?.terminate();
      try {
        resolve(runOnMain(op, payload, onProgress));
      } catch (fallbackErr) {
        reject(err || fallbackErr);
      }
    };
    worker.onmessage = (ev) => {
      const data = ev.data || {};
      if (data.type === "progress") {
        onProgress?.(data.stage);
        return;
      }
      worker?.terminate();
      if (data.type === "done") resolve(data.world);
      else reject(new Error(data.message || "生成失败"));
    };
    worker.onerror = (ev) => fail(ev.error || new Error(ev.message || "Worker 无法启动"));
    worker.postMessage({ op, ...payload });
  });
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
