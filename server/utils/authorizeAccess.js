import mongoose from "mongoose";
import crypto from "crypto";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import Share from "../models/share.model.js";

/**
 * Generate a short-lived signed auth ticket for immediate access action (valid for 2 minutes)
 */
export function generateAuthTicket(identifier) {
  const secret = process.env.MY_SECERT_KEY || "meghvault_share_ticket_secret";
  const payload = `${identifier}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Verify a short-lived signed auth ticket (max 2 minutes lifespan)
 */
export function verifyAuthTicket(ticket, expectedIdentifier) {
  if (!ticket || !expectedIdentifier) return false;
  try {
    const secret = process.env.MY_SECERT_KEY || "meghvault_share_ticket_secret";
    const raw = Buffer.from(ticket, "base64url").toString();
    const parts = raw.split(":");
    if (parts.length < 3) return false;
    const [id, timestamp, sig] = parts;
    if (id !== expectedIdentifier.toString()) return false;
    const age = Date.now() - Number(timestamp);
    // Ephemeral ticket: max 2 minutes validity (120,000 ms)
    if (age < 0 || age > 2 * 60 * 1000) return false;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${id}:${timestamp}`)
      .digest("hex");
    return sig === expectedSig;
  } catch {
    return false;
  }
}

/**
 * Traverses up the directory ancestry tree to retrieve all parent directory IDs
 * @param {import("mongoose").Types.ObjectId | string} startParentDirId
 * @returns {Promise<Array<string>>}
 */
export async function getAncestorDirectoryIds(startParentDirId) {
  if (!startParentDirId) return [];

  const ancestors = [];
  let currentId = startParentDirId.toString();
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    ancestors.push(currentId);

    if (!mongoose.Types.ObjectId.isValid(currentId)) {
      break;
    }

    const dir = await Directory.findById(currentId).select("parentDirId").lean();
    if (!dir || !dir.parentDirId) {
      break;
    }
    currentId = dir.parentDirId.toString();
  }

  return ancestors;
}

/**
 * ReBAC / Fine-Grained Authorization Evaluator
 * Evaluates whether a user (or public guest with a share token) is authorized to perform an action.
 *
 * @param {Object} params
 * @param {Object|null} params.user - Authenticated user document (req.foundUser) or null
 * @param {"read"|"write"|"delete"|"share"|"download"} params.action - Action to perform
 * @param {"file"|"directory"} params.resourceType - Type of resource
 * @param {string|import("mongoose").Types.ObjectId} params.resourceId - Resource ID
 * @param {Object} [params.options]
 * @param {string} [params.options.shareToken] - Optional public share token
 * @param {boolean} [params.options.passwordVerified] - Whether password check passed for token
 * @returns {Promise<{ allowed: boolean, status?: number, message?: string, role?: string, resource?: any, share?: any, inheritedFrom?: string, allowDownload?: boolean, requiresPassword?: boolean }>}
 */
export async function authorizeAccess({
  user = null,
  action = "read",
  resourceType,
  resourceId,
  options = {},
}) {
  try {
    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      return {
        allowed: false,
        status: 400,
        message: "Invalid resource ID format",
      };
    }

    // 1. Fetch resource
    let resource = null;
    if (resourceType === "file") {
      resource = await File.findById(resourceId).lean();
    } else if (resourceType === "directory") {
      resource = await Directory.findById(resourceId).lean();
    }

    if (!resource) {
      return {
        allowed: false,
        status: 404,
        message: `${resourceType === "file" ? "File" : "Directory"} not found`,
      };
    }

    // Trashed resources are inaccessible for normal access, previews, downloads, or shares
    if (resource.isTrashed && !options.allowTrashed) {
      return {
        allowed: false,
        status: 404,
        message: `${resourceType === "file" ? "File" : "Directory"} is in trash`,
      };
    }

    // 2. Global Administrator override
    if (user && user.role === "Admin") {
      return {
        allowed: true,
        role: "admin",
        resource,
      };
    }

    // 3. Direct Owner: has unconditional permission for all actions
    const userIdStr = user?._id ? user._id.toString() : null;
    const ownerIdStr = resource.userId ? resource.userId.toString() : null;

    if (userIdStr && ownerIdStr && userIdStr === ownerIdStr) {
      return {
        allowed: true,
        role: "owner",
        resource,
      };
    }

    // Helper to evaluate password verification for a share record (no permanent saved cookies)
    const isSharePasswordSatisfied = (shareRecord) => {
      if (!shareRecord?.linkSettings?.isPasswordProtected || !shareRecord?.linkSettings?.passwordHash) {
        return true;
      }
      if (options.passwordVerified) return true;
      const token = shareRecord.linkSettings?.shareToken;
      const resIdStr = shareRecord.resourceId?.toString();
      const currentResIdStr = resource?._id?.toString();
      const ticketValid =
        (token && verifyAuthTicket(options.ticket, token)) ||
        (resIdStr && verifyAuthTicket(options.ticket, resIdStr)) ||
        (currentResIdStr && verifyAuthTicket(options.ticket, currentResIdStr));
      return Boolean(ticketValid);
    };

    // 4. Direct Collaborators check on the resource itself
    const directShare = await Share.findOne({
      resourceType,
      resourceId: resource._id,
    }).lean();

    if (directShare && userIdStr) {
      const directCollab = directShare.collaborators?.find(
        (c) => c.userId?.toString() === userIdStr
      );

      if (directCollab) {
        if (!isSharePasswordSatisfied(directShare)) {
          return {
            allowed: false,
            status: 401,
            requiresPassword: true,
            shareToken: directShare.linkSettings?.shareToken,
            shareId: directShare._id.toString(),
            resourceType,
            resourceId: resource._id.toString(),
            message: "Password verification required for this protected item",
            share: directShare,
            resource,
          };
        }

        if (directCollab.role === "collaborator") {
          // Collaborator can read, write, download. Cannot delete or change sharing.
          if (["read", "write", "download"].includes(action)) {
            return {
              allowed: true,
              role: "collaborator",
              resource,
              share: directShare,
            };
          }
        } else if (directCollab.role === "viewer") {
          // Viewer can read, download. Cannot write or delete.
          if (["read", "download"].includes(action)) {
            return {
              allowed: true,
              role: "viewer",
              resource,
              share: directShare,
            };
          }
        }
      }
    }

    // 5. Hierarchical Ancestor Directory Inheritance (Zanzibar Graph Walk)
    const parentId = resource.parentDirId;
    if (parentId && userIdStr) {
      const ancestorIds = await getAncestorDirectoryIds(parentId);

      if (ancestorIds.length > 0) {
        // Find any share records where user is listed in parent directories
        const ancestorShares = await Share.find({
          resourceType: "directory",
          resourceId: { $in: ancestorIds },
          "collaborators.userId": user._id,
        }).lean();

        if (ancestorShares.length > 0) {
          // Take closest ancestor share
          for (const ancestorId of ancestorIds) {
            const foundShare = ancestorShares.find(
              (s) => s.resourceId.toString() === ancestorId
            );
            if (foundShare) {
              const collab = foundShare.collaborators.find(
                (c) => c.userId?.toString() === userIdStr
              );

              if (collab) {
                if (!isSharePasswordSatisfied(foundShare)) {
                  return {
                    allowed: false,
                    status: 401,
                    requiresPassword: true,
                    shareToken: foundShare.linkSettings?.shareToken,
                    shareId: foundShare._id.toString(),
                    inheritedFrom: ancestorId,
                    message: "Password verification required for this protected folder",
                    share: foundShare,
                    resource,
                  };
                }

                if (collab.role === "collaborator" && ["read", "write", "download"].includes(action)) {
                  return {
                    allowed: true,
                    role: "collaborator",
                    resource,
                    share: foundShare,
                    inheritedFrom: ancestorId,
                  };
                }
                if (collab.role === "viewer" && ["read", "download"].includes(action)) {
                  return {
                    allowed: true,
                    role: "viewer",
                    resource,
                    share: foundShare,
                    inheritedFrom: ancestorId,
                  };
                }
              }
            }
          }
        }
      }
    }

    // 6. Public Link Access Check (via Share Token)
    let tokenShare = null;
    if (options.shareToken) {
      tokenShare = await Share.findOne({
        "linkSettings.shareToken": options.shareToken,
      }).lean();
    } else if (directShare?.linkSettings?.isEnabled) {
      tokenShare = directShare;
    }

    if (tokenShare && tokenShare.linkSettings?.isEnabled) {
      const { visibility, expiresAt, allowDownload, isPasswordProtected } = tokenShare.linkSettings;

      // Check Expiration
      if (expiresAt && new Date() > new Date(expiresAt)) {
        return {
          allowed: false,
          status: 410,
          message: "This share link has expired",
        };
      }

      // Check Password Protection
      if (!isSharePasswordSatisfied(tokenShare)) {
        return {
          allowed: false,
          status: 401,
          requiresPassword: true,
          shareToken: tokenShare.linkSettings?.shareToken,
          message: "Password verification required for this link",
          share: tokenShare,
          resource,
        };
      }

      // Check Visibility
      if (visibility === "restricted") {
        // In restricted mode, only added collaborators or owner can use link
        if (!userIdStr) {
          return {
            allowed: false,
            status: 401,
            message: "This link is restricted. Please sign in to access.",
          };
        }
        const isCollab = tokenShare.collaborators?.some(
          (c) => c.userId?.toString() === userIdStr
        );
        const isOwner = tokenShare.ownerId?.toString() === userIdStr;

        if (!isCollab && !isOwner) {
          return {
            allowed: false,
            status: 403,
            message: "Access restricted: you have not been granted collaborator access.",
          };
        }
      }

      // Action rules for public link
      if (action === "read") {
        return {
          allowed: true,
          role: "public_link",
          resource,
          share: tokenShare,
          allowDownload,
        };
      }

      if (action === "download") {
        if (!allowDownload) {
          return {
            allowed: false,
            status: 403,
            message: "File downloads are disabled for this link by the owner",
          };
        }
        return {
          allowed: true,
          role: "public_link",
          resource,
          share: tokenShare,
          allowDownload: true,
        };
      }

      // Write, delete, and share management are prohibited via public links
      return {
        allowed: false,
        status: 403,
        message: "Action not permitted via share link",
      };
    }

    // 7. Fallback: Access Denied
    return {
      allowed: false,
      status: 403,
      message: "Access denied: you do not have permission for this resource",
    };
  } catch (error) {
    console.error("Authorization check error:", error);
    return {
      allowed: false,
      status: 500,
      message: "Authorization evaluation error",
    };
  }
}
