import express from "express";
import validateIdMiddleware from "../middlewares/validateId.middleware.js";
import {
  createDirByParentDirId,
  createDirInRoot,
  deleteDirById,
  downloadDirById,
  getDirById,
  getRootDir,
  renameDirById,
} from "../controller/directory.controller.js";
import {
  moveDirectoryRoute,
  getFolderTree,
} from "../controller/move.controller.js";
import {
  validate,
  dirIdParamValidator,
  parentDirIdParamValidator,
  renameDirValidator,
  moveDirValidator,
  createDirValidator,
} from "../validators/index.js";
import { zipExportRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { zipCompressionThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

router.param("parentDirId", validateIdMiddleware);
router.param("id", validateIdMiddleware);

// Get Folder Hierarchy Tree (for move destination picker)
router.get("/tree", getFolderTree);

// Serving Root Directory Files / Read = Passed
router.get("/", getRootDir);

// Download Directory as Zip Stream (Surgically throttled for CPU zlib compression + rate-limited)
router.get(
  "/:id/download",
  zipCompressionThrottler,
  zipExportRateLimiter,
  validate(dirIdParamValidator),
  downloadDirById
);

// Serving Directory Files / Read = Passed
router.get("/:id", validate(dirIdParamValidator), getDirById);

// Creating Directory In Root = Passed
router.post("/", validate(createDirValidator), createDirInRoot);

// Creating Directory With ParentDirId = Passed
router.post(
  "/:parentDirId",
  validate(parentDirIdParamValidator),
  createDirByParentDirId
);

// Move Directory
router.patch("/:id/move", validate(moveDirValidator), moveDirectoryRoute);

// Rename Directory = Passed
router.patch("/:id", validate(renameDirValidator), renameDirById);

// Delete Directory = Passed
router.delete("/:id", validate(dirIdParamValidator), deleteDirById);

export default router;
