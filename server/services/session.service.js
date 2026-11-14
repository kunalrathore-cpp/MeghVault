import Session from "../models/session.model.js";
import {
  COOKIE_NAME,
  getSessionCookieOptions,
  getClearCookieOptions,
} from "../utils/cookie.util.js";

const MAX_SESSIONS_PER_USER = 2;

/**
 * Create a new user session enforcing maximum concurrent sessions (2 max)
 * Sets signed httpOnly, secure, sameSite: "lax" session cookie
 * @param {import("mongoose").Types.ObjectId} userId
 * @param {import("express").Response} res
 * @returns {Promise<import("mongoose").Document>}
 */
export async function createUserSession(userId, res) {
  const sessionCount = await Session.countDocuments({ userId });
  if (sessionCount >= MAX_SESSIONS_PER_USER) {
    // Delete oldest session
    await Session.findOneAndDelete({ userId }, { sort: { createdAt: 1 } });
  }

  const session = await Session.create({ userId });
  const finalCookie = Buffer.from(session.id.toString()).toString("base64url");

  res.cookie(COOKIE_NAME, finalCookie, getSessionCookieOptions());

  return session;
}

/**
 * Destroy current session from database and clear cookie with matching security options
 * @param {string} signedSid - base64url encoded session ID from signed cookie
 * @param {import("express").Response} res
 */
export async function destroySession(signedSid, res) {
  if (signedSid) {
    const finalSid = Buffer.from(signedSid, "base64url").toString();
    await Session.findByIdAndDelete(finalSid);
  }
  res.clearCookie(COOKIE_NAME, getClearCookieOptions());
}

/**
 * Destroy all sessions for a user and clear current cookie with matching security options
 * @param {string} signedSid - base64url encoded session ID from signed cookie
 * @param {import("express").Response} res
 */
export async function destroyAllUserSessions(signedSid, res) {
  if (signedSid) {
    const finalSid = Buffer.from(signedSid, "base64url").toString();
    const session = await Session.findById(finalSid).select("userId").lean();
    if (session) {
      await Session.deleteMany({ userId: session.userId });
    }
  }
  res.clearCookie(COOKIE_NAME, getClearCookieOptions());
}
