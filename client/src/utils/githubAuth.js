/**
 * GitHub OAuth 2.0 Client Utility
 * Securely uses VITE_GITHUB_CLIENT_ID configured in client environment.
 */
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";

export const isGithubAuthEnabled = Boolean(GITHUB_CLIENT_ID);

/**
 * Build GitHub OAuth 2.0 Authorization URL on the client
 * @param {Object} options
 * @param {string} options.state - CSRF protection state token
 * @param {string} [options.redirectUri] - Authorized redirect URI
 * @returns {string} GitHub authorization URL
 */
export function buildGithubAuthUrl({
  state,
  redirectUri = "http://localhost:4000/auth/github/callback",
}) {
  if (!GITHUB_CLIENT_ID) {
    throw new Error(
      "GitHub Client ID (VITE_GITHUB_CLIENT_ID) is not configured in client/.env"
    );
  }

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state: state || "",
    allow_signup: "true",
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
