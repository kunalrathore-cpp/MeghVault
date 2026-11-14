import { z } from "zod";
import {
  objectIdSchema,
  targetDirIdSchema,
  safeFilenameSchema,
} from "./common.validator.js";

/**
 * Validates directory ID parameter (:id)
 */
export const dirIdParamValidator = {
  params: z.object({
    id: objectIdSchema,
  }),
};

/**
 * Validates parent directory ID parameter (:parentDirId)
 */
export const parentDirIdParamValidator = {
  params: z.object({
    parentDirId: objectIdSchema,
  }),
};

/**
 * Validates directory renaming
 * PATCH /api/directory/:id
 */
export const renameDirValidator = {
  params: z.object({
    id: objectIdSchema,
  }),
  body: z
    .object({
      newDirName: safeFilenameSchema,
    })
    .strict("Unexpected fields are not allowed in directory rename"),
};

/**
 * Validates moving a specific directory via direct route
 * PATCH /api/directory/:id/move
 */
export const moveDirValidator = {
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

/**
 * Optional header/body validator for folder creation
 */
export const createDirValidator = {
  params: z
    .object({
      parentDirId: objectIdSchema.optional(),
    })
    .optional(),
  headers: z
    .object({
      dirname: z.string().trim().max(255).optional(),
    })
    .passthrough(),
};
