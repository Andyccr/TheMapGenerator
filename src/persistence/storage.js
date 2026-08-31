/**
 * Persistence. LocalStorage for small snapshots and an index of named slots;
 * IndexedDB holds the full WorldData so maps near the cell cap still autosave.
 */
const LS_KEY = "fwmg-autosave-v1";
const LS_SLOTS = "fwmg-slots-index-v1";
const DB_NAME = "fwmg-v1";
const STORE = "worlds";

export const SLOT_COUNT = 6;

/** @param {import("../types.js").WorldData} world */
export function saveLocal(world) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(world));
    return true;
  } catch {
    return false;
  }
}

/** @returns {import("../types.js").WorldData | null} */
export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @returns {{ seed: string, mapName: string, generatedAt: string } | null} */
export function peekAutosave() {
  const w = loadLocal();
  if (!w?.meta) return null;
  return {
    seed: String(w.meta.seed || ""),
    mapName: String(w.meta.mapName || w.meta.seed || ""),
    generatedAt: String(w.generatedAt || ""),
  };
}

/** @param {import("../types.js").WorldData} world */
export async function saveAutosave(world) {
  const ok = saveLocal(world);
  try {
    await idbPut("autosave", world);
  } catch {
    /* private mode or quota */
  }
  return ok;
}

/** @returns {Promise<import("../types.js").WorldData | null>} */
export async function loadAutosave() {
  try {
    const w = await idbGet("autosave");
    if (w) return w;
  } catch {
    /* fall through */
  }
  return loadLocal();
}

/**
 * @param {number} index
 * @param {import("../types.js").WorldData} world
 */
export async function saveSlot(index, world) {
  const i = clampSlot(index);
  try {
    await idbPut(`slot-${i}`, world);
    rememberSlotMeta(i, world);
    return true;
  } catch {
    /* try localStorage for small worlds */
  }
  try {
    localStorage.setItem(`fwmg-slot-${i}`, JSON.stringify(world));
    rememberSlotMeta(i, world);
    return true;
  } catch {
    return false;
  }
}

/** @param {number} index */
export async function loadSlot(index) {
  const i = clampSlot(index);
  try {
    const w = await idbGet(`slot-${i}`);
    if (w) return w;
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(`fwmg-slot-${i}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @returns {{ index: number, empty: boolean, mapName?: string, seed?: string, savedAt?: string }[]} */
export function listSlotMeta() {
  try {
    const raw = localStorage.getItem(LS_SLOTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const row = arr[i];
      if (row && !row.empty) return { index: i, empty: false, mapName: row.mapName, seed: row.seed, savedAt: row.savedAt };
      return { index: i, empty: true };
    });
  } catch {
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({ index: i, empty: true }));
  }
}

/** @param {import("../types.js").WorldData} world @param {string} filename */
export function downloadJson(world, filename) {
  const blob = new Blob([JSON.stringify(world)], { type: "application/json" });
  triggerDownload(blob, filename);
}

/** @param {HTMLCanvasElement} canvas @param {string} filename */
export function downloadPng(canvas, filename) {
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, filename);
  }, "image/png");
}

/**
 * @param {File} file
 * @returns {Promise<unknown>}
 */
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取文件。"));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new Error("文件不是合法 JSON。"));
      }
    };
    reader.readAsText(file);
  });
}

/** @param {number} index */
function clampSlot(index) {
  const i = Number(index) | 0;
  return Math.max(0, Math.min(SLOT_COUNT - 1, i));
}

/**
 * @param {number} index
 * @param {import("../types.js").WorldData} world
 */
function rememberSlotMeta(index, world) {
  const list = listSlotMeta();
  list[index] = {
    index,
    empty: false,
    mapName: world.meta.mapName || world.meta.seed,
    seed: world.meta.seed,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LS_SLOTS, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function idbAvailable() {
  return typeof indexedDB !== "undefined";
}

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  if (!idbAvailable()) return Promise.reject(new Error("no idb"));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} key @param {unknown} value */
async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** @param {string} key */
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** @param {Blob} blob @param {string} filename */
function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
