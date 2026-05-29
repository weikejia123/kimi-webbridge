/**
 * Extension SafeSerialize Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { safeSerialize } from "../dist/content/safeSerialize.js";

describe("safeSerialize", () => {
  it("serializes primitives", () => {
    assert.strictEqual(safeSerialize(null), null);
    assert.strictEqual(safeSerialize(true), true);
    assert.strictEqual(safeSerialize(false), false);
    assert.strictEqual(safeSerialize(42), 42);
    assert.strictEqual(safeSerialize(-3.14), -3.14);
    assert.strictEqual(safeSerialize("hello"), "hello");
    assert.strictEqual(safeSerialize(undefined), "[undefined]");
  });

  it("serializes bigints", () => {
    assert.strictEqual(safeSerialize(BigInt(9007199254740991)), "9007199254740991n");
  });

  it("serializes symbols", () => {
    assert.strictEqual(safeSerialize(Symbol("foo")), "[Symbol: foo]");
    assert.strictEqual(safeSerialize(Symbol()), "[Symbol]");
  });

  it("serializes functions", () => {
    function namedFn() {}
    assert.strictEqual(safeSerialize(namedFn), "[Function: namedFn]");
    assert.strictEqual(safeSerialize(() => {}), "[Function]");
  });

  it("serializes dates", () => {
    const d = new Date("2024-01-15T00:00:00.000Z");
    assert.strictEqual(safeSerialize(d), "2024-01-15T00:00:00.000Z");
  });

  it("serializes errors", () => {
    const err = new Error("oops");
    const out = safeSerialize(err);
    assert.deepStrictEqual(out, { __error: true, name: "Error", message: "oops" });
  });

  it("serializes plain objects", () => {
    const out = safeSerialize({ a: 1, b: "two", c: true });
    assert.deepStrictEqual(out, { a: 1, b: "two", c: true });
  });

  it("omits undefined object values", () => {
    const out = safeSerialize({ a: 1, b: undefined, c: "ok" });
    assert.deepStrictEqual(out, { a: 1, c: "ok" });
  });

  it("serializes arrays", () => {
    const out = safeSerialize([1, null, "x", undefined]);
    assert.deepStrictEqual(out, [1, null, "x", "[undefined]"]);
  });

  it("detects circular references", () => {
    const obj = { a: 1 };
    obj.self = obj;
    const out = safeSerialize(obj);
    assert.deepStrictEqual(out, { a: 1, self: "[Circular]" });
  });

  it("enforces depth limit", () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: "deep" } } } } } } };
    const out = safeSerialize(deep);
    // default maxDepth is 6; values at depth 7 are truncated
    assert.deepStrictEqual(out.l1.l2.l3.l4.l5.l6, { l7: "[DepthLimit]" });
  });

  it("enforces array item limit", () => {
    const arr = new Array(10).fill(1);
    const out = safeSerialize(arr, { maxArrayItems: 3 });
    assert.deepStrictEqual(out, [1, 1, 1, "..."]);
  });

  it("enforces object key limit", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const out = safeSerialize(obj, { maxObjectKeys: 2 });
    assert.strictEqual(Object.keys(out).length, 3); // 2 keys + "..."
    assert.strictEqual(out["..."], "...");
  });

  it("enforces string length limit", () => {
    const s = "a".repeat(20);
    const out = safeSerialize(s, { maxStringLength: 10 });
    assert.strictEqual(out, "a".repeat(10) + "...");
  });

  it("serializes nested structures", () => {
    const input = {
      users: [
        { id: 1, name: "Alice", tags: ["admin", "dev"] },
        { id: 2, name: "Bob", tags: [] },
      ],
      meta: { count: 2, ok: true },
    };
    const out = safeSerialize(input);
    assert.deepStrictEqual(out, {
      users: [
        { id: 1, name: "Alice", tags: ["admin", "dev"] },
        { id: 2, name: "Bob", tags: [] },
      ],
      meta: { count: 2, ok: true },
    });
  });
});
