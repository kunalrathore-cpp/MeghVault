import { getClientIdentifier } from "./rateLimit.middleware.js";

/**
 * In-Memory Store for API Throttling state.
 * Tracks active in-flight requests, token bucket balances, and timestamps.
 * Implements low-overhead automatic sweeping to prevent memory leaks.
 */
class ThrottleStore {
  constructor(cleanupIntervalMs = 60000, defaultTtlMs = 120000) {
    this.records = new Map();
    this.defaultTtlMs = defaultTtlMs;

    // Periodic sweep of idle records to preserve memory
    this.timer = setInterval(() => this.pruneIdle(), cleanupIntervalMs);
    if (this.timer.unref) {
      this.timer.unref(); // Don't prevent Node process termination
    }
  }

  /**
   * Retrieve or initialize client record for a given throttler scope and client key
   * @param {string} key
   * @param {number} maxTokens
   * @returns {Object} client record
   */
  get(key, maxTokens = 10) {
    let record = this.records.get(key);
    if (!record) {
      record = {
        active: 0,
        tokens: maxTokens,
        lastRefillAt: Date.now(),
        lastRequestAt: 0,
        lastReleasedAt: 0,
      };
      this.records.set(key, record);
    }
    return record;
  }

  /**
   * Refill token bucket based on elapsed time and refill rate
   * @param {Object} record
   * @param {number} maxTokens
   * @param {number} refillRatePerSec
   */
  refillTokens(record, maxTokens, refillRatePerSec) {
    const now = Date.now();
    const elapsedSec = (now - record.lastRefillAt) / 1000;
    if (elapsedSec > 0 && record.tokens < maxTokens) {
      const added = elapsedSec * refillRatePerSec;
      record.tokens = Math.min(maxTokens, record.tokens + added);
      record.lastRefillAt = now;
    }
  }

  /**
   * Prunes entries with 0 active requests that have been idle longer than TTL
   */
  pruneIdle() {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (record.active === 0 && now - record.lastRequestAt > this.defaultTtlMs) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Clear all records (useful for testing or shutdown)
   */
  reset() {
    this.records.clear();
  }
}

// Global shared store singleton
export const sharedThrottleStore = new ThrottleStore();

/**
 * Universal Surgical Throttler Factory
 *
 * Combines:
 * 1. Concurrency Limiting (In-Flight Guard): Caps simultaneous CPU/IO tasks per client.
 * 2. Minimum Spacing / Cooldown: Prevents rapid-fire bursts on expensive operations.
 * 3. Token Bucket Cost Accounting: Allocates burst tokens with gradual replenishment.
 * 4. Dual Identification: Session ID when authenticated, client IP when unauthenticated.
 *
 * @param {Object} config
 * @param {string} config.name - Unique namespace for the throttler (e.g., "zip-compress", "bcrypt-verify")
 * @param {number} [config.maxConcurrent=1] - Maximum simultaneous active executions per client
 * @param {number} [config.minSpacingMs=0] - Minimum milliseconds between consecutive requests
 * @param {number} [config.bucketCapacity=10] - Token bucket maximum capacity
 * @param {number} [config.refillRatePerSec=1] - Token refill rate per second
 * @param {number} [config.costPerRequest=1] - Token cost per invocation
 * @param {string} [config.message] - Custom user-facing error message on 429
 * @param {Function} [config.keyResolver] - Optional custom key resolver (defaults to getClientIdentifier)
 * @returns {import("express").RequestHandler}
 */
export function createThrottler({
  name,
  maxConcurrent = 1,
  minSpacingMs = 0,
  bucketCapacity = 10,
  refillRatePerSec = 1,
  costPerRequest = 1,
  message = "This operation is temporarily throttled. Please wait before retrying.",
  keyResolver = getClientIdentifier,
}) {
  return (req, res, next) => {
    // Never throttle CORS preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return next();
    }

    // Optional test environment bypass
    if (process.env.NODE_ENV === "test" && process.env.DISABLE_THROTTLING === "true") {
      return next();
    }

    const clientIdentifier = keyResolver(req);
    const scopeKey = `${name}:${clientIdentifier}`;
    const record = sharedThrottleStore.get(scopeKey, bucketCapacity);
    const now = Date.now();

    // Refill tokens
    sharedThrottleStore.refillTokens(record, bucketCapacity, refillRatePerSec);

    // ------------------------------------------------------------------------
    // Check 1: Concurrency Limiting (In-Flight Active Tasks)
    // ------------------------------------------------------------------------
    if (record.active >= maxConcurrent) {
      const retryAfter = 2; // conservative estimate in seconds
      res.set("Retry-After", String(retryAfter));
      res.set("X-Throttle-Scope", name);
      res.set("X-Throttle-Active", String(record.active));
      res.set("X-Throttle-Max-Concurrent", String(maxConcurrent));

      return res.status(429).json({
        error:
          message ||
          `Task concurrency limit exceeded: ${record.active} active operation(s) in progress. Please wait for one to complete.`,
        throttled: true,
        reason: "CONCURRENCY_LIMIT_EXCEEDED",
        active: record.active,
        maxConcurrent,
        retryAfter,
      });
    }

    // ------------------------------------------------------------------------
    // Check 2: Minimum Spacing / Burst Smoothing
    // ------------------------------------------------------------------------
    if (minSpacingMs > 0 && record.lastRequestAt > 0) {
      const elapsed = now - record.lastRequestAt;
      if (elapsed < minSpacingMs) {
        const waitMs = minSpacingMs - elapsed;
        const retryAfter = Math.max(1, Math.ceil(waitMs / 1000));

        res.set("Retry-After", String(retryAfter));
        res.set("X-Throttle-Scope", name);
        res.set("X-Throttle-Cooldown-Remaining-Ms", String(waitMs));

        return res.status(429).json({
          error:
            message ||
            `Task pacing limit: Please wait ${Math.ceil(waitMs / 1000)}s before initiating another request.`,
          throttled: true,
          reason: "PACING_LIMIT_EXCEEDED",
          waitMs,
          retryAfter,
        });
      }
    }

    // ------------------------------------------------------------------------
    // Check 3: Token Bucket Budget
    // ------------------------------------------------------------------------
    if (record.tokens < costPerRequest) {
      const neededTokens = costPerRequest - record.tokens;
      const retryAfter = Math.max(1, Math.ceil(neededTokens / refillRatePerSec));

      res.set("Retry-After", String(retryAfter));
      res.set("X-Throttle-Scope", name);
      res.set("X-Throttle-Remaining-Tokens", String(Math.floor(record.tokens)));

      return res.status(429).json({
        error:
          message ||
          "Operational capacity limit reached. Please wait a moment before trying again.",
        throttled: true,
        reason: "TOKEN_BUCKET_EXHAUSTED",
        remainingTokens: Math.floor(record.tokens),
        retryAfter,
      });
    }

    // ------------------------------------------------------------------------
    // Acquire Execution Slot
    // ------------------------------------------------------------------------
    record.active++;
    record.tokens = Math.max(0, record.tokens - costPerRequest);
    record.lastRequestAt = now;

    // Attach tracking headers to successful response
    res.set("X-Throttle-Scope", name);
    res.set("X-Throttle-Active", String(record.active));
    res.set("X-Throttle-Max-Concurrent", String(maxConcurrent));

    // ------------------------------------------------------------------------
    // Release Execution Slot (Guaranteed Single-Fire on finish/close/error)
    // ------------------------------------------------------------------------
    let isReleased = false;
    const releaseSlot = () => {
      if (isReleased) return;
      isReleased = true;

      record.active = Math.max(0, record.active - 1);
      record.lastReleasedAt = Date.now();
    };

    res.on("finish", releaseSlot);
    res.on("close", releaseSlot);
    res.on("error", releaseSlot);

    next();
  };
}

// ============================================================================
// SURGICAL PRE-CONFIGURED THROTTLERS FOR EXPENSIVE CPU / IO TASKS
// ============================================================================

/**
 * 1. Directory Zip Compression Throttler
 * Heavy CPU task: zlib streaming compression.
 * Enforces: Max 1 active zip creation at a time per user/IP, with 1.5s spacing.
 */
export const zipCompressionThrottler = createThrottler({
  name: "zip-compression",
  maxConcurrent: 1,
  minSpacingMs: 1500,
  bucketCapacity: 5,
  refillRatePerSec: 0.5,
  costPerRequest: 1,
  message:
    "A folder compression task is already active for your session. Please wait for it to finish before downloading another archive.",
});

/**
 * 2. Cryptographic Password Verification Throttler
 * Heavy CPU task: bcrypt.compare (runs on UV threadpool).
 * Enforces: Max 1 concurrent password check per client, with 600ms spacing to prevent threadpool starvation.
 */
export const cryptoPasswordThrottler = createThrottler({
  name: "crypto-password",
  maxConcurrent: 1,
  minSpacingMs: 600,
  bucketCapacity: 6,
  refillRatePerSec: 1,
  costPerRequest: 1,
  message:
    "Security key verification is currently processing. Please wait a moment before trying again.",
});

/**
 * 3. File Upload Stream Throttler
 * Heavy I/O task: Multipart parsing, disk chunk streaming, hashing.
 * Enforces: Max 3 concurrent uploads per user/IP, with 100ms spacing.
 */
export const fileUploadThrottler = createThrottler({
  name: "file-upload",
  maxConcurrent: 3,
  minSpacingMs: 100,
  bucketCapacity: 15,
  refillRatePerSec: 2,
  costPerRequest: 1,
  message:
    "Maximum concurrent uploads reached for your session. Please wait for active uploads to finish.",
});

/**
 * 4. Bulk Cloud Integration Import Throttler
 * Heavy CPU/Network task: Google Drive / Photos / GitHub repo bulk fetching & disk writes.
 * Enforces: Max 1 concurrent import job per client, with 3s pacing.
 */
export const bulkImportThrottler = createThrottler({
  name: "bulk-import",
  maxConcurrent: 1,
  minSpacingMs: 3000,
  bucketCapacity: 3,
  refillRatePerSec: 0.2,
  costPerRequest: 1,
  message:
    "A cloud repository or photo import task is already running for your account. Please wait for it to complete.",
});

/**
 * 5. Admin Recursive Storage Telemetry Throttler
 * Heavy DB & Filesystem task: Recursive directory sizing and physical disk stat accumulation.
 * Enforces: Max 1 concurrent storage calculation per admin, with 1s spacing.
 */
export const adminStorageThrottler = createThrottler({
  name: "admin-storage-telemetry",
  maxConcurrent: 1,
  minSpacingMs: 1000,
  bucketCapacity: 5,
  refillRatePerSec: 1,
  costPerRequest: 1,
  message:
    "Storage recalculation is already in progress. Please wait a moment before requesting another telemetry update.",
});

/**
 * 6. High-Impact Account Operations Throttler
 * Heavy DB & Filesystem task: Cascade account deletion, ownership transfer, email migrations.
 * Enforces: Max 1 concurrent execution per user/session, with 2s spacing to prevent race conditions.
 */
export const accountOperationThrottler = createThrottler({
  name: "account-operation",
  maxConcurrent: 1,
  minSpacingMs: 2000,
  bucketCapacity: 5,
  refillRatePerSec: 0.5,
  costPerRequest: 1,
  message:
    "An account modification is already in progress. Please wait a moment before trying again.",
});
