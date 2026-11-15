import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  BRUSH_TOOLS,
  MORE_TOOLS,
  PRIMARY_TOOLS,
  SHELL_CHARTER,
  SHELL_REGIONS,
  overflowLabel,
  shouldKeepOverflowOpen,
  toolHasOptions,
} from "../shell.js";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../index.html"), "utf8");

test("shell charter and regions stay a four-step workshop", () => {
  assert.equal(SHELL_CHARTER, "生成 → 查看 → 编辑 → 检视");
  assert.deepEqual(
    SHELL_REGIONS.map((r) => r.id),
    ["masthead", "panel-left", "stage", "panel-right"],
  );
});

test("primary rail is six tools; the rest sit behind 更多", () => {
  assert.deepEqual(PRIMARY_TOOLS, ["pan", "raise", "lower", "paint", "burg", "erase"]);
  assert.equal(MORE_TOOLS.length, 8);
  assert.ok(BRUSH_TOOLS.includes("paint"));
  assert.equal(BRUSH_TOOLS.includes("river"), false);
  const overlap = PRIMARY_TOOLS.filter((id) => MORE_TOOLS.includes(id));
  assert.deepEqual(overlap, []);
});

test("overflow picker closes after a tool is chosen and pan has no option card", () => {
  assert.equal(shouldKeepOverflowOpen("river"), false);
  assert.equal(shouldKeepOverflowOpen("pan"), false);
  assert.equal(overflowLabel("river"), "河流");
  assert.equal(overflowLabel("pan"), "更多");
  assert.equal(toolHasOptions("pan"), false);
  assert.equal(toolHasOptions("burg"), false);
  assert.equal(toolHasOptions("paint"), true);
  assert.equal(toolHasOptions("marker"), true);
  assert.equal(toolHasOptions("journey"), true);
  assert.equal(toolHasOptions("river"), false);
});

test("index.html rail matches the coded primary and overflow lists", () => {
  const rail = html.match(/id="tool-rail"[\s\S]*?<\/nav>/)?.[0] || "";
  const more = rail.match(/id="tool-rail-more"[\s\S]*?<\/details>/)?.[0] || "";
  const primary = [...rail.matchAll(/data-tool="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((id) => !more.includes(`data-tool="${id}"`));
  const overflow = [...more.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(primary, PRIMARY_TOOLS);
  assert.deepEqual(overflow, MORE_TOOLS);
  assert.match(rail, /id="tool-context"/);
});
