import mongoose from "mongoose";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import Share from "../models/share.model.js";
import Activity from "../models/activity.model.js";
import { authorizeAccess } from "../utils/authorizeAccess.js";
import { getPhysicalFileSize } from "../utils/storagePath.js";
import { buildDirectoryBreadcrumbs } from "../utils/breadcrumb.js";

/**
 * GET /api/details/:resourceType/:id
 * Fetches comprehensive metadata and stats for a file or directory
 */
export const getResourceDetails = async (req, res) => {
  try {
    const { resourceType, id } = req.params;
    const currentUser = req.foundUser;

    if (!resourceType || !id || !["file", "directory"].includes(resourceType)) {
      return res.status(400).json({ error: "Invalid resourceType or id" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid resource ID format" });
    }

    // Check read authorization
    const auth = await authorizeAccess({
      user: currentUser,
      action: "read",
      resourceType,
      resourceId: id,
      options: {
        allowTrashed: true,
        cookies: req.signedCookies,
        ticket: req.query.ticket || req.headers["x-share-ticket"],
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message || "Access denied",
        requiresPassword: Boolean(auth.requiresPassword),
      });
    }

    const resource = auth.resource;
    const isDir = resourceType === "directory";

    // 1. Build canonical breadcrumb path
    const pathTrail = await buildDirectoryBreadcrumbs(resource.parentDirId, currentUser.rootDirId);
    const fullPathString = `${pathTrail.map((p) => p.name).join(" / ")} / ${resource.name}`;

    // 2. Resource-specific metrics
    let size = 0;
    let fileCount = 0;
    let folderCount = 0;

    if (isDir) {
      // Calculate direct child counts
      const [filesInDir, subDirs] = await Promise.all([
        File.find({ parentDirId: resource._id, isTrashed: { $ne: true } })
          .select("_id extension")
          .lean(),
        Directory.find({ parentDirId: resource._id, isTrashed: { $ne: true } })
          .select("_id")
          .lean(),
      ]);

      fileCount = filesInDir.length;
      folderCount = subDirs.length;

      // Sum sizes of direct files
      for (const f of filesInDir) {
        size += getPhysicalFileSize(f._id, f.extension);
      }
    } else {
      size = getPhysicalFileSize(resource._id, resource.extension);
    }

    // 3. Sharing status
    let sharing = {
      isShared: false,
      role: auth.role || "owner",
      collaboratorsCount: 0,
      isPublic: false,
      publicRole: null,
      shareToken: null,
      collaborators: [],
    };

    const shareDoc = await Share.findOne({
      resourceType,
      resourceId: resource._id,
    }).lean();

    if (shareDoc) {
      const activeCollaborators = (shareDoc.collaborators || []).filter(
        (c) => c.status === "accepted" || !c.status
      );
      sharing = {
        isShared: true,
        role: auth.role || "owner",
        collaboratorsCount: activeCollaborators.length,
        collaborators: activeCollaborators.map((c) => ({
          email: c.email,
          role: c.role,
        })),
        isPublic: Boolean(shareDoc.publicLink?.enabled),
        publicRole: shareDoc.publicLink?.role || "viewer",
        shareToken: shareDoc.publicLink?.token || null,
      };
    }

    // 4. Recent activities for this resource
    const activities = await Activity.find({
      resourceId: resource._id,
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    return res.status(200).json({
      id: resource._id.toString(),
      name: resource.name,
      extension: resource.extension || "",
      resourceType,
      isDirectory: isDir,
      size,
      parentDirId: resource.parentDirId ? resource.parentDirId.toString() : null,
      pathTrail,
      fullPath: fullPathString,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      isTrashed: Boolean(resource.isTrashed),
      trashedAt: resource.trashedAt || null,
      isPasswordProtected: Boolean(resource.isPasswordProtected),
      source: resource.source || "meghvault",
      fileCount,
      folderCount,
      sharing,
      recentActivities: activities.map((a) => ({
        id: a._id.toString(),
        action: a.action,
        createdAt: a.createdAt,
        details: a.details,
      })),
    });
  } catch (error) {
    console.error("getResourceDetails error:", error);
    return res.status(500).json({ error: "Failed to load resource details" });
  }
};
