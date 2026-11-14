import express from "express";
import validateIdMiddleware from "../middlewares/validateId.middleware.js";
import {
  deleteFileById,
  fileUploaderByDirId,
  getFileById,
  rootDirFileUploader,
  updateFileById,
} from "../controller/file.controller.js";
import { moveFileRoute } from "../controller/move.controller.js";
import {
  validate,
  fileIdParamValidator,
  uploadFileParamValidator,
  updateFileValidator,
  moveFileValidator,
} from "../validators/index.js";
import { fileUploadRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { fileUploadThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

router.param("parentDirId", validateIdMiddleware);
router.param("id", validateIdMiddleware);

// Create / Upload Files In Root (Surgically throttled for concurrent stream I/O + rate-limited)
router.post(
  "/",
  fileUploadThrottler,
  fileUploadRateLimiter,
  rootDirFileUploader
);

// Create / Upload Files In Parent Directory (Surgically throttled for concurrent stream I/O + rate-limited)
router.post(
  "/:parentDirId",
  fileUploadThrottler,
  fileUploadRateLimiter,
  validate(uploadFileParamValidator),
  fileUploaderByDirId
);

// Read = Passed
// Dynamic-Routing (Supports ID only, ID with filename, or stream paths)
router.get("/:id", validate(fileIdParamValidator), getFileById);
router.get("/:id/:filename", validate(fileIdParamValidator), getFileById);
router.get("/stream/:id/:filename", validate(fileIdParamValidator), getFileById);

// Move File
router.patch("/:id/move", validate(moveFileValidator), moveFileRoute);

// Update / Rename = Passed
router.patch("/:id", validate(updateFileValidator), updateFileById);

// Delete = Passed
router.delete("/:id", validate(fileIdParamValidator), deleteFileById);

export default router;
