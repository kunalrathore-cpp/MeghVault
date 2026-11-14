import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import {
  getAuthUrlHandler,
  callbackHandler,
  getStatusHandler,
  listFilesHandler,
  importItemsHandler,
  disconnectHandler,
} from "../controller/googleDrive.controller.js";
import {
  validate,
  googleDriveImportValidator,
  oauthCallbackValidator,
} from "../validators/index.js";
import { integrationRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { bulkImportThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

// Callback endpoint (does not require checkAuth middleware because it runs in OAuth redirect popup)
router.get("/callback", validate(oauthCallbackValidator), callbackHandler);

// Protected endpoints requiring MeghVault authentication
router.get("/auth-url", checkAuth, getAuthUrlHandler);
router.get("/status", checkAuth, getStatusHandler);
router.get("/files", checkAuth, listFilesHandler);
router.post(
  "/import",
  checkAuth,
  bulkImportThrottler,
  integrationRateLimiter,
  validate(googleDriveImportValidator),
  importItemsHandler
);
router.post("/disconnect", checkAuth, disconnectHandler);

export default router;
