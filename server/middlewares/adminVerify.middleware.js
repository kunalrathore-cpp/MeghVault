/**
 * Admin Verification Middleware
 * Requires that checkAuth has already populated req.foundUser.
 * Ensures the authenticated user has the 'Admin' authorization role.
 */
export default async function adminVerify(req, res, next) {
  const user = req.foundUser;

  if (!user) {
    return res.status(401).json({
      error:
        "Unauthorized: Authentication required before accessing admin resources.",
    });
  }

  if (user.role !== "Admin") {
    return res.status(403).json({
      error: "Forbidden: Access denied. Administrator privileges required.",
      code: "ADMIN_REQUIRED",
    });
  }

  next();
}
