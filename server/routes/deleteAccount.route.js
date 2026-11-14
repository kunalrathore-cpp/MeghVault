import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import {
  requestDeleteAccountOtp,
  confirmDeleteAccount,
} from "../controller/user.controller.js";
import {
  validate,
  requestDeleteAccountOtpValidator,
  confirmDeleteAccountValidator,
} from "../validators/index.js";
import {
  otpSendRateLimiter,
  authVerifyRateLimiter,
} from "../middlewares/rateLimit.middleware.js";
import { accountOperationThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

/**
 * Request OTP code for permanent account deletion
 * POST /api/delete-account/request-otp
 */
router.post(
  "/request-otp",
  checkAuth,
  otpSendRateLimiter,
  validate(requestDeleteAccountOtpValidator),
  requestDeleteAccountOtp
);

/**
 * Confirm and permanently delete account with OTP verification
 * POST /api/delete-account/confirm
 */
router.post(
  "/confirm",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmDeleteAccountValidator),
  confirmDeleteAccount
);

/**
 * Direct RESTful DELETE endpoint for account deletion
 * DELETE /api/delete-account
 */
router.delete(
  "/",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmDeleteAccountValidator),
  confirmDeleteAccount
);

export default router;
