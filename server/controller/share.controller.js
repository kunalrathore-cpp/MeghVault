import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";
import Share from "../models/share.model.js";
import User from "../models/user.model.js";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { authorizeAccess, getAncestorDirectoryIds } from "../utils/authorizeAccess.js";
import { getStorageDirectory } from "../utils/storagePath.js";
import { logActivity } from "../utils/logActivity.js";
import { downloadDirById } from "./directory.controller.js";
import { getGeneralClearCookieOptions } from "../utils/cookie.util.js";

/**
 * Generate a clean, URL-safe share token (12 characters)
 */
function generateShareToken() {
  return crypto.randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

/**
 * Generate a signed auth ticket for password-verified share sessions
 */
export function generateAuthTicket(token) {
  const secret = process.env.MY_SECERT_KEY || "meghvault_share_ticket_secret";
  const payload = `${token}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Verify a signed auth ticket
 */
export function verifyAuthTicket(ticket, expectedToken) {
  if (!ticket) return false;
  try {
    const secret = process.env.MY_SECERT_KEY || "meghvault_share_ticket_secret";
    const raw = Buffer.from(ticket, "base64url").toString();
    const parts = raw.split(":");
    if (parts.length < 3) return false;
    const [tok, timeStr, sig] = parts;
    if (tok !== expectedToken) return false;
    const age = Date.now() - parseInt(timeStr, 10);
    // Ticket valid for 24 hours
    if (isNaN(age) || age < 0 || age > 24 * 60 * 60 * 1000) return false;
    const expectedSig = crypto.createHmac("sha256", secret).update(`${tok}:${timeStr}`).digest("hex");
    return sig === expectedSig;
  } catch {
    return false;
  }
}

/**
 * Convert user-friendly expiration options to a target Date
 */
function calculateExpirationDate(option) {
  if (!option || option === "never") return null;
  const now = Date.now();
  switch (option) {
    case "1h":
      return new Date(now + 60 * 60 * 1000);
    case "24h":
      return new Date(now + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now + 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * Get or automatically create the Share document for a given resource
 */
async function findOrCreateShare(resourceType, resourceId, currentUserId) {
  let share = await Share.findOne({ resourceType, resourceId });
  if (!share) {
    // Find the resource owner
    let ownerId = currentUserId;
    if (resourceType === "file") {
      const file = await File.findById(resourceId).select("userId").lean();
      if (file) ownerId = file.userId;
    } else if (resourceType === "directory") {
      const dir = await Directory.findById(resourceId).select("userId").lean();
      if (dir) ownerId = dir.userId;
    }

    share = await Share.create({
      resourceType,
      resourceId,
      ownerId,
      collaborators: [],
      linkSettings: {
        isEnabled: false,
        shareToken: generateShareToken(),
        visibility: "restricted",
        expiresAt: null,
        allowDownload: true,
        isPasswordProtected: false,
        passwordHash: null,
      },
    });
  } else if (!share.linkSettings?.shareToken) {
    // Ensure token exists
    share.linkSettings.shareToken = generateShareToken();
    await share.save();
  }
  return share;
}

/**
 * GET /api/share/:resourceType/:resourceId
 * Retrieve share settings, owner details, collaborators, and link settings
 */
export const getShareSettings = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const currentUser = req.foundUser;

    // Check authorization: User must have read access
    const auth = await authorizeAccess({
      user: currentUser,
      action: "read",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const resource = auth.resource;
    const share = await findOrCreateShare(resourceType, resourceId, currentUser._id);

    // Fetch owner details
    const owner = await User.findById(share.ownerId)
      .select("_id name email profile role")
      .lean();

    const ownerData = {
      id: owner?._id?.toString() || share.ownerId.toString(),
      name: owner?.name || (owner?.email ? owner.email.split("@")[0] : "Owner"),
      email: owner?.email || "",
      avatar: owner?.profile || null,
      isCurrentUser: owner?._id?.toString() === currentUser._id.toString(),
    };

    // Calculate file size on disk if file
    let size = 0;
    if (resourceType === "file") {
      const ext = resource.extension?.startsWith(".") ? resource.extension : `.${resource.extension || ""}`;
      const filePath = path.join(getStorageDirectory(), `${resource._id}${ext}`);
      try {
        if (fs.existsSync(filePath)) {
          size = fs.statSync(filePath).size;
        }
      } catch {
        size = 0;
      }
    }

    return res.status(200).json({
      resource: {
        id: resource._id.toString(),
        name: resource.name,
        type: resourceType,
        extension: resource.extension || "",
        size,
        source: resource.source || "meghvault",
      },
      owner: ownerData,
      collaborators: share.collaborators.map((c) => ({
        userId: c.userId.toString(),
        name: c.name || (c.email ? c.email.split("@")[0] : "User"),
        email: c.email,
        avatar: c.avatar,
        role: c.role,
        addedAt: c.addedAt,
        isCurrentUser: c.userId.toString() === currentUser._id.toString(),
      })),
      linkSettings: {
        isEnabled: share.linkSettings.isEnabled,
        shareToken: share.linkSettings.shareToken,
        visibility: share.linkSettings.visibility,
        expiresAt: share.linkSettings.expiresAt,
        allowDownload: share.linkSettings.allowDownload,
        isPasswordProtected: Boolean(share.linkSettings.isPasswordProtected),
        hasPassword: Boolean(share.linkSettings.passwordHash),
      },
      currentUserRole: auth.role,
      isOwner: auth.role === "owner" || auth.role === "admin",
    });
  } catch (error) {
    console.error("getShareSettings error:", error);
    return res.status(500).json({ error: "Failed to retrieve share settings" });
  }
};

/**
 * GET /api/share/users/search
 * Search registered users to add as collaborators (excludes current user and owner)
 */
export const searchShareableUsers = async (req, res) => {
  try {
    const { q = "", resourceType, resourceId } = req.query;
    const currentUser = req.foundUser;
    const cleanQ = q.trim();

    // Determine existing collaborators and owner to exclude
    let existingCollabIds = new Set();
    let ownerId = currentUser._id.toString();

    if (resourceType && resourceId && mongoose.Types.ObjectId.isValid(resourceId)) {
      const share = await Share.findOne({ resourceType, resourceId }).lean();
      if (share) {
        ownerId = share.ownerId ? share.ownerId.toString() : ownerId;
        share.collaborators?.forEach((c) => existingCollabIds.add(c.userId.toString()));
      } else {
        if (resourceType === "file") {
          const file = await File.findById(resourceId).select("userId").lean();
          if (file) ownerId = file.userId.toString();
        } else if (resourceType === "directory") {
          const dir = await Directory.findById(resourceId).select("userId").lean();
          if (dir) ownerId = dir.userId.toString();
        }
      }
    }

    const filter = {
      _id: { $ne: currentUser._id },
    };

    if (ownerId && ownerId !== currentUser._id.toString() && mongoose.Types.ObjectId.isValid(ownerId)) {
      filter._id = { $nin: [currentUser._id, new mongoose.Types.ObjectId(ownerId)] };
    }

    if (cleanQ) {
      filter.$or = [
        { name: { $regex: cleanQ, $options: "i" } },
        { email: { $regex: cleanQ, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("_id name email profile role")
      .limit(20)
      .lean();

    const formattedUsers = users.map((u) => ({
      id: u._id.toString(),
      name: u.name || (u.email ? u.email.split("@")[0] : "User"),
      email: u.email,
      avatar: u.profile || null,
      role: u.role || "User",
      isCollaborator: existingCollabIds.has(u._id.toString()),
    }));

    return res.status(200).json({ users: formattedUsers });
  } catch (error) {
    console.error("searchShareableUsers error:", error);
    return res.status(500).json({ error: "Failed to search users" });
  }
};

/**
 * POST /api/share/:resourceType/:resourceId/collaborators
 * Invite one or multiple collaborators by email address or user IDs
 */
export const inviteCollaborator = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { email, userIds, users: multiUsers, role = "collaborator" } = req.body;
    const currentUser = req.foundUser;

    // Check authorization: Only Owner or Admin can manage sharing
    const auth = await authorizeAccess({
      user: currentUser,
      action: "share",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const share = await findOrCreateShare(resourceType, resourceId, currentUser._id);
    const owner = await User.findById(share.ownerId).lean();
    const ownerEmail = owner?.email ? owner.email.toLowerCase() : "";

    // Normalize targets to add
    const targetsToProcess = [];

    if (Array.isArray(userIds) && userIds.length > 0) {
      const foundUsers = await User.find({ _id: { $in: userIds } }).lean();
      for (const u of foundUsers) {
        targetsToProcess.push({ user: u, role });
      }
    } else if (Array.isArray(multiUsers) && multiUsers.length > 0) {
      const ids = multiUsers.map((m) => m.id || m.userId).filter(Boolean);
      const emails = multiUsers.map((m) => m.email?.toLowerCase()).filter(Boolean);
      const foundUsers = await User.find({
        $or: [{ _id: { $in: ids } }, { email: { $in: emails } }],
      }).lean();

      for (const u of foundUsers) {
        const item = multiUsers.find(
          (m) =>
            (m.id && m.id === u._id.toString()) ||
            (m.email && m.email.toLowerCase() === u.email.toLowerCase())
        );
        targetsToProcess.push({ user: u, role: item?.role || role });
      }
    } else if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail === ownerEmail) {
        return res.status(400).json({ error: "Cannot invite the resource owner as a collaborator" });
      }
      const targetUser = await User.findOne({ email: cleanEmail }).lean();
      if (!targetUser) {
        return res.status(404).json({
          error: `No user found with email "${cleanEmail}". Collaborators must have a registered MeghVault account.`,
        });
      }
      targetsToProcess.push({ user: targetUser, role });
    } else {
      return res.status(400).json({ error: "No valid users or email provided to invite" });
    }

    let addedCount = 0;
    for (const { user, role: userRole } of targetsToProcess) {
      if (user.email.toLowerCase() === ownerEmail) continue;

      const existingIndex = share.collaborators.findIndex(
        (c) => c.userId.toString() === user._id.toString() || c.email === user.email.toLowerCase()
      );

      const assignedRole = userRole === "editor" || userRole === "collaborator" ? "collaborator" : "viewer";

      const record = {
        userId: user._id,
        name: user.name || user.email.split("@")[0],
        email: user.email,
        avatar: user.profile || null,
        role: assignedRole,
        addedAt: new Date(),
      };

      if (existingIndex >= 0) {
        share.collaborators[existingIndex] = record;
      } else {
        share.collaborators.push(record);
      }
      addedCount++;
    }

    await share.save();

    if (addedCount > 0) {
      const emailList = targetsToProcess.map((t) => t.user.email).filter(Boolean).join(", ");
      logActivity({
        userId: currentUser._id,
        resourceType,
        resourceId,
        action: "share",
        details: {
          name: auth.resource?.name,
          sharedWithEmail: emailList,
          extension: auth.resource?.extension,
        },
      });
    }

    const formattedCollaborators = share.collaborators.map((c) => ({
      userId: c.userId.toString(),
      name: c.name,
      email: c.email,
      avatar: c.avatar,
      role: c.role,
      addedAt: c.addedAt,
      isCurrentUser: c.userId.toString() === currentUser._id.toString(),
    }));

    return res.status(200).json({
      message: `${addedCount} collaborator${addedCount === 1 ? "" : "s"} added successfully`,
      collaborators: formattedCollaborators,
    });
  } catch (error) {
    console.error("inviteCollaborator error:", error);
    return res.status(500).json({ error: "Failed to invite collaborator" });
  }
};

/**
 * DELETE /api/share/:resourceType/:resourceId/collaborators/:targetUserId
 * Remove a collaborator from a resource
 */
export const removeCollaborator = async (req, res) => {
  try {
    const { resourceType, resourceId, targetUserId } = req.params;
    const currentUser = req.foundUser;

    const auth = await authorizeAccess({
      user: currentUser,
      action: "share",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const share = await findOrCreateShare(resourceType, resourceId, currentUser._id);

    share.collaborators = share.collaborators.filter(
      (c) => c.userId.toString() !== targetUserId
    );

    await share.save();

    return res.status(200).json({
      message: "Collaborator removed successfully",
      collaborators: share.collaborators.map((c) => ({
        userId: c.userId.toString(),
        name: c.name,
        email: c.email,
        avatar: c.avatar,
        role: c.role,
        addedAt: c.addedAt,
      })),
    });
  } catch (error) {
    console.error("removeCollaborator error:", error);
    return res.status(500).json({ error: "Failed to remove collaborator" });
  }
};

/**
 * PATCH /api/share/:resourceType/:resourceId/collaborators/:targetUserId
 * Update a collaborator's role (viewer vs collaborator)
 */
export const updateCollaboratorRole = async (req, res) => {
  try {
    const { resourceType, resourceId, targetUserId } = req.params;
    const { role } = req.body;
    const currentUser = req.foundUser;

    if (!["viewer", "collaborator"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'viewer' or 'collaborator'" });
    }

    const auth = await authorizeAccess({
      user: currentUser,
      action: "share",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const share = await findOrCreateShare(resourceType, resourceId, currentUser._id);

    const collab = share.collaborators.find(
      (c) => c.userId.toString() === targetUserId
    );

    if (!collab) {
      return res.status(404).json({ error: "Collaborator not found on this resource" });
    }

    collab.role = role;
    await share.save();

    return res.status(200).json({
      message: `Collaborator role updated to ${role}`,
      collaborator: collab,
    });
  } catch (error) {
    console.error("updateCollaboratorRole error:", error);
    return res.status(500).json({ error: "Failed to update collaborator role" });
  }
};

/**
 * PATCH /api/share/:resourceType/:resourceId/link
 * Update Link Settings (Status, Visibility, Expiration, Allow Download, Password Protection)
 */
export const updateLinkSettings = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const {
      isEnabled,
      visibility,
      expirationOption,
      allowDownload,
      isPasswordProtected,
      securityKey,
      password,
    } = req.body;
    const currentUser = req.foundUser;

    const auth = await authorizeAccess({
      user: currentUser,
      action: "share",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const share = await findOrCreateShare(resourceType, resourceId, currentUser._id);

    if (typeof isEnabled === "boolean") {
      share.linkSettings.isEnabled = isEnabled;
    }

    if (visibility && ["public", "restricted"].includes(visibility)) {
      share.linkSettings.visibility = visibility;
    }

    if (expirationOption !== undefined) {
      share.linkSettings.expiresAt = calculateExpirationDate(expirationOption);
    }

    if (typeof allowDownload === "boolean") {
      share.linkSettings.allowDownload = allowDownload;
    }

    // Password Protection validation and update (supports both securityKey and password field names)
    const rawKey = securityKey !== undefined ? securityKey : password;
    const effectiveKey = typeof rawKey === "string" ? rawKey.trim() : null;

    if (effectiveKey) {
      const salt = await bcrypt.genSalt(10);
      share.linkSettings.passwordHash = await bcrypt.hash(effectiveKey, salt);
      share.linkSettings.isPasswordProtected = true;
    } else if (typeof isPasswordProtected === "boolean") {
      if (isPasswordProtected) {
        if (share.linkSettings.passwordHash) {
          share.linkSettings.isPasswordProtected = true;
        } else {
          return res.status(400).json({
            error: "Please enter and apply a security key to activate password protection.",
          });
        }
      } else {
        share.linkSettings.isPasswordProtected = false;
        share.linkSettings.passwordHash = null;
      }
    }

    await share.save();

    return res.status(200).json({
      message: "Link settings updated successfully",
      linkSettings: {
        isEnabled: share.linkSettings.isEnabled,
        shareToken: share.linkSettings.shareToken,
        visibility: share.linkSettings.visibility,
        expiresAt: share.linkSettings.expiresAt,
        allowDownload: share.linkSettings.allowDownload,
        isPasswordProtected: Boolean(share.linkSettings.isPasswordProtected),
        hasPassword: Boolean(share.linkSettings.passwordHash),
      },
    });
  } catch (error) {
    console.error("updateLinkSettings error:", error);
    return res.status(500).json({ error: "Failed to update link settings" });
  }
};

/**
 * GET /api/share/public/:token
 * Public entrypoint to view shared file or directory metadata
 */
export const getPublicShareInfo = async (req, res) => {
  try {
    const { token } = req.params;
    const { subDirId, ticket } = req.query;
    const isTicketValid = verifyAuthTicket(ticket || req.headers["x-share-ticket"], token);
    const isPasswordVerified = isTicketValid;

    const share = await Share.findOne({ "linkSettings.shareToken": token }).lean();
    if (!share || !share.linkSettings?.isEnabled) {
      return res.status(404).json({ error: "Shared resource not found or link has been disabled" });
    }

    // Expiration check
    if (share.linkSettings.expiresAt && new Date() > new Date(share.linkSettings.expiresAt)) {
      return res.status(410).json({ error: "This share link has expired", code: "EXPIRED" });
    }

    // Fetch root shared resource
    let rootResource = null;
    if (share.resourceType === "file") {
      rootResource = await File.findById(share.resourceId).lean();
    } else if (share.resourceType === "directory") {
      rootResource = await Directory.findById(share.resourceId).lean();
    }

    if (!rootResource) {
      return res.status(404).json({ error: "Shared item no longer exists" });
    }

    const owner = await User.findById(share.ownerId).select("name email profile").lean();
    const ownerName = owner?.name || (owner?.email ? owner.email.split("@")[0] : "MeghVault User");

    // If visitor is owner or admin, they never require password
    const isOwnerOrAdmin = Boolean(
      req.foundUser &&
      (req.foundUser._id.toString() === share.ownerId.toString() || req.foundUser.role === "Admin")
    );

    // Password Protection check (never bypass with stored cookies)
    const isPasswordRequired =
      !isOwnerOrAdmin &&
      share.linkSettings.isPasswordProtected &&
      share.linkSettings.passwordHash &&
      !isPasswordVerified;

    if (isPasswordRequired) {
      return res.status(200).json({
        requiresPassword: true,
        resourceName: rootResource.name,
        resourceType: share.resourceType,
        ownerName,
        visibility: share.linkSettings.visibility,
      });
    }

    // Check Restricted access if signed in
    if (share.linkSettings.visibility === "restricted") {
      const currentUser = req.foundUser;
      if (!currentUser) {
        return res.status(401).json({
          error: "This share link is restricted to invited collaborators. Please log in to view.",
          requiresAuth: true,
        });
      }
      const isCollab = share.collaborators.some(
        (c) => c.userId.toString() === currentUser._id.toString()
      );
      const isOwner = share.ownerId.toString() === currentUser._id.toString();
      const isAdmin = currentUser.role === "Admin";
      if (!isCollab && !isOwner && !isAdmin) {
        return res.status(403).json({
          error: "Access denied: you are not listed as a collaborator on this item.",
        });
      }
    }

    // Calculate file size on disk for single file
    let size = 0;
    if (share.resourceType === "file") {
      const ext = rootResource.extension?.startsWith(".") ? rootResource.extension : `.${rootResource.extension || ""}`;
      const filePath = path.join(getStorageDirectory(), `${rootResource._id}${ext}`);
      try {
        if (fs.existsSync(filePath)) size = fs.statSync(filePath).size;
      } catch {
        size = 0;
      }
    }

    // If directory, handle navigation (root or subfolder drill-down)
    let directoryContents = null;
    let targetDirectory = rootResource;

    if (share.resourceType === "directory") {
      let currentDirId = rootResource._id.toString();

      if (subDirId && subDirId !== currentDirId) {
        // Validate subfolder ancestry to ensure visitor can only view descendants of shared folder
        const ancestors = await getAncestorDirectoryIds(subDirId);
        if (ancestors.includes(rootResource._id.toString())) {
          const subDir = await Directory.findById(subDirId).lean();
          if (subDir) {
            targetDirectory = subDir;
            currentDirId = subDir._id.toString();
          }
        }
      }

      const [subDirs, subFiles] = await Promise.all([
        Directory.find({ parentDirId: targetDirectory._id }).sort({ name: 1 }).lean(),
        File.find({ parentDirId: targetDirectory._id }).sort({ name: 1 }).lean(),
      ]);

      // Calculate file sizes on disk
      const storageDir = getStorageDirectory();
      const mappedFiles = subFiles.map((f) => {
        let fileSize = f.size || 0;
        if (!fileSize) {
          const ext = f.extension?.startsWith(".") ? f.extension : `.${f.extension || ""}`;
          const p = path.join(storageDir, `${f._id}${ext}`);
          try {
            if (fs.existsSync(p)) fileSize = fs.statSync(p).size;
          } catch {
            fileSize = 0;
          }
        }
        return {
          id: f._id.toString(),
          name: f.name,
          extension: f.extension,
          size: fileSize,
          isDirectory: false,
          type: "file",
        };
      });

      // Construct directory breadcrumbs relative to shared root
      const breadcrumbs = [];
      let walkId = targetDirectory._id.toString();
      const sharedRootIdStr = rootResource._id.toString();
      const visited = new Set();

      while (walkId && !visited.has(walkId)) {
        visited.add(walkId);
        if (walkId === sharedRootIdStr) {
          breadcrumbs.unshift({ id: rootResource._id.toString(), name: rootResource.name });
          break;
        }
        const dirNode = await Directory.findById(walkId).select("name parentDirId").lean();
        if (!dirNode) break;
        breadcrumbs.unshift({ id: dirNode._id.toString(), name: dirNode.name });
        walkId = dirNode.parentDirId ? dirNode.parentDirId.toString() : null;
      }

      directoryContents = {
        currentDirectory: {
          id: targetDirectory._id.toString(),
          name: targetDirectory.name,
          isRoot: targetDirectory._id.toString() === rootResource._id.toString(),
        },
        directories: subDirs.map((d) => ({
          id: d._id.toString(),
          name: d.name,
          isDirectory: true,
          type: "directory",
        })),
        files: mappedFiles,
        breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : [{ id: rootResource._id.toString(), name: rootResource.name }],
      };
    }

    const currentUser = req.foundUser;
    let currentUserRole = null;
    if (currentUser) {
      if (currentUser.role === "Admin") {
        currentUserRole = "admin";
      } else if (share.ownerId.toString() === currentUser._id.toString()) {
        currentUserRole = "owner";
      } else {
        const collab = share.collaborators?.find((c) => c.userId?.toString() === currentUser._id.toString());
        currentUserRole = collab?.role || "viewer";
      }
    }

    return res.status(200).json({
      requiresPassword: false,
      currentUserRole,
      isLoggedIn: Boolean(currentUser),
      resource: {
        id: targetDirectory._id.toString(),
        rootId: rootResource._id.toString(),
        name: targetDirectory.name,
        type: share.resourceType,
        extension: targetDirectory.extension || "",
        size,
        source: targetDirectory.source || "meghvault",
        createdAt: targetDirectory.createdAt,
      },
      owner: {
        name: ownerName,
        avatar: owner?.profile || null,
      },
      linkSettings: {
        shareToken: share.linkSettings.shareToken,
        visibility: share.linkSettings.visibility,
        allowDownload: share.linkSettings.allowDownload,
        expiresAt: share.linkSettings.expiresAt,
      },
      directoryContents,
    });
  } catch (error) {
    console.error("getPublicShareInfo error:", error);
    return res.status(500).json({ error: "Failed to retrieve shared resource" });
  }
};

/**
 * POST /api/share/public/:token/verify-password
 * Verifies security key for a password-protected link
 */
export const verifyPublicPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Security key password is required" });
    }

    const share = await Share.findOne({ "linkSettings.shareToken": token });
    if (!share || !share.linkSettings?.isEnabled) {
      return res.status(404).json({ error: "Share link not found or disabled" });
    }

    // Generate short-lived signed auth ticket (valid for 2 minutes)
    const authTicket = generateAuthTicket(token);

    // Clear any persistent cookies so password is never permanently saved
    res.clearCookie(`share_pass_${token}`, getGeneralClearCookieOptions());
    if (share.resourceId) {
      res.clearCookie(`share_pass_res_${share.resourceId.toString()}`, getGeneralClearCookieOptions());
    }

    if (!share.linkSettings.isPasswordProtected || !share.linkSettings.passwordHash) {
      return res.status(200).json({
        message: "No password required for this link",
        verified: true,
        authTicket,
      });
    }

    const isMatch = await bcrypt.compare(password, share.linkSettings.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid security key. Please check and try again." });
    }

    return res.status(200).json({
      message: "Security key verified successfully",
      verified: true,
      authTicket,
    });
  } catch (error) {
    console.error("verifyPublicPassword error:", error);
    return res.status(500).json({ error: "Password verification failed" });
  }
};

/**
 * POST /api/share/:resourceType/:resourceId/unlock
 * Authenticated or direct unlock endpoint for shared files and folders
 */
export const unlockSharedAsset = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Security key password is required" });
    }

    const share = await Share.findOne({
      resourceType,
      resourceId,
    });

    if (!share) {
      return res.status(404).json({ error: "Share settings not found for this resource" });
    }

    const token = share.linkSettings?.shareToken;
    // Generate auth ticket tied to resourceId for immediate action execution
    const authTicket = generateAuthTicket(resourceId);

    // Clear any previous persistent cookies
    if (token) {
      res.clearCookie(`share_pass_${token}`, getGeneralClearCookieOptions());
    }
    res.clearCookie(`share_pass_res_${resourceId}`, getGeneralClearCookieOptions());

    if (!share.linkSettings?.isPasswordProtected || !share.linkSettings?.passwordHash) {
      return res.status(200).json({
        message: "No password required for this item",
        verified: true,
        authTicket,
      });
    }

    const isMatch = await bcrypt.compare(password, share.linkSettings.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid security key. Please check and try again." });
    }

    return res.status(200).json({
      message: "Security key verified successfully",
      verified: true,
      authTicket,
    });
  } catch (error) {
    console.error("unlockSharedAsset error:", error);
    return res.status(500).json({ error: "Failed to unlock shared item" });
  }
};

/**
 * GET /api/share/public/:token/stream
 * GET /api/share/public/:token/stream/:fileId
 * Public streaming or download of shared file or file within shared directory
 */
export const streamPublicFile = async (req, res, next) => {
  try {
    const { token, fileId } = req.params;
    const queryFileId = req.query.fileId || fileId;
    const ticket = req.query.ticket || req.headers["x-share-ticket"];
    const isDownload = req.query.action === "download";
    const isTicketValid = verifyAuthTicket(ticket, token);
    const isPasswordVerified = isTicketValid;

    const share = await Share.findOne({ "linkSettings.shareToken": token }).lean();
    if (!share || !share.linkSettings?.isEnabled) {
      return res.status(404).json({ error: "Share link not found or inactive" });
    }

    // Resolve target file
    let targetFileId = null;

    if (share.resourceType === "file") {
      targetFileId = share.resourceId;
    } else if (share.resourceType === "directory") {
      if (!queryFileId) {
        return res.status(400).json({ error: "File ID is required to access files in a shared folder" });
      }

      // Verify file belongs inside this shared directory hierarchy
      const candidateFile = await File.findById(queryFileId).lean();
      if (!candidateFile) {
        return res.status(404).json({ error: "Requested file not found" });
      }

      const fileParentId = candidateFile.parentDirId?.toString();
      const sharedDirId = share.resourceId.toString();

      if (fileParentId !== sharedDirId) {
        const ancestors = await getAncestorDirectoryIds(fileParentId);
        if (!ancestors.includes(sharedDirId)) {
          return res.status(403).json({ error: "File is not part of this shared folder" });
        }
      }

      targetFileId = candidateFile._id;
    }

    const auth = await authorizeAccess({
      user: req.foundUser || null,
      action: isDownload ? "download" : "read",
      resourceType: "file",
      resourceId: targetFileId,
      options: {
        shareToken: token,
        passwordVerified: isPasswordVerified,
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message });
    }

    const fileData = auth.resource;
    const ext = fileData.extension?.startsWith(".") ? fileData.extension : `.${fileData.extension || ""}`;
    const fullFileName = `${fileData._id}${ext}`;
    const storageDir = getStorageDirectory();
    let filePath = path.join(storageDir, fullFileName);

    if (!fs.existsSync(filePath)) {
      const altPath = path.join(storageDir, `${fileData._id}`);
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      } else {
        return res.status(404).json({ error: "Physical file missing on server" });
      }
    }

    const handleFileError = (err) => {
      if (!err || res.headersSent) return;
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "File missing on storage server" });
      }
      next(err);
    };

    if (isDownload) {
      return res.download(filePath, fileData.name, handleFileError);
    }

    // Set inline disposition with original filename for proper browser preview
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(fileData.name)}"`
    );
    return res.sendFile(filePath, handleFileError);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/share/public/:token/download
 * Public download of an entire shared folder as a streaming zip archive
 */
export const downloadPublicSharedFolder = async (req, res, next) => {
  try {
    const { token } = req.params;
    const share = await Share.findOne({ "linkSettings.shareToken": token }).lean();
    if (!share || !share.linkSettings?.isEnabled) {
      return res.status(404).json({ error: "Share link not found or inactive" });
    }
    if (share.resourceType !== "directory") {
      return res.status(400).json({ error: "Shared item is not a directory" });
    }
    req.params.id = share.resourceId.toString();
    req.query.shareToken = token;
    return downloadDirById(req, res, next);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/share/shared-with-me
 * Retrieve all files and folders shared with the currently authenticated user
 */
export const getSharedWithMe = async (req, res) => {
  try {
    const currentUser = req.foundUser;
    const userIdStr = currentUser._id.toString();

    // Find all shares where current user is a collaborator
    const shares = await Share.find({
      "collaborators.userId": currentUser._id,
    }).lean();

    const fileIds = [];
    const dirIds = [];
    const shareMap = new Map();

    for (const s of shares) {
      const collab = s.collaborators.find((c) => c.userId.toString() === userIdStr);
      const role = collab?.role || "viewer";
      const key = `${s.resourceType}_${s.resourceId.toString()}`;
      const isPasswordProtected = Boolean(
        s.linkSettings?.isPasswordProtected && s.linkSettings?.passwordHash
      );
      const token = s.linkSettings?.shareToken;
      const resIdStr = s.resourceId?.toString();
      // Password protection is never saved across visits/actions; collaborator must enter password every time
      const isUnlocked = !isPasswordProtected;

      shareMap.set(key, {
        role,
        shareId: s._id.toString(),
        addedAt: collab?.addedAt,
        isPasswordProtected,
        isUnlocked,
        shareToken: token || null,
      });

      if (s.resourceType === "file") {
        fileIds.push(s.resourceId);
      } else if (s.resourceType === "directory") {
        dirIds.push(s.resourceId);
      }
    }

    const [files, directories] = await Promise.all([
      File.find({ _id: { $in: fileIds }, isTrashed: { $ne: true } }).populate("userId", "name email profile").lean(),
      Directory.find({ _id: { $in: dirIds }, isTrashed: { $ne: true } }).populate("userId", "name email profile").lean(),
    ]);

    const formattedFiles = files.map((f) => {
      const meta = shareMap.get(`file_${f._id.toString()}`);
      return {
        id: f._id.toString(),
        name: f.name,
        size: f.size || 0,
        extension: f.extension || "",
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        isDirectory: false,
        type: "file",
        source: f.source || "meghvault",
        role: meta?.role || "viewer",
        sharedAt: meta?.addedAt || f.createdAt,
        isPasswordProtected: Boolean(meta?.isPasswordProtected),
        isUnlocked: Boolean(meta?.isUnlocked),
        shareToken: meta?.shareToken || null,
        owner: {
          id: f.userId?._id?.toString() || "",
          name: f.userId?.name || (f.userId?.email ? f.userId.email.split("@")[0] : "Owner"),
          email: f.userId?.email || "",
          avatar: f.userId?.profile || null,
        },
      };
    });

    const formattedDirs = directories.map((d) => {
      const meta = shareMap.get(`directory_${d._id.toString()}`);
      return {
        id: d._id.toString(),
        name: d.name,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        isDirectory: true,
        type: "directory",
        role: meta?.role || "viewer",
        sharedAt: meta?.addedAt || d.createdAt,
        isPasswordProtected: Boolean(meta?.isPasswordProtected),
        isUnlocked: Boolean(meta?.isUnlocked),
        shareToken: meta?.shareToken || null,
        owner: {
          id: d.userId?._id?.toString() || "",
          name: d.userId?.name || (d.userId?.email ? d.userId.email.split("@")[0] : "Owner"),
          email: d.userId?.email || "",
          avatar: d.userId?.profile || null,
        },
      };
    });

    return res.status(200).json({
      files: formattedFiles,
      directories: formattedDirs,
    });
  } catch (error) {
    console.error("getSharedWithMe error:", error);
    return res.status(500).json({ error: "Failed to retrieve shared items" });
  }
};

/**
 * POST /api/share/:resourceType/:resourceId/import-to-root
 * Allows an Editor (or Owner/Admin) to import a shared file or directory into their personal root folder
 */
export const importAssetToRoot = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const currentUser = req.foundUser;

    // Check authorization: Must have read access
    const auth = await authorizeAccess({
      user: currentUser,
      action: "read",
      resourceType,
      resourceId,
      options: {
        ticket: req.query.ticket || req.headers["x-share-ticket"],
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message || "Access denied",
        requiresPassword: Boolean(auth.requiresPassword),
        shareToken: auth.shareToken || null,
      });
    }

    // Role check: Only Collaborators (Editor/Viewer), Owner, or Admin can import to root
    const canImport =
      auth.role === "collaborator" ||
      auth.role === "viewer" ||
      auth.role === "owner" ||
      auth.role === "admin";

    if (!canImport) {
      return res.status(403).json({
        error: "Permission denied. Only authorized collaborators can import this asset to their root folder.",
      });
    }

    const userRootDirId = currentUser.rootDirId;
    if (!userRootDirId) {
      return res.status(400).json({ error: "User root directory ID is not configured" });
    }

    const storageDir = getStorageDirectory();

    if (resourceType === "file") {
      const sourceFile = auth.resource;
      const ext = sourceFile.extension?.startsWith(".")
        ? sourceFile.extension
        : `.${sourceFile.extension || ""}`;
      const srcPath = path.join(storageDir, `${sourceFile._id}${ext}`);

      if (!fs.existsSync(srcPath)) {
        return res.status(404).json({ error: "Source physical file not found on storage" });
      }

      const newFileId = new mongoose.Types.ObjectId();
      const destPath = path.join(storageDir, `${newFileId}${ext}`);

      await fs.promises.copyFile(srcPath, destPath);

      const importedFile = await File.create({
        _id: newFileId,
        name: sourceFile.name,
        extension: sourceFile.extension || "",
        userId: currentUser._id,
        parentDirId: userRootDirId,
        source: "meghvault",
      });

      logActivity({
        userId: currentUser._id,
        resourceType: "file",
        resourceId: importedFile._id,
        action: "import",
        details: {
          name: importedFile.name,
          extension: importedFile.extension || "",
          source: "meghvault",
        },
      });

      return res.status(200).json({
        message: `"${sourceFile.name}" imported to your root folder successfully`,
        file: {
          id: importedFile._id.toString(),
          name: importedFile.name,
          extension: importedFile.extension,
          isDirectory: false,
          type: "file",
        },
      });
    } else if (resourceType === "directory") {
      const sourceDir = auth.resource;

      // Create new root-level directory for the current user
      const newRootDirId = new mongoose.Types.ObjectId();
      const importedDir = await Directory.create({
        _id: newRootDirId,
        name: sourceDir.name,
        userId: currentUser._id,
        parentDirId: userRootDirId,
      });

      logActivity({
        userId: currentUser._id,
        resourceType: "directory",
        resourceId: importedDir._id,
        action: "import",
        details: {
          name: importedDir.name,
          source: "meghvault",
        },
      });

      // Recursive copy helper
      async function copyFolderRecursive(srcDirId, destParentDirId, userId) {
        // Copy files
        const childFiles = await File.find({ parentDirId: srcDirId }).lean();
        for (const f of childFiles) {
          const ext = f.extension?.startsWith(".") ? f.extension : `.${f.extension || ""}`;
          const srcFilePath = path.join(storageDir, `${f._id}${ext}`);
          const newFId = new mongoose.Types.ObjectId();
          const destFilePath = path.join(storageDir, `${newFId}${ext}`);

          try {
            if (fs.existsSync(srcFilePath)) {
              await fs.promises.copyFile(srcFilePath, destFilePath);
            }
          } catch (copyErr) {
            console.error("Error copying file during directory import:", copyErr);
          }

          await File.create({
            _id: newFId,
            name: f.name,
            extension: f.extension || "",
            userId,
            parentDirId: destParentDirId,
            source: "meghvault",
          });
        }

        // Copy subdirectories
        const childDirs = await Directory.find({ parentDirId: srcDirId }).lean();
        for (const d of childDirs) {
          const newSubDirId = new mongoose.Types.ObjectId();
          await Directory.create({
            _id: newSubDirId,
            name: d.name,
            userId,
            parentDirId: destParentDirId,
          });
          await copyFolderRecursive(d._id, newSubDirId, userId);
        }
      }

      await copyFolderRecursive(sourceDir._id, newRootDirId, currentUser._id);

      return res.status(200).json({
        message: `Folder "${sourceDir.name}" and all its contents imported to your root folder successfully`,
        directory: {
          id: importedDir._id.toString(),
          name: importedDir.name,
          isDirectory: true,
          type: "directory",
        },
      });
    } else {
      return res.status(400).json({ error: "Invalid resource type" });
    }
  } catch (error) {
    console.error("importAssetToRoot error:", error);
    return res.status(500).json({ error: "Failed to import asset into root folder" });
  }
};
