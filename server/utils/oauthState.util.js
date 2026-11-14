import crypto from "crypto";
import {
  OAUTH_STATE_COOKIE_NAME,
  getOAuthStateCookieOptions,
  getClearCookieOptions,
} from "./cookie.util.js";

/**
 * Generate cryptographically secure random state token and set signed httpOnly cookie
 * Supports optional payload for tagging action type (e.g. login vs repo integration)
 * Configured with SameSite=Lax and Secure for CSRF defense.
 * @param {import("express").Response} res
 * @param {Object} [payload] - Optional metadata payload (e.g. { action: "repo-integration", userId })
 * @returns {string} State token for OAuth provider
 */
export function generateOAuthState(res, payload = null) {
  const randomHex = crypto.randomBytes(32).toString("hex");
  let state = randomHex;

  if (payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    state = `${randomHex}.${encodedPayload}`;
  }

  res.cookie(
    OAUTH_STATE_COOKIE_NAME,
    { state: randomHex, payload },
    getOAuthStateCookieOptions()
  );

  return state;
}

/**
 * Validate incoming state against signed cookie and clear cookie
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {{ valid: boolean, payload: any } | null} Returns validation result or null if invalid
 */
export function validateOAuthState(req, res) {
  const receivedState = req.query?.state;
  const expectedData = req.signedCookies?.[OAUTH_STATE_COOKIE_NAME];

  // Immediately clear state cookie once read with matching security options
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, getClearCookieOptions());

  if (!receivedState || !expectedData) {
    return null;
  }

  const expectedState = typeof expectedData === "object" ? expectedData.state : expectedData;
  const payload = typeof expectedData === "object" ? expectedData.payload : null;

  // Extract the random hex portion if state contains encoded payload
  const receivedRandomHex = receivedState.split(".")[0];

  if (!receivedRandomHex || receivedRandomHex !== expectedState) {
    return null;
  }

  return { valid: true, payload };
}
