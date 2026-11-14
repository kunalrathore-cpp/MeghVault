import { paginationQuerySchema } from "./common.validator.js";

/**
 * Validates recent activities query pagination
 * GET /api/recent
 */
export const recentActivitiesQueryValidator = {
  query: paginationQuerySchema,
};
