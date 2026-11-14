import DOMPurify from "isomorphic-dompurify";

// Sensitive keys whose values should never be altered by HTML stripping (e.g. passwords, hashes, raw tokens)
const BYPASS_KEYS = new Set([
  "password",
  "pass",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "credential",
  "credentials",
  "code",
]);

/**
 * Sanitizes plain text input by stripping all HTML tags, script elements,
 * event handlers, and malicious control characters.
 *
 * @param {string} value
 * @returns {string} Sanitized clean string
 */
export function sanitizeText(value) {
  if (typeof value !== "string") return value;

  // Strip all HTML/SVG/MathML tags and attributes for strict plain-text safety
  const clean = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  return clean.trim();
}

/**
 * Sanitizes HTML or SVG strings while preserving safe markup.
 *
 * @param {string} html
 * @param {import("dompurify").Config} [options]
 * @returns {string} Sanitized HTML/SVG string
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== "string") return html;
  return DOMPurify.sanitize(html, options);
}

/**
 * Validates and sanitizes a URL to ensure it does not use javascript:, data:, or vbscript:
 *
 * @param {string} urlString
 * @returns {string|null} Safe URL string or null if unsafe
 */
export function sanitizeUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return null;

  const trimmed = urlString.trim();
  // Disallow javascript:, vbscript:, and file: schemes
  if (/^(javascript|vbscript|data(?!:image\/)):/i.test(trimmed)) {
    return null;
  }

  const clean = DOMPurify.sanitize(trimmed);
  return clean;
}

/**
 * Recursively traverses and sanitizes all string fields in an object or array.
 * Preserves numbers, booleans, null, Buffers, and bypasses sensitive fields like passwords.
 *
 * @param {any} input
 * @returns {any} Sanitized clone of input
 */
export function sanitizeObject(input) {
  if (!input || typeof input !== "object") {
    return typeof input === "string" ? sanitizeText(input) : input;
  }

  if (Buffer.isBuffer(input) || input instanceof Uint8Array || input instanceof Date) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();

    if (BYPASS_KEYS.has(lowerKey)) {
      // Passwords and raw crypto tokens should not be modified
      sanitized[key] = value;
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export default {
  sanitizeText,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeObject,
};
