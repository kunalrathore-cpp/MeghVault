import { z } from "zod";
import {
  objectIdSchema,
  targetDirIdSchema,
  resourceTypeSchema,
} from "./common.validator.js";

/**
 * Validates unified single item move
 * PATCH /api/items/move
 */
export const moveItemValidator = {
  body: z
    .object({
      itemType: resourceTypeSchema,
      itemId: objectIdSchema,
      targetDirId: targetDirIdSchema,
      conflictResolution: z
        .enum(["rename", "conflict"], {
          errorMap: () => ({ message: "conflictResolution must be 'rename' or 'conflict'" }),
        })
        .optional()
        .default("conflict"),
    })
    .strict("Unexpected fields are not allowed in move request"),
};

/**
 * Validates bulk item move
 * POST /api/items/bulk-move
 */
export const bulkMoveValidator = {
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              itemType: resourceTypeSchema,
              itemId: objectIdSchema,
            })
            .strict()
        )
        .min(1, "Items array cannot be empty")
        .max(200, "Cannot move more than 200 items at once"),
      targetDirId: targetDirIdSchema,
      conflictResolution: z
        .enum(["rename", "conflict"])
        .optional()
        .default("rename"),
    })
    .strict("Unexpected fields are not allowed in bulk move request"),
};

/**
 * Validates bulk download zip stream query parameters
 * GET /api/items/download-zip
 */
export const downloadBulkValidator = {
  query: z
    .object({
      files: z.string().optional(),
      dirs: z.string().optional(),
      directories: z.string().optional(),
      name: z.string().max(150, "Archive name is too long").optional(),
    })
    .refine(
      (data) =>
        (data.files && data.files.trim().length > 0) ||
        (data.dirs && data.dirs.trim().length > 0) ||
        (data.directories && data.directories.trim().length > 0),
      {
        message: "At least one file or directory ID must be provided for download",
      }
    ),
};
