import { z } from "zod";
import { objectIdSchema, resourceTypeSchema } from "./common.validator.js";

/**
 * Validates star toggle payload
 * POST /api/starred/toggle
 */
export const toggleStarValidator = {
  body: z
    .object({
      resourceType: resourceTypeSchema,
      resourceId: objectIdSchema,
    })
    .strict("Unexpected fields are not allowed in star toggle"),
};
