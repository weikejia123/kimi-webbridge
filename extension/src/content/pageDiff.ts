/**
 * Kimi WebBridge v2.0 — Page State Diff
 *
 * Lightweight pre/post action diff computation.
 */

import type { PageStateDiff, ElementInfo } from "../shared/protocol.js";
import type { MiniPageState } from "../shared/telemetry.js";
import { buildElementInfo } from "./elementScanner.js";

export { type MiniPageState };

export function captureMiniPageState(): MiniPageState {
  return {
    url: location.href,
    title: document.title,
    textLength: document.body?.textContent?.length ?? 0,
    elementCount: document.querySelectorAll("*").length,
  };
}

function captureDialogs(): ElementInfo[] {
  const dialogs: ElementInfo[] = [];
  document.querySelectorAll("dialog[open], [role='dialog']").forEach((el) => {
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) dialogs.push(info);
  });
  return dialogs;
}

export function computePageDiff(pre: MiniPageState, post: MiniPageState): PageStateDiff {
  const urlChanged = pre.url !== post.url;
  const titleChanged = pre.title !== post.title;

  const postDialogs = captureDialogs();

  const newText: string[] = [];
  const removedText: string[] = [];

  if (urlChanged) {
    newText.push(`URL changed from "${pre.url}" to "${post.url}"`);
  }
  if (titleChanged) {
    newText.push(`Title changed from "${pre.title}" to "${post.title}"`);
  }
  if (
    post.textLength !== undefined &&
    pre.textLength !== undefined &&
    post.textLength > pre.textLength
  ) {
    newText.push(`Text length increased from ${pre.textLength} to ${post.textLength}`);
  }
  if (
    post.textLength !== undefined &&
    pre.textLength !== undefined &&
    post.textLength < pre.textLength
  ) {
    removedText.push(`Text length decreased from ${pre.textLength} to ${post.textLength}`);
  }

  const diff: PageStateDiff = {
    urlChanged,
    urlBefore: pre.url,
    urlAfter: post.url,
    newText,
    removedText,
    dialogsOpened: postDialogs,
    dialogsClosed: [],
  };

  return diff;
}
