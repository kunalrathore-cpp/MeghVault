import express from "express";
import {
  userAuth,
  getGoogleAuthUrlHandler,
  googleAuthDirectHandler,
  googleAuthCallbackHandler,
  getGithubAuthUrlHandler,
  githubAuthDirectHandler,
  githubAuthCallbackHandler,
} from "../controller/auth.controller.js";
import {
  validate,
  userAuthValidator,
  oauthCallbackValidator,
} from "../validators/index.js";
import { authVerifyRateLimiter } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Unified Email + OTP Authentication (Rate-limited to stop credential & OTP brute-force)
router.post(
  "/",
  authVerifyRateLimiter,
  validate(userAuthValidator),
  userAuth
);

// Google OAuth 2.0 (OpenID Connect)
router.get("/google/url", getGoogleAuthUrlHandler);
router.get("/google", googleAuthDirectHandler);
router.get(
  "/google/callback",
  validate(oauthCallbackValidator),
  googleAuthCallbackHandler
);

// GitHub OAuth 2.0 (User Authentication)
router.get("/github/url", getGithubAuthUrlHandler);
router.get("/github", githubAuthDirectHandler);
router.get(
  "/github/callback",
  validate(oauthCallbackValidator),
  githubAuthCallbackHandler
);

export default router;
