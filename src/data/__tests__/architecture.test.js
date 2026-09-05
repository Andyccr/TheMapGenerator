import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("../..", import.meta.url));

function listJs(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...listJs(full));
    } else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

function importsOf(file) {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function layerOf(file) {
  const rel = relative(srcRoot, file).replaceAll("\\", "/");
  const top = rel.split("/")[0];
  return top;
}

const forbidden = {
  data: ["generators", "editors", "renderers", "ui", "persistence", "workers"],
  generators: ["editors", "renderers", "ui", "persistence", "workers"],
  editors: ["renderers", "ui", "persistence", "workers"],
  renderers: ["generators", "editors", "ui", "persistence", "workers"],
};

test("four-layer folders do not import across the wrong boundary", () => {
  const files = listJs(srcRoot);
  /** @type {string[]} */
  const leaks = [];
  for (const file of files) {
    const layer = layerOf(file);
    const bans = forbidden[layer];
    if (!bans) continue;
    for (const spec of importsOf(file)) {
      if (!spec.startsWith(".")) continue;
      const resolved = relative(srcRoot, join(dirname(file), spec)).replaceAll("\\", "/");
      const target = resolved.split("/")[0];
      if (bans.includes(target)) leaks.push(`${relative(srcRoot, file)} → ${resolved}`);
    }
  }
  assert.equal(leaks.length, 0, leaks.join("\n"));
});
