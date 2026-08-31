/**
 * Off-thread generation. The generator never touches the DOM, so the whole
 * pipeline can run in a module worker. Falls back to the main thread if
 * workers are unavailable (some file:// previews).
 */
import { MapGenerator } from "../generators/mapGenerator.js";

const gen = new MapGenerator();

const progress = (stage) => postMessage({ type: "progress", stage });

self.onmessage = (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.op === "generate") {
      const world = gen.generate(msg.config, progress);
      postMessage({ type: "done", world });
      return;
    }
    if (msg.op === "society") {
      gen.regenerateSociety(msg.world, msg.societySeed);
      postMessage({ type: "done", world: msg.world });
      return;
    }
    if (msg.op === "routes") {
      gen.rebuildRoutesAndMarkers(msg.world);
      postMessage({ type: "done", world: msg.world });
      return;
    }
    postMessage({ type: "error", message: `未知操作：${String(msg.op)}` });
  } catch (err) {
    postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
