/**
 * Extension Shared Telemetry Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActionResult } from "../dist/shared/telemetry.js";

describe("shared/telemetry", () => {
  it("creates a successful action result", () => {
    const result = makeActionResult("click", true);
    assert.strictEqual(result.action, "click");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.strategyUsed, undefined);
    assert.strictEqual(result.error, undefined);
  });

  it("creates a failed action result", () => {
    const result = makeActionResult("fill", false);
    assert.strictEqual(result.action, "fill");
    assert.strictEqual(result.success, false);
  });
});
