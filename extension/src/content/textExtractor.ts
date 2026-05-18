/**
 * Kimi WebBridge v2.0 — Text Extractor
 *
 * Extracts page text content with support for plain, markdown, and blocks formats,
 * plus cursor-based chunking, shadow DOM traversal, and same-origin iframe support.
 */

import type { TargetRef, TextBlock, TextExtractionResult } from "../shared/protocol.js";
import { ChunkStore } from "./chunkStore.js";
import { isVisible } from "./actionRuntime.js";

const chunkStore = new ChunkStore();

const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "canvas",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "noscript",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tfoot",
  "ul",
  "video",
]);

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

type ExtractOpts = {
  visibleOnly: boolean;
  includeInputs: boolean;
  includeButtons: boolean;
  includeLinks: boolean;
  scope: "document" | "viewport" | TargetRef;
};

class TextBuilder {
  private parts: string[] = [];
  private needsSpace = false;

  addText(text: string): void {
    if (!text) return;
    if (this.needsSpace && this.parts.length > 0) {
      this.parts.push(" ");
    }
    this.parts.push(text);
    this.needsSpace = true;
  }

  addLine(text: string): void {
    if (this.parts.length > 0 && this.parts[this.parts.length - 1] !== "\n") {
      this.parts.push("\n");
    }
    this.parts.push(text);
    this.needsSpace = false;
  }

  addBreak(): void {
    if (this.parts.length > 0 && this.parts[this.parts.length - 1] !== "\n") {
      this.parts.push("\n");
    }
    this.needsSpace = false;
  }

  getText(): string {
    return this.parts.join("");
  }
}

function getInlineText(el: Element): string {
  const parts: string[] = [];
  Array.from(el.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? "");
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase();
      if (tag === "br") {
        parts.push("\n");
      } else {
        parts.push(getInlineText(child as Element));
      }
    }
  });
  return parts.join("").trim();
}

function shouldSkipElement(el: Element, opts: ExtractOpts): boolean {
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT")
    return true;
  if (opts.visibleOnly && !isVisible(el)) return true;
  if (opts.scope === "viewport" && !isInViewport(el)) return true;
  return false;
}

function extractToText(root: Element, opts: ExtractOpts, format: "plain" | "markdown"): string {
  const builder = new TextBuilder();

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) builder.addText(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    if (shouldSkipElement(el, opts)) return;

    const tag = el.tagName.toLowerCase();

    // Shadow DOM
    const shadow = (el as HTMLElement).shadowRoot;
    if (shadow) {
      Array.from(shadow.childNodes).forEach((child) => visit(child));
      return;
    }

    // Same-origin iframe
    if (tag === "iframe") {
      try {
        const body = (el as HTMLIFrameElement).contentDocument?.body;
        if (body) {
          Array.from(body.childNodes).forEach((child) => visit(child));
        }
      } catch {
        // cross-origin
      }
      return;
    }

    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (!opts.includeInputs) return;
      let value = "";
      if (tag === "select") {
        value = Array.from((el as HTMLSelectElement).selectedOptions)
          .map((o) => o.text)
          .join(", ");
      } else {
        value = (el as HTMLInputElement).value;
      }
      if (value) {
        builder.addLine(format === "markdown" ? `[Input: ${value}]` : value);
      }
      return;
    }

    if (tag === "button") {
      if (!opts.includeButtons) return;
      const text = el.textContent?.trim() ?? "";
      if (text) {
        builder.addLine(format === "markdown" ? `**${text}**` : text);
      }
      return;
    }

    if (tag === "a") {
      if (!opts.includeLinks) return;
      const text = el.textContent?.trim() ?? "";
      const href = (el as HTMLAnchorElement).href;
      if (text) {
        builder.addLine(format === "markdown" ? `[${text}](${href})` : text);
      }
      return;
    }

    if (tag === "br") {
      builder.addBreak();
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const text = el.textContent?.trim() ?? "";
      const level = parseInt(tag.slice(1), 10);
      if (text) {
        builder.addLine(format === "markdown" ? `${"#".repeat(level)} ${text}` : text);
      }
      return;
    }

    if (tag === "li") {
      const text = getInlineText(el);
      if (text) {
        builder.addLine(format === "markdown" ? `- ${text}` : text);
      }
      return;
    }

    if (tag === "b" || tag === "strong") {
      const text = getInlineText(el);
      if (text) builder.addText(format === "markdown" ? `**${text}**` : text);
      return;
    }

    const isBlock = BLOCK_ELEMENTS.has(tag);
    if (isBlock) builder.addBreak();

    Array.from(el.childNodes).forEach((child) => visit(child));

    if (isBlock) builder.addBreak();
  }

  visit(root);
  return builder.getText().trim();
}

function extractToBlocks(root: Element, opts: ExtractOpts): TextBlock[] {
  const blocks: TextBlock[] = [];

  function visit(node: Node): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    if (shouldSkipElement(el, opts)) return;

    const tag = el.tagName.toLowerCase();

    // Shadow DOM
    const shadow = (el as HTMLElement).shadowRoot;
    if (shadow) {
      Array.from(shadow.childNodes).forEach((child) => visit(child));
      return;
    }

    // Same-origin iframe
    if (tag === "iframe") {
      try {
        const body = (el as HTMLIFrameElement).contentDocument?.body;
        if (body) {
          Array.from(body.childNodes).forEach((child) => visit(child));
        }
      } catch {
        // cross-origin
      }
      return;
    }

    if (tag === "script" || tag === "style" || tag === "noscript") return;

    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (!opts.includeInputs) return;
      let value = "";
      if (tag === "select") {
        value = Array.from((el as HTMLSelectElement).selectedOptions)
          .map((o) => o.text)
          .join(", ");
      } else {
        value = (el as HTMLInputElement).value;
      }
      if (value) blocks.push({ type: "input", text: value });
      return;
    }

    if (tag === "button") {
      if (!opts.includeButtons) return;
      const text = el.textContent?.trim() ?? "";
      if (text) blocks.push({ type: "button", text });
      return;
    }

    if (tag === "a") {
      if (!opts.includeLinks) return;
      const text = el.textContent?.trim() ?? "";
      const href = (el as HTMLAnchorElement).href;
      if (text) blocks.push({ type: "link", text, href });
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const text = el.textContent?.trim() ?? "";
      const level = parseInt(tag.slice(1), 10);
      if (text) blocks.push({ type: "heading", text, level });
      return;
    }

    if (tag === "li") {
      const text = getInlineText(el);
      if (text) blocks.push({ type: "list", text });
      return;
    }

    if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "span") {
      const text = getInlineText(el);
      const hasBlockChild =
        el.querySelector("div, section, article, p, li, h1, h2, h3, h4, h5, h6") !== null;
      if (text && !hasBlockChild) {
        blocks.push({ type: "paragraph", text });
        return;
      }
    }

    Array.from(el.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) visit(child);
    });
  }

  visit(root);
  return blocks;
}

function resolveRoot(scope: "document" | "viewport" | TargetRef): Element | null {
  if (scope === "document" || scope === "viewport") {
    return document.body;
  }
  if (scope.selector) {
    return document.querySelector(scope.selector);
  }
  if (scope.ref) {
    return document.querySelector(`[data-bridge-ref="${CSS.escape(scope.ref)}"]`);
  }
  return null;
}

export function extractText(args: {
  scope?: "document" | "viewport" | TargetRef;
  visibleOnly?: boolean;
  includeInputs?: boolean;
  includeButtons?: boolean;
  includeLinks?: boolean;
  format?: "plain" | "markdown" | "blocks";
  chunkSize?: number;
  cursor?: string;
}): TextExtractionResult {
  const scope = args.scope ?? "document";
  const visibleOnly = args.visibleOnly ?? true;
  const includeInputs = args.includeInputs ?? true;
  const includeButtons = args.includeButtons ?? true;
  const includeLinks = args.includeLinks ?? true;
  const format = args.format ?? "markdown";
  const chunkSize = args.chunkSize ?? 8000;

  const root = resolveRoot(scope);
  if (!root) {
    return {
      format,
      chars: 0,
      truncated: false,
      stats: { totalTextEstimate: 0, blocksReturned: 0 },
    };
  }

  const opts: ExtractOpts = {
    visibleOnly,
    includeInputs,
    includeButtons,
    includeLinks,
    scope,
  };

  let text = "";
  let blocks: TextBlock[] | undefined;

  if (format === "blocks") {
    blocks = extractToBlocks(root, opts);
    text = blocks.map((b) => b.text).join("\n");
  } else {
    text = extractToText(root, opts, format);
  }

  // Cursor-based chunking
  if (args.cursor) {
    const sepIndex = args.cursor.indexOf(":");
    if (sepIndex > 0) {
      const sessionId = args.cursor.slice(0, sepIndex);
      const offset = parseInt(args.cursor.slice(sepIndex + 1), 10);
      if (!Number.isNaN(offset)) {
        const chunk = chunkStore.getChunk(sessionId, offset, chunkSize);
        const stats: { totalTextEstimate: number; blocksReturned?: number } = {
          totalTextEstimate: text.length,
        };
        if (blocks !== undefined) stats.blocksReturned = blocks.length;
        const result: TextExtractionResult = {
          format,
          text: chunk.text,
          chars: chunk.text.length,
          truncated: chunk.nextCursor !== undefined,
          stats,
        };
        if (chunk.nextCursor !== undefined) {
          result.nextCursor = `${sessionId}:${chunk.nextCursor}`;
        }
        return result;
      }
    }
    const stats0: { totalTextEstimate: number; blocksReturned?: number } = {
      totalTextEstimate: text.length,
    };
    if (blocks !== undefined) stats0.blocksReturned = blocks.length;
    return {
      format,
      chars: 0,
      truncated: false,
      stats: stats0,
    };
  }

  if (text.length <= chunkSize) {
    const stats: { totalTextEstimate: number; blocksReturned?: number } = {
      totalTextEstimate: text.length,
    };
    if (blocks !== undefined) stats.blocksReturned = blocks.length;
    const result: TextExtractionResult = {
      format,
      chars: text.length,
      truncated: false,
      stats,
    };
    if (format === "blocks" && blocks !== undefined) {
      result.blocks = blocks;
    } else if (format !== "blocks") {
      result.text = text;
    }
    return result;
  }

  const sessionId = chunkStore.createSession(text);
  const chunk = chunkStore.getChunk(sessionId, 0, chunkSize);
  const stats2: { totalTextEstimate: number; blocksReturned?: number } = {
    totalTextEstimate: text.length,
  };
  if (blocks !== undefined) stats2.blocksReturned = blocks.length;
  const result2: TextExtractionResult = {
    format,
    chars: chunk.text.length,
    truncated: true,
    stats: stats2,
  };
  if (format === "blocks" && blocks !== undefined) {
    result2.blocks = blocks.slice(0, 100);
  } else if (format !== "blocks") {
    result2.text = chunk.text;
  }
  if (chunk.nextCursor !== undefined) {
    result2.nextCursor = `${sessionId}:${chunk.nextCursor}`;
  }
  return result2;
}
