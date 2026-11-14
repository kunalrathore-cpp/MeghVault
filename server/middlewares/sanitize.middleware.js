import { sanitizeObject, sanitizeText } from "../utils/sanitize.js";

/**
 * Global Express sanitization middleware powered by DOMPurify (via isomorphic-dompurify).
 * Deeply scrubs incoming request bodies, query strings, and URL parameters to prevent
 * Cross-Site Scripting (XSS), script injection, and HTML payload tampering.
 */
export function sanitizeRequestMiddleware(req, res, next) {
  try {
    // 1. Sanitize JSON / URL-encoded body
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }

    // 2. Sanitize URL query parameters (handling Express 5 getter-only property safely)
    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = sanitizeObject(req.query);
      Object.defineProperty(req, "query", {
        value: sanitizedQuery,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    // 3. Sanitize route parameters
    if (req.params && typeof req.params === "object") {
      for (const key of Object.keys(req.params)) {
        if (typeof req.params[key] === "string") {
          req.params[key] = sanitizeText(req.params[key]);
        }
      }
    }

    return next();
  } catch (err) {
    console.error("Sanitization middleware error:", err);
    return next(err);
  }
}

export default sanitizeRequestMiddleware;
