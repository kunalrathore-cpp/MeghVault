import express from "express";
import {
  moveItem,
  bulkMoveItems,
  downloadBulkItems,
  getFolderTree,
} from "../controller/move.controller.js";
import {
  validate,
  moveItemValidator,
  bulkMoveValidator,
  downloadBulkValidator,
} from "../validators/index.js";

const router = express.Router();

// Bulk move endpoint: POST /api/items/bulk-move
router.post("/bulk-move", validate(bulkMoveValidator), bulkMoveItems);

// Unified move endpoint: PATCH /api/items/move
router.patch("/move", validate(moveItemValidator), moveItem);

// Bulk download zip stream endpoint: GET /api/items/download-zip
router.get("/download-zip", validate(downloadBulkValidator), downloadBulkItems);

// Folder hierarchy tree endpoint: GET /api/items/folder-tree
router.get("/folder-tree", getFolderTree);

export default router;
