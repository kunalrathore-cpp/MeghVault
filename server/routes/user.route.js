import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import {
  getUserProfile,
  updateUserProfile,
  userLogout,
  allUserSessionsLogout,
  requestOwnershipTransferOtp,
  confirmOwnershipTransfer,
  requestDeleteAccountOtp,
  confirmDeleteAccount,
  requestChangeEmailOldOtp,
  verifyChangeEmailOldOtp,
  resendChangeEmailNewOtp,
  confirmChangeEmailNewOtp,
} from "../controller/user.controller.js";
import {
  validate,
  updateProfileValidator,
  requestOwnershipTransferValidator,
  confirmOwnershipTransferValidator,
  requestDeleteAccountOtpValidator,
  confirmDeleteAccountValidator,
  requestChangeEmailOldOtpValidator,
  verifyChangeEmailOldOtpValidator,
  resendChangeEmailNewOtpValidator,
  confirmChangeEmailNewOtpValidator,
} from "../validators/index.js";
import {
  otpSendRateLimiter,
  authVerifyRateLimiter,
} from "../middlewares/rateLimit.middleware.js";
import { accountOperationThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

// User Profile
router.get("/", checkAuth, getUserProfile);
router.patch(
  "/profile",
  checkAuth,
  validate(updateProfileValidator),
  updateUserProfile
);

// User Logout
router.post("/logout", userLogout);

// Logout All User Sessions
router.post("/logout-all", allUserSessionsLogout);

// Account Ownership Transfer (Strictly Protected by checkAuth, Rate Limiting & Validation)
router.post(
  "/transfer-ownership/request-otp",
  checkAuth,
  otpSendRateLimiter,
  validate(requestOwnershipTransferValidator),
  requestOwnershipTransferOtp
);

router.post(
  "/transfer-ownership/confirm",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmOwnershipTransferValidator),
  confirmOwnershipTransfer
);

// Dedicated Delete My Account Routes (Canonical kebab-case)
router.post(
  "/delete-account/request-otp",
  checkAuth,
  otpSendRateLimiter,
  validate(requestDeleteAccountOtpValidator),
  requestDeleteAccountOtp
);

router.post(
  "/delete-account/confirm",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmDeleteAccountValidator),
  confirmDeleteAccount
);

router.delete(
  "/delete-account",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmDeleteAccountValidator),
  confirmDeleteAccount
);

// Account Email Change Routes (Dual-OTP Protected: Old Email Authorization -> New Email Verification)
router.post(
  "/change-email/request-old-otp",
  checkAuth,
  otpSendRateLimiter,
  validate(requestChangeEmailOldOtpValidator),
  requestChangeEmailOldOtp
);

router.post(
  "/change-email/verify-old-otp",
  checkAuth,
  authVerifyRateLimiter,
  validate(verifyChangeEmailOldOtpValidator),
  verifyChangeEmailOldOtp
);

router.post(
  "/change-email/resend-new-otp",
  checkAuth,
  otpSendRateLimiter,
  validate(resendChangeEmailNewOtpValidator),
  resendChangeEmailNewOtp
);

router.post(
  "/change-email/confirm-new-otp",
  checkAuth,
  accountOperationThrottler,
  authVerifyRateLimiter,
  validate(confirmChangeEmailNewOtpValidator),
  confirmChangeEmailNewOtp
);

export default router;
