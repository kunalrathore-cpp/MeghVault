import mongoose from "mongoose";
import User from "../models/user.model.js";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import Share from "../models/share.model.js";
import Starred from "../models/starred.model.js";
import Session from "../models/session.model.js";
import OTP from "../models/otp.model.js";
import Activity from "../models/activity.model.js";
import { generateRandomAvatarSync } from "../services/avatar.service.js";
import {
  destroySession,
  destroyAllUserSessions,
} from "../services/session.service.js";
import {
  sendOTPService,
  sendEmailChangeNotificationService,
} from "../services/sendOTP.service.js";
import { getClearCookieOptions } from "../utils/cookie.util.js";
import { logActivity } from "../utils/logActivity.js";
import { deletePhysicalFile } from "../utils/storagePath.js";
import {
  createSignedToken,
  verifySignedToken,
} from "../utils/token.util.js";

export const getUserProfile = async (req, res) => {
  let profile = req.foundUser.profile;
  if (!profile) {
    profile = generateRandomAvatarSync(req.foundUser.email);
    try {
      await User.updateOne({ _id: req.foundUser._id }, { $set: { profile } });
      req.foundUser.profile = profile;
    } catch {
      // Safe fallback if read operation
    }
  }

  res.status(200).json({
    id: req.foundUser._id,
    name:
      req.foundUser.name ||
      (req.foundUser.email ? req.foundUser.email.split("@")[0] : "User"),
    email: req.foundUser.email,
    profile,
    role: req.foundUser.role || "User",
    authProvider: req.foundUser.authProvider,
    preferences: req.foundUser.preferences || { showAllActionsDirectly: false },
    integrations: {
      googleDrive: Boolean(req.foundUser.integrations?.googleDrive?.connected),
      googlePhotos: Boolean(req.foundUser.integrations?.googlePhotos?.connected),
      github: Boolean(req.foundUser.integrations?.github?.connected),
    },
  });
};

export const updateUserProfile = async (req, res) => {
  try {
    const { name, preferences, profile } = req.body || {};
    const userId = req.foundUser._id;

    const updateFields = {};

    if (name && typeof name === "string") {
      updateFields.name = name.trim();
    }

    if (profile !== undefined) {
      if (profile === null || profile === "") {
        // Reset to generated avatar
        updateFields.profile = generateRandomAvatarSync(req.foundUser.email || userId?.toString());
      } else if (typeof profile === "string") {
        updateFields.profile = profile.trim();
      }
    }

    if (preferences && typeof preferences === "object") {
      updateFields.preferences = {
        ...(req.foundUser.preferences || {}),
        showAllActionsDirectly: Boolean(preferences.showAllActionsDirectly),
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        profile: updatedUser.profile,
        role: updatedUser.role,
        preferences: updatedUser.preferences,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Failed to update profile settings" });
  }
};

export const userLogout = async (req, res) => {
  try {
    await destroySession(req.signedCookies?.sid, res);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return res.status(400).json({ message: "Logout failed", error: error.message });
  }
};

export const allUserSessionsLogout = async (req, res) => {
  try {
    await destroyAllUserSessions(req.signedCookies?.sid, res);
    return res
      .status(200)
      .json({ message: "All sessions logged out successfully" });
  } catch (error) {
    console.error("Logout all sessions error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/user/transfer-ownership/request-otp
 * Validates recipient user existence and dispatches an OTP to the current user's email
 */
export const requestOwnershipTransferOtp = async (req, res) => {
  try {
    const { targetEmail } = req.body;
    const currentUser = req.foundUser;

    const normalizedTarget = targetEmail.trim().toLowerCase();

    if (normalizedTarget === currentUser.email.toLowerCase()) {
      return res.status(400).json({
        error: "Action Denied: You cannot transfer account ownership to yourself.",
        code: "CANNOT_TRANSFER_TO_SELF",
      });
    }

    const recipient = await User.findOne({ email: normalizedTarget }).lean();
    if (!recipient) {
      return res.status(404).json({
        error: "Recipient email does not match any registered MeghVault account. Please verify the email address.",
        code: "RECIPIENT_NOT_FOUND",
      });
    }

    // Safety check: Prevent sole administrator from transferring & destroying account if no other admins exist
    if (currentUser.role === "Admin" && recipient.role !== "Admin") {
      const adminCount = await User.countDocuments({ role: "Admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: "Action Denied: Cannot delete the sole system administrator. Please assign another Admin first.",
          code: "SOLE_ADMIN_RESTRICTION",
        });
      }
    }

    // Dispatch security verification OTP
    await sendOTPService(currentUser.email, {
      type: "ownership-transfer",
      targetEmail: normalizedTarget,
    });

    return res.status(200).json({
      success: true,
      message: `A 4-digit transfer verification code was sent to ${currentUser.email}.`,
      recipient: {
        id: recipient._id,
        name: recipient.name,
        email: recipient.email,
        profile: recipient.profile,
      },
    });
  } catch (error) {
    console.error("requestOwnershipTransferOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to process ownership transfer request",
    });
  }
};

/**
 * POST /api/user/transfer-ownership/confirm
 * Atomically transfers all files, folders, and shares to the recipient,
 * deletes the current user, and terminates all active sessions.
 */
export const confirmOwnershipTransfer = async (req, res) => {
  try {
    const { targetEmail, otp } = req.body;
    const currentUser = req.foundUser;
    const normalizedTarget = targetEmail.trim().toLowerCase();

    if (normalizedTarget === currentUser.email.toLowerCase()) {
      return res.status(400).json({
        error: "Action Denied: You cannot transfer account ownership to yourself.",
      });
    }

    // 1. Verify OTP in database
    const otpRecord = await OTP.findOne({ email: currentUser.email });
    if (!otpRecord || otpRecord.otp !== otp.trim()) {
      return res.status(401).json({
        error: "Invalid or expired verification code. Please request a new code.",
        code: "INVALID_OTP",
      });
    }

    const ageMs = Date.now() - new Date(otpRecord.createdAt).getTime();
    if (ageMs > 3 * 60 * 1000) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(401).json({
        error: "Verification code has expired. Please request a new code.",
        code: "EXPIRED_OTP",
      });
    }

    // Consume OTP immediately to prevent replay attacks
    await OTP.deleteOne({ _id: otpRecord._id });

    // 2. Validate recipient user exists
    const targetUser = await User.findOne({ email: normalizedTarget });
    if (!targetUser) {
      return res.status(404).json({
        error: "Recipient user account was not found.",
        code: "RECIPIENT_NOT_FOUND",
      });
    }

    // 3. Execute Atomic Ownership Transfer Transaction
    let transferredFolderName = `Transferred from ${currentUser.email}`;
    let reparentedFolderId = null;

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Re-read both users within transaction
        const sourceUser = await User.findById(currentUser._id).session(dbSession);
        const recipientUser = await User.findById(targetUser._id).session(dbSession);

        if (!sourceUser || !recipientUser) {
          throw new Error("One or both user records could not be verified in transaction.");
        }

        // Fetch Root Directories
        const sourceRootDir = await Directory.findById(sourceUser.rootDirId).session(dbSession);
        const recipientRootDir = await Directory.findById(recipientUser.rootDirId).session(dbSession);

        if (!sourceRootDir || !recipientRootDir) {
          throw new Error("Root directory pointers are missing or damaged.");
        }

        reparentedFolderId = sourceRootDir._id;

        // Resolve clean, conflict-free folder name inside recipient's root directory
        let candidateName = `Transferred from ${sourceUser.email}`;
        let counter = 1;
        while (
          await Directory.findOne({
            parentDirId: recipientRootDir._id,
            name: candidateName,
            isTrashed: false,
          }).session(dbSession)
        ) {
          candidateName = `Transferred from ${sourceUser.email} (${counter})`;
          counter++;
        }
        transferredFolderName = candidateName;

        // Step A: Reparent source user's root directory under recipient's root directory
        await Directory.updateOne(
          { _id: sourceRootDir._id },
          {
            $set: {
              name: transferredFolderName,
              userId: recipientUser._id,
              parentDirId: recipientRootDir._id,
            },
          },
          { session: dbSession }
        );

        // Step B: Bulk reassign all other directories belonging to source user
        await Directory.updateMany(
          { userId: sourceUser._id, _id: { $ne: sourceRootDir._id } },
          { $set: { userId: recipientUser._id } },
          { session: dbSession }
        );

        // Step C: Bulk reassign all files belonging to source user
        await File.updateMany(
          { userId: sourceUser._id },
          { $set: { userId: recipientUser._id } },
          { session: dbSession }
        );

        // Step D: Reassign Share documents owned by source user
        await Share.updateMany(
          { ownerId: sourceUser._id },
          {
            $set: { ownerId: recipientUser._id },
            $pull: { collaborators: { userId: recipientUser._id } },
          },
          { session: dbSession }
        );

        // Step E: Remove source user from any shared items where they were a collaborator
        await Share.updateMany(
          { "collaborators.userId": sourceUser._id },
          {
            $pull: { collaborators: { userId: sourceUser._id } },
          },
          { session: dbSession }
        );

        // Step F: Migrate Starred items without duplicate compound index conflicts
        const sourceStars = await Starred.find({ userId: sourceUser._id }).session(dbSession);
        for (const star of sourceStars) {
          const alreadyStarredByRecipient = await Starred.findOne({
            userId: recipientUser._id,
            resourceId: star.resourceId,
          }).session(dbSession);

          if (!alreadyStarredByRecipient) {
            await Starred.updateOne(
              { _id: star._id },
              { $set: { userId: recipientUser._id } },
              { session: dbSession }
            );
          } else {
            await Starred.deleteOne({ _id: star._id }).session(dbSession);
          }
        }

        // Step G: Terminate and delete all active sessions of source user
        await Session.deleteMany({ userId: sourceUser._id }, { session: dbSession });

        // Step H: Permanently delete source user account from database
        await User.findByIdAndDelete(sourceUser._id, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    // 4. Clear auth cookies for the departing user
    res.clearCookie("sid", getClearCookieOptions());

    // 5. Log activity for the recipient user
    if (reparentedFolderId) {
      logActivity({
        userId: targetUser._id,
        resourceType: "directory",
        resourceId: reparentedFolderId,
        action: "import",
        details: {
          name: transferredFolderName,
          source: "ownership-transfer",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Account ownership successfully transferred to ${normalizedTarget}. All files have been relocated and your account has been closed.`,
      transferredFolderName,
    });
  } catch (error) {
    console.error("confirmOwnershipTransfer error:", error);
    return res.status(500).json({
      error: error.message || "Failed to execute account ownership transfer",
    });
  }
};

/**
 * POST /api/user/delete-account/request-otp
 * POST /api/delete-account/request-otp
 * Generates and sends a 4-digit security OTP to verify self account deletion
 */
export const requestDeleteAccountOtp = async (req, res) => {
  try {
    const currentUser = req.foundUser;

    // Check sole administrator safeguard
    if (currentUser.role === "Admin") {
      const adminCount = await User.countDocuments({ role: "Admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: "Action Denied: Cannot delete the sole system administrator. Please assign another Admin first.",
          code: "SOLE_ADMIN_RESTRICTION",
        });
      }
    }

    // Send deletion confirmation OTP
    await sendOTPService(currentUser.email, {
      type: "delete-account",
    });

    return res.status(200).json({
      success: true,
      message: `A 4-digit deletion confirmation code was sent to ${currentUser.email}.`,
    });
  } catch (error) {
    console.error("requestDeleteAccountOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to initiate account deletion request",
    });
  }
};

/**
 * POST /api/user/delete-account/confirm
 * POST /api/delete-account/confirm
 * DELETE /api/user/delete-account
 * Verifies OTP, scrubs physical files from storage disk, cascadingly wipes all
 * MongoDB records (sessions, files, directories, shares, starred, activity),
 * and permanently deletes the user account.
 */
export const confirmDeleteAccount = async (req, res) => {
  try {
    const { otp } = req.body || {};
    const currentUser = req.foundUser;
    const userId = currentUser._id;

    // 1. Check sole administrator safeguard
    if (currentUser.role === "Admin") {
      const adminCount = await User.countDocuments({ role: "Admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: "Action Denied: Cannot delete the sole system administrator. Please assign another Admin first.",
          code: "SOLE_ADMIN_RESTRICTION",
        });
      }
    }

    // 2. Verify OTP in database
    const otpRecord = await OTP.findOne({ email: currentUser.email });
    if (!otpRecord || otpRecord.otp !== otp?.trim()) {
      return res.status(401).json({
        error: "Invalid or expired verification code. Please request a new code.",
        code: "INVALID_OTP",
      });
    }

    const ageMs = Date.now() - new Date(otpRecord.createdAt).getTime();
    if (ageMs > 3 * 60 * 1000) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(401).json({
        error: "Verification code has expired. Please request a new code.",
        code: "EXPIRED_OTP",
      });
    }

    // Consume OTP immediately to prevent replay attacks
    await OTP.deleteOne({ _id: otpRecord._id });

    // 3. Delete physical storage files from disk
    const userFiles = await File.find({ userId }).lean();
    for (const f of userFiles) {
      try {
        await deletePhysicalFile(f._id, f.extension);
      } catch (err) {
        console.error(`Failed to delete physical file ${f._id}:`, err);
      }
    }

    // 4. Cascade delete across all database collections using MongoDB transaction
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Step A: Terminate sessions
        await Session.deleteMany({ userId }, { session: dbSession });

        // Step B: Delete files
        await File.deleteMany({ userId }, { session: dbSession });

        // Step C: Delete directories
        await Directory.deleteMany({ userId }, { session: dbSession });

        // Step D: Delete shares owned by user
        await Share.deleteMany({ ownerId: userId }, { session: dbSession });

        // Step E: Remove user from collaborators of other users' shares
        await Share.updateMany(
          { "collaborators.userId": userId },
          { $pull: { collaborators: { userId } } },
          { session: dbSession }
        );

        // Step F: Delete starred records
        await Starred.deleteMany({ userId }, { session: dbSession });

        // Step G: Delete activity feed records
        await Activity.deleteMany({ userId }, { session: dbSession });

        // Step H: Delete any pending OTPs
        await OTP.deleteMany({ email: currentUser.email }, { session: dbSession });

        // Step I: Permanently delete user document
        await User.findByIdAndDelete(userId, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    // 5. Clear auth session cookies
    res.clearCookie("sid", getClearCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Your MeghVault account and all associated data have been permanently deleted.",
    });
  } catch (error) {
    console.error("confirmDeleteAccount error:", error);
    return res.status(500).json({
      error: error.message || "Failed to delete account",
    });
  }
};

/**
 * Step 1: Request Email Change & Dispatch OTP to Old/Current Email
 * POST /api/user/change-email/request-old-otp
 */
export const requestChangeEmailOldOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const currentUser = req.foundUser;
    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const currentEmail = currentUser.email.toLowerCase();

    if (normalizedNewEmail === currentEmail) {
      return res.status(400).json({
        error: "This is already your active account email address.",
        code: "SAME_EMAIL",
      });
    }

    // Check if new email is already registered by another user
    const existingUser = await User.findOne({ email: normalizedNewEmail });
    if (existingUser) {
      return res.status(200).json({
        exists: true,
        canMigrate: true,
        message: "An account with this email is already registered on MeghVault.",
        existingUser: {
          id: existingUser._id,
          name: existingUser.name || existingUser.email.split("@")[0],
          email: existingUser.email,
          profile: existingUser.profile,
        },
      });
    }

    // Email is free! Send Step 1 OTP to currentUser.email
    await sendOTPService(currentUser.email, {
      type: "change-email-old",
      targetEmail: normalizedNewEmail,
    });

    return res.status(200).json({
      exists: false,
      step: 1,
      message: `A 4-digit authorization code was sent to your current email (${currentUser.email}).`,
    });
  } catch (error) {
    console.error("requestChangeEmailOldOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to process email change request",
    });
  }
};

/**
 * Step 2: Verify Old/Current Email OTP & Dispatch OTP to New Email
 * POST /api/user/change-email/verify-old-otp
 */
export const verifyChangeEmailOldOtp = async (req, res) => {
  try {
    const { newEmail, otp } = req.body;
    const currentUser = req.foundUser;
    const normalizedNewEmail = newEmail.trim().toLowerCase();

    // 1. Verify OTP in database for current user's email
    const otpRecord = await OTP.findOne({ email: currentUser.email });
    if (!otpRecord || otpRecord.otp !== otp.trim()) {
      return res.status(401).json({
        error: "Invalid or expired authorization code. Please request a new code.",
        code: "INVALID_OTP",
      });
    }

    const ageMs = Date.now() - new Date(otpRecord.createdAt).getTime();
    if (ageMs > 3 * 60 * 1000) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(401).json({
        error: "Authorization code has expired. Please request a new code.",
        code: "EXPIRED_OTP",
      });
    }

    // Consume OTP 1
    await OTP.deleteOne({ _id: otpRecord._id });

    // 2. Re-verify new email is still not registered
    const existingUser = await User.findOne({ email: normalizedNewEmail });
    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email address was just registered by another user.",
        code: "EMAIL_TAKEN",
      });
    }

    // 3. Issue signed changeToken
    const changeToken = createSignedToken({
      userId: currentUser._id.toString(),
      oldEmail: currentUser.email,
      newEmail: normalizedNewEmail,
    });

    // 4. Dispatch Step 2 OTP to new email
    await sendOTPService(normalizedNewEmail, {
      type: "change-email-new",
    });

    return res.status(200).json({
      success: true,
      step: 2,
      changeToken,
      message: `Current email authorized! A 4-digit verification code has been dispatched to ${normalizedNewEmail}.`,
    });
  } catch (error) {
    console.error("verifyChangeEmailOldOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to verify authorization code",
    });
  }
};

/**
 * Resend OTP to New Email during Step 2
 * POST /api/user/change-email/resend-new-otp
 */
export const resendChangeEmailNewOtp = async (req, res) => {
  try {
    const { newEmail, changeToken } = req.body;
    const currentUser = req.foundUser;
    const normalizedNewEmail = newEmail.trim().toLowerCase();

    // Verify token
    const tokenResult = verifySignedToken(changeToken);
    if (!tokenResult.valid) {
      return res.status(401).json({
        error: tokenResult.error || "Invalid or expired session token. Please restart the email change process.",
        code: "INVALID_TOKEN",
      });
    }

    if (
      tokenResult.payload.userId !== currentUser._id.toString() ||
      tokenResult.payload.newEmail !== normalizedNewEmail
    ) {
      return res.status(403).json({
        error: "Token mismatch. Unauthorized request.",
      });
    }

    // Re-dispatch OTP to new email
    await sendOTPService(normalizedNewEmail, {
      type: "change-email-new",
    });

    return res.status(200).json({
      success: true,
      message: `A new verification code was sent to ${normalizedNewEmail}.`,
    });
  } catch (error) {
    console.error("resendChangeEmailNewOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to resend verification code",
    });
  }
};

/**
 * Step 3: Verify New Email OTP & Atomically Commit Email Update
 * POST /api/user/change-email/confirm-new-otp
 */
export const confirmChangeEmailNewOtp = async (req, res) => {
  try {
    const { newEmail, otp, changeToken } = req.body;
    const currentUser = req.foundUser;
    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const oldEmail = currentUser.email;

    // 1. Verify changeToken
    const tokenResult = verifySignedToken(changeToken);
    if (!tokenResult.valid) {
      return res.status(401).json({
        error: tokenResult.error || "Invalid or expired change authorization. Please restart the process.",
        code: "INVALID_TOKEN",
      });
    }

    if (
      tokenResult.payload.userId !== currentUser._id.toString() ||
      tokenResult.payload.newEmail !== normalizedNewEmail
    ) {
      return res.status(403).json({
        error: "Authorization token does not match active user or target email.",
      });
    }

    // 2. Verify OTP for new email
    const otpRecord = await OTP.findOne({ email: normalizedNewEmail });
    if (!otpRecord || otpRecord.otp !== otp.trim()) {
      return res.status(401).json({
        error: "Invalid or expired verification code for your new email.",
        code: "INVALID_OTP",
      });
    }

    const ageMs = Date.now() - new Date(otpRecord.createdAt).getTime();
    if (ageMs > 3 * 60 * 1000) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(401).json({
        error: "Verification code has expired. Please request a new code.",
        code: "EXPIRED_OTP",
      });
    }

    // Consume OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // 3. Atomic Database Update in Mongoose Transaction
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Double-check race condition: new email is still available
        const checkConflict = await User.findOne({ email: normalizedNewEmail }).session(dbSession);
        if (checkConflict && checkConflict._id.toString() !== currentUser._id.toString()) {
          throw new Error("This email address was claimed by another user just now.");
        }

        // Update User email and unlink previous third-party OAuth provider IDs
        await User.updateOne(
          { _id: currentUser._id },
          {
            $set: {
              email: normalizedNewEmail,
              "authProvider.emailAuth": true,
              "authProvider.googleAuth": null,
              "authProvider.githubAuth": null,
            },
          },
          { session: dbSession }
        );

        // Update collaborators array in Share collection where user is a collaborator
        await Share.updateMany(
          { "collaborators.userId": currentUser._id },
          { $set: { "collaborators.$.email": normalizedNewEmail } },
          { session: dbSession }
        );
      });
    } finally {
      await dbSession.endSession();
    }

    // 4. Send courtesy security notification to old email
    sendEmailChangeNotificationService(oldEmail, normalizedNewEmail);

    // 5. Security audit log
    console.log(`[Security Audit] User ${currentUser._id} changed email from ${oldEmail} to ${normalizedNewEmail}`);

    // 6. Return updated user profile
    const updatedUser = await User.findById(currentUser._id);

    return res.status(200).json({
      success: true,
      message: `Your account email has been successfully updated to ${normalizedNewEmail}.`,
      user: {
        id: updatedUser._id,
        name: updatedUser.name || updatedUser.email.split("@")[0],
        email: updatedUser.email,
        profile: updatedUser.profile,
        role: updatedUser.role || "User",
        authProvider: updatedUser.authProvider,
        preferences: updatedUser.preferences,
        integrations: {
          googleDrive: Boolean(updatedUser.integrations?.googleDrive?.connected),
          googlePhotos: Boolean(updatedUser.integrations?.googlePhotos?.connected),
          github: Boolean(updatedUser.integrations?.github?.connected),
        },
      },
    });
  } catch (error) {
    console.error("confirmChangeEmailNewOtp error:", error);
    return res.status(500).json({
      error: error.message || "Failed to update email address",
    });
  }
};
