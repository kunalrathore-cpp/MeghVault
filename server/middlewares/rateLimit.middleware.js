import { rateLimit, ipKeyGenerator } from "express-rate-limit";

/**
 * Resolves the client rate-limiting identifier using a secure dual-mode (Session ID or IP) strategy.
 *
 * 1. Authenticated Users (Session ID):
 *    If a cryptographically signed session cookie (`req.signedCookies.sid`) exists,
 *    rate limiting is scoped to the verified session (`sess_<sid>`).
 *    - Eliminates false-positive lockouts on shared networks (corporate NAT, university Wi-Fi, cellular CGNAT).
 *    - Thwarts proxy-rotation evasion: an authenticated attacker cannot bypass limits by rotating IP addresses.
 *
 * 2. Unauthenticated Users (Client IP):
 *    Falls back to the normalized client IP address (`ip_<normalized_ip>`) with RFC-compliant
 *    IPv6 subnetting (preventing IPv6 address-hopping bypasses).
 *    - Protects unauthenticated endpoints (OTP dispatch, login attempts, public share links).
 *
 * 3. Composite Mode (Optional):
 *    If `RATE_LIMIT_COMPOSITE_KEY=true` in environment, combines both (`sess_<sid>#ip_<ip>`).
 *
 * @param {import("express").Request} req
 * @returns {string} Unique client identifier
 */
export function getClientIdentifier(req) {
  const sid = req.signedCookies?.sid;
  const rawIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  const clientIp = ipKeyGenerator(rawIp);

  if (sid) {
    if (process.env.RATE_LIMIT_COMPOSITE_KEY === "true") {
      return `sess_${sid}#ip_${clientIp}`;
    }
    return `sess_${sid}`;
  }

  return `ip_${clientIp}`;
}

/**
 * Universal Rate Limiter Factory
 * Creates structured, RFC-compliant rate limiters with standardized JSON errors,
 * standard headers (RateLimit-*), session-or-IP keying, and automatic CORS preflight bypass.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum allowed requests within window
 * @param {string} options.message - User-facing error message on 429
 * @param {boolean} [options.skipSuccessfulRequests=false] - Only count failed requests
 * @param {Function} [options.keyGenerator] - Optional custom key generator
 * @returns {import("express").RequestHandler}
 */
export function createRateLimiter({
  windowMs,
  max,
  message,
  skipSuccessfulRequests = false,
  keyGenerator = getClientIdentifier,
}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true, // Send RFC RateLimit-* headers
    legacyHeaders: false, // Disable legacy X-RateLimit-* headers
    keyGenerator,
    skipSuccessfulRequests,
    skip: (req) => {
      // Never rate-limit CORS preflight OPTIONS checks
      if (req.method === "OPTIONS") {
        return true;
      }
      // Optional bypass for test runner if explicitly configured
      if (process.env.NODE_ENV === "test" && process.env.DISABLE_RATE_LIMIT === "true") {
        return true;
      }
      return false;
    },
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

      res.set("Retry-After", String(retryAfter));
      return res.status(options.statusCode || 429).json({
        error:
          typeof options.message === "string"
            ? options.message
            : "Too many requests. Please try again later.",
        retryAfter,
      });
    },
    message,
  });
}

// ============================================================================
// TIER 1: Global DoS Shield
// Protects the server against volumetric HTTP flood attacks, scraping, and crawler loops.
// Default: 300 requests per 15 minutes per IP (~20 req/minute).
// ============================================================================
export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_GLOBAL_MAX
    ? parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10)
    : 300,
  message:
    "Too many requests from this IP address. Please slow down and try again after 15 minutes.",
});

// ============================================================================
// TIER 2: OTP Generation / Sending Limiter
// Protects transactional email service (Resend) from exhaustion & prevents inbox bombing.
// Default: 5 requests per 10 minutes per IP.
// ============================================================================
export const otpSendRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: process.env.RATE_LIMIT_OTP_SEND_MAX
    ? parseInt(process.env.RATE_LIMIT_OTP_SEND_MAX, 10)
    : 5,
  message:
    "Too many OTP requests from this IP. Please wait 10 minutes before requesting another verification code.",
});

// ============================================================================
// TIER 3: Authentication & Verification Brute-Force Limiter
// Protects 4-digit OTP codes and login credentials against automated brute-force attacks.
// Default: 10 attempts per 15 minutes per IP.
// ============================================================================
export const authVerifyRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_AUTH_VERIFY_MAX
    ? parseInt(process.env.RATE_LIMIT_AUTH_VERIFY_MAX, 10)
    : 10,
  message:
    "Too many authentication attempts from this IP. Please wait 15 minutes before trying again.",
});

// ============================================================================
// TIER 4: Shared Asset Password Verification Limiter
// Protects password-protected public links against dictionary attacks.
// Default: 10 attempts per 15 minutes per IP.
// ============================================================================
export const sharePasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_SHARE_PASS_MAX
    ? parseInt(process.env.RATE_LIMIT_SHARE_PASS_MAX, 10)
    : 10,
  message:
    "Too many security key attempts for this resource. Please wait 15 minutes before trying again.",
});

// ============================================================================
// TIER 5: File Upload & Heavy Mutation Limiter
// Protects disk I/O, storage capacity, and network bandwidth from flood attacks.
// Default: 60 uploads per 15 minutes per IP.
// ============================================================================
export const fileUploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_UPLOAD_MAX
    ? parseInt(process.env.RATE_LIMIT_UPLOAD_MAX, 10)
    : 60,
  message:
    "File upload limit reached for this session. Please wait a few minutes before uploading more files.",
});

// ============================================================================
// TIER 6: Archive / Zip Compression Limiter
// Protects CPU and memory from compression exhaustion during on-the-fly zip creation.
// Default: 20 zip downloads per 15 minutes per IP.
// ============================================================================
export const zipExportRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_ZIP_MAX
    ? parseInt(process.env.RATE_LIMIT_ZIP_MAX, 10)
    : 20,
  message:
    "Folder archive rate limit reached. Please wait a few minutes before downloading additional zip files.",
});

// ============================================================================
// TIER 7: Third-Party Integration Import Limiter
// Protects external API quotas (Google Drive, Google Photos, GitHub) and server queues.
// Default: 30 imports per 15 minutes per IP.
// ============================================================================
export const integrationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_INTEGRATION_MAX
    ? parseInt(process.env.RATE_LIMIT_INTEGRATION_MAX, 10)
    : 30,
  message:
    "Integration sync rate limit reached. Please wait a few minutes before importing additional items.",
});
