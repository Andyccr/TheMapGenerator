const KEY = "fwmg-autosave-v1";

/** @param {import("../types.js").WorldData} world */
export function saveLocal(world) {
  try {
    localStorage.setItem(KEY, JSON.stringify(world));
  } catch {
    /* quota or private mode — ignore */
  }
}

/** @returns {import("../types.js").WorldData | null} */
export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
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
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new Error("File is not valid JSON."));
      }
    };
    reader.readAsText(file);
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
