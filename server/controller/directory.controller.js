import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import * as archiverModule from "archiver";
import { formatDocument } from "../utils/formatDocumentId.js";
import { deleteDirectoryRecursively } from "../utils/deleteDirectoryRecursively.js";
import { buildDirectoryBreadcrumbs } from "../utils/breadcrumb.js";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import Share from "../models/share.model.js";
import { authorizeAccess } from "../utils/authorizeAccess.js";
import { logActivity } from "../utils/logActivity.js";
import { getPhysicalFilePath } from "../utils/storagePath.js";

export const getRootDir = async (req, res) => {
  const foundUser = req.foundUser;
  const _id = foundUser.rootDirId;
  try {
    const directoryData = await Directory.findOne({
      _id,
      userId: foundUser._id,
    }).lean();

    if (!directoryData) {
      return res.status(404).json({
        error: "Directory not found or you do not have access to it!",
      });
    }

    // Fetch all files at once using $in (if any exist) excluding trashed items
    let files = [];
    files = await File.find({
      parentDirId: directoryData._id,
      isTrashed: { $ne: true },
    }).lean();

    // Fetch all sub-directories at once using $in (if any exist) excluding trashed items
    let directories = [];
    directories = await Directory.find({
      parentDirId: directoryData._id,
      isTrashed: { $ne: true },
    }).lean();

    // 3. APPLY THE HELPER FUNCTION HERE
    const formattedDirectoryData = formatDocument(directoryData);
    const formattedFiles = files.map(formatDocument);
    const formattedDirectories = directories.map(formatDocument);

    // 4. Send the perfectly formatted data to the frontend
    return res.status(200).json({
      ...formattedDirectoryData,
      name: "My Drive",
      parentDirId: null,
      files: formattedFiles,
      directories: formattedDirectories,
      breadcrumbs: [{ id: null, name: "My Drive" }],
    });
  } catch (error) {
    console.error("Error fetching root directory:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

export const getDirById = async (req, res) => {
  const foundUser = req.foundUser;
  const _id = req.params.id;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "read",
      resourceType: "directory",
      resourceId: _id,
      options: {
        cookies: req.signedCookies,
        ticket: req.query.ticket || req.headers["x-share-ticket"],
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message || "Directory not found or access denied",
        requiresPassword: Boolean(auth.requiresPassword),
        shareToken: auth.shareToken || null,
      });
    }

    const directoryData = auth.resource;
    const isUserRoot =
      Boolean(foundUser.rootDirId && directoryData._id.toString() === foundUser.rootDirId.toString()) ||
      Boolean(!directoryData.parentDirId || directoryData.name?.startsWith("root-"));

    // Fetch all files at once using $in (if any exist) excluding trashed items
    let files = [];
    files = await File.find({
      parentDirId: directoryData._id,
      isTrashed: { $ne: true },
    }).lean();

    // Fetch all sub-directories at once using $in (if any exist) excluding trashed items
    let directories = [];
    directories = await Directory.find({
      parentDirId: directoryData._id,
      isTrashed: { $ne: true },
    }).lean();

    // 3. APPLY THE HELPER FUNCTION HERE
    const formattedDirectoryData = formatDocument(directoryData);
    const formattedFiles = files.map(formatDocument);
    const formattedDirectories = directories.map(formatDocument);

    // 4. Build canonical breadcrumbs
    const breadcrumbs = isUserRoot
      ? [{ id: null, name: "My Drive" }]
      : await buildDirectoryBreadcrumbs(directoryData._id, foundUser.rootDirId);

    // 5. Send formatted data to frontend
    return res.status(200).json({
      ...formattedDirectoryData,
      name: isUserRoot ? "My Drive" : formattedDirectoryData.name,
      parentDirId: isUserRoot ? null : formattedDirectoryData.parentDirId,
      files: formattedFiles,
      directories: formattedDirectories,
      breadcrumbs,
    });
  } catch (error) {
    console.error("Error fetching root directory:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

export const createDirInRoot = async (req, res, next) => {
  const foundUser = req.foundUser;
  const parentDirId = foundUser.rootDirId;
  const dirname = req.headers.dirname || "New Folder";
  try {
    const parentDirectoryData = await Directory.findOne({
      _id: parentDirId,
      userId: foundUser._id,
    }).lean();
    if (!parentDirectoryData) {
      return res.status(404).json({ message: "Directory Not Found" });
    }
    const newDirId = new mongoose.Types.ObjectId();
    await Directory.insertOne({
      _id: newDirId,
      name: dirname,
      parentDirId,
      userId: foundUser._id,
    });

    logActivity({
      userId: foundUser._id,
      resourceType: "directory",
      resourceId: newDirId,
      action: "upload",
      details: { name: dirname },
    });

    res.status(200).json("Directory Created");
  } catch (error) {
    if (error.code === 121) {
      res.status(121).json("Validation failed");
    }
    res.status(400).json("Something Went Wrong");
  }
};

export const createDirByParentDirId = async (req, res, next) => {
  const parentDirId = req.params.parentDirId;
  const foundUser = req.foundUser;
  const dirname = req.headers.dirname || "New Folder";
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "write",
      resourceType: "directory",
      resourceId: parentDirId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ message: auth.message || "Directory Not Found or Access Denied" });
    }

    const newDirId = new mongoose.Types.ObjectId();
    await Directory.insertOne({
      _id: newDirId,
      name: dirname,
      parentDirId: parentDirId,
      userId: foundUser._id,
    });

    logActivity({
      userId: foundUser._id,
      resourceType: "directory",
      resourceId: newDirId,
      action: "upload",
      details: { name: dirname },
    });

    res.status(200).json("Directory Created");
  } catch (error) {
    if (error.code === 121) {
      res.status(121).json("Validation failed");
    }
    res.status(400).json("Something Went Wrong");
  }
};

export const renameDirById = async (req, res) => {
  const _id = req.params.id;
  const newDirName = req.body.newDirName;
  const foundUser = req.foundUser;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "write",
      resourceType: "directory",
      resourceId: _id,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ message: auth.message || "Directory Not Found or Access Denied" });
    }

    const previousName = auth.resource?.name || "";
    await Directory.updateOne({ _id }, { name: newDirName });

    logActivity({
      userId: foundUser._id,
      resourceType: "directory",
      resourceId: _id,
      action: "rename",
      details: {
        name: newDirName,
        previousName,
      },
    });

    return res.status(200).json("Directory Rename Successfully");
  } catch (error) {
    return res.status(400).json("Something Went Wrong");
  }
};

export const deleteDirById = async (req, res, next) => {
  const _id = req.params.id;
  const foundUser = req.foundUser;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "delete",
      resourceType: "directory",
      resourceId: _id,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        message: auth.message || "Directory Not Found or Permission Denied",
      });
    }

    const directoryData = auth.resource;

    // Don't allow root directory deletion (parentDirId is null)
    if (!directoryData.parentDirId) {
      return res.status(400).json({
        message: "Root Directory Cannot Be Deleted",
      });
    }
    // Delete directory and everything inside it recursively
    await deleteDirectoryRecursively(_id);
    // Delete associated share record
    await Share.deleteOne({ resourceType: "directory", resourceId: _id }).catch(() => {});

    res.status(200).json({
      message: "Directory and all its contents deleted!",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Streams an entire folder hierarchy as a zip archive on the fly ($O(1)$ RAM).
 * Uses BFS traversal, auto-disambiguates colliding names, preserves empty subdirs,
 * verifies ReBAC permissions, and aborts immediately if client connection is closed.
 */
export const downloadDirById = async (req, res, next) => {
  const _id = req.params.id;
  const foundUser = req.foundUser;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "download",
      resourceType: "directory",
      resourceId: _id,
      options: {
        cookies: req.signedCookies,
        ticket: req.query.ticket || req.headers["x-share-ticket"],
        shareToken: req.query.shareToken,
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message || "Directory not found or access denied",
        requiresPassword: Boolean(auth.requiresPassword),
        shareToken: auth.shareToken || null,
      });
    }

    const directoryData = auth.resource;
    const rawName = directoryData.name || "Folder";
    const isUserRoot =
      Boolean(foundUser?.rootDirId && directoryData._id.toString() === foundUser.rootDirId.toString()) ||
      Boolean(!directoryData.parentDirId || directoryData.name?.startsWith("root-"));
    const folderDisplayName = isUserRoot ? "My Drive" : rawName;
    const safeArchiveName = folderDisplayName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Folder";
    const asciiArchiveName = safeArchiveName.replace(/[^\x20-\x7E]/g, "_") || "Folder";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiArchiveName}.zip"; filename*=UTF-8''${encodeURIComponent(safeArchiveName)}.zip`
    );

    const createZipArchive = (options = {}) => {
      if (archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
      }
      const factory = archiverModule.default || archiverModule;
      return factory("zip", options);
    };

    const archive = createZipArchive({
      zlib: { level: 1 }, // Level 1 is fastest compression, preserving CPU and maximizing throughput
    });

    let isAborted = false;
    let isFinalized = false;

    archive.on("error", (err) => {
      console.error("[Folder Download] Archiver error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate folder archive" });
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

    const queue = [{ dirId: directoryData._id, relativePath: "" }];
    let totalItemsAdded = 0;

    while (queue.length > 0) {
      if (isAborted || req.destroyed || res.destroyed) break;

      const current = queue.shift();

      const [subDirs, files] = await Promise.all([
        Directory.find({
          parentDirId: current.dirId,
          isTrashed: { $ne: true },
        }).lean(),
        File.find({
          parentDirId: current.dirId,
          isTrashed: { $ne: true },
        }).lean(),
      ]);

      if (subDirs.length === 0 && files.length === 0) {
        if (current.relativePath) {
          archive.append("", { name: `${current.relativePath}/` });
          totalItemsAdded++;
        }
        continue;
      }

      const usedNames = new Set();
      const disambiguate = (name, isFolder) => {
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
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = isFolder ? `${base} (${counter})` : `${base} (${counter})${ext}`;
          counter++;
        }
        usedNames.add(candidate.toLowerCase());
        return candidate;
      };

      // 1. Process and enqueue subdirectories
      for (const subDir of subDirs) {
        if (isAborted) break;
        const folderName = disambiguate(subDir.name, true);
        const subDirPath = current.relativePath
          ? `${current.relativePath}/${folderName}`
          : folderName;

        queue.push({
          dirId: subDir._id,
          relativePath: subDirPath,
        });
      }

      // 2. Process and append files
      for (const file of files) {
        if (isAborted) break;
        const fileName = disambiguate(file.name, false);
        const entryPath = current.relativePath
          ? `${current.relativePath}/${fileName}`
          : fileName;

        const physicalFilePath = getPhysicalFilePath(file._id, file.extension);
        if (physicalFilePath && fs.existsSync(physicalFilePath)) {
          archive.append(fs.createReadStream(physicalFilePath), {
            name: entryPath,
          });
          totalItemsAdded++;
        } else {
          console.warn(`[Folder Download] File on disk missing: ${file._id} (${file.name})`);
        }
      }
    }

    if (totalItemsAdded === 0 && !isAborted) {
      archive.append("", { name: `${safeArchiveName}/` });
    }

    if (!isAborted) {
      await archive.finalize();

      if (foundUser?._id) {
        logActivity({
          userId: foundUser._id,
          resourceType: "directory",
          resourceId: directoryData._id,
          action: "download",
          details: {
            name: directoryData.name,
          },
        });
      }
    }
  } catch (error) {
    console.error("[Folder Download] Unexpected error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to download folder" });
    }
    res.end();
  }
};
