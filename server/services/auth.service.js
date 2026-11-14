import mongoose from "mongoose";
import User from "../models/user.model.js";
import Directory from "../models/directory.model.js";

/**
 * Extract provider string ID if passed as string or object { id }
 * @param {string|{ id: string }} value
 * @returns {string|null}
 */
function extractProviderId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.id) return value.id;
  return null;
}

/**
 * Find an existing user or auto-provision a new user + root directory in a transaction.
 * Manages multi-provider account linking (emailAuth, googleAuth, githubAuth)
 *
 * @param {Object} params
 * @param {string} params.email - User email
 * @param {string} [params.name] - User display name
 * @param {string} [params.profile] - Profile image URL or SVG
 * @param {string} [params.avatar] - Fallback avatar image URL or SVG
 * @param {Object} [params.authProvider] - Provider auth metadata
 * @param {boolean} [params.authProvider.emailAuth] - Email OTP verified
 * @param {string|{ id: string }} [params.authProvider.googleAuth] - Google OAuth ID
 * @param {string|{ id: string }} [params.authProvider.githubAuth] - GitHub OAuth ID
 * @returns {Promise<import("mongoose").Document>}
 */
export async function findOrCreateUser({
  email,
  name,
  profile,
  authProvider = {},
}) {
  const cleanEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: cleanEmail });
  const incomingProfile = profile || null;

  const googleId = extractProviderId(authProvider.googleAuth);
  const githubId = extractProviderId(authProvider.githubAuth);

  // Existing User: Update provider linking and profile if applicable
  if (user) {
    let modified = false;

    // Ensure authProvider object structure exists
    if (!user.authProvider) {
      user.authProvider = {
        emailAuth: false,
        googleAuth: null,
        githubAuth: null,
      };
      modified = true;
    }

    // Link Email OTP auth
    if (authProvider.emailAuth && !user.authProvider.emailAuth) {
      user.authProvider.emailAuth = true;
      modified = true;
    }

    // Link Google OAuth ID
    if (googleId && user.authProvider.googleAuth !== googleId) {
      user.authProvider.googleAuth = googleId;
      modified = true;
    }

    // Link GitHub OAuth ID
    if (githubId && user.authProvider.githubAuth !== githubId) {
      user.authProvider.githubAuth = githubId;
      modified = true;
    }

    // Update real profile picture if user currently has an SVG or none
    if (
      incomingProfile &&
      (!user.profile || user.profile.startsWith("data:image/svg+xml"))
    ) {
      user.profile = incomingProfile;
      modified = true;
    }

    // Update name if currently default
    if (name && (!user.name || user.name === user.email.split("@")[0])) {
      user.name = name;
      modified = true;
    }

    if (modified) {
      await user.save();
    }
    return user;
  }

  // New User: Provision user and root directory atomically
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const userId = new mongoose.Types.ObjectId();
    const rootDirId = new mongoose.Types.ObjectId();
    const defaultName = name || cleanEmail.split("@")[0];

    const initialAuthProvider = {
      emailAuth: Boolean(authProvider.emailAuth),
      googleAuth: googleId,
      githubAuth: githubId,
    };

    const createdUsers = await User.create(
      [
        {
          _id: userId,
          name: defaultName,
          email: cleanEmail,
          profile: incomingProfile,
          role:
            process.env.ADMIN_EMAIL &&
            cleanEmail === process.env.ADMIN_EMAIL.toLowerCase().trim()
              ? "Admin"
              : "User",
          authProvider: initialAuthProvider,
          rootDirId,
        },
      ],
      { session }
    );

    await Directory.create(
      [
        {
          _id: rootDirId,
          name: `root-${cleanEmail}`,
          parentDirId: null,
          userId,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return createdUsers[0];
  } catch (err) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
