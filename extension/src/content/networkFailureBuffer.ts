/**
 * Kimi WebBridge v2.0 — Network Failure Buffer
 *
 * Captures recent failed network requests for observation APIs.
 */

import type { NetworkFailure } from "../shared/protocol.js";

const MAX_FAILURES = 50;
const buffer: NetworkFailure[] = [];
let started = false;

function pushFailure(failure: NetworkFailure): void {
  buffer.push(failure);
  if (buffer.length > MAX_FAILURES) {
    buffer.shift();
  }
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type XHROpenFn = (
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
) => void;

type XHRSendFn = (body?: Document | XMLHttpRequestBodyInit | null) => void;

interface XHRMeta {
  _bridgeMethod?: string;
  _bridgeUrl?: string;
}

export function startNetworkFailureBuffer(): void {
  if (started) return;
  started = true;

  const origFetch = window.fetch.bind(window) as FetchFn;
  (window as unknown as { fetch: FetchFn }).fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? "GET";
    try {
      const response = await origFetch(input, init);
      if (!response.ok) {
        pushFailure({
          timestamp: Date.now(),
          url,
          method,
          status: response.status,
          error: `HTTP ${response.status} ${response.statusText}`,
        });
      }
      return response;
    } catch (err: unknown) {
      pushFailure({
        timestamp: Date.now(),
        url,
        method,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const origXHROpen = XMLHttpRequest.prototype.open as unknown as XHROpenFn;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & XHRMeta,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    this._bridgeMethod = method;
    this._bridgeUrl = typeof url === "string" ? url : url.href;
    return origXHROpen.call(this, method, url, async, username, password);
  };

  const origXHRSend = XMLHttpRequest.prototype.send as unknown as XHRSendFn;
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & XHRMeta,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const self = this;
    const handleLoad = (): void => {
      if (self.status >= 400) {
        pushFailure({
          timestamp: Date.now(),
          url: self._bridgeUrl ?? "",
          method: self._bridgeMethod ?? "GET",
          status: self.status,
          error: `HTTP ${self.status} ${self.statusText}`,
        });
      }
      cleanup();
    };
    const handleError = (): void => {
      pushFailure({
        timestamp: Date.now(),
        url: self._bridgeUrl ?? "",
        method: self._bridgeMethod ?? "GET",
        error: "Network error",
      });
      cleanup();
    };
    const cleanup = (): void => {
      self.removeEventListener("load", handleLoad);
      self.removeEventListener("error", handleError);
    };
    self.addEventListener("load", handleLoad);
    self.addEventListener("error", handleError);
    return origXHRSend.call(this, body);
  };
}

export function getRecentNetworkFailures(limit = 10): NetworkFailure[] {
  return buffer.slice(-limit);
}
