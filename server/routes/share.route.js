import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import optionalAuth from "../middlewares/optionalAuth.middleware.js";
import {
  getShareSettings,
  inviteCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
  updateLinkSettings,
  getPublicShareInfo,
  verifyPublicPassword,
  streamPublicFile,
  downloadPublicSharedFolder,
  getSharedWithMe,
  searchShareableUsers,
  importAssetToRoot,
  unlockSharedAsset,
} from "../controller/share.controller.js";
import {
  validate,
  shareResourceParamValidator,
  shareCollaboratorParamValidator,
  publicShareTokenParamValidator,
  verifyPublicPasswordValidator,
  unlockSharedAssetValidator,
  inviteCollaboratorValidator,
  updateCollaboratorRoleValidator,
  updateLinkSettingsValidator,
  searchUsersValidator,
} from "../validators/index.js";
import {
  sharePasswordRateLimiter,
  zipExportRateLimiter,
} from "../middlewares/rateLimit.middleware.js";
import {
  zipCompressionThrottler,
  cryptoPasswordThrottler,
} from "../middlewares/throttler.middleware.js";

const router = express.Router();

// --- Public Endpoints (Accessible by Token) ---
router.get(
  "/public/:token",
  optionalAuth,
  validate(publicShareTokenParamValidator),
  getPublicShareInfo
);
router.post(
  "/public/:token/verify-password",
  cryptoPasswordThrottler,
  sharePasswordRateLimiter,
  validate(verifyPublicPasswordValidator),
  verifyPublicPassword
);
router.get(
  "/public/:token/download",
  zipCompressionThrottler,
  zipExportRateLimiter,
  optionalAuth,
  validate(publicShareTokenParamValidator),
  downloadPublicSharedFolder
);
router.get(
  "/public/:token/stream",
  optionalAuth,
  validate(publicShareTokenParamValidator),
  streamPublicFile
);
router.get(
  "/public/:token/stream/:fileId",
  optionalAuth,
  validate(publicShareTokenParamValidator),
  streamPublicFile
);

// --- Authenticated Collaboration Endpoints ---
router.get("/shared-with-me", checkAuth, getSharedWithMe);
router.get(
  "/users/search",
  checkAuth,
  validate(searchUsersValidator),
  searchShareableUsers
);

// --- Authenticated Management Endpoints (Require User Session) ---
router.post(
  "/:resourceType/:resourceId/unlock",
  checkAuth,
  cryptoPasswordThrottler,
  sharePasswordRateLimiter,
  validate(unlockSharedAssetValidator),
  unlockSharedAsset
);
router.get(
  "/:resourceType/:resourceId",
  checkAuth,
  validate(shareResourceParamValidator),
  getShareSettings
);
router.post(
  "/:resourceType/:resourceId/import-to-root",
  checkAuth,
  validate(shareResourceParamValidator),
  importAssetToRoot
);
router.post(
  "/:resourceType/:resourceId/collaborators",
  checkAuth,
  validate(inviteCollaboratorValidator),
  inviteCollaborator
);
router.delete(
  "/:resourceType/:resourceId/collaborators/:targetUserId",
  checkAuth,
  validate(shareCollaboratorParamValidator),
  removeCollaborator
);
router.patch(
  "/:resourceType/:resourceId/collaborators/:targetUserId",
  checkAuth,
  validate(updateCollaboratorRoleValidator),
  updateCollaboratorRole
);
router.patch(
  "/:resourceType/:resourceId/link",
  checkAuth,
  validate(updateLinkSettingsValidator),
  updateLinkSettings
);

export default router;
