import express from "express";
import {
  verifyAdminAccess,
  getAdminStats,
  getAllUsers,
  getUserById,
  getUserStorage,
  updateUserRole,
  forceLogoutUser,
  deleteUserAccount,
} from "../controller/admin.controller.js";
import {
  validate,
  adminUserIdParamValidator,
  adminUserListQueryValidator,
  adminUserStorageValidator,
  adminUpdateUserRoleValidator,
} from "../validators/index.js";
import { adminStorageThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

// Admin Verification Endpoint
router.get("/verify", verifyAdminAccess);

// Telemetry & Users
router.get("/stats", getAdminStats);
router.get("/users", validate(adminUserListQueryValidator), getAllUsers);

// Inspect User Profile & User Storage (Surgically throttled for recursive filesystem disk calculations)
router.get("/users/:userId", validate(adminUserIdParamValidator), getUserById);
router.get(
  "/users/:userId/storage",
  adminStorageThrottler,
  validate(adminUserStorageValidator),
  getUserStorage
);

// User Management Actions
router.patch(
  "/users/:userId/role",
  validate(adminUpdateUserRoleValidator),
  updateUserRole
);
router.post(
  "/users/:userId/logout",
  validate(adminUserIdParamValidator),
  forceLogoutUser
);
router.delete(
  "/users/:userId",
  validate(adminUserIdParamValidator),
  deleteUserAccount
);

export default router;
