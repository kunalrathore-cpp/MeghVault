import { z } from "zod";
import { emailSchema, otpSchema } from "./common.validator.js";

/**
 * Validates unified passwordless authentication (Email + OTP)
 * POST /api/auth
 */
export const userAuthValidator = {
  body: z
    .object({
      email: emailSchema,
      otp: otpSchema,
    })
    .strict(),
};

/**
 * Validates OAuth callback query parameters (Google and GitHub)
 */
export const oauthCallbackValidator = {
  query: z
    .object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    })
    .passthrough(),
};
