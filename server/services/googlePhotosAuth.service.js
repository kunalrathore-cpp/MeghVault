import "dotenv/config";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import User from "../models/user.model.js";
import { encryptToken, decryptToken } from "./encryption.service.js";

const clientId = (process.env.GOOGLE_CLIENT_ID || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const redirectUri = (
  process.env.GOOGLE_PHOTOS_REDIRECT_URI ||
  "http://localhost:4000/auth/google-photos/callback"
)
  .trim()
  .replace(/^["']|["']$/g, "");

export function createPhotosOAuthClient() {
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are missing."
    );
  }
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

/**
 * Generate Google Photos OAuth URL requesting offline access (refresh token)
 */
export function generatePhotosAuthUrl(state) {
  const client = createPhotosOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
      "https://www.googleapis.com/auth/photoslibrary.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state,
  });
}

/**
 * Exchange authorization code for tokens and fetch connected Google account email
 */
export async function exchangePhotosCode(code) {
  const client = createPhotosOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    email = data.email || null;
  } catch (err) {
    console.warn("Could not retrieve user email from Google OAuth:", err.message);
  }

  return {
    tokens,
    email,
  };
}

/**
 * Connect Google Photos credentials to user profile in MongoDB
 */
export async function saveUserPhotosCredentials(userId, { tokens, email }) {
  const encryptedRefreshToken = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : null;

  const updateFields = {
    "integrations.googlePhotos.connected": true,
    "integrations.googlePhotos.accessToken": tokens.access_token || null,
    "integrations.googlePhotos.expiryDate": tokens.expiry_date || null,
    ...(email ? { "integrations.googlePhotos.email": email } : {}),
  };

  if (encryptedRefreshToken) {
    updateFields["integrations.googlePhotos.refreshToken"] = encryptedRefreshToken;
  }

  await User.updateOne({ _id: userId }, { $set: updateFields });
}

/**
 * Get an authenticated Google Photos client token for the user.
 * Automatically refreshes access token if expired using stored encrypted refresh token.
 */
export async function getAuthenticatedPhotosClient(userId) {
  const user = await User.findById(userId).lean();
  if (!user || !user.integrations?.googlePhotos?.connected) {
    throw new Error("Google Photos is not connected for this user.");
  }

  const { refreshToken: encryptedRefreshToken, accessToken, expiryDate } =
    user.integrations.googlePhotos;

  if (!encryptedRefreshToken) {
    await User.updateOne(
      { _id: userId },
      { $set: { "integrations.googlePhotos.connected": false } }
    );
    throw new Error("Google Photos authorization expired. Please reconnect.");
  }

  const plainRefreshToken = decryptToken(encryptedRefreshToken);
  const client = createPhotosOAuthClient();

  client.setCredentials({
    refresh_token: plainRefreshToken,
    access_token: accessToken,
    expiry_date: expiryDate,
  });

  // Listen to automatic token refreshes by google-auth-library
  client.on("tokens", async (newTokens) => {
    const updates = {
      "integrations.googlePhotos.accessToken": newTokens.access_token,
      "integrations.googlePhotos.expiryDate": newTokens.expiry_date,
    };
    if (newTokens.refresh_token) {
      updates["integrations.googlePhotos.refreshToken"] = encryptToken(
        newTokens.refresh_token
      );
    }
    await User.updateOne({ _id: userId }, { $set: updates });
  });

  const tokenResponse = await client.getAccessToken();
  const currentAccessToken = tokenResponse?.token || accessToken;

  return {
    client,
    accessToken: currentAccessToken,
    email: user.integrations.googlePhotos.email,
  };
}
