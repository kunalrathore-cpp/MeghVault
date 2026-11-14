import { z } from "zod";
import {
  objectIdSchema,
  resourceTypeSchema,
  emailSchema,
} from "./common.validator.js";

/**
 * Validates share resource params (:resourceType/:resourceId)
 */
export const shareResourceParamValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
  }),
};

/**
 * Validates share collaborator params (:resourceType/:resourceId/collaborators/:targetUserId)
 */
export const shareCollaboratorParamValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
    targetUserId: objectIdSchema,
  }),
};

/**
 * Validates public share token params (:token)
 */
export const publicShareTokenParamValidator = {
  params: z.object({
    token: z.string().trim().min(1, "Share token is required"),
    fileId: objectIdSchema.optional(),
  }),
};

/**
 * Validates collaborator invitation payload
 * POST /api/share/:resourceType/:resourceId/collaborators
 */
export const inviteCollaboratorValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
  }),
  body: z
    .object({
      email: emailSchema.optional(),
      userIds: z.array(objectIdSchema).optional(),
      users: z
        .array(
          z.object({
            userId: objectIdSchema.optional(),
            email: emailSchema.optional(),
            role: z.enum(["viewer", "collaborator"]).optional(),
          })
        )
        .optional(),
      role: z.enum(["viewer", "collaborator"]).optional().default("collaborator"),
    })
    .refine(
      (data) =>
        data.email ||
        (data.userIds && data.userIds.length > 0) ||
        (data.users && data.users.length > 0),
      {
        message: "At least one email, userId, or user entry must be specified for invitation",
      }
    ),
};

/**
 * Validates collaborator role update
 * PATCH /api/share/:resourceType/:resourceId/collaborators/:targetUserId
 */
export const updateCollaboratorRoleValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
    targetUserId: objectIdSchema,
  }),
  body: z
    .object({
      role: z.enum(["viewer", "collaborator"], {
        errorMap: () => ({ message: "Role must be 'viewer' or 'collaborator'" }),
      }),
    })
    .strict("Unexpected fields are not allowed"),
};

/**
 * Validates share link settings update
 * PATCH /api/share/:resourceType/:resourceId/link
 */
export const updateLinkSettingsValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
  }),
  body: z
    .object({
      isEnabled: z.boolean().optional(),
      visibility: z.enum(["public", "restricted"]).optional(),
      allowDownload: z.boolean().optional(),
      isPasswordProtected: z.boolean().optional(),
      securityKey: z.string().trim().optional(),
      password: z.string().trim().optional(),
      expirationOption: z
        .enum(["never", "1hour", "1day", "7days", "30days"])
        .optional(),
    })
    .passthrough(),
};

/**
 * Validates password verification for public link
 * POST /api/share/public/:token/verify-password
 */
export const verifyPublicPasswordValidator = {
  params: z.object({
    token: z.string().trim().min(1, "Share token is required"),
  }),
  body: z
    .object({
      password: z.string().min(1, "Password is required"),
    })
    .strict(),
};

/**
 * Validates password unlock for authenticated users
 * POST /api/share/:resourceType/:resourceId/unlock
 */
export const unlockSharedAssetValidator = {
  params: z.object({
    resourceType: resourceTypeSchema,
    resourceId: objectIdSchema,
  }),
  body: z
    .object({
      password: z.string().min(1, "Password is required"),
    })
    .strict(),
};

/**
 * Validates user search query for sharing
 * GET /api/share/users/search
 */
export const searchUsersValidator = {
  query: z.object({
    q: z.string().optional().default(""),
    resourceType: resourceTypeSchema.optional(),
    resourceId: objectIdSchema.optional(),
  }),
};
