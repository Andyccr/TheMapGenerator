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

test("UI helpers do not import generators (App and generateClient may)", () => {
  const uiDir = join(srcRoot, "ui");
  const allowed = new Set(["app.js", "generateClient.js"]);
  /** @type {string[]} */
  const leaks = [];
  for (const file of listJs(uiDir)) {
    const name = file.split(/[/\\]/).pop();
    if (allowed.has(name || "")) continue;
    for (const spec of importsOf(file)) {
      if (!spec.startsWith(".")) continue;
      const resolved = relative(srcRoot, join(dirname(file), spec)).replaceAll("\\", "/");
      if (resolved.startsWith("generators/")) leaks.push(`${relative(srcRoot, file)} → ${resolved}`);
    }
  }
  assert.equal(leaks.length, 0, leaks.join("\n"));
});

test("App imports only MapGenerator from generators", () => {
  const file = join(srcRoot, "ui/app.js");
  const gens = importsOf(file).filter((s) => s.includes("/generators/"));
  assert.deepEqual(gens, ["../generators/mapGenerator.js"]);
});

test("generators do not re-export data catalogs or JSON helpers", () => {
  const banned =
    /\bexport\s*\{[^}]*\b(BIOMES|STANCE_LABELS|stanceLabel|tiesFor|otherId|setStance|pruneDiplomacy|LANDFORMS|RECIPES|landformById|recipeFor|parseRecipe|landformLabel|stepSummary)\b/;
  /** @type {string[]} */
  const leaks = [];
  for (const file of listJs(join(srcRoot, "generators"))) {
    const text = readFileSync(file, "utf8");
    if (banned.test(text)) leaks.push(relative(srcRoot, file));
  }
  assert.equal(leaks.length, 0, leaks.join("\n"));
});

test("App event wiring lives in bindings.js", () => {
  const bind = readFileSync(join(srcRoot, "ui/bindings.js"), "utf8");
  assert.match(bind, /export function bindWorkshop/);
  assert.match(bind, /btn-generate/);
  const app = readFileSync(join(srcRoot, "ui/app.js"), "utf8");
  assert.match(app, /bindWorkshop\(this\)/);
  assert.doesNotMatch(app, /btn-generate/);
});

test("generateClient does not alias stage labels", () => {
  const text = readFileSync(join(srcRoot, "ui/generateClient.js"), "utf8");
  assert.doesNotMatch(text, /STAGE_LABELS/);
  assert.doesNotMatch(text, /GENERATION_STAGE_LABELS/);
});

test("MapGenerator no longer exposes unused rebuildRoutes", () => {
  const text = readFileSync(join(srcRoot, "generators/mapGenerator.js"), "utf8");
  assert.doesNotMatch(text, /rebuildRoutes\(/);
  assert.match(text, /rebuildRoutesAndMarkers\(/);
});
