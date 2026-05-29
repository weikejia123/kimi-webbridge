/**
 * Kimi WebBridge v2.0 — Page State Diff
 *
 * Lightweight pre/post action diff computation plus semantic change detection.
 */

import type { PageStateDiff, ElementInfo } from "../shared/protocol.js";
import type { MiniPageState } from "../shared/telemetry.js";
import { buildElementInfo } from "./elementScanner.js";

export { type MiniPageState };

export type SemanticChangeType =
  | "modal_opened"
  | "modal_closed"
  | "dropdown_appeared"
  | "dropdown_hidden"
  | "form_loaded"
  | "toast_appeared"
  | "page_navigated"
  | "content_updated";

export interface SemanticChange {
  type: SemanticChangeType;
  summary: string;
  affectedElements: ElementInfo[];
}

interface SemanticSnapshot {
  url: string;
  title: string;
  modals: ElementInfo[];
  dropdowns: ElementInfo[];
  forms: ElementInfo[];
  toasts: ElementInfo[];
}

let lastSemanticSnapshot: SemanticSnapshot | null = null;

function captureVisibleModals(): ElementInfo[] {
  const results: ElementInfo[] = [];
  document.querySelectorAll("dialog[open], [role='dialog'], .modal, .modal.show").forEach((el) => {
    const htmlEl = el instanceof HTMLElement ? el : null;
    if (htmlEl) {
      const style = window.getComputedStyle(htmlEl);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    }
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) results.push(info);
  });
  return results;
}

function captureVisibleDropdowns(): ElementInfo[] {
  const results: ElementInfo[] = [];
  document.querySelectorAll(".dropdown-menu, [role='menu'], [role='listbox'], .select-options, .autocomplete-results").forEach((el) => {
    const htmlEl = el instanceof HTMLElement ? el : null;
    if (htmlEl) {
      const style = window.getComputedStyle(htmlEl);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    }
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) results.push(info);
  });
  return results;
}

function captureVisibleForms(): ElementInfo[] {
  const results: ElementInfo[] = [];
  document.querySelectorAll("form, fieldset").forEach((el) => {
    const htmlEl = el instanceof HTMLElement ? el : null;
    if (htmlEl) {
      const style = window.getComputedStyle(htmlEl);
      if (style.display === "none" || style.visibility === "hidden") return;
    }
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) results.push(info);
  });
  return results;
}

function captureToasts(): ElementInfo[] {
  const results: ElementInfo[] = [];
  document.querySelectorAll("[role='alert'], [role='status'], .toast, .notification, .snackbar, .alert").forEach((el) => {
    const htmlEl = el instanceof HTMLElement ? el : null;
    if (htmlEl) {
      const style = window.getComputedStyle(htmlEl);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    }
    const info = buildElementInfo(el, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (info) results.push(info);
  });
  return results;
}

export function captureSemanticSnapshot(): SemanticSnapshot {
  return {
    url: location.href,
    title: document.title,
    modals: captureVisibleModals(),
    dropdowns: captureVisibleDropdowns(),
    forms: captureVisibleForms(),
    toasts: captureToasts(),
  };
}

export function setLastSemanticSnapshot(snapshot: SemanticSnapshot | null): void {
  lastSemanticSnapshot = snapshot;
}

export function getLastSemanticSnapshot(): SemanticSnapshot | null {
  return lastSemanticSnapshot;
}

function findNewElements(current: ElementInfo[], previous: ElementInfo[]): ElementInfo[] {
  const prevRefs = new Set(previous.map((e) => e.ref).filter(Boolean));
  return current.filter((e) => !prevRefs.has(e.ref));
}

function findRemovedElements(current: ElementInfo[], previous: ElementInfo[]): ElementInfo[] {
  const currRefs = new Set(current.map((e) => e.ref).filter(Boolean));
  return previous.filter((e) => !currRefs.has(e.ref));
}

export function computeSemanticChanges(
  oldSnapshot: SemanticSnapshot,
  newSnapshot: SemanticSnapshot,
): SemanticChange[] {
  const changes: SemanticChange[] = [];

  if (oldSnapshot.url !== newSnapshot.url) {
    changes.push({
      type: "page_navigated",
      summary: `Page navigated from "${oldSnapshot.title}" to "${newSnapshot.title}"`,
      affectedElements: [],
    });
  }

  const newModals = findNewElements(newSnapshot.modals, oldSnapshot.modals);
  const closedModals = findRemovedElements(newSnapshot.modals, oldSnapshot.modals);

  if (newModals.length > 0) {
    changes.push({
      type: "modal_opened",
      summary: `Modal dialog opened with ${newModals.length} element(s)`,
      affectedElements: newModals,
    });
  }

  if (closedModals.length > 0) {
    changes.push({
      type: "modal_closed",
      summary: `Modal dialog closed (${closedModals.length} element(s) removed)`,
      affectedElements: closedModals,
    });
  }

  const newDropdowns = findNewElements(newSnapshot.dropdowns, oldSnapshot.dropdowns);
  const hiddenDropdowns = findRemovedElements(newSnapshot.dropdowns, oldSnapshot.dropdowns);

  if (newDropdowns.length > 0) {
    const itemCount = newDropdowns.reduce((sum, d) => sum + (d.text ? d.text.split("\n").length : 0), 0);
    changes.push({
      type: "dropdown_appeared",
      summary: `Dropdown menu with ${itemCount} item(s) appeared`,
      affectedElements: newDropdowns,
    });
  }

  if (hiddenDropdowns.length > 0) {
    changes.push({
      type: "dropdown_hidden",
      summary: `Dropdown menu hidden (${hiddenDropdowns.length} element(s))`,
      affectedElements: hiddenDropdowns,
    });
  }

  const newForms = findNewElements(newSnapshot.forms, oldSnapshot.forms);
  if (newForms.length > 0) {
    changes.push({
      type: "form_loaded",
      summary: `Form loaded with ${newForms.length} field group(s)`,
      affectedElements: newForms,
    });
  }

  const newToasts = findNewElements(newSnapshot.toasts, oldSnapshot.toasts);
  if (newToasts.length > 0) {
    changes.push({
      type: "toast_appeared",
      summary: `Notification appeared: ${newToasts.map((t) => t.text ?? "unknown").join("; ")}`,
      affectedElements: newToasts,
    });
  }

  const textChanged = oldSnapshot.title !== newSnapshot.title && oldSnapshot.url === newSnapshot.url;
  if (textChanged && changes.length === 0) {
    changes.push({
      type: "content_updated",
      summary: `Page content updated (title changed from "${oldSnapshot.title}" to "${newSnapshot.title}")`,
      affectedElements: [],
    });
  }

  return changes;
}

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
