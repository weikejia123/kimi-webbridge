/**
 * Kimi WebBridge v2.0 — Origin Policy
 *
 * Defense-in-depth origin check. The daemon already binds to 127.0.0.1,
 * but this provides an additional layer for filtering connections.
 */

export class OriginPolicy {
  private allowedOrigins = new Set<string>(["localhost", "127.0.0.1", "::1"]);

  /** Check whether an address is in the allowed origin set. */
  isAllowed(address: string): boolean {
    const normalized = this.normalizeAddress(address);
    return this.allowedOrigins.has(normalized);
  }

  /** Add an allowed origin. */
  addAllowed(origin: string): void {
    this.allowedOrigins.add(this.normalizeAddress(origin));
  }

  /** Remove an allowed origin. */
  removeAllowed(origin: string): void {
    this.allowedOrigins.delete(this.normalizeAddress(origin));
  }

  /** Get the list of currently allowed origins. */
  getAllowedOrigins(): string[] {
    return Array.from(this.allowedOrigins);
  }

  private normalizeAddress(address: string): string {
    // Strip IPv4-mapped IPv6 prefix
    if (address.startsWith("::ffff:")) {
      return address.slice(7);
    }
    return address;
  }
}

/** Global singleton origin policy instance. */
export const originPolicy = new OriginPolicy();
