import mongoose from "mongoose";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import Share from "../models/share.model.js";
import Starred from "../models/starred.model.js";
import { authorizeAccess } from "../utils/authorizeAccess.js";
import { deletePhysicalFile, getPhysicalFileSize } from "../utils/storagePath.js";
import { deleteDirectoryRecursively } from "../utils/deleteDirectoryRecursively.js";
import { logActivity } from "../utils/logActivity.js";

/**
 * POST /api/trash/:resourceType/:id
 * Moves a file or directory to the trash (Soft Delete)
 */
export const moveToTrash = async (req, res) => {
  try {
    const resourceType = req.params.resourceType || req.body.resourceType;
    const resourceId = req.params.id || req.body.resourceId;
    const currentUser = req.foundUser;

    if (!resourceType || !resourceId || !["file", "directory"].includes(resourceType)) {
      return res.status(400).json({ error: "Invalid resourceType ('file' | 'directory') or resourceId" });
    }

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ error: "Invalid resource ID format" });
    }

    // Require write/delete permission (owner or authorized editor)
    const auth = await authorizeAccess({
      user: currentUser,
      action: "delete",
      resourceType,
      resourceId,
      options: { allowTrashed: false },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message || "Permission denied" });
    }

    const resource = auth.resource;
    const now = new Date();

    if (resourceType === "file") {
      if (resource.isTrashed) {
        return res.status(400).json({ error: "File is already in trash" });
      }

      await File.updateOne(
        { _id: resource._id },
        {
          $set: {
            isTrashed: true,
            trashedAt: now,
            trashedDirectly: true,
            originalParentDirId: resource.parentDirId,
          },
        }
      );

      logActivity({
        userId: currentUser._id,
        resourceType: "file",
        resourceId: resource._id,
        action: "trash",
        details: {
          name: resource.name,
          extension: resource.extension,
          size: resource.size,
          source: resource.source || "meghvault",
        },
      });

      return res.status(200).json({
        message: `"${resource.name}" moved to trash`,
        id: resource._id.toString(),
      });
    }

    // Directory
    if (!resource.parentDirId) {
      return res.status(400).json({ error: "Root directory cannot be moved to trash" });
    }

    if (resource.isTrashed) {
      return res.status(400).json({ error: "Folder is already in trash" });
    }

    // 1. Traverse all descendant directories using a breadth-first queue
    const allDescendantDirIds = [];
    const queue = [resource._id];

    while (queue.length > 0) {
      const currentDirId = queue.shift();
      const subDirs = await Directory.find({ parentDirId: currentDirId }).select("_id").lean();
      for (const sub of subDirs) {
        allDescendantDirIds.push(sub._id);
        queue.push(sub._id);
      }
    }

    // 2. Mark top-level directory as directly trashed
    await Directory.updateOne(
      { _id: resource._id },
      {
        $set: {
          isTrashed: true,
          trashedAt: now,
          trashedDirectly: true,
          originalParentDirId: resource.parentDirId,
        },
      }
    );

    // 3. Mark descendant directories as indirectly trashed (only if not already trashed)
    if (allDescendantDirIds.length > 0) {
      await Directory.updateMany(
        {
          _id: { $in: allDescendantDirIds },
          isTrashed: { $ne: true },
        },
        {
          $set: {
            isTrashed: true,
            trashedAt: now,
            trashedDirectly: false,
          },
        }
      );
    }

    // 4. Mark all descendant files as indirectly trashed (only if not already trashed)
    const allFolderIds = [resource._id, ...allDescendantDirIds];
    await File.updateMany(
      {
        parentDirId: { $in: allFolderIds },
        isTrashed: { $ne: true },
      },
      {
        $set: {
          isTrashed: true,
          trashedAt: now,
          trashedDirectly: false,
        },
      }
    );

    logActivity({
      userId: currentUser._id,
      resourceType: "directory",
      resourceId: resource._id,
      action: "trash",
      details: {
        name: resource.name,
        source: resource.source || "meghvault",
      },
    });

    return res.status(200).json({
      message: `Folder "${resource.name}" moved to trash`,
      id: resource._id.toString(),
    });
  } catch (error) {
    console.error("moveToTrash error:", error);
    return res.status(500).json({ error: "Failed to move item to trash" });
  }
};

/**
 * GET /api/trash
 * Retrieves all directly trashed files and folders for the current user
 */
export const getTrash = async (req, res) => {
  try {
    const userId = req.foundUser._id;

    const [files, directories] = await Promise.all([
      File.find({
        userId,
        isTrashed: true,
        trashedDirectly: true,
      })
        .sort({ trashedAt: -1 })
        .lean(),
      Directory.find({
        userId,
        isTrashed: true,
        trashedDirectly: true,
      })
        .sort({ trashedAt: -1 })
        .lean(),
    ]);

    const formattedFiles = files.map((f) => ({
      id: f._id.toString(),
      name: f.name,
      size: getPhysicalFileSize(f._id, f.extension),
      extension: f.extension || "",
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      trashedAt: f.trashedAt,
      isDirectory: false,
      type: "file",
      source: f.source || "meghvault",
      isTrashed: true,
    }));

    const formattedDirs = directories.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      trashedAt: d.trashedAt,
      isDirectory: true,
      type: "directory",
      isTrashed: true,
    }));

    return res.status(200).json({
      files: formattedFiles,
      directories: formattedDirs,
    });
  } catch (error) {
    console.error("getTrash error:", error);
    return res.status(500).json({ error: "Failed to load trash" });
  }
};

/**
 * POST /api/trash/:resourceType/:id/restore
 * Restores a trashed file or folder back to its parent directory (or fallback root)
 */
export const restoreFromTrash = async (req, res) => {
  try {
    const { resourceType, id } = req.params;
    const currentUser = req.foundUser;

    if (!resourceType || !id || !["file", "directory"].includes(resourceType)) {
      return res.status(400).json({ error: "Invalid resourceType or id" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid resource ID format" });
    }

    const auth = await authorizeAccess({
      user: currentUser,
      action: "delete",
      resourceType,
      resourceId: id,
      options: { allowTrashed: true },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message || "Permission denied" });
    }

    const resource = auth.resource;
    if (!resource.isTrashed) {
      return res.status(400).json({ error: "Item is not in trash" });
    }

    // Determine target parent directory: check if original parent is alive and not trashed
    let restoreDirId = resource.originalParentDirId;
    let isParentValid = false;
    if (restoreDirId && mongoose.Types.ObjectId.isValid(restoreDirId)) {
      const parentDir = await Directory.findOne({
        _id: restoreDirId,
        isTrashed: { $ne: true },
      }).lean();
      if (parentDir) {
        isParentValid = true;
      }
    }

    // If original parent was deleted or is also trashed, attach restored item to User's Root Directory
    if (!isParentValid) {
      restoreDirId = currentUser.rootDirId;
    }

    if (resourceType === "file") {
      await File.updateOne(
        { _id: resource._id },
        {
          $set: {
            isTrashed: false,
            trashedAt: null,
            trashedDirectly: false,
            originalParentDirId: null,
            parentDirId: restoreDirId,
          },
        }
      );

      logActivity({
        userId: currentUser._id,
        resourceType: "file",
        resourceId: resource._id,
        action: "restore",
        details: {
          name: resource.name,
          extension: resource.extension,
        },
      });

      return res.status(200).json({
        message: `"${resource.name}" restored successfully`,
        id: resource._id.toString(),
      });
    }

    // Restore Directory
    await Directory.updateOne(
      { _id: resource._id },
      {
        $set: {
          isTrashed: false,
          trashedAt: null,
          trashedDirectly: false,
          originalParentDirId: null,
          parentDirId: restoreDirId,
        },
      }
    );

    // Restore descendant directories that were trashed indirectly (trashedDirectly === false)
    const descendantDirIds = [];
    const queue = [resource._id];

    while (queue.length > 0) {
      const currentDirId = queue.shift();
      const subDirs = await Directory.find({
        parentDirId: currentDirId,
        isTrashed: true,
        trashedDirectly: false,
      }).select("_id").lean();

      for (const sub of subDirs) {
        descendantDirIds.push(sub._id);
        queue.push(sub._id);
      }
    }

    if (descendantDirIds.length > 0) {
      await Directory.updateMany(
        { _id: { $in: descendantDirIds } },
        {
          $set: {
            isTrashed: false,
            trashedAt: null,
            trashedDirectly: false,
            originalParentDirId: null,
          },
        }
      );
    }

    // Restore descendant files that were trashed indirectly (trashedDirectly === false)
    const allRestoredDirIds = [resource._id, ...descendantDirIds];
    await File.updateMany(
      {
        parentDirId: { $in: allRestoredDirIds },
        isTrashed: true,
        trashedDirectly: false,
      },
      {
        $set: {
          isTrashed: false,
          trashedAt: null,
          trashedDirectly: false,
          originalParentDirId: null,
        },
      }
    );

    logActivity({
      userId: currentUser._id,
      resourceType: "directory",
      resourceId: resource._id,
      action: "restore",
      details: {
        name: resource.name,
      },
    });

    return res.status(200).json({
      message: `Folder "${resource.name}" and its contents restored successfully`,
      id: resource._id.toString(),
    });
  } catch (error) {
    console.error("restoreFromTrash error:", error);
    return res.status(500).json({ error: "Failed to restore item from trash" });
  }
};

/**
 * DELETE /api/trash/:resourceType/:id
 * Permanently deletes a single file or directory and purges disk storage
 */
export const permanentlyDelete = async (req, res) => {
  try {
    const { resourceType, id } = req.params;
    const currentUser = req.foundUser;

    if (!resourceType || !id || !["file", "directory"].includes(resourceType)) {
      return res.status(400).json({ error: "Invalid resourceType or id" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid resource ID format" });
    }

    const auth = await authorizeAccess({
      user: currentUser,
      action: "delete",
      resourceType,
      resourceId: id,
      options: { allowTrashed: true },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ error: auth.message || "Permission denied" });
    }

    const resource = auth.resource;

    if (resourceType === "file") {
      // 1. Purge physical file on disk
      await deletePhysicalFile(resource._id, resource.extension);

      // 2. Delete file document
      await File.deleteOne({ _id: resource._id });

      // 3. Delete share and starred records
      await Promise.allSettled([
        Starred.deleteMany({ resourceType: "file", resourceId: resource._id }),
        Share.deleteMany({ resourceType: "file", resourceId: resource._id }),
      ]);

      return res.status(200).json({
        message: `File "${resource.name}" permanently deleted`,
      });
    }

    // Directory permanent delete
    if (!resource.parentDirId) {
      return res.status(400).json({ error: "Root directory cannot be deleted" });
    }

    await deleteDirectoryRecursively(resource._id);

    return res.status(200).json({
      message: `Folder "${resource.name}" and all contents permanently deleted`,
    });
  } catch (error) {
    console.error("permanentlyDelete error:", error);
    return res.status(500).json({ error: "Failed to permanently delete item" });
  }
};

/**
 * DELETE /api/trash/empty
 * Permanently purges all trashed files, directories, and disk files for the current user
 */
export const emptyTrash = async (req, res) => {
  try {
    const userId = req.foundUser._id;

    // 1. Find all trashed files for this user
    const trashedFiles = await File.find({
      userId,
      isTrashed: true,
    }).select("_id extension").lean();

    // 2. Delete all physical files from disk in parallel
    await Promise.allSettled(
      trashedFiles.map((f) => deletePhysicalFile(f._id, f.extension))
    );

    const fileIds = trashedFiles.map((f) => f._id);

    // 3. Bulk delete all file documents from DB
    await File.deleteMany({ userId, isTrashed: true });

    // 4. Find all trashed directories for this user
    const trashedDirs = await Directory.find({
      userId,
      isTrashed: true,
    }).select("_id").lean();

    const dirIds = trashedDirs.map((d) => d._id);

    // 5. Bulk delete all directory documents from DB
    await Directory.deleteMany({ userId, isTrashed: true });

    // 6. Bulk delete any remaining Starred and Share records for trashed items
    await Promise.allSettled([
      Starred.deleteMany({
        $or: [
          { resourceType: "file", resourceId: { $in: fileIds } },
          { resourceType: "directory", resourceId: { $in: dirIds } },
        ],
      }),
      Share.deleteMany({
        $or: [
          { resourceType: "file", resourceId: { $in: fileIds } },
          { resourceType: "directory", resourceId: { $in: dirIds } },
        ],
      }),
    ]);

    return res.status(200).json({
      message: "Trash emptied successfully",
      deletedFilesCount: fileIds.length,
      deletedFoldersCount: dirIds.length,
    });
  } catch (error) {
    console.error("emptyTrash error:", error);
    return res.status(500).json({ error: "Failed to empty trash" });
  }
};
