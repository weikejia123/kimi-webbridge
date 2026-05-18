/**
 * Kimi WebBridge v2.0 — Protocol Version Negotiation
 *
 * Used during WebSocket handshake to ensure client and daemon
 * speak a compatible protocol version.
 */

export const SUPPORTED_VERSIONS = ["2.0"] as const;

/** Check whether a version string is supported. */
export function isVersionSupported(v: string): boolean {
  return SUPPORTED_VERSIONS.includes(v as (typeof SUPPORTED_VERSIONS)[number]);
}

/**
 * Negotiate a compatible version given the client's advertised version.
 * Returns the negotiated version if compatible, or null if not.
 */
export function negotiateVersion(clientVersion: string): string | null {
  if (isVersionSupported(clientVersion)) {
    return clientVersion;
  }
  return null;
}
