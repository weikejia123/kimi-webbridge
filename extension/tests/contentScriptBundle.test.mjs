/**
 * Content Script Bundle Regression Test
 *
 * Verifies that dist/content/index.js is built as a single bundled
 * classic script (IIFE) with no ES module imports or exports.
 *
 * This prevents the "Cannot use import statement outside a module"
 * SyntaxError that occurs when Chrome loads an unbundled ES module
 * content script via manifest content_scripts auto-injection.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contentScriptPath = join(__dirname, "..", "dist", "content", "index.js");

describe("content script bundle", () => {
  let source;

  it("should exist", () => {
    let content;
    try {
      content = readFileSync(contentScriptPath, "utf-8");
    } catch (err) {
      assert.fail(`dist/content/index.js not found: ${err.message}`);
    }
    source = content;
    assert.ok(source.length > 1000, "bundle should be > 1KB");
  });

  it("should not contain top-level ES module imports", () => {
    const importRegex = /^import\s+/gm;
    const matches = source.match(importRegex);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length ?? 0} top-level import statement(s). ` +
        "Content scripts loaded via manifest content_scripts run as classic scripts. " +
        "Use esbuild --bundle --format=iife to inline all imports."
    );
  });

  it("should not contain top-level ES module exports", () => {
    const exportRegex = /^export\s+/gm;
    const matches = source.match(exportRegex);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length ?? 0} top-level export statement(s). ` +
        "Classic scripts cannot use export."
    );
  });

  it("should be an IIFE bundle", () => {
    const firstLines = source.split("\n").slice(0, 5).join("\n");
    assert.ok(
      firstLines.includes('"use strict"') && firstLines.includes("(() => {"),
      "Expected bundle to start with 'use strict' and an arrow-function IIFE. " +
        `Got:\n${firstLines}`
    );
  });

  it("should register onMessage listener", () => {
    assert.ok(
      source.includes("chrome.runtime.onMessage.addListener"),
      "Bundle must contain chrome.runtime.onMessage.addListener"
    );
  });
});
