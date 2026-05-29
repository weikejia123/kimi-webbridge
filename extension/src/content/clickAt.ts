/**
 * Kimi WebBridge v2.0 — click_at Tool Handler
 *
 * Clicks at absolute screen coordinates using native mouse events.
 * Fallback for dynamically-appended elements (e.g. Bootstrap dropdowns)
 * where DOM-based resolution fails.
 */

export interface ClickAtOptions {
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  clickCount?: number;
}

export interface ClickAtResult {
  success: boolean;
  elementTag?: string | undefined;
  elementText?: string | undefined;
  x: number;
  y: number;
}

const BUTTON_MAP: Record<NonNullable<ClickAtOptions["button"]>, number> = {
  left: 0,
  middle: 1,
  right: 2,
};

export function clickAt(opts: ClickAtOptions): ClickAtResult {
  const { x, y, button = "left", clickCount = 1 } = opts;
  const buttonNumber = BUTTON_MAP[button];

  const el = document.elementFromPoint(x, y);
  const target: EventTarget = el ?? document;

  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    button: buttonNumber,
  };

  const events = [
    new MouseEvent("mousemove", { ...eventInit, detail: 0 }),
    new MouseEvent("mousedown", { ...eventInit, detail: clickCount }),
    new MouseEvent("mouseup", { ...eventInit, detail: clickCount }),
    new MouseEvent("click", { ...eventInit, detail: clickCount }),
  ];

  for (const event of events) {
    target.dispatchEvent(event);
  }

  return {
    success: true,
    elementTag: el ? el.tagName.toLowerCase() : undefined,
    elementText: el
      ? (el.textContent ?? "").trim().slice(0, 100)
      : undefined,
    x,
    y,
  };
}
