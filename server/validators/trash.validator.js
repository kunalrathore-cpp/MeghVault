import { z } from "zod";
import { objectIdSchema, resourceTypeSchema } from "./common.validator.js";

/**
 * Validates trash resource action params (:resourceType/:id)
 * Applicable to moveToTrash, restoreFromTrash, and permanentlyDelete
 */
export const trashItemParamValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    id: objectIdSchema,
  }),
};
