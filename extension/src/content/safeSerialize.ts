/**
 * Kimi WebBridge v2.0 — Safe Serializer
 *
 * Deep-clones arbitrary JavaScript values into JSON-safe structures with
 * configurable limits, circular-reference detection, and special handling
 * for DOM nodes, functions, symbols, errors, and bigints.
 */

export type SafeSerializeOptions = {
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
};

const DEFAULT_OPTS: Required<SafeSerializeOptions> = {
  maxDepth: 6,
  maxArrayItems: 500,
  maxObjectKeys: 500,
  maxStringLength: 10000,
};

/**
 * Safely serialize an arbitrary value into a JSON-friendly structure.
 *
 * - Circular references → "[Circular]"
 * - DOM nodes → { __domNode: true, tagName, id?, className?, textContentPreview? }
 * - Functions → "[Function: name]" or "[Function]"
 * - Symbols → "[Symbol: description]" or "[Symbol]"
 * - undefined in arrays → "[undefined]"
 * - undefined as object values → omitted
 * - bigint → string with "n" suffix
 * - Date → ISO string
 * - Error → { __error: true, name, message }
 */
export function safeSerialize(
  value: unknown,
  opts?: SafeSerializeOptions,
): unknown {
  const merged = { ...DEFAULT_OPTS, ...opts };
  return serialize(value, merged, new WeakSet(), 0);
}

function serialize(
  value: unknown,
  opts: Required<SafeSerializeOptions>,
  visited: WeakSet<object>,
  depth: number,
): unknown {
  // Depth limit
  if (depth > opts.maxDepth) {
    return "[DepthLimit]";
  }

  // Primitives
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > opts.maxStringLength) {
      return value.slice(0, opts.maxStringLength) + "...";
    }
    return value;
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (typeof value === "bigint") {
    return String(value) + "n";
  }

  if (typeof value === "symbol") {
    const desc = value.description;
    return desc ? `[Symbol: ${desc}]` : "[Symbol]";
  }

  if (typeof value === "function") {
    const name = (value as Function).name;
    return name ? `[Function: ${name}]` : "[Function]";
  }

  // Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Error
  if (value instanceof Error) {
    return {
      __error: true,
      name: value.name,
      message: value.message,
    };
  }

  // DOM Node
  if (typeof window !== "undefined" && value instanceof Node) {
    const el = value instanceof Element ? value : null;
    const preview: Record<string, unknown> = {
      __domNode: true,
    };
    if (el) {
      preview.tagName = el.tagName;
      if (el.id) preview.id = el.id;
      if (el.className) preview.className = el.className;
      const text = el.textContent ?? "";
      if (text.length > 80) {
        preview.textContentPreview = text.slice(0, 80) + "...";
      } else if (text.length > 0) {
        preview.textContentPreview = text;
      }
    } else {
      preview.nodeType = value.nodeType;
    }
    return preview;
  }

  // Circular reference check
  if (typeof value === "object" && value !== null) {
    if (visited.has(value)) {
      return "[Circular]";
    }
    visited.add(value);

    // Array
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      const limit = Math.min(value.length, opts.maxArrayItems);
      for (let i = 0; i < limit; i++) {
        out.push(serialize(value[i], opts, visited, depth + 1));
      }
      if (value.length > opts.maxArrayItems) {
        out.push("...");
      }
      return out;
    }

    // Plain object
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>);
    const limit = Math.min(keys.length, opts.maxObjectKeys);
    for (let i = 0; i < limit; i++) {
      const k = keys[i];
      if (k === undefined) continue;
      const v = (value as Record<string, unknown>)[k];
      // Omit undefined values in objects (standard JSON behavior)
      if (typeof v !== "undefined") {
        out[k] = serialize(v, opts, visited, depth + 1);
      }
    }
    if (keys.length > opts.maxObjectKeys) {
      out["..."] = "...";
    }
    return out;
  }

  // Fallback
  return String(value);
}
