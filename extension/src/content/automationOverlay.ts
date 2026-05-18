/**
 * Floating automation status panel.
 */

const OVERLAY_ID = "kimi-bridge-overlay";

export function showOverlay(opts: {
  status: "active" | "paused" | "idle";
  currentTool?: string;
  message?: string;
}): void {
  hideOverlay();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.position = "fixed";
  overlay.style.top = "12px";
  overlay.style.right = "12px";
  overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
  overlay.style.color = "#fff";
  overlay.style.borderRadius = "8px";
  overlay.style.padding = "12px";
  overlay.style.zIndex = "999999";
  overlay.style.fontFamily = "system-ui, -apple-system, sans-serif";
  overlay.style.fontSize = "13px";
  overlay.style.lineHeight = "1.4";
  overlay.style.maxWidth = "280px";
  overlay.style.pointerEvents = "auto";

  overlay.innerHTML = buildOverlayHTML(opts);

  const append = (): void => {
    if (document.body) {
      document.body.appendChild(overlay);
    }
  };

  if (document.body) {
    append();
  } else {
    window.addEventListener("DOMContentLoaded", append, { once: true });
  }

  if (opts.status === "idle") {
    setTimeout(() => {
      hideOverlay();
    }, 2000);
  }
}

export function hideOverlay(): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
}

export function updateOverlay(opts: {
  status?: string;
  currentTool?: string;
  message?: string;
}): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    if (opts.status === "idle") {
      return;
    }
    const showOpts: { status: "active" | "paused" | "idle"; currentTool?: string; message?: string } = {
      status: (opts.status as "active" | "paused" | "idle") ?? "active",
    };
    if (opts.currentTool !== undefined) showOpts.currentTool = opts.currentTool;
    if (opts.message !== undefined) showOpts.message = opts.message;
    showOverlay(showOpts);
    return;
  }

  const currentTool = opts.currentTool ?? overlay.dataset.currentTool ?? "";
  const status = opts.status ?? overlay.dataset.status ?? "active";
  const message = opts.message ?? overlay.dataset.message ?? "";

  overlay.dataset.currentTool = currentTool;
  overlay.dataset.status = status;
  overlay.dataset.message = message;

  overlay.innerHTML = buildOverlayHTML({
    status: status as "active" | "paused" | "idle",
    currentTool,
    message,
  });

  if (status === "idle") {
    setTimeout(() => {
      hideOverlay();
    }, 2000);
  }
}

function buildOverlayHTML(opts: {
  status: "active" | "paused" | "idle";
  currentTool?: string;
  message?: string;
}): string {
  const statusEmoji = opts.status === "active" ? "🤖" : opts.status === "paused" ? "⏸️" : "✅";
  const statusText = opts.status.charAt(0).toUpperCase() + opts.status.slice(1);
  const toolText = opts.currentTool ? ` | Current: ${opts.currentTool}` : "";
  const messageText = opts.message
    ? `<div style="margin-top:4px;opacity:0.8;">${escapeHtml(opts.message)}</div>`
    : "";

  return `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>${statusEmoji} Kimi Bridge: ${statusText}${toolText}</span>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button style="background:#444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;" disabled>Pause</button>
      <button style="background:#444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;" disabled>Stop</button>
    </div>
    ${messageText}
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
