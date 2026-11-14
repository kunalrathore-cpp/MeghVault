import User from "../models/user.model.js";
import Session from "../models/session.model.js";

/**
 * Optional Auth Middleware
 * Populates req.foundUser if a valid session cookie exists, but proceeds without failing if absent.
 */
export default async function optionalAuth(req, res, next) {
  const { sid } = req.signedCookies || {};

  if (!sid) {
    req.foundUser = null;
    return next();
  }

  try {
    const finalSid = Buffer.from(sid, "base64url").toString();
    if (!finalSid) {
      req.foundUser = null;
      return next();
    }

    const foundSession = await Session.findById(finalSid).lean();
    if (!foundSession) {
      req.foundUser = null;
      return next();
    }

    const foundUser = await User.findById(foundSession.userId).lean();
    req.foundUser = foundUser || null;
    return next();
  } catch {
    req.foundUser = null;
    return next();
  }
}
