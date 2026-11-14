import DOMPurify from "dompurify";

const BYPASS_KEYS = new Set([
  "password",
  "token",
  "secret",
  "code",
]);

/**
 * Strips all HTML/SVG tags, script elements, and dangerous characters from user text inputs.
 * Use for usernames, folder names, filenames, emails, search queries, etc.
 *
 * @param {string} value
 * @returns {string} Clean plain text
 */
export function sanitizeText(value) {
  if (typeof value !== "string") return value;

  const clean = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  return clean.trim();
}

/**
 * Sanitizes rich HTML markup, stripping scripts, dangerous handlers (onerror, onload),
 * and iframe/object exploits while preserving approved safe markup.
 *
 * @param {string} html
 * @param {import("dompurify").Config} [options]
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== "string") return html;
  return DOMPurify.sanitize(html, options);
}

/**
 * Validates that a URL does not execute scripts via javascript:, vbscript:, etc.
 *
 * @param {string} urlString
 * @returns {string|null} Safe URL or null if invalid/malicious
 */
export function sanitizeUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return null;

  const trimmed = urlString.trim();
  if (/^(javascript|vbscript|data(?!:image\/)):/i.test(trimmed)) {
    return null;
  }

  return DOMPurify.sanitize(trimmed);
}

/**
 * Deeply sanitizes an object or array before sending it over the wire or storing it.
 *
 * @param {any} input
 * @returns {any} Sanitized clone
 */
export function sanitizeObject(input) {
  if (!input || typeof input !== "object") {
    return typeof input === "string" ? sanitizeText(input) : input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeObject);
  }

  const clean = {};
  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (BYPASS_KEYS.has(lowerKey)) {
      clean[key] = value;
      continue;
    }

    if (typeof value === "string") {
      clean[key] = sanitizeText(value);
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
}

export { DOMPurify };
export default {
  sanitizeText,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeObject,
  DOMPurify,
};
