/**
 * Kimi WebBridge v2.0 — DOM Fingerprint
 *
 * Fast, non-cryptographic fingerprint of key DOM features for stability
 * detection across snapshots.
 */

export interface DomFingerprint {
  hash: string;
  elementCount: number;
  interactiveCount: number;
  modalCount: number;
  formCount: number;
  timestamp: number;
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16);
}

export function captureFingerprint(): DomFingerprint {
  const elementCount = document.querySelectorAll("*").length;

  const interactiveSelector =
    'a, button, input, textarea, select, [contenteditable="true"], ' +
    '[role="button"], [role="link"], [role="checkbox"], [role="radio"], ' +
    '[role="menuitem"], [role="tab"], [role="switch"]';
  const interactiveCount = document.querySelectorAll(interactiveSelector).length;

  const modalCount = document.querySelectorAll(
    "dialog[open], [role='dialog'], .modal, .modal.show, [class*='modal']:not([class*='modal-backdrop'])"
  ).length;

  const formCount = document.querySelectorAll("form").length;

  const htmlLen = document.documentElement?.innerHTML?.length ?? 0;
  const raw = `${htmlLen}:${interactiveCount}:${modalCount}:${formCount}`;
  const hash = simpleHash(raw);

  return {
    hash,
    elementCount,
    interactiveCount,
    modalCount,
    formCount,
    timestamp: Date.now(),
  };
}

export function fingerprintStable(a: DomFingerprint, b: DomFingerprint): boolean {
  if (a.hash !== b.hash) return false;
  if (a.elementCount !== b.elementCount) return false;
  if (a.interactiveCount !== b.interactiveCount) return false;
  if (a.modalCount !== b.modalCount) return false;
  if (a.formCount !== b.formCount) return false;
  return true;
}
