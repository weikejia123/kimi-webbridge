/**
 * Kimi WebBridge v2.0 — Rate Limiter
 *
 * Token bucket algorithm for per-tab rate limiting.
 */

export interface RateLimitConfig {
  maxActionsPerSecond: number;
  burstSize: number;
}

interface BucketState {
  tokens: number;
  lastUpdate: number;
}

const defaultConfig: RateLimitConfig = {
  maxActionsPerSecond: 1,
  burstSize: 3,
};

const buckets = new Map<number, BucketState>();

/**
 * Check whether an action is allowed for the given tab.
 * Returns { allowed, retryAfterMis }.
 */
export function checkRateLimit(
  tabId: number,
  config?: Partial<RateLimitConfig>,
): { allowed: boolean; retryAfterMs: number } {
  const cfg: RateLimitConfig = { ...defaultConfig, ...config };
  const now = Date.now();

  let bucket = buckets.get(tabId);
  if (!bucket) {
    bucket = { tokens: cfg.burstSize, lastUpdate: now };
    buckets.set(tabId, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsedMs = now - bucket.lastUpdate;
  const refillRateMs = 1000 / cfg.maxActionsPerSecond;
  const tokensToAdd = elapsedMs / refillRateMs;
  bucket.tokens = Math.min(cfg.burstSize, bucket.tokens + tokensToAdd);
  bucket.lastUpdate = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  const retryAfterMs = Math.ceil((1 - bucket.tokens) * refillRateMs);
  return { allowed: false, retryAfterMs };
}


/**
 * Clear bucket state for a tab (e.g. on tab closed).
 */
export function clearBucket(tabId: number): void {
  buckets.delete(tabId);
}
