import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import { COOKIE_NAME, getClearCookieOptions } from "../utils/cookie.util.js";

export default async function checkAuth(req, res, next) {
  const { sid } = req.signedCookies;

  if (!sid) {
    return res.status(401).json({ error: "Not LoggedIn!" });
  }

  const finalSid = Buffer.from(sid, "base64url").toString();

  if (!finalSid) {
    res.clearCookie(COOKIE_NAME, getClearCookieOptions());
    return res.status(401).json({ error: "Not LoggedIn!" });
  }

  try {
    const foundSession = await Session.findById(finalSid).lean();

    if (!foundSession) {
      res.clearCookie(COOKIE_NAME, getClearCookieOptions());
      return res.status(401).json({ error: "Not LoggedIn!" });
    }

    const foundUser = await User.findById({
      _id: foundSession.userId,
    }).lean();

    if (!foundUser) {
      res.clearCookie(COOKIE_NAME, getClearCookieOptions());
      return res.status(401).json({ error: "Not LoggedIn!" });
    }

    req.foundUser = foundUser;

    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}
