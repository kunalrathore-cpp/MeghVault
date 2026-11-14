import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import * as archiverModule from "archiver";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { authorizeAccess, getAncestorDirectoryIds } from "../utils/authorizeAccess.js";
import { logActivity } from "../utils/logActivity.js";
import { formatDocument } from "../utils/formatDocumentId.js";
import { getPhysicalFilePath } from "../utils/storagePath.js";

/**
 * Generates an auto-incremented non-conflicting filename e.g. "Report (1)"
 */
async function generateUniqueFileName(parentDirId, baseName, extension) {
  let candidateName = baseName;
  let counter = 1;
  const ext = extension || "";

  while (
    await File.findOne({
      parentDirId,
      name: candidateName,
      extension: ext,
      isTrashed: { $ne: true },
    }).lean()
  ) {
    candidateName = `${baseName} (${counter})`;
    counter++;
  }

  return candidateName;
}

/**
 * Generates an auto-incremented non-conflicting directory name e.g. "Projects (1)"
 */
async function generateUniqueDirName(parentDirId, baseName) {
  let candidateName = baseName;
  let counter = 1;

  while (
    await Directory.findOne({
      parentDirId,
      name: candidateName,
      isTrashed: { $ne: true },
    }).lean()
  ) {
    candidateName = `${baseName} (${counter})`;
    counter++;
  }

  return candidateName;
}

/**
 * Unified Controller: Move a file or directory to a target directory
 * PATCH /api/items/move
 * Body: { itemType: "file" | "directory", itemId, targetDirId, conflictResolution?: "rename" | "conflict" }
 */
export async function moveItem(req, res) {
  const foundUser = req.foundUser;
  const { itemType, itemId, targetDirId, conflictResolution = "conflict" } = req.body;

  try {
    if (!itemType || !["file", "directory"].includes(itemType)) {
      return res.status(400).json({ error: "itemType must be 'file' or 'directory'" });
    }

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: "Invalid item ID format" });
    }

    // 1. Resolve Target Directory (null, undefined, "root", or rootDirId -> user's root directory)
    const isTargetRoot =
      !targetDirId ||
      targetDirId === "root" ||
      targetDirId.toString() === foundUser.rootDirId.toString();

    let resolvedTargetDirId = foundUser.rootDirId;
    let targetFolderName = "My Drive";

    if (!isTargetRoot) {
      if (!mongoose.Types.ObjectId.isValid(targetDirId)) {
        return res.status(400).json({ error: "Invalid destination folder ID" });
      }

      const targetDir = await Directory.findById(targetDirId).lean();
      if (!targetDir) {
        return res.status(404).json({ error: "Destination folder not found" });
      }

      if (targetDir.isTrashed) {
        return res.status(400).json({ error: "Cannot move item into a folder that is in trash" });
      }

      // Check user edit permissions on target folder
      const targetAuth = await authorizeAccess({
        user: foundUser,
        action: "write",
        resourceType: "directory",
        resourceId: targetDirId,
      });

      if (!targetAuth.allowed) {
        return res.status(targetAuth.status || 403).json({
          error: targetAuth.message || "You do not have permission to add items to the destination folder",
        });
      }

      resolvedTargetDirId = targetDir._id;
      targetFolderName = targetDir.name;
    }

    // 2. Handle File Move
    if (itemType === "file") {
      const fileAuth = await authorizeAccess({
        user: foundUser,
        action: "write",
        resourceType: "file",
        resourceId: itemId,
      });

      if (!fileAuth.allowed) {
        return res.status(fileAuth.status || 403).json({
          error: fileAuth.message || "Permission denied or file not found",
        });
      }

      const file = fileAuth.resource;
      if (file.isTrashed) {
        return res.status(400).json({ error: "Cannot move a file that is currently in trash" });
      }

      const currentParentId = file.parentDirId?.toString();
      if (currentParentId === resolvedTargetDirId.toString()) {
        return res.status(400).json({ error: "File is already in the selected destination folder" });
      }

      // Name collision check in target folder
      let finalName = file.name;
      const existingConflict = await File.findOne({
        parentDirId: resolvedTargetDirId,
        name: file.name,
        extension: file.extension || "",
        isTrashed: { $ne: true },
        _id: { $ne: file._id },
      }).lean();

      if (existingConflict) {
        if (conflictResolution === "rename") {
          finalName = await generateUniqueFileName(resolvedTargetDirId, file.name, file.extension);
        } else {
          const fullName = `${file.name}${file.extension ? `.${file.extension}` : ""}`;
          return res.status(409).json({
            error: `A file named "${fullName}" already exists in the destination folder`,
            hasConflict: true,
            existingName: fullName,
          });
        }
      }

      // Resolve source folder name for audit logging
      let sourceParentName = "My Drive";
      if (currentParentId && currentParentId !== foundUser.rootDirId.toString()) {
        const sourceDir = await Directory.findById(currentParentId).select("name").lean();
        sourceParentName = sourceDir?.name || "Folder";
      }

      // Fast Atomic Pointer Update (Zero disk copy!)
      await File.updateOne(
        { _id: file._id },
        {
          parentDirId: resolvedTargetDirId,
          ...(finalName !== file.name ? { name: finalName } : {}),
        }
      );

      // Log Activity Event
      logActivity({
        userId: foundUser._id,
        resourceType: "file",
        resourceId: file._id,
        action: "move",
        details: {
          name: finalName,
          extension: file.extension,
          fromDirectoryName: sourceParentName,
          toDirectoryName: targetFolderName,
          source: file.source,
        },
      });

      const updatedFile = await File.findById(file._id).lean();
      return res.status(200).json({
        success: true,
        message: `Moved "${file.name}" to "${targetFolderName}"`,
        item: formatDocument(updatedFile),
        fromDirectoryName: sourceParentName,
        toDirectoryName: targetFolderName,
      });
    }

    // 3. Handle Directory Move
    if (itemType === "directory") {
      const dirAuth = await authorizeAccess({
        user: foundUser,
        action: "write",
        resourceType: "directory",
        resourceId: itemId,
      });

      if (!dirAuth.allowed) {
        return res.status(dirAuth.status || 403).json({
          error: dirAuth.message || "Permission denied or folder not found",
        });
      }

      const dir = dirAuth.resource;

      if (dir._id.toString() === foundUser.rootDirId.toString()) {
        return res.status(400).json({ error: "Cannot move your root My Drive folder" });
      }

      if (dir.isTrashed) {
        return res.status(400).json({ error: "Cannot move a folder that is currently in trash" });
      }

      const currentParentId = dir.parentDirId?.toString();
      if (currentParentId === resolvedTargetDirId.toString()) {
        return res.status(400).json({ error: "Folder is already in the selected destination folder" });
      }

      // CRITICAL CYCLE CHECK 1: Cannot move into self
      if (dir._id.toString() === resolvedTargetDirId.toString()) {
        return res.status(400).json({ error: "Cannot move a folder into itself" });
      }

      // CRITICAL CYCLE CHECK 2: Cannot move into any descendant subfolder
      const targetAncestors = await getAncestorDirectoryIds(resolvedTargetDirId);
      if (targetAncestors.includes(dir._id.toString())) {
        return res.status(400).json({
          error: "Cannot move a folder into one of its own subfolders (circular reference)",
        });
      }

      // Name collision check in target folder
      let finalName = dir.name;
      const existingConflict = await Directory.findOne({
        parentDirId: resolvedTargetDirId,
        name: dir.name,
        isTrashed: { $ne: true },
        _id: { $ne: dir._id },
      }).lean();

      if (existingConflict) {
        if (conflictResolution === "rename") {
          finalName = await generateUniqueDirName(resolvedTargetDirId, dir.name);
        } else {
          return res.status(409).json({
            error: `A folder named "${dir.name}" already exists in the destination folder`,
            hasConflict: true,
            existingName: dir.name,
          });
        }
      }

      // Resolve source folder name for audit logging
      let sourceParentName = "My Drive";
      if (currentParentId && currentParentId !== foundUser.rootDirId.toString()) {
        const sourceDir = await Directory.findById(currentParentId).select("name").lean();
        sourceParentName = sourceDir?.name || "Folder";
      }

      // Fast Atomic Pointer Update (Zero disk copy!)
      await Directory.updateOne(
        { _id: dir._id },
        {
          parentDirId: resolvedTargetDirId,
          ...(finalName !== dir.name ? { name: finalName } : {}),
        }
      );

      // Log Activity Event
      logActivity({
        userId: foundUser._id,
        resourceType: "directory",
        resourceId: dir._id,
        action: "move",
        details: {
          name: finalName,
          fromDirectoryName: sourceParentName,
          toDirectoryName: targetFolderName,
          source: dir.source,
        },
      });

      const updatedDir = await Directory.findById(dir._id).lean();
      return res.status(200).json({
        success: true,
        message: `Moved "${dir.name}" to "${targetFolderName}"`,
        item: formatDocument(updatedDir),
        fromDirectoryName: sourceParentName,
        toDirectoryName: targetFolderName,
      });
    }
  } catch (error) {
    console.error("Error moving item:", error);
    return res.status(500).json({ error: "Internal server error moving item" });
  }
}

/**
 * Controller: Get full hierarchy tree of user's active folders for the Move picker
 * GET /api/directory/tree?excludeDirId=...
 */
export async function getFolderTree(req, res) {
  const foundUser = req.foundUser;
  const { excludeDirId, excludeDirIds } = req.query;

  try {
    // 1. Fetch all active non-trashed directories owned by user
    const dirs = await Directory.find({
      userId: foundUser._id,
      isTrashed: { $ne: true },
      _id: { $ne: foundUser.rootDirId },
    })
      .select("_id name parentDirId isPasswordProtected source updatedAt")
      .sort({ name: 1 })
      .lean();

    // 2. Identify all excluded directories and recursively exclude their descendants
    const excludedIds = new Set();
    const candidateExcludes = [];
    if (excludeDirId) {
      excludeDirId.toString().split(",").forEach((id) => candidateExcludes.push(id.trim()));
    }
    if (excludeDirIds) {
      excludeDirIds.toString().split(",").forEach((id) => candidateExcludes.push(id.trim()));
    }

    for (const cand of candidateExcludes) {
      if (mongoose.Types.ObjectId.isValid(cand)) {
        excludedIds.add(cand.toString());
      }
    }

    if (excludedIds.size > 0) {
      let addedMore = true;
      while (addedMore) {
        addedMore = false;
        for (const d of dirs) {
          const dId = d._id.toString();
          const pId = d.parentDirId?.toString();
          if (pId && excludedIds.has(pId) && !excludedIds.has(dId)) {
            excludedIds.add(dId);
            addedMore = true;
          }
        }
      }
    }

    // 3. Filter out excluded descendants
    const filteredDirs = dirs
      .filter((d) => !excludedIds.has(d._id.toString()))
      .map((d) => ({
        id: d._id.toString(),
        name: d.name,
        parentDirId:
          !d.parentDirId || d.parentDirId.toString() === foundUser.rootDirId.toString()
            ? null
            : d.parentDirId.toString(),
        isPasswordProtected: Boolean(d.isPasswordProtected),
        source: d.source || "meghvault",
      }));

    return res.status(200).json({
      root: {
        id: null,
        name: "My Drive",
        isRoot: true,
      },
      folders: filteredDirs,
    });
  } catch (error) {
    console.error("Error fetching folder tree:", error);
    return res.status(500).json({ error: "Failed to load destination folder hierarchy" });
  }
}

/**
 * Direct file route adapter: PATCH /api/file/:id/move
 */
export async function moveFileRoute(req, res) {
  req.body.itemType = "file";
  req.body.itemId = req.params.id;
  return moveItem(req, res);
}

/**
 * Direct directory route adapter: PATCH /api/directory/:id/move
 */
export async function moveDirectoryRoute(req, res) {
  req.body.itemType = "directory";
  req.body.itemId = req.params.id;
  return moveItem(req, res);
}

/**
 * Controller: Move multiple items (files and directories) to a target directory in bulk
 * POST /api/items/bulk-move
 * Body: { items: [{ itemType: "file" | "directory", itemId }], targetDirId, conflictResolution?: "rename" | "conflict" }
 */
export async function bulkMoveItems(req, res) {
  const foundUser = req.foundUser;
  const { items, targetDirId, conflictResolution = "rename" } = req.body;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array cannot be empty" });
    }

    if (items.length > 200) {
      return res.status(400).json({ error: "Cannot move more than 200 items at once" });
    }

    // 1. Resolve Target Directory
    const isTargetRoot =
      !targetDirId ||
      targetDirId === "root" ||
      targetDirId.toString() === foundUser.rootDirId.toString();

    let resolvedTargetDirId = foundUser.rootDirId;
    let targetFolderName = "My Drive";

    if (!isTargetRoot) {
      if (!mongoose.Types.ObjectId.isValid(targetDirId)) {
        return res.status(400).json({ error: "Invalid destination folder ID" });
      }

      const targetDir = await Directory.findById(targetDirId).lean();
      if (!targetDir) {
        return res.status(404).json({ error: "Destination folder not found" });
      }

      if (targetDir.isTrashed) {
        return res.status(400).json({ error: "Cannot move items into a folder that is in trash" });
      }

      const targetAuth = await authorizeAccess({
        user: foundUser,
        action: "write",
        resourceType: "directory",
        resourceId: targetDirId,
      });

      if (!targetAuth.allowed) {
        return res.status(targetAuth.status || 403).json({
          error: targetAuth.message || "You do not have permission to add items to the destination folder",
        });
      }

      resolvedTargetDirId = targetDir._id;
      targetFolderName = targetDir.name;
    }

    // 2. Pre-flight Cycle Checks for all directories being moved
    const targetAncestors = await getAncestorDirectoryIds(resolvedTargetDirId);
    for (const item of items) {
      if (item.itemType === "directory") {
        const dId = item.itemId?.toString();
        if (dId === resolvedTargetDirId.toString()) {
          return res.status(400).json({
            error: "Cannot move a folder into itself",
          });
        }
        if (targetAncestors.includes(dId)) {
          return res.status(400).json({
            error: "Cannot move a folder into one of its own subfolders (circular reference)",
          });
        }
      }
    }

    const movedItems = [];
    const errors = [];
    let successCount = 0;

    // 3. Process each item
    for (const item of items) {
      const { itemType, itemId } = item;
      if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
        errors.push({ itemId, error: "Invalid item ID" });
        continue;
      }

      if (itemType === "file") {
        const fileAuth = await authorizeAccess({
          user: foundUser,
          action: "write",
          resourceType: "file",
          resourceId: itemId,
        });

        if (!fileAuth.allowed) {
          errors.push({ itemId, error: fileAuth.message || "Permission denied" });
          continue;
        }

        const file = fileAuth.resource;
        if (file.isTrashed) {
          errors.push({ itemId, error: "File is in trash" });
          continue;
        }

        const currentParentId = file.parentDirId?.toString();
        if (currentParentId === resolvedTargetDirId.toString()) {
          // Already in destination
          continue;
        }

        let finalName = file.name;
        const existingConflict = await File.findOne({
          parentDirId: resolvedTargetDirId,
          name: file.name,
          extension: file.extension || "",
          isTrashed: { $ne: true },
          _id: { $ne: file._id },
        }).lean();

        if (existingConflict) {
          finalName = await generateUniqueFileName(resolvedTargetDirId, file.name, file.extension);
        }

        let sourceParentName = "My Drive";
        if (currentParentId && currentParentId !== foundUser.rootDirId.toString()) {
          const sourceDir = await Directory.findById(currentParentId).select("name").lean();
          sourceParentName = sourceDir?.name || "Folder";
        }

        await File.updateOne(
          { _id: file._id },
          {
            parentDirId: resolvedTargetDirId,
            ...(finalName !== file.name ? { name: finalName } : {}),
          }
        );

        logActivity({
          userId: foundUser._id,
          resourceType: "file",
          resourceId: file._id,
          action: "move",
          details: {
            name: finalName,
            extension: file.extension,
            fromDirectoryName: sourceParentName,
            toDirectoryName: targetFolderName,
            source: file.source,
          },
        });

        movedItems.push({ id: file._id, name: finalName, type: "file" });
        successCount++;
      } else if (itemType === "directory") {
        const dirAuth = await authorizeAccess({
          user: foundUser,
          action: "write",
          resourceType: "directory",
          resourceId: itemId,
        });

        if (!dirAuth.allowed) {
          errors.push({ itemId, error: dirAuth.message || "Permission denied" });
          continue;
        }

        const dir = dirAuth.resource;
        if (dir._id.toString() === foundUser.rootDirId.toString()) {
          errors.push({ itemId, error: "Cannot move root folder" });
          continue;
        }

        if (dir.isTrashed) {
          errors.push({ itemId, error: "Folder is in trash" });
          continue;
        }

        const currentParentId = dir.parentDirId?.toString();
        if (currentParentId === resolvedTargetDirId.toString()) {
          // Already in destination
          continue;
        }

        let finalName = dir.name;
        const existingConflict = await Directory.findOne({
          parentDirId: resolvedTargetDirId,
          name: dir.name,
          isTrashed: { $ne: true },
          _id: { $ne: dir._id },
        }).lean();

        if (existingConflict) {
          finalName = await generateUniqueDirName(resolvedTargetDirId, dir.name);
        }

        let sourceParentName = "My Drive";
        if (currentParentId && currentParentId !== foundUser.rootDirId.toString()) {
          const sourceDir = await Directory.findById(currentParentId).select("name").lean();
          sourceParentName = sourceDir?.name || "Folder";
        }

        await Directory.updateOne(
          { _id: dir._id },
          {
            parentDirId: resolvedTargetDirId,
            ...(finalName !== dir.name ? { name: finalName } : {}),
          }
        );

        logActivity({
          userId: foundUser._id,
          resourceType: "directory",
          resourceId: dir._id,
          action: "move",
          details: {
            name: finalName,
            fromDirectoryName: sourceParentName,
            toDirectoryName: targetFolderName,
            source: dir.source,
          },
        });

        movedItems.push({ id: dir._id, name: finalName, type: "directory" });
        successCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully moved ${successCount} item${successCount === 1 ? "" : "s"} to "${targetFolderName}"`,
      movedCount: successCount,
      totalCount: items.length,
      toDirectoryName: targetFolderName,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("bulkMoveItems error:", error);
    return res.status(500).json({ error: "Failed to perform bulk move" });
  }
}

/**
 * Controller: Stream multiple files and/or directories as a single zip archive ($O(1)$ RAM)
 * GET /api/items/download-zip?files=id1,id2&dirs=dir1,dir2&name=ArchiveName
 */
export async function downloadBulkItems(req, res) {
  const foundUser = req.foundUser;
  try {
    const rawFiles = (req.query.files || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
    const rawDirs = (req.query.dirs || req.query.directories || "").toString().split(",").map((s) => s.trim()).filter(Boolean);

    if (rawFiles.length === 0 && rawDirs.length === 0) {
      return res.status(400).json({ error: "No files or directories specified for download" });
    }

    const archiveBaseName = (req.query.name || "MeghVault-Archive").replace(/[/\\?%*:|"<>]/g, "_").trim() || "MeghVault-Archive";
    const asciiArchiveName = archiveBaseName.replace(/[^\x20-\x7E]/g, "_") || "MeghVault-Archive";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiArchiveName}.zip"; filename*=UTF-8''${encodeURIComponent(archiveBaseName)}.zip`
    );

    const createZipArchive = (options = {}) => {
      if (archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
      }
      const factory = archiverModule.default || archiverModule;
      return factory("zip", options);
    };

    const archive = createZipArchive({
      zlib: { level: 1 },
    });

    let isAborted = false;
    let isFinalized = false;

    archive.on("error", (err) => {
      console.error("[Bulk Download] Archiver error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate zip archive" });
      } else {
        res.end();
      }
    });

    archive.on("end", () => {
      isFinalized = true;
    });

    res.on("close", () => {
      if (!isFinalized && !res.writableEnded) {
        isAborted = true;
        try {
          archive.abort();
        } catch {}
      }
    });

    archive.pipe(res);

    let totalItemsAdded = 0;
    const topLevelNames = new Set();

    const disambiguateTopLevel = (name, isFolder) => {
      let clean = (name || (isFolder ? "Folder" : "File"))
        .replace(/[/\\?%*:|"<>]/g, "_")
        .trim();
      if (!clean) clean = isFolder ? "Folder" : "File";

      let base = clean;
      let ext = "";
      if (!isFolder) {
        ext = path.extname(clean);
        base = path.basename(clean, ext);
      }

      let candidate = clean;
      let counter = 1;
      while (topLevelNames.has(candidate.toLowerCase())) {
        candidate = isFolder ? `${base} (${counter})` : `${base} (${counter})${ext}`;
        counter++;
      }
      topLevelNames.add(candidate.toLowerCase());
      return candidate;
    };

    // 1. Append selected files to zip root
    for (const fileId of rawFiles) {
      if (isAborted) break;
      if (!mongoose.Types.ObjectId.isValid(fileId)) continue;

      const auth = await authorizeAccess({
        user: foundUser,
        action: "download",
        resourceType: "file",
        resourceId: fileId,
        options: {
          cookies: req.signedCookies,
          ticket: req.query.ticket || req.headers["x-share-ticket"],
        },
      });

      if (!auth.allowed) continue;
      const file = auth.resource;
      if (file.isTrashed) continue;

      const entryName = disambiguateTopLevel(file.name, false);
      const physicalFilePath = getPhysicalFilePath(file._id, file.extension);
      if (physicalFilePath && fs.existsSync(physicalFilePath)) {
        archive.append(fs.createReadStream(physicalFilePath), {
          name: entryName,
        });
        totalItemsAdded++;
      }
    }

    // 2. Append selected directories and their recursive BFS subtrees
    for (const dirId of rawDirs) {
      if (isAborted) break;
      if (!mongoose.Types.ObjectId.isValid(dirId)) continue;

      const auth = await authorizeAccess({
        user: foundUser,
        action: "download",
        resourceType: "directory",
        resourceId: dirId,
        options: {
          cookies: req.signedCookies,
          ticket: req.query.ticket || req.headers["x-share-ticket"],
        },
      });

      if (!auth.allowed) continue;
      const dir = auth.resource;
      if (dir.isTrashed) continue;

      const topFolderName = disambiguateTopLevel(dir.name, true);
      const queue = [{ dirId: dir._id, relativePath: topFolderName }];
      let dirEntriesAdded = 0;

      while (queue.length > 0) {
        if (isAborted || req.destroyed || res.destroyed) break;

        const current = queue.shift();

        const [subDirs, subFiles] = await Promise.all([
          Directory.find({
            parentDirId: current.dirId,
            isTrashed: { $ne: true },
          }).lean(),
          File.find({
            parentDirId: current.dirId,
            isTrashed: { $ne: true },
          }).lean(),
        ]);

        if (subDirs.length === 0 && subFiles.length === 0) {
          archive.append("", { name: `${current.relativePath}/` });
          dirEntriesAdded++;
          totalItemsAdded++;
          continue;
        }

        const localNames = new Set();
        const disambiguateLocal = (name, isFolder) => {
          let clean = (name || (isFolder ? "Folder" : "File"))
            .replace(/[/\\?%*:|"<>]/g, "_")
            .trim();
          if (!clean) clean = isFolder ? "Folder" : "File";

          let base = clean;
          let ext = "";
          if (!isFolder) {
            ext = path.extname(clean);
            base = path.basename(clean, ext);
          }

          let candidate = clean;
          let counter = 1;
          while (localNames.has(candidate.toLowerCase())) {
            candidate = isFolder ? `${base} (${counter})` : `${base} (${counter})${ext}`;
            counter++;
          }
          localNames.add(candidate.toLowerCase());
          return candidate;
        };

        for (const sDir of subDirs) {
          if (isAborted) break;
          const sName = disambiguateLocal(sDir.name, true);
          queue.push({
            dirId: sDir._id,
            relativePath: `${current.relativePath}/${sName}`,
          });
        }

        for (const sFile of subFiles) {
          if (isAborted) break;
          const fName = disambiguateLocal(sFile.name, false);
          const entryPath = `${current.relativePath}/${fName}`;
          const physicalFilePath = getPhysicalFilePath(sFile._id, sFile.extension);
          if (physicalFilePath && fs.existsSync(physicalFilePath)) {
            archive.append(fs.createReadStream(physicalFilePath), {
              name: entryPath,
            });
            dirEntriesAdded++;
            totalItemsAdded++;
          }
        }
      }

      if (dirEntriesAdded === 0 && !isAborted) {
        archive.append("", { name: `${topFolderName}/` });
        totalItemsAdded++;
      }
    }

    if (totalItemsAdded === 0 && !isAborted) {
      archive.append("", { name: `${archiveBaseName}/` });
    }

    if (!isAborted) {
      await archive.finalize();

      if (foundUser?._id) {
        logActivity({
          userId: foundUser._id,
          resourceType: "file",
          resourceId: foundUser._id,
          action: "download",
          details: {
            name: `${archiveBaseName}.zip`,
            source: "bulk_download",
          },
        });
      }
    }
  } catch (error) {
    console.error("[Bulk Download] Unexpected error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to download selected items" });
    }
    res.end();
  }
}
