import { sanitizeObject } from "../utils/sanitize.js";

/**
 * Safely assign properties to Express Request object.
 * In Express 5, req.query is a getter-only property on the request prototype,
 * so direct assignment (req.query = ...) throws a TypeError.
 * Using Object.defineProperty safely overrides the instance property without errors.
 */
function setRequestProperty(req, prop, value) {
  const cleanValue = sanitizeObject(value);
  if (prop === "query") {
    Object.defineProperty(req, "query", {
      value: cleanValue,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    try {
      req[prop] = cleanValue;
    } catch {
      Object.defineProperty(req, prop, {
        value: cleanValue,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/**
 * Universal production-ready Zod validation middleware for Express.
 * Accepts either:
 *  1) A single Zod schema representing the body, or an object containing { body, query, params, headers }
 *  2) A configuration object: { body?: ZodSchema, query?: ZodSchema, params?: ZodSchema, headers?: ZodSchema }
 *
 * Automatically sanitizes and replaces req.body, req.query, and req.params with the parsed output.
 */
export const validate = (schemaConfig) => async (req, res, next) => {
  try {
    if (!schemaConfig) {
      return next();
    }

    const isZodType = typeof schemaConfig?.parseAsync === "function";

    if (isZodType) {
      const shape = schemaConfig.shape;
      const hasHttpTargets =
        shape && (shape.body || shape.query || shape.params || shape.headers);

      if (hasHttpTargets) {
        const payloadToValidate = {};
        if (shape.body) payloadToValidate.body = req.body;
        if (shape.query) payloadToValidate.query = req.query;
        if (shape.params) payloadToValidate.params = req.params;
        if (shape.headers) payloadToValidate.headers = req.headers;

        const parsed = await schemaConfig.parseAsync(payloadToValidate);
        if (parsed.body !== undefined) setRequestProperty(req, "body", parsed.body);
        if (parsed.query !== undefined) setRequestProperty(req, "query", parsed.query);
        if (parsed.params !== undefined) setRequestProperty(req, "params", parsed.params);
      } else {
        // Fallback: validates req.body directly
        const parsedBody = await schemaConfig.parseAsync(req.body);
        setRequestProperty(req, "body", parsedBody);
      }
    } else if (typeof schemaConfig === "object") {
      // Configuration object pattern { body, query, params, headers }
      if (schemaConfig.params) {
        const parsedParams = await schemaConfig.params.parseAsync(req.params);
        setRequestProperty(req, "params", parsedParams);
      }
      if (schemaConfig.query) {
        const parsedQuery = await schemaConfig.query.parseAsync(req.query);
        setRequestProperty(req, "query", parsedQuery);
      }
      if (schemaConfig.body) {
        const parsedBody = await schemaConfig.body.parseAsync(req.body);
        setRequestProperty(req, "body", parsedBody);
      }
      if (schemaConfig.headers) {
        await schemaConfig.headers.parseAsync(req.headers);
      }
    }

    return next();
  } catch (err) {
    if (err?.name === "ZodError" || Array.isArray(err?.issues)) {
      const details = (err.issues || []).map((issue) => {
        const rawPath = issue.path || [];
        let location = "body";
        let field = rawPath.join(".");

        if (
          rawPath.length > 0 &&
          ["body", "query", "params", "headers"].includes(rawPath[0])
        ) {
          location = rawPath[0];
          field = rawPath.slice(1).join(".") || location;
        }

        return {
          location,
          field,
          message: issue.message,
        };
      });

      const firstMessage = details[0]?.message || "Validation failed";

      return res.status(400).json({
        error: firstMessage,
        message: firstMessage,
        details,
      });
    }

    return next(err);
  }
};

export default validate;
