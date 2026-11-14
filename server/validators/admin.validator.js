import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

/**
 * Validates admin user ID param (:userId)
 */
export const adminUserIdParamValidator = {
  params: z.object({
    userId: objectIdSchema,
  }),
};

/**
 * Validates admin user listing query
 * GET /api/admin/users
 */
export const adminUserListQueryValidator = {
  query: z.object({
    filter: z.string().max(50).optional(),
    search: z.string().max(100).optional(),
  }),
};

/**
 * Validates admin user storage inspect
 * GET /api/admin/users/:userId/storage
 */
export const adminUserStorageValidator = {
  params: z.object({
    userId: objectIdSchema,
  }),
  query: z.object({
    dirId: objectIdSchema.optional(),
  }),
};

/**
 * Validates user role update by admin
 * PATCH /api/admin/users/:userId/role
 */
export const adminUpdateUserRoleValidator = {
  params: z.object({
    userId: objectIdSchema,
  }),
  body: z
    .object({
      role: z.enum(["Admin", "User"], {
        errorMap: () => ({ message: "Role must be 'Admin' or 'User'" }),
      }),
    })
    .strict("Unexpected fields are not allowed"),
};
