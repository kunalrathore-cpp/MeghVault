import OTP from "../models/otp.model.js";
import User from "../models/user.model.js";
import { findOrCreateUser } from "../services/auth.service.js";
import { createUserSession } from "../services/session.service.js";
import {
  generateGoogleAuthUrl,
  verifyGoogleAuthCode,
} from "../services/googleAuth.service.js";
import {
  generateGithubAuthUrl,
  verifyGithubAuthCode,
} from "../services/githubAuth.service.js";
import {
  generateOAuthState,
  validateOAuthState,
} from "../utils/oauthState.util.js";
import { renderPopupResponse } from "../utils/oauthPopup.util.js";

/**
 * Unified Passwordless Authentication (Email + OTP)
 */
export const userAuth = async (req, res) => {
  const { email, otp } = req.body || {};
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanOtp = (otp || "").trim();

  if (!cleanEmail || !cleanOtp) {
    return res
      .status(400)
      .json({ error: "Email and verification code are required" });
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    return res
      .status(400)
      .json({ error: "Please enter a valid email address" });
  }

  try {
    // 1. Verify OTP
    const foundOTPRecord = await OTP.findOne({
      email: cleanEmail,
      otp: cleanOtp,
    });
    if (!foundOTPRecord) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code" });
    }

    // 2. Consume OTP
    await OTP.deleteMany({ email: cleanEmail });

    // 3. Find or Auto-Provision User with emailAuth flag
    const user = await findOrCreateUser({
      email: cleanEmail,
      name: cleanEmail.split("@")[0],
      authProvider: {
        emailAuth: true,
      },
    });

    // 4. Create Session and set signed cookie
    await createUserSession(user._id, res);

    return res.status(200).json({
      message: "Authenticated successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profile: user.profile,
        role: user.role || "User",
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return res
      .status(500)
      .json({ message: "Authentication failed", error: error.message });
  }
};

/**
 * Generate Google OAuth 2.0 URL (JSON endpoint for popup initiation)
 */
export const getGoogleAuthUrlHandler = (req, res) => {
  try {
    const state = generateOAuthState(res);
    const url = generateGoogleAuthUrl(state);
    return res.status(200).json({ success: true, url, state });
  } catch (error) {
    console.error("Google Auth URL Generation Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to initialize Google authentication",
    });
  }
};

/**
 * Direct Google OAuth 2.0 redirection (fallback for non-popup redirects)
 */
export const googleAuthDirectHandler = (req, res) => {
  try {
    const state = generateOAuthState(res);
    const url = generateGoogleAuthUrl(state);
    return res.redirect(url);
  } catch (error) {
    console.error("Google Auth Direct Redirect Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to redirect to Google",
    });
  }
};

/**
 * Google OAuth 2.0 Callback Handler
 * Handles Google redirection, validates CSRF state, exchanges code for tokens,
 * cryptographically verifies id_token, provisions user and establishes session.
 */
export const googleAuthCallbackHandler = async (req, res) => {
  const { code, error } = req.query;

  // Handle Google user consent cancellation or authorization errors
  if (error) {
    console.warn("Google OAuth callback returned error:", error);
    return renderPopupResponse(res, {
      success: false,
      error:
        error === "access_denied"
          ? "Google sign-in was cancelled."
          : `Google error: ${error}`,
    });
  }

  // Validate CSRF state token against signed cookie
  const isStateValid = validateOAuthState(req, res);
  if (!isStateValid) {
    console.error("CSRF state mismatch or missing in Google OAuth callback");
    return renderPopupResponse(res, {
      success: false,
      error:
        "Security validation failed (CSRF state mismatch). Please try again.",
    });
  }

  try {
    // 1. Exchange code and cryptographically verify id_token with Google
    const { email, name, profile, googleId } = await verifyGoogleAuthCode(code);

    // 2. Find or auto-provision user with googleAuth provider info
    const user = await findOrCreateUser({
      email,
      name,
      profile,
      authProvider: {
        googleAuth: googleId,
      },
    });

    // 3. Establish active session
    await createUserSession(user._id, res);

    // 4. Render popup closing response communicating success to client
    return renderPopupResponse(res, { success: true });
  } catch (err) {
    const isInvalidGrant =
      err.message?.includes("invalid_grant") ||
      err.response?.data?.error === "invalid_grant" ||
      err.cause?.message === "invalid_grant";

    if (isInvalidGrant) {
      console.warn("[Google OAuth] Authorization code expired or already redeemed (invalid_grant).");
    } else {
      console.error("Google OAuth token verification failed:", err);
    }

    return renderPopupResponse(res, {
      success: false,
      error: isInvalidGrant
        ? "Google authorization code expired or already used. Please click 'Sign in with Google' again."
        : err.message || "Failed to authenticate with Google",
    });
  }
};

/**
 * Generate GitHub OAuth URL (JSON endpoint for popup initiation)
 */
export const getGithubAuthUrlHandler = (req, res) => {
  try {
    const state = generateOAuthState(res);
    const url = generateGithubAuthUrl(state);
    return res.status(200).json({ success: true, url, state });
  } catch (error) {
    console.error("GitHub Auth URL Generation Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to initialize GitHub authentication",
    });
  }
};

/**
 * Direct GitHub OAuth redirection (fallback for non-popup redirects)
 */
export const githubAuthDirectHandler = (req, res) => {
  try {
    const state = generateOAuthState(res);
    const url = generateGithubAuthUrl(state);
    return res.redirect(url);
  } catch (error) {
    console.error("GitHub Auth Direct Redirect Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to redirect to GitHub",
    });
  }
};

/**
 * GitHub OAuth Callback Handler
 * Validates CSRF state, exchanges code for access token,
 * fetches user profile & verified email, provisions user, and establishes session.
 */
export const githubAuthCallbackHandler = async (req, res) => {
  const { code, error, error_description } = req.query;

  // Handle GitHub user consent cancellation or authorization errors
  if (error) {
    console.warn("GitHub OAuth callback returned error:", error, error_description);
    return renderPopupResponse(res, {
      success: false,
      error:
        error === "access_denied"
          ? "GitHub sign-in was cancelled."
          : `GitHub error: ${error_description || error}`,
      errorType: "GITHUB_OAUTH_ERROR",
    });
  }

  // Validate CSRF state token against signed cookie
  const isStateValid = validateOAuthState(req, res);
  if (!isStateValid) {
    console.error("CSRF state mismatch or missing in GitHub OAuth callback");
    return renderPopupResponse(res, {
      success: false,
      error: "Security validation failed (CSRF state mismatch). Please try again.",
      errorType: "GITHUB_OAUTH_ERROR",
    });
  }

  try {
    // Check if this was a repository integration linking flow
    if (isStateValid?.payload?.action === "repo-integration") {
      const userId = isStateValid.payload.userId;
      if (!userId) {
        throw new Error("Missing user identity in repository integration state.");
      }

      const { accessToken, username, email: githubEmail, profile } =
        await verifyGithubAuthCode(code);

      // Use GitHub verified email or fallback to existing MeghVault user's email if GitHub provided a noreply address
      const existingUser = await User.findById(userId).select("email").lean();
      const finalEmail =
        githubEmail && !githubEmail.includes("noreply")
          ? githubEmail
          : (existingUser?.email || githubEmail);

      await User.findByIdAndUpdate(userId, {
        $set: {
          "integrations.github": {
            connected: true,
            accessToken,
            username,
            email: finalEmail,
            avatar: profile,
            connectedAt: new Date(),
          },
        },
      });

      return renderPopupResponse(res, {
        success: true,
        successType: "GITHUB_INTEGRATION_CONNECTED",
      });
    }

    // 1. Exchange code and verify identity with GitHub for user login / registration
    const { email, name, profile, githubId } = await verifyGithubAuthCode(code);

    // 2. Find or auto-provision user with githubAuth provider info
    const user = await findOrCreateUser({
      email,
      name,
      profile,
      authProvider: {
        githubAuth: githubId,
      },
    });

    // 3. Establish active session
    await createUserSession(user._id, res);

    // 4. Render popup closing response communicating success to client
    return renderPopupResponse(res, {
      success: true,
      successType: "GITHUB_OAUTH_SUCCESS",
    });
  } catch (err) {
    console.error("GitHub OAuth authentication failed:", err);
    const isIntegration = isStateValid?.payload?.action === "repo-integration";
    return renderPopupResponse(res, {
      success: false,
      error: err.message || "Failed to authenticate with GitHub",
      errorType: isIntegration ? "GITHUB_INTEGRATION_ERROR" : "GITHUB_OAUTH_ERROR",
    });
  }
};
