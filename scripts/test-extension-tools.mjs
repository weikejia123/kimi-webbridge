/**
 * Extension Tool Integration Test
 * Sends BridgeCommands through the daemon to test all extension tools.
 */

import { WebSocket } from "ws";

const TEST_PORT = process.env.WEBBRIDGE_TEST_PORT || "10086";
const DAEMON_URL = `ws://127.0.0.1:${TEST_PORT}`;
let TAB_ID = null;
let ws;
let requestId = 0;
const pending = new Map();

function send(tool, args = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++requestId);
    const msg = { v: "2.0", id, tool, args, tabId: TAB_ID };
    pending.set(id, { resolve, reject, timer: setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${tool} timed out`));
    }, 10000) });
    ws.send(JSON.stringify(msg));
  });
}

function connectAgent() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(DAEMON_URL);
    const timer = setTimeout(() => reject(new Error("Agent connect timeout")), 5000);
    ws.on("open", () => { clearTimeout(timer); resolve(); });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "version_accepted") return;
        const p = pending.get(parsed.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(parsed.id);
          p.resolve(parsed);
        }
      } catch { /* ignore */ }
    });
  });
}

async function doVersionNegotiation() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Version timeout")), 5000);
    const handler = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "version_accepted") {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve();
        }
      } catch { /* ignore */ }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ type: "version", version: "2.0" }));
  });
}

async function runTest(name, fn) {
  try {
    const result = await fn();
    const ok = result?.ok ?? true;
    console.log(ok ? `✅ ${name}` : `❌ ${name} — error: ${result?.error?.message ?? JSON.stringify(result?.error)}`);
    return ok;
  } catch (err) {
    console.log(`❌ ${name} — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("Connecting to daemon...");
  await connectAgent();
  await doVersionNegotiation();
  console.log("Agent connected, testing extension tools...\n");

  // Discover active tab from bridge status
  const statusResp = await send("get_bridge_status", {});
  if (statusResp?.ok && statusResp.result?.extension?.activeTabId) {
    TAB_ID = statusResp.result.extension.activeTabId;
    console.log(`Using active tab: ${TAB_ID}\n`);
  } else {
    console.log("⚠️ Could not discover active tab from bridge status, using fallback\n");
    TAB_ID = 1311407425;
  }

  let passed = 0;
  let failed = 0;

  // 1. ping
  if (await runTest("ping", () => send("ping", {}))) passed++; else failed++;

  // 2. get_bridge_status
  if (await runTest("get_bridge_status", () => send("get_bridge_status", {}))) passed++; else failed++;

  // 3. get_page_state
  if (await runTest("get_page_state", () => send("get_page_state", {}))) passed++; else failed++;

  // 4. query_elements (find all links)
  if (await runTest("query_elements", () => send("query_elements", { selector: "a", limit: 5 }))) passed++; else failed++;

  // 5. extract_text
  if (await runTest("extract_text", () => send("extract_text", { format: "plain", maxChars: 500 }))) passed++; else failed++;

  // 6. get_full_text
  if (await runTest("get_full_text", () => send("get_full_text", { maxChars: 1000 }))) passed++; else failed++;

  // 7. find_element (find the heading)
  if (await runTest("find_element", () => send("find_element", { selector: "h1" }))) passed++; else failed++;

  // 8. describe_element
  const descResult = await send("find_element", { selector: "h1" }).catch(() => null);
  if (descResult?.ok && descResult.result?.target) {
    if (await runTest("describe_element", () => send("describe_element", { target: descResult.result.target }))) passed++; else failed++;
  } else {
    console.log("⚠️ describe_element — skipped (no target ref from find_element)");
  }

  // 9. highlight
  if (descResult?.ok && descResult.result?.target) {
    if (await runTest("highlight", () => send("highlight", { target: descResult.result.target }))) passed++; else failed++;
  } else {
    console.log("⚠️ highlight — skipped (no target ref)");
  }

  // 10. list_actions
  if (await runTest("list_actions", () => send("list_actions", { limit: 10 }))) passed++; else failed++;

  // 11. click_ref (click the first link)
  const linksResult = await send("query_elements", { selector: "a", limit: 3 }).catch(() => null);
  if (linksResult?.ok && linksResult.result?.elements?.[0]) {
    const firstLink = linksResult.result.elements[0];
    if (await runTest("click_ref", () => send("click_ref", { target: { ref: firstLink.ref } }))) passed++; else failed++;
  } else {
    console.log("⚠️ click_ref — skipped (no links found)");
  }

  // 12. scroll_to
  if (await runTest("scroll_to", () => send("scroll_to", { direction: "bottom" }))) passed++; else failed++;

  // 13. hover
  if (linksResult?.ok && linksResult.result?.elements?.[0]) {
    const firstLink = linksResult.result.elements[0];
    if (await runTest("hover", () => send("hover", { target: { ref: firstLink.ref } }))) passed++; else failed++;
  } else {
    console.log("⚠️ hover — skipped (no links found)");
  }

  // 14. capture_screenshot
  if (await runTest("capture_screenshot", () => send("capture_screenshot", { format: "png" }))) passed++; else failed++;

  // 15. evaluate_v2
  if (await runTest("evaluate_v2", () => send("evaluate_v2", { code: "document.title", returnByValue: true }))) passed++; else failed++;

  // 16. press_key
  if (await runTest("press_key", () => send("press_key", { key: "Escape" }))) passed++; else failed++;

  // 17. key_combo
  if (await runTest("key_combo", () => send("key_combo", { combo: "Control+a" }))) passed++; else failed++;

  // 18. wait_for
  if (await runTest("wait_for", () => send("wait_for", { condition: { type: "text_visible", text: "IANA" }, timeoutMs: 5000 }))) passed++; else failed++;

  // 19. list_tabs
  if (await runTest("list_tabs", () => send("list_tabs", {}))) passed++; else failed++;

  // 20. get_last_trace
  if (await runTest("get_last_trace", () => send("get_last_trace", {}))) passed++; else failed++;

  // 21. recover
  if (await runTest("recover", () => send("recover", {}))) passed++; else failed++;

  ws.close();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  if (ws) ws.close();
  process.exit(1);
});
