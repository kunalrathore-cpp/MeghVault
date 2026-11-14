import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import {
  getAuthUrlHandler,
  callbackHandler,
  getStatusHandler,
  listAlbumsHandler,
  listMediaItemsHandler,
  importItemsHandler,
  disconnectHandler,
  createPickerSessionHandler,
  getPickerSessionStatusHandler,
  getPickerSessionItemsHandler,
} from "../controller/googlePhotos.controller.js";
import {
  validate,
  googlePhotosImportValidator,
  googlePhotosPickerSessionValidator,
  oauthCallbackValidator,
} from "../validators/index.js";
import { integrationRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { bulkImportThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

// Callback endpoint (OAuth redirect in popup)
router.get("/callback", validate(oauthCallbackValidator), callbackHandler);

// Protected endpoints requiring MeghVault authentication
router.get("/auth-url", checkAuth, getAuthUrlHandler);
router.get("/status", checkAuth, getStatusHandler);
router.get("/albums", checkAuth, listAlbumsHandler);
router.get("/media-items", checkAuth, listMediaItemsHandler);
router.post(
  "/import",
  checkAuth,
  bulkImportThrottler,
  integrationRateLimiter,
  validate(googlePhotosImportValidator),
  importItemsHandler
);
router.post("/disconnect", checkAuth, disconnectHandler);

// Google Photos Native Picker API (photospicker.googleapis.com)
router.post("/picker-session", checkAuth, createPickerSessionHandler);
router.get(
  "/picker-session/:sessionId/status",
  checkAuth,
  validate(googlePhotosPickerSessionValidator),
  getPickerSessionStatusHandler
);
router.get(
  "/picker-session/:sessionId/items",
  checkAuth,
  validate(googlePhotosPickerSessionValidator),
  getPickerSessionItemsHandler
);

export default router;
