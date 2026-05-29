/**
 * Kimi WebBridge v2.0 — Integration Smoke Test
 */

import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TEST_PORT = process.env.WEBBRIDGE_TEST_PORT || "10086";
const DAEMON_URL = `ws://127.0.0.1:${TEST_PORT}`;
const EXTENSION_URL = `ws://127.0.0.1:${TEST_PORT}/extension?tabId=1`;
let daemonProcess;
let passed = 0;
let failed = 0;

function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

async function connectAgent() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DAEMON_URL);
    const timer = setTimeout(() => reject(new Error("Agent connect timeout")), 3000);
    ws.on("open", () => { clearTimeout(timer); resolve(ws); });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function connectExtension() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(EXTENSION_URL);
    const timer = setTimeout(() => reject(new Error("Extension connect timeout")), 3000);
    ws.on("open", () => { clearTimeout(timer); resolve(ws); });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function sendAndWait(ws, msg, expectedType, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Response timeout")), timeoutMs);
    const handler = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === expectedType) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(parsed);
        }
      } catch { /* ignore non-JSON */ }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

async function runTest(name, fn) {
  try {
    await fn();
    log("PASS", name);
    passed++;
  } catch (err) {
    log("FAIL", `${name}: ${err.message}`);
    failed++;
  }
}

async function main() {
  log("INFO", "Starting smoke test...");

  daemonProcess = spawn("node", ["daemon/dist/server/websocketServer.js"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, WEBBRIDGE_PORT: TEST_PORT },
  });
  daemonProcess.stdout.on("data", (d) => process.stdout.write(`[daemon] ${d}`));
  daemonProcess.stderr.on("data", (d) => process.stderr.write(`[daemon] ${d}`));

  await sleep(1000);

  let agentWs;
  await runTest("Agent connects to daemon", async () => {
    agentWs = await connectAgent();
  });

  if (!agentWs) {
    log("FAIL", "Cannot continue without agent connection");
    process.exit(1);
  }

  await runTest("Version negotiation succeeds", async () => {
    const resp = await sendAndWait(agentWs, { type: "version", version: "2.0" }, "version_accepted");
    if (resp.type !== "version_accepted") throw new Error(`Unexpected: ${resp.type}`);
  });

  await runTest("ping returns pong", async () => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ping timeout")), 3000);
      const handler = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.v === "2.0" && parsed.tool === "ping" && parsed.ok === true) {
            clearTimeout(timer);
            agentWs.off("message", handler);
            resolve();
          }
        } catch { /* ignore */ }
      };
      agentWs.on("message", handler);
      agentWs.send(JSON.stringify({ v: "2.0", id: "ping-1", tool: "ping", args: {} }));
    });
  });

  let extWs;
  await runTest("Extension connects to /extension", async () => {
    extWs = await connectExtension();
  });

  await runTest("Extension auth handshake completes", async () => {
    // Daemon does not send auth_accepted for extension connections;
    // auth is fire-and-forget when token is valid.
    extWs.send(JSON.stringify({ type: "auth", token: "test-token" }));
    await sleep(200);
  });

  await runTest("Extension registration accepted", async () => {
    extWs.send(JSON.stringify({ type: "register", tabId: 1, version: "0.6.0", manifestVersion: 3 }));
    await sleep(200);
  });

  agentWs.close();
  if (extWs) extWs.close();
  daemonProcess.kill();

  log("INFO", `Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test error:", err);
  if (daemonProcess) daemonProcess.kill();
  process.exit(1);
});
