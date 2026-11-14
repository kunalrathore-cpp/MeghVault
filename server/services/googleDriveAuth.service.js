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
  process.env.GOOGLE_DRIVE_REDIRECT_URI ||
  "http://localhost:4000/auth/google-drive/callback"
)
  .trim()
  .replace(/^["']|["']$/g, "");

export function createDriveOAuthClient() {
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
 * Generate Google Drive OAuth URL requesting offline access (refresh token)
 */
export function generateDriveAuthUrl(state) {
  const client = createDriveOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

/**
 * Exchange authorization code for tokens and fetch connected Google account email
 */
export async function exchangeDriveCode(code) {
  const client = createDriveOAuthClient();
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
 * Connect Google Drive credentials to user profile in MongoDB
 */
export async function saveUserDriveCredentials(userId, { tokens, email }) {
  const encryptedRefreshToken = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : null;

  const updateFields = {
    "integrations.googleDrive.connected": true,
    "integrations.googleDrive.accessToken": tokens.access_token || null,
    "integrations.googleDrive.expiryDate": tokens.expiry_date || null,
    ...(email ? { "integrations.googleDrive.email": email } : {}),
  };

  if (encryptedRefreshToken) {
    updateFields["integrations.googleDrive.refreshToken"] = encryptedRefreshToken;
  }

  await User.updateOne({ _id: userId }, { $set: updateFields });
}

/**
 * Get an authenticated Google Drive API client for the user.
 * Automatically refreshes access token if expired using stored encrypted refresh token.
 */
export async function getAuthenticatedDriveClient(userId) {
  const user = await User.findById(userId).lean();
  if (!user || !user.integrations?.googleDrive?.connected) {
    throw new Error("Google Drive is not connected for this user.");
  }

  const { refreshToken: encryptedRefreshToken, accessToken, expiryDate } =
    user.integrations.googleDrive;

  if (!encryptedRefreshToken) {
    // Revoke connection flag if refresh token is missing
    await User.updateOne(
      { _id: userId },
      { $set: { "integrations.googleDrive.connected": false } }
    );
    throw new Error("Google Drive authorization expired. Please reconnect.");
  }

  const plainRefreshToken = decryptToken(encryptedRefreshToken);
  const client = createDriveOAuthClient();

  client.setCredentials({
    refresh_token: plainRefreshToken,
    access_token: accessToken,
    expiry_date: expiryDate,
  });

  // Listen to automatic token refreshes by google-auth-library
  client.on("tokens", async (newTokens) => {
    const updates = {
      "integrations.googleDrive.accessToken": newTokens.access_token,
      "integrations.googleDrive.expiryDate": newTokens.expiry_date,
    };
    if (newTokens.refresh_token) {
      updates["integrations.googleDrive.refreshToken"] = encryptToken(
        newTokens.refresh_token
      );
    }
    await User.updateOne({ _id: userId }, { $set: updates });
  });

  // Force get/refresh token to ensure validity for the native Picker and backend streaming
  const tokenResponse = await client.getAccessToken();
  const currentAccessToken = tokenResponse?.token || accessToken;

  const drive = google.drive({ version: "v3", auth: client });

  return {
    drive,
    client,
    accessToken: currentAccessToken,
    email: user.integrations.googleDrive.email,
  };
}
