/**
 * Per-domain policy enforcement.
 */

import { getCurrentPolicy } from "./status.js";

const SENSITIVE_TOOLS = new Set(["submit_form", "click_ref"]);

export function isDomainAllowed(url: string): boolean {
  const hostname = parseHostname(url);
  if (!hostname) {
    return true;
  }

  const policy = getCurrentPolicy();

  if (policy.blockedDomains.includes(hostname)) {
    return false;
  }

  if (policy.allowedDomains !== "all") {
    const allowed = policy.allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    if (!allowed) {
      return false;
    }
  }

  return true;
}

export async function checkPolicyBeforeAction(
  tabId: number,
  tool: string,
): Promise<{ allowed: boolean; reason?: string }> {
  let url: string | undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    url = tab.url;
  } catch {
    return { allowed: false, reason: "Tab not accessible" };
  }

  if (url && !isDomainAllowed(url)) {
    const hostname = parseHostname(url) ?? "unknown";
    return { allowed: false, reason: `Domain blocked: ${hostname}` };
  }

  const policy = getCurrentPolicy();
  if (policy.requireApproval && SENSITIVE_TOOLS.has(tool)) {
    return { allowed: false, reason: `Approval required for tool: ${tool}` };
  }

  return { allowed: true };
}

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
