import { z } from "zod";
import { targetDirIdSchema } from "./common.validator.js";

/**
 * Validates Google Drive items import payload
 * POST /api/google-drive/import
 */
export const googleDriveImportValidator = {
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              id: z.string().min(1, "Google Drive file ID is required"),
              name: z.string().min(1, "File name is required"),
              mimeType: z.string().optional(),
            })
            .passthrough()
        )
        .min(1, "No items provided for import"),
      targetDirId: targetDirIdSchema,
    })
    .passthrough(),
};

/**
 * Validates Google Photos items import payload
 * POST /api/google-photos/import
 */
export const googlePhotosImportValidator = {
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              id: z.string().min(1, "Google Photos item ID is required"),
              filename: z.string().optional(),
              baseUrl: z.string().url().optional(),
              mimeType: z.string().optional(),
            })
            .passthrough()
        )
        .min(1, "No items provided for import"),
      targetDirId: targetDirIdSchema,
    })
    .passthrough(),
};

/**
 * Validates Google Photos picker session ID param
 * GET /api/google-photos/picker-session/:sessionId/status
 */
export const googlePhotosPickerSessionValidator = {
  params: z.object({
    sessionId: z.string().trim().min(1, "Session ID is required"),
  }),
};

/**
 * Validates GitHub repository import payload
 * POST /api/github/import
 */
export const githubImportValidator = {
  body: z
    .object({
      repos: z
        .array(
          z
            .object({
              name: z.string().trim().optional(),
              repo: z.string().trim().optional(),
              owner: z
                .union([
                  z.string().trim().min(1),
                  z.object({ login: z.string().trim().min(1) }),
                ])
                .optional(),
              branch: z.string().trim().optional(),
              defaultBranch: z.string().trim().optional(),
              fullName: z.string().trim().optional(),
              format: z.enum(["folder", "zip"]).optional(),
            })
            .passthrough()
            .refine(
              (r) => Boolean(r.repo || r.name),
              "Repository name (repo or name) is required"
            )
        )
        .min(1, "No repositories provided for import"),
      targetDirId: targetDirIdSchema,
      format: z.enum(["folder", "zip"]).optional().default("folder"),
    })
    .passthrough(),
};

/**
 * Validates GitHub repository branch lookup
 * GET /api/github/repos/:owner/:repo/branches
 */
export const githubBranchParamValidator = {
  params: z.object({
    owner: z.string().trim().min(1, "Owner is required"),
    repo: z.string().trim().min(1, "Repo is required"),
  }),
};
