import express from "express";
import { generateOTP, verifyOTP } from "../controller/otp.controller.js";
import {
  validate,
  generateOtpValidator,
  verifyOtpValidator,
} from "../validators/index.js";
import {
  otpSendRateLimiter,
  authVerifyRateLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Generate OTP (Rate-limited to prevent email bombing & API quota abuse)
router.post(
  "/",
  otpSendRateLimiter,
  validate(generateOtpValidator),
  generateOTP
);

// Verify OTP (Rate-limited to stop brute-forcing 4-digit verification codes)
router.post(
  "/verify-otp",
  authVerifyRateLimiter,
  validate(verifyOtpValidator),
  verifyOTP
);

export default router;
