/**
 * Google OAuth 2.0 Client Utility
 * Securely uses VITE_GOOGLE_CLIENT_ID configured in client environment.
 */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const isGoogleAuthEnabled = Boolean(GOOGLE_CLIENT_ID);

/**
 * Build Google OAuth 2.0 Authorization URL on the client
 * @param {Object} options
 * @param {string} options.state - CSRF protection state token
 * @param {string} [options.redirectUri] - Authorized redirect URI
 * @returns {string} Google authorization URL
 */
export function buildGoogleAuthUrl({
  state,
  redirectUri = "http://localhost:4000/auth/google/callback",
}) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "Google Client ID (VITE_GOOGLE_CLIENT_ID) is not configured in client/.env"
    );
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
    prompt: "consent",
    access_type: "offline",
    state: state || "",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
