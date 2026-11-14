import express from "express";
import {
  getTrash,
  moveToTrash,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
} from "../controller/trash.controller.js";
import { validate, trashItemParamValidator } from "../validators/index.js";

const router = express.Router();

// Delete forever all trashed items
router.delete("/empty", emptyTrash);

// Get all directly trashed items for the current user
router.get("/", getTrash);

// Move item to trash (soft delete)
router.post(
  "/:resourceType/:id",
  validate(trashItemParamValidator),
  moveToTrash
);

// Restore item from trash
router.post(
  "/:resourceType/:id/restore",
  validate(trashItemParamValidator),
  restoreFromTrash
);

// Permanently delete a single item from trash
router.delete(
  "/:resourceType/:id",
  validate(trashItemParamValidator),
  permanentlyDelete
);

export default router;
