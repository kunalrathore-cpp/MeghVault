import { z } from "zod";
import {
  objectIdSchema,
  targetDirIdSchema,
  safeFilenameSchema,
} from "./common.validator.js";

/**
 * Validates file ID parameter (:id) and optional :filename
 */
export const fileIdParamValidator = {
  params: z
    .object({
      id: objectIdSchema,
      filename: z.string().optional(),
    })
    .passthrough(),
};

/**
 * Validates parentDirId for file upload
 */
export const uploadFileParamValidator = {
  params: z.object({
    parentDirId: objectIdSchema,
  }),
};

/**
 * Validates file renaming / updating
 * PATCH /api/file/:id
 */
export const updateFileValidator = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z
    .object({
      newFilename: safeFilenameSchema,
    })
    .strict("Unexpected fields are not allowed in file rename"),
};

/**
 * Validates moving a specific file via direct route
 * PATCH /api/file/:id/move
 */
export const moveFileValidator = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z
    .object({
      targetDirId: targetDirIdSchema,
      conflictResolution: z.enum(["rename", "conflict"]).optional().default("conflict"),
    })
    .passthrough(),
};
