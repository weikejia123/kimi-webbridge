/**
 * Kimi WebBridge v2.0 — Page State
 *
 * Main observation API that builds a unified PageState snapshot.
 */

import type { PageState, ElementInfo } from "../shared/protocol.js";
import { scanElements, buildElementInfo } from "./elementScanner.js";
import { scanActions } from "./actionScanner.js";
import { getRecentErrors } from "./browserErrorBuffer.js";
import { getRecentNetworkFailures } from "./networkFailureBuffer.js";
import { elementRegistry } from "./elementRegistry.js";

function buildSummary(): PageState["summary"] {
  const headings: Array<{ level: number; text: string }> = [];
  document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const level = parseInt(el.tagName.slice(1), 10);
    const text = el.textContent?.trim() ?? "";
    headings.push({ level, text });
  });

  const dialogs: ElementInfo[] = [];
  document.querySelectorAll("dialog[open], [role='dialog']").forEach((el) => {
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) dialogs.push(info);
  });

  const alerts: ElementInfo[] = [];
  document.querySelectorAll("[role='alert']").forEach((el) => {
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) alerts.push(info);
  });

  return {
    headings,
    forms: document.querySelectorAll("form").length,
    links: document.querySelectorAll("a").length,
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input, textarea, select").length,
    contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
    dialogs,
    alerts,
  };
}

export function getPageState(args: {
  mode?: "summary" | "interactive" | "full";
  maxElements?: number;
  maxTextPerElement?: number;
  includePossibleActions?: boolean;
  includeRecentErrors?: boolean;
  includeRecentNetworkFailures?: boolean;
  includeFrames?: boolean;
  includeBoundingBoxes?: boolean;
  cursor?: string;
}): PageState {
  const mode = args.mode ?? "interactive";
  const includeBoundingBoxes = args.includeBoundingBoxes ?? true;
  const includePossibleActions = args.includePossibleActions ?? true;
  const includeRecentErrors = args.includeRecentErrors ?? true;
  const includeRecentNetworkFailures = args.includeRecentNetworkFailures ?? true;

  let activeElement: ElementInfo | undefined;
  if (document.activeElement && document.activeElement !== document.body) {
    const info = buildElementInfo(document.activeElement, {
      includeBoundingBoxes,
      maxTextPerElement: args.maxTextPerElement ?? 160,
    });
    if (info) activeElement = info;
  }

  const page: PageState["page"] = {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scroll: {
      x: window.scrollX,
      y: window.scrollY,
      maxX: document.documentElement.scrollWidth - window.innerWidth,
      maxY: document.documentElement.scrollHeight - window.innerHeight,
    },
  };
  if (activeElement !== undefined) {
    page.activeElement = activeElement;
  }

  const pageState: PageState = {
    page,
    summary: buildSummary(),
    elements: [],
    possibleActions: [],
    recentErrors: includeRecentErrors ? getRecentErrors(10) : [],
    recentNetworkFailures: includeRecentNetworkFailures ? getRecentNetworkFailures(10) : [],
    truncated: false,
    snapshotId: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    generation: elementRegistry.getGeneration(),
  };

  if (mode !== "summary") {
    const scanArgs: Parameters<typeof scanElements>[0] = {
      maxElements: args.maxElements ?? 300,
      includeBoundingBoxes,
      maxTextPerElement: args.maxTextPerElement ?? 160,
    };
    if (args.cursor !== undefined) {
      const cursorNum = parseInt(args.cursor, 10);
      if (!Number.isNaN(cursorNum)) {
        scanArgs.cursor = cursorNum;
      }
    }
    const scanResult = scanElements(scanArgs);

    pageState.elements = scanResult.elements;
    pageState.truncated = scanResult.truncated;
    if (scanResult.nextCursor !== undefined) {
      pageState.nextCursor = scanResult.nextCursor.toString();
    }

    if (includePossibleActions && scanResult.elements.length > 0) {
      pageState.possibleActions = scanActions(scanResult.elements);
    }
  }

  return pageState;
}
