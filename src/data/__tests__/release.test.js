import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  assert.match(html, /\?v=2\.5\.0/);
  assert.match(html, /data-tool="journey"/);
  assert.match(html, /id="btn-journey-seal"/);
});
