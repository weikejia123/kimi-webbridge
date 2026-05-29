/**
 * Daemon ExtensionRouter Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { extensionRouter } from "../dist/extension/router.js";

class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.sent = [];
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3; // CLOSED
  }
}

describe("ExtensionRouter", () => {
  it("registers a tab", () => {
    const ws = new MockWebSocket();
    extensionRouter.registerTab(42, ws);
    assert.strictEqual(extensionRouter.isConnected(42), true);
    assert.deepStrictEqual(extensionRouter.getConnectedTabs(), [42]);
  });

  it("unregisters a tab", () => {
    const ws = new MockWebSocket();
    extensionRouter.registerTab(43, ws);
    extensionRouter.unregisterTab(43);
    assert.strictEqual(extensionRouter.isConnected(43), false);
  });

  it("sends a command with BridgeCommand envelope", async () => {
    const ws = new MockWebSocket();
    extensionRouter.registerTab(44, ws);

    const promise = extensionRouter.sendCommand(44, undefined, "get_page_state", {}, 5000, "req-1");

    // Should have sent a message with requestId + BridgeCommand fields
    assert.strictEqual(ws.sent.length, 1);
    const sent = JSON.parse(ws.sent[0]);
    assert.strictEqual(sent.v, "2.0");
    assert.strictEqual(sent.id, "req-1");
    assert.strictEqual(sent.tool, "get_page_state");
    assert.strictEqual(typeof sent.requestId, "string");
    assert.strictEqual(sent.tabId, 44);

    // Simulate extension response
    ws.emit("message", Buffer.from(JSON.stringify({ requestId: sent.requestId, response: { ok: true } })));

    const result = await promise;
    assert.strictEqual(result.ok, true);
  });

  it("returns error when tab not connected", async () => {
    const result = await extensionRouter.sendCommand(999, undefined, "ping", {}, 1000, "req-2");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, "UNKNOWN_ERROR");
  });

  it("times out when extension does not respond", async () => {
    const ws = new MockWebSocket();
    extensionRouter.registerTab(45, ws);

    const result = await extensionRouter.sendCommand(45, undefined, "ping", {}, 50, "req-3");
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.message.includes("timed out"));
  });
});
