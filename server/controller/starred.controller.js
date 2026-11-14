import mongoose from "mongoose";
import Starred from "../models/starred.model.js";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { authorizeAccess } from "../utils/authorizeAccess.js";
import { getPhysicalFileSize } from "../utils/storagePath.js";
import { logActivity } from "../utils/logActivity.js";

/**
 * POST /api/starred/toggle
 * Toggles starred status of a file or directory for the authenticated user
 */
export const toggleStar = async (req, res) => {
  try {
    const userId = req.foundUser._id;
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId || !["file", "directory"].includes(resourceType)) {
      return res.status(400).json({
        error: "Valid resourceType ('file' | 'directory') and resourceId are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ error: "Invalid resource ID format" });
    }

    // Check authorization: User must have read access to star the item
    const auth = await authorizeAccess({
      user: req.foundUser,
      action: "read",
      resourceType,
      resourceId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message || "Permission denied" });
    }

    const existing = await Starred.findOne({ userId, resourceId });
    if (existing) {
      await Starred.deleteOne({ _id: existing._id });
      return res.status(200).json({
        isStarred: false,
        resourceId,
        message: "Removed from Starred",
      });
    } else {
      await Starred.create({
        userId,
        resourceType,
        resourceId,
      });

      logActivity({
        userId,
        resourceType,
        resourceId,
        action: "star",
        details: {
          name: auth.resource?.name,
          extension: auth.resource?.extension,
          source: auth.resource?.source,
        },
      });

      return res.status(200).json({
        isStarred: true,
        resourceId,
        message: "Added to Starred",
      });
    }
  } catch (error) {
    console.error("toggleStar error:", error);
    return res.status(500).json({ error: "Failed to toggle star status" });
  }
};

/**
 * GET /api/starred
 * Retrieves all starred files and directories for the authenticated user
 */
export const getStarredItems = async (req, res) => {
  try {
    const userId = req.foundUser._id;
    const starredRecords = await Starred.find({ userId }).sort({ createdAt: -1 }).lean();

    const fileIds = [];
    const dirIds = [];
    const starredMap = new Map();

    for (const record of starredRecords) {
      const idStr = record.resourceId.toString();
      starredMap.set(`${record.resourceType}_${idStr}`, record);
      if (record.resourceType === "file") {
        fileIds.push(record.resourceId);
      } else if (record.resourceType === "directory") {
        dirIds.push(record.resourceId);
      }
    }

    const [files, directories] = await Promise.all([
      File.find({ _id: { $in: fileIds }, isTrashed: { $ne: true } })
        .populate("userId", "name email profile")
        .lean(),
      Directory.find({ _id: { $in: dirIds }, isTrashed: { $ne: true } })
        .populate("userId", "name email profile")
        .lean(),
    ]);

    // Check all existing documents (even if trashed) to only cleanup truly deleted orphaned records
    const [allExistingFiles, allExistingDirs] = await Promise.all([
      File.find({ _id: { $in: fileIds } }).select("_id").lean(),
      Directory.find({ _id: { $in: dirIds } }).select("_id").lean(),
    ]);

    const foundFileIdSet = new Set(allExistingFiles.map((f) => f._id.toString()));
    const foundDirIdSet = new Set(allExistingDirs.map((d) => d._id.toString()));

    const orphanedIds = [];
    for (const record of starredRecords) {
      const idStr = record.resourceId.toString();
      if (record.resourceType === "file" && !foundFileIdSet.has(idStr)) {
        orphanedIds.push(record._id);
      } else if (record.resourceType === "directory" && !foundDirIdSet.has(idStr)) {
        orphanedIds.push(record._id);
      }
    }

    if (orphanedIds.length > 0) {
      Starred.deleteMany({ _id: { $in: orphanedIds } }).catch(() => {});
    }

    const formattedFiles = files.map((f) => {
      const meta = starredMap.get(`file_${f._id.toString()}`);
      return {
        id: f._id.toString(),
        name: f.name,
        size: getPhysicalFileSize(f._id, f.extension),
        extension: f.extension || "",
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        isDirectory: false,
        type: "file",
        source: f.source || "meghvault",
        isStarred: true,
        starredAt: meta?.createdAt || f.createdAt,
        owner: {
          id: f.userId?._id?.toString() || "",
          name: f.userId?.name || (f.userId?.email ? f.userId.email.split("@")[0] : "Owner"),
          email: f.userId?.email || "",
          avatar: f.userId?.profile || null,
        },
      };
    });

    const formattedDirs = directories.map((d) => {
      const meta = starredMap.get(`directory_${d._id.toString()}`);
      return {
        id: d._id.toString(),
        name: d.name,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        isDirectory: true,
        type: "directory",
        source: d.source || "meghvault",
        isStarred: true,
        starredAt: meta?.createdAt || d.createdAt,
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
    console.error("getStarredItems error:", error);
    return res.status(500).json({ error: "Failed to retrieve starred items" });
  }
};

/**
 * GET /api/starred/ids
 * Returns all starred item IDs for the authenticated user for instant UI sync
 */
export const getStarredIds = async (req, res) => {
  try {
    const userId = req.foundUser._id;
    const starred = await Starred.find({ userId }).select("resourceId").lean();
    const starredIds = starred.map((s) => s.resourceId.toString());
    return res.status(200).json({ starredIds });
  } catch (error) {
    console.error("getStarredIds error:", error);
    return res.status(500).json({ error: "Failed to fetch starred item IDs" });
  }
};
