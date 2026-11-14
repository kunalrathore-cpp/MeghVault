import "dotenv/config";
import { OAuth2Client } from "google-auth-library";

const clientId = (process.env.GOOGLE_CLIENT_ID || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const redirectUrl = (
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:4000/auth/google/callback"
)
  .trim()
  .replace(/^["']|["']$/g, "");

export const oauth2Client = new OAuth2Client({
  clientId,
  clientSecret,
  redirectUri: redirectUrl,
});

/**
 * Generate Google OAuth 2.0 authorization URL
 * Uses OpenID Connect scopes: openid, email, profile
 * prompt: 'consent' ensures the user consent screen is presented
 */
export function generateGoogleAuthUrl(state) {
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured."
    );
  }

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    prompt: "consent",
    state,
  });
}

/**
 * Exchange authorization code for tokens and cryptographically verify the id_token
 */
export async function verifyGoogleAuthCode(code) {
  if (!code) {
    throw new Error("Authorization code is required from Google callback.");
  }

  // 1. Exchange authorization code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens || !tokens.id_token) {
    throw new Error("Google token exchange failed to return an id_token.");
  }

  // 2. Cryptographically verify the id_token using Google's public certificates
  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Invalid Google id_token payload.");
  }

  // 3. Ensure email is verified by Google
  if (!payload.email_verified) {
    throw new Error("Your Google email address is not verified.");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.email.split("@")[0],
    profile: payload.picture || null,
  };
}
