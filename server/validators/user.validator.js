import { z } from "zod";
import { emailSchema, otpSchema } from "./common.validator.js";

/**
 * Validates user profile updates
 * PATCH /api/user/profile
 */
export const updateProfileValidator = {
  body: z
    .object({
      name: z
        .string({
          invalid_type_error: "Name must be a string",
        })
        .trim()
        .min(1, "Name cannot be empty")
        .max(100, "Name cannot exceed 100 characters")
        .optional(),
      profile: z
        .string({
          invalid_type_error: "Profile URL must be a string",
        })
        .trim()
        .nullable()
        .optional(),
      preferences: z
        .object({
          showAllActionsDirectly: z.boolean({
            invalid_type_error: "showAllActionsDirectly must be a boolean",
          }).optional(),
        })
        .passthrough()
        .optional(),
    })
    .strict("Unexpected fields are not allowed in profile update"),
};

/**
 * Validates ownership transfer OTP request
 * POST /api/user/transfer-ownership/request-otp
 */
export const requestOwnershipTransferValidator = {
  body: z
    .object({
      targetEmail: emailSchema,
    })
    .strict("Unexpected fields are not allowed in transfer request"),
};

/**
 * Validates ownership transfer confirmation and execution
 * POST /api/user/transfer-ownership/confirm
 */
export const confirmOwnershipTransferValidator = {
  body: z
    .object({
      targetEmail: emailSchema,
      otp: otpSchema,
    })
    .strict("Unexpected fields are not allowed in transfer confirmation"),
};

/**
 * Validates requesting OTP for account deletion
 * POST /api/user/delete-account/request-otp
 */
export const requestDeleteAccountOtpValidator = {
  body: z
    .object({})
    .strict("Unexpected fields are not allowed in deletion OTP request")
    .optional(),
};

/**
 * Validates self account deletion confirmation
 * POST /api/user/delete-account/confirm
 */
export const confirmDeleteAccountValidator = {
  body: z
    .object({
      otp: otpSchema,
      confirmationText: z
        .string({
          invalid_type_error: "Confirmation text must be a string",
        })
        .trim()
        .optional(),
    })
    .passthrough(),
};

/**
 * Validates requesting OTP to old email for changing account email
 * POST /api/user/change-email/request-old-otp
 */
export const requestChangeEmailOldOtpValidator = {
  body: z
    .object({
      newEmail: emailSchema,
    })
    .strict("Unexpected fields are not allowed in change email request"),
};

/**
 * Validates verifying OTP on old email to authorize change
 * POST /api/user/change-email/verify-old-otp
 */
export const verifyChangeEmailOldOtpValidator = {
  body: z
    .object({
      newEmail: emailSchema,
      otp: otpSchema,
    })
    .strict("Unexpected fields are not allowed in old email verification"),
};

/**
 * Validates resending OTP to new email
 * POST /api/user/change-email/resend-new-otp
 */
export const resendChangeEmailNewOtpValidator = {
  body: z
    .object({
      newEmail: emailSchema,
      changeToken: z
        .string({
          required_error: "Change token is required",
          invalid_type_error: "Change token must be a string",
        })
        .min(1, "Change token cannot be empty"),
    })
    .strict("Unexpected fields are not allowed"),
};

/**
 * Validates verifying OTP on new email to finalize email update
 * POST /api/user/change-email/confirm-new-otp
 */
export const confirmChangeEmailNewOtpValidator = {
  body: z
    .object({
      newEmail: emailSchema,
      otp: otpSchema,
      changeToken: z
        .string({
          required_error: "Change token is required",
          invalid_type_error: "Change token must be a string",
        })
        .min(1, "Change token cannot be empty"),
    })
    .strict("Unexpected fields are not allowed in new email confirmation"),
};
