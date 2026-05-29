/**
 * Extension Shared Errors Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createBridgeError, isBridgeErrorCode, BRIDGE_ERROR_CODES } from "../dist/shared/errors.js";

describe("shared/errors", () => {
  it("has all expected error codes", () => {
    assert.ok(BRIDGE_ERROR_CODES.includes("ELEMENT_NOT_FOUND"));
    assert.ok(BRIDGE_ERROR_CODES.includes("PERMISSION_DENIED"));
    assert.ok(BRIDGE_ERROR_CODES.includes("INVALID_ARGUMENT"));
    assert.ok(BRIDGE_ERROR_CODES.includes("UNKNOWN_ERROR"));
    assert.ok(BRIDGE_ERROR_CODES.includes("NAVIGATION_TIMEOUT"));
    assert.strictEqual(BRIDGE_ERROR_CODES.length, 17);
  });

  it("creates a BridgeError with defaults", () => {
    const err = createBridgeError("ELEMENT_NOT_FOUND", "button missing");
    assert.strictEqual(err.code, "ELEMENT_NOT_FOUND");
    assert.strictEqual(err.message, "button missing");
    assert.strictEqual(err.recoverable, true);
    assert.strictEqual(err.suggestedNextTools, undefined);
  });

  it("creates a non-recoverable error", () => {
    const err = createBridgeError("PERMISSION_DENIED", "blocked", { recoverable: false });
    assert.strictEqual(err.code, "PERMISSION_DENIED");
    assert.strictEqual(err.recoverable, false);
  });

  it("includes suggested next tools", () => {
    const err = createBridgeError("NO_FORM_FOUND", "no form", {
      recoverable: true,
      suggestedNextTools: ["press_key", "snapshot_v2"],
    });
    assert.deepStrictEqual(err.suggestedNextTools, ["press_key", "snapshot_v2"]);
  });

  it("includes details", () => {
    const err = createBridgeError("EVALUATION_ERROR", "script failed", {
      details: { line: 42 },
    });
    assert.deepStrictEqual(err.details, { line: 42 });
  });

  it("validates known error codes", () => {
    assert.strictEqual(isBridgeErrorCode("ELEMENT_NOT_FOUND"), true);
    assert.strictEqual(isBridgeErrorCode("INVALID_ARGUMENT"), true);
    assert.strictEqual(isBridgeErrorCode("UNKNOWN_ERROR"), true);
  });

  it("rejects invalid error codes", () => {
    assert.strictEqual(isBridgeErrorCode("NOT_REAL"), false);
    assert.strictEqual(isBridgeErrorCode(""), false);
    assert.strictEqual(isBridgeErrorCode("element_not_found"), false);
  });
});
