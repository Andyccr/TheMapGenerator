import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { APP_VERSION } from "../../core/version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("pages workflow publishes icon, manifest, and source", () => {
  const yml = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  assert.match(yml, /icon\.svg/);
  assert.match(yml, /manifest\.webmanifest/);
  assert.match(yml, /cp -r src/);
});

test("shell HTML has a first-run welcome and a cancel control", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /id="welcome-dialog"/);
  assert.match(html, /id="btn-cancel-job"/);
  assert.match(html, /id="stage-empty"/);
  assert.match(html, new RegExp(`\\?v=${APP_VERSION.replaceAll(".", "\\.")}`));
  assert.match(html, /data-tool="journey"/);
  assert.match(html, /id="btn-journey-seal"/);
});

test("shell HTML follows the generate-view-edit-inspect charter", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /生成 → 查看 → 编辑 → 检视/);
  assert.match(html, /<span class="step-index">1<\/span> 生成/);
  assert.match(html, /<span class="step-index">2<\/span> 编辑/);
  assert.match(html, /<span class="step-index">3<\/span> 存档/);
  assert.match(html, /id="step-generate"/);
  assert.match(html, /id="opt-roster"/);
  assert.match(html, /id="dock-layers"/);
  assert.match(html, /id="tool-opts-paint"/);
  assert.doesNotMatch(html, /id="btn-panel-left"/);
  assert.doesNotMatch(html, /id="style-picks"/);
});
