import { WebSocket } from "ws";

const ws = new WebSocket("ws://127.0.0.1:10086");
let ready = false;

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "version", version: "2.0" }));
});

ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.type === "version_accepted") {
    ready = true;
    poll();
  }
});

async function poll() {
  while (ready && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      v: "2.0", id: `poll-${Date.now()}`,
      tool: "snapshot", args: {}, tabId: 1311408027
    }));
    await new Promise(r => setTimeout(r, 3000));
  }
}

ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.tool === "snapshot" && msg.ok) {
    const p = msg.result.page;
    const h = msg.result.summary.headings.slice(0, 5).map(x => x.text).join(" | ");
    console.log(`[${new Date().toISOString().slice(11,19)}] ${p.title} — ${h}`);
  }
});

setTimeout(() => ws.close(), 120000);
