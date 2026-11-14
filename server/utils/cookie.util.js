/**
 * Centralized Cookie Configuration Utility
 * Enforces production-grade security attributes (HttpOnly, Secure, SameSite=Lax)
 * across session, OAuth CSRF state, and authentication lifecycle operations.
 */

export const COOKIE_NAME = "sid";
export const OAUTH_STATE_COOKIE_NAME = "oauth_state";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
export const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

export const isProduction = process.env.NODE_ENV === "production";
export const isSecure = process.env.COOKIE_SECURE === "true" || isProduction;

/**
 * Standard cookie configuration for user session cookies.
 * Configured with SameSite=Lax and Secure for strict CSRF defense.
 * @param {number} [maxAge]
 * @returns {import("express").CookieOptions}
 */
export const getSessionCookieOptions = (maxAge = SESSION_MAX_AGE) => ({
  httpOnly: true,
  signed: true,
  sameSite: "lax",
  secure: isSecure,
  path: "/",
  maxAge,
});

/**
 * Standard options for clearing session cookies.
 * Matching attributes (path, sameSite, secure, httpOnly, signed) guarantee
 * reliable deletion across all modern browsers.
 * @returns {import("express").CookieOptions}
 */
export const getClearCookieOptions = () => ({
  httpOnly: true,
  signed: true,
  sameSite: "lax",
  secure: isSecure,
  path: "/",
});

/**
 * Standard cookie configuration for OAuth CSRF state verification cookies.
 * Short-lived (10m) signed cookie with SameSite=Lax to allow safe top-level OAuth callbacks.
 * @param {number} [maxAge]
 * @returns {import("express").CookieOptions}
 */
export const getOAuthStateCookieOptions = (maxAge = OAUTH_STATE_MAX_AGE) => ({
  httpOnly: true,
  signed: true,
  sameSite: "lax",
  secure: isSecure,
  path: "/",
  maxAge,
});

/**
 * Standard options for clearing non-session or resource cookies.
 * @returns {import("express").CookieOptions}
 */
export const getGeneralClearCookieOptions = () => ({
  sameSite: "lax",
  secure: isSecure,
  path: "/",
});
