/**
 * Daemon Protocol Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { validateBridgeCommand, createErrorResponse } from "../dist/protocol/v2.js";
import { errorFactory } from "../dist/protocol/errors.js";

describe("protocol/v2", () => {
  it("validates a correct BridgeCommand", () => {
    const cmd = { v: "2.0", id: "1", tool: "ping", args: {} };
    const result = validateBridgeCommand(cmd);
    assert.strictEqual(result.v, "2.0");
    assert.strictEqual(result.id, "1");
    assert.strictEqual(result.tool, "ping");
  });

  it("rejects missing version", () => {
    const cmd = { id: "1", tool: "ping", args: {} };
    const result = validateBridgeCommand(cmd);
    assert.strictEqual(result, null);
  });

  it("rejects missing id", () => {
    const cmd = { v: "2.0", tool: "ping", args: {} };
    const result = validateBridgeCommand(cmd);
    assert.strictEqual(result, null);
  });

  it("rejects missing tool", () => {
    const cmd = { v: "2.0", id: "1", args: {} };
    const result = validateBridgeCommand(cmd);
    assert.strictEqual(result, null);
  });

  it("rejects non-object args", () => {
    const cmd = { v: "2.0", id: "1", tool: "ping", args: "bad" };
    const result = validateBridgeCommand(cmd);
    assert.strictEqual(result, null);
  });
});

describe("protocol/errors", () => {
  it("creates ELEMENT_NOT_FOUND error", () => {
    const err = errorFactory.elementNotFound("button missing");
    assert.strictEqual(err.code, "ELEMENT_NOT_FOUND");
    assert.strictEqual(err.message, "button missing");
    assert.strictEqual(err.recoverable, true);
  });

  it("creates PERMISSION_DENIED error", () => {
    const err = errorFactory.permissionDenied("blocked");
    assert.strictEqual(err.code, "PERMISSION_DENIED");
    assert.strictEqual(err.recoverable, false);
  });

  it("creates TIMED_OUT error", () => {
    const err = errorFactory.timedOut("slow");
    assert.strictEqual(err.code, "NAVIGATION_TIMEOUT");
    assert.strictEqual(err.message, "slow");
    assert.strictEqual(err.recoverable, true);
  });

  it("creates INVALID_ARGUMENT error", () => {
    const err = errorFactory.invalidArgument("bad args");
    assert.strictEqual(err.code, "INVALID_ARGUMENT");
    assert.strictEqual(err.recoverable, true);
  });

  it("creates UNKNOWN_ERROR error", () => {
    const err = errorFactory.unknownError("boom");
    assert.strictEqual(err.code, "UNKNOWN_ERROR");
    assert.strictEqual(err.recoverable, true);
  });
});

describe("protocol/createErrorResponse", () => {
  it("builds a valid error response", () => {
    const cmd = { v: "2.0", id: "42", tool: "click_ref", args: {} };
    const err = errorFactory.elementNotFound("gone");
    const resp = createErrorResponse(cmd, err, { durationMs: 5 });
    assert.strictEqual(resp.v, "2.0");
    assert.strictEqual(resp.id, "42");
    assert.strictEqual(resp.ok, false);
    assert.strictEqual(resp.tool, "click_ref");
    assert.strictEqual(resp.error.code, "ELEMENT_NOT_FOUND");
    assert.strictEqual(resp.telemetry.durationMs, 5);
  });
});
