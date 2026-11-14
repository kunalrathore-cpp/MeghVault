import crypto from "crypto";

const SECRET_KEY =
  process.env.MY_SECERT_KEY || "meghvault_super_secure_secret_fallback_key_2026";

/**
 * Creates a cryptographically signed HMAC token for sensitive multi-step actions
 * @param {object} payload - Data to embed (e.g. { userId, newEmail })
 * @param {number} ttlMs - Time to live in milliseconds (defaults to 10 minutes)
 * @returns {string} Signed token: `${encodedPayload}.${signature}`
 */
export function createSignedToken(payload, ttlMs = 10 * 60 * 1000) {
  const data = {
    ...payload,
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(8).toString("hex"),
  };

  const jsonStr = JSON.stringify(data);
  const encodedPayload = Buffer.from(jsonStr).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes an HMAC signed token
 * @param {string} token - The signed token string
 * @returns {{ valid: boolean, payload: object | null, error?: string }}
 */
export function verifySignedToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, payload: null, error: "Malformed token" };
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { valid: false, payload: null, error: "Invalid token structure" };
  }

  // Recalculate signature
  const expectedSignature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(encodedPayload)
    .digest("base64url");

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, payload: null, error: "Invalid token signature" };
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr);

    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, payload: null, error: "Token has expired" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null, error: "Failed to parse token payload" };
  }
}
