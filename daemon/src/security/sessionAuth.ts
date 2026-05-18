/**
 * Kimi WebBridge v2.0 — Session Token Authentication
 *
 * Simple token-based authentication for WebSocket connections.
 * Tokens are NOT required by default to allow easy development,
 * but can be enabled for production deployments.
 *
 * Environment variable KIMI_WEBBRIDGE_TOKEN sets a persistent token.
 * If unset and auth is required, a random token is generated at startup.
 */

import { randomBytes } from "crypto";

function loadEnvToken(): string | undefined {
  try {
    const envToken = process.env.KIMI_WEBBRIDGE_TOKEN;
    if (typeof envToken === "string" && envToken.length > 0) {
      return envToken;
    }
  } catch {
    // process.env may not be available in all runtimes
  }
  return undefined;
}

export class SessionAuth {
  private tokens = new Set<string>();
  private required = false;

  constructor() {
    const envToken = loadEnvToken();
    if (envToken) {
      this.tokens.add(envToken);
      this.required = true;
    }
  }

  /** Generate a new random 32-byte hex token. */
  generateToken(): string {
    const token = randomBytes(16).toString("hex");
    this.tokens.add(token);
    return token;
  }

  /** Validate whether a token exists in the active token set. */
  validateToken(token: string): boolean {
    if (!this.required) return true;
    return this.tokens.has(token);
  }

  /** Enable or disable token requirement. */
  requireToken(required: boolean): void {
    this.required = required;
  }

  /** Check whether token authentication is currently required. */
  isTokenRequired(): boolean {
    return this.required;
  }

  /** Revoke a specific token. */
  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  /** Clear all active tokens. */
  clearTokens(): void {
    this.tokens.clear();
    const envToken = loadEnvToken();
    if (envToken) {
      this.tokens.add(envToken);
    }
  }

  /** Get the number of active tokens. */
  tokenCount(): number {
    return this.tokens.size;
  }
}

/** Global singleton session auth instance. */
export const sessionAuth = new SessionAuth();
