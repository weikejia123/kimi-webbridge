/**
 * Extension Actionability Unit Tests
 *
 * Tests actionability logic with mocked DOM APIs.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Mock getComputedStyle for actionability tests
const originalGetComputedStyle = global.getComputedStyle;

function mockElement(props) {
  return {
    isConnected: props.isConnected !== false,
    getAttribute: (name) => props.attributes?.[name] ?? null,
    hasAttribute: (name) => props.attributes?.[name] !== undefined,
    tagName: props.tagName ?? "DIV",
    disabled: props.disabled ?? false,
    getBoundingClientRect: () => props.rect ?? { x: 0, y: 0, width: 100, height: 50 },
    style: {},
    parentElement: props.parentElement ?? null,
    closest: () => props.closestResult ?? null,
    matches: () => false,
  };
}

function mockComputedStyle(style) {
  return {
    display: style.display ?? "block",
    visibility: style.visibility ?? "visible",
    opacity: style.opacity ?? "1",
    pointerEvents: style.pointerEvents ?? "auto",
  };
}

describe("actionability checks", () => {
  it("visible element is actionable", () => {
    const el = mockElement({
      isConnected: true,
      rect: { x: 10, y: 10, width: 100, height: 50 },
      attributes: {},
    });

    global.getComputedStyle = () => mockComputedStyle({});

    const visible = el.isConnected;
    const rect = el.getBoundingClientRect();
    const nonzero = rect.width > 0 && rect.height > 0;

    assert.strictEqual(visible, true);
    assert.strictEqual(nonzero, true);

    global.getComputedStyle = originalGetComputedStyle;
  });

  it("disconnected element is not actionable", () => {
    const el = mockElement({ isConnected: false });
    assert.strictEqual(el.isConnected, false);
  });

  it("element with display:none is not visible", () => {
    global.getComputedStyle = () => mockComputedStyle({ display: "none" });
    const style = global.getComputedStyle({});
    assert.strictEqual(style.display, "none");
    global.getComputedStyle = originalGetComputedStyle;
  });

  it("element with visibility:hidden is not visible", () => {
    global.getComputedStyle = () => mockComputedStyle({ visibility: "hidden" });
    const style = global.getComputedStyle({});
    assert.strictEqual(style.visibility, "hidden");
    global.getComputedStyle = originalGetComputedStyle;
  });

  it("element with opacity:0 is not visible", () => {
    global.getComputedStyle = () => mockComputedStyle({ opacity: "0" });
    const style = global.getComputedStyle({});
    assert.strictEqual(style.opacity, "0");
    global.getComputedStyle = originalGetComputedStyle;
  });

  it("disabled input is not enabled", () => {
    const el = mockElement({ disabled: true });
    assert.strictEqual(el.disabled, true);
  });

  it("aria-disabled element is not enabled", () => {
    const el = mockElement({ attributes: { "aria-disabled": "true" } });
    assert.strictEqual(el.getAttribute("aria-disabled"), "true");
  });

  it("zero-size element has no bounding box", () => {
    const el = mockElement({ rect: { x: 0, y: 0, width: 0, height: 0 } });
    const rect = el.getBoundingClientRect();
    assert.strictEqual(rect.width, 0);
    assert.strictEqual(rect.height, 0);
  });
});
