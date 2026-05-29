/**
 * Kimi WebBridge v2.0 — Permission Model
 *
 * Domain-based permission checking with wildcard support.
 */

export interface PermissionConfig {
  allowedDomains: string[];
  deniedDomains: string[];
  requireConfirmation: boolean;
}

const defaultConfig: PermissionConfig = {
  allowedDomains: ["<all_urls>"],
  deniedDomains: [],
  requireConfirmation: false,
};

/**
 * Convert a wildcard pattern to a RegExp.
 * e.g. "anything.localhost" -> /^.*\.localhost$/
 * e.g. "chroniccareiq.com" -> /^chroniccareiq\.com$/
 */
function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$");
}

/**
 * Check whether a URL is permitted by the given configuration.
 * Wildcard '*' is supported in domain patterns.
 */
export function checkDomainPermission(
  url: string,
  config?: Partial<PermissionConfig>,
): { allowed: boolean; reason?: string } {
  const cfg: PermissionConfig = { ...defaultConfig, ...config };

  let hostname: string | null;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  if (!hostname) {
    return { allowed: false, reason: "Cannot extract hostname from URL" };
  }

  // Check denied list first
  for (const denied of cfg.deniedDomains) {
    const regex = wildcardToRegex(denied);
    if (regex.test(hostname)) {
      return { allowed: false, reason: `Domain denied: ${hostname}` };
    }
  }

  // If allowedDomains is ["<all_urls>"], allow anything not denied
  if (cfg.allowedDomains.length === 1 && cfg.allowedDomains[0] === "<all_urls>") {
    return { allowed: true };
  }

  for (const allowed of cfg.allowedDomains) {
    const regex = wildcardToRegex(allowed);
    if (regex.test(hostname)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: `Domain not allowed: ${hostname}` };
}
