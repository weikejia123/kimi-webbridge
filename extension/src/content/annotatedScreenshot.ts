/**
 * Kimi WebBridge v2.0 — Annotated Screenshot
 *
 * Captures a screenshot of the current tab and overlays bounding boxes +
 * labels for all detected interactive elements.
 */

import { scanElements } from "./elementScanner.js";

export interface AnnotatedScreenshotResult {
  base64: string;
  width: number;
  height: number;
  elementCount: number;
}

const COLOR_CYCLE = ["#FF0000", "#00FF00", "#0000FF", "#FF00FF", "#00FFFF", "#FFFF00"];

function sendToBackground<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message ?? "Unknown runtime error"));
      } else {
        resolve(response as T);
      }
    });
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load screenshot image"));
    img.src = src;
  });
}

export async function takeAnnotatedScreenshot(
  opts?: { maxElements?: number; drawLabels?: boolean; tabId?: number },
): Promise<AnnotatedScreenshotResult> {
  // 1. Capture screenshot via background service worker.
  const captureResult = await sendToBackground<{
    success: boolean;
    screenshot?: string;
    error?: string;
  }>({
    type: "capture_screenshot",
    tabId: opts?.tabId,
  });

  if (!captureResult.success || !captureResult.screenshot) {
    throw new Error(captureResult.error ?? "Screenshot capture failed");
  }

  // 2. Scan interactive elements with bounding boxes.
  const scanResult = scanElements({
    includeBoundingBoxes: true,
    maxElements: opts?.maxElements ?? 200,
    maxTextPerElement: 40,
  });

  const elements = scanResult.elements.filter(
    (e) => e.rect !== undefined && e.rect.w > 2 && e.rect.h > 2,
  );

  // 3. Load screenshot into canvas and overlay boxes.
  const img = await loadImage(captureResult.screenshot);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2d context");
  }

  ctx.drawImage(img, 0, 0);

  // Scale factor: screenshot pixels per CSS pixel.
  const scaleX = img.naturalWidth / window.innerWidth;
  const scaleY = img.naturalHeight / window.innerHeight;
  const drawLabels = opts?.drawLabels !== false;

  let idx = 0;
  for (const el of elements) {
    if (!el.rect) continue;

    const color = COLOR_CYCLE[idx % COLOR_CYCLE.length]!;
    const x = el.rect.x * scaleX;
    const y = el.rect.y * scaleY;
    const w = el.rect.w * scaleX;
    const h = el.rect.h * scaleY;

    // Fill with 15 % opacity.
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1.0;

    // 2 px stroke.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Label.
    if (drawLabels) {
      const labelText = `${el.tag}${el.name ? `:${el.name.slice(0, 20)}` : ""}`;
      ctx.font = "bold 12px sans-serif";
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = 12;
      const padding = 2;

      let labelX = x + padding;
      let labelY = y + textHeight + padding;

      // Clip to canvas bounds.
      if (labelX + textWidth > canvas.width) {
        labelX = Math.max(0, canvas.width - textWidth - padding);
      }
      if (labelX < 0) labelX = 0;
      if (labelY > canvas.height) {
        labelY = Math.max(textHeight, y + h - padding);
      }
      if (labelY < textHeight) labelY = textHeight;

      // White outline for readability.
      ctx.lineWidth = 3;
      ctx.strokeStyle = "white";
      ctx.lineJoin = "round";
      ctx.strokeText(labelText, labelX, labelY);

      // Black fill.
      ctx.fillStyle = "black";
      ctx.fillText(labelText, labelX, labelY);
    }
    idx++;
  }

  const base64 = canvas.toDataURL("image/png");

  return {
    base64,
    width: canvas.width,
    height: canvas.height,
    elementCount: elements.length,
  };
}
