import { z } from "zod";
import { emailSchema, otpSchema } from "./common.validator.js";

/**
 * Validates OTP generation payload
 * POST /api/otp
 */
export const generateOtpValidator = {
  body: z
    .object({
      email: emailSchema,
    })
    .strict(),
};

/**
 * Validates standalone OTP verification payload
 * POST /api/otp/verify-otp
 */
export const verifyOtpValidator = {
  body: z
    .object({
      email: emailSchema,
      otp: otpSchema,
    })
    .strict(),
};
