import { z } from "zod";
import { objectIdSchema, resourceTypeSchema } from "./common.validator.js";

/**
 * Validates resource details inspect query
 * GET /api/details/:resourceType/:id
 */
export const resourceDetailsParamValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    id: objectIdSchema,
  }),
};
