import mongoose from "mongoose";
import { unlink } from "fs/promises";
import fs, { createWriteStream } from "fs";
import path from "path";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import Share from "../models/share.model.js";
import Starred from "../models/starred.model.js";
import { getStorageDirectory, deletePhysicalFile } from "../utils/storagePath.js";
import { authorizeAccess } from "../utils/authorizeAccess.js";
import { logActivity } from "../utils/logActivity.js";

export const rootDirFileUploader = async (req, res) => {
  const foundUser = req.foundUser;
  // Get parentDirId directly from the user's rootDirId
  const parentDirId = foundUser.rootDirId;

  const filename = req.headers.filename || "untitled";
  const extension = path.extname(filename);
  const _id = new mongoose.Types.ObjectId();
  const fullFileName = `${_id}${extension}`;
  const storageDir = getStorageDirectory();
  const filePath = path.join(storageDir, fullFileName);

  try {
    const parentDirectoryData = await Directory.findOne({
      _id: parentDirId,
      userId: foundUser._id,
    }).lean();

    if (!parentDirectoryData) {
      return res.status(404).json({ message: "Root Directory Not Found" });
    }

    // --- 1. Helper function to clean up orphaned physical files ---
    const cleanupFailedUpload = async () => {
      try {
        await unlink(filePath);
      } catch (err) {
        if (err.code !== "ENOENT")
          console.error("Failed to delete physical file:", err);
      }
    };

    let isErrorHandled = false;
    const writeStream = createWriteStream(filePath);

    // --- 2. Handle stream errors (Connection loss, disk issues) ---
    req.on("error", async (error) => {
      if (isErrorHandled) return;
      isErrorHandled = true;
      writeStream.destroy();
      await cleanupFailedUpload();
      if (!res.headersSent)
        res.status(500).json({ message: "Upload interrupted" });
    });

    writeStream.on("error", async (error) => {
      if (isErrorHandled) return;
      isErrorHandled = true;
      await cleanupFailedUpload();
      if (!res.headersSent)
        res.status(500).json({ message: "Error saving file to disk" });
    });

    // --- 3. Handle successful write, then process MongoDB logic ---
    writeStream.on("finish", async () => {
      if (isErrorHandled) return;

      try {
        // Step A: Insert into files collection
        await File.insertOne({
          _id,
          parentDirId: parentDirId,
          userId: foundUser._id,
          extension,
          name: filename,
        });

        // Step B: Send response only after EVERYTHING succeeds
        res
          .status(201)
          .json({ message: "File Uploaded Successfully", fileId: _id });

        // Step C: Non-blocking activity logging
        logActivity({
          userId: foundUser._id,
          resourceType: "file",
          resourceId: _id,
          action: "upload",
          details: {
            name: filename,
            extension,
          },
        });
      } catch (error) {
        // --- 4. Rollback database and file system if MongoDB fails ---
        console.error("Database operation failed:", error);

        await cleanupFailedUpload(); // Delete the physical file
        await File.deleteOne({ _id }); // Delete orphaned document

        if (!res.headersSent)
          res.status(500).json({ message: "Database error, upload cancelled" });
      }
    });

    // Start streaming the upload to disk
    req.pipe(writeStream);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export const fileUploaderByDirId = async (req, res) => {
  const parentDirId = req.params.parentDirId;
  const foundUser = req.foundUser;

  const filename = req.headers.filename || "untitled";
  const extension = path.extname(filename);
  const _id = new mongoose.Types.ObjectId();
  const fullFileName = `${_id}${extension}`;
  const storageDir = getStorageDirectory();
  const filePath = path.join(storageDir, fullFileName);

  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "write",
      resourceType: "directory",
      resourceId: parentDirId,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ message: auth.message || "Directory Not Found or Write Access Denied" });
    }

    const parentDirectoryData = auth.resource;

    // --- 1. Helper function to delete physical file if things fail ---
    const cleanupFailedUpload = async () => {
      try {
        await unlink(filePath);
      } catch (err) {
        // Ignore error if file doesn't exist yet (ENOENT)
        if (err.code !== "ENOENT")
          console.error("Failed to delete physical file:", err);
      }
    };

    const writeStream = createWriteStream(filePath);
    let isErrorHandled = false; // Prevents multiple error responses

    // --- 2. Handle Stream Errors (Network drops, disk full, etc.) ---
    req.on("error", async (error) => {
      if (isErrorHandled) return;
      isErrorHandled = true;
      writeStream.destroy(); // Stop writing
      await cleanupFailedUpload(); // Delete the broken file
      if (!res.headersSent)
        res.status(500).json({ message: "Upload interrupted" });
    });

    writeStream.on("error", async (error) => {
      if (isErrorHandled) return;
      isErrorHandled = true;
      await cleanupFailedUpload(); // Delete the broken file
      if (!res.headersSent)
        res.status(500).json({ message: "Error saving file to disk" });
    });

    // --- 3. Handle Successful File Save -> Then do DB Ops ---
    // Use writeStream.on("finish") instead of req.on("end") to ensure it is fully written to disk
    writeStream.on("finish", async () => {
      if (isErrorHandled) return;

      try {
        // Step A: Insert into files collection
        await File.insertOne({
          _id,
          parentDirId: parentDirId,
          userId: foundUser._id,
          extension,
          name: filename,
        });

        // Step B: Send success response ONLY after DB is updated
        res
          .status(201)
          .json({ message: "File Uploaded Successfully", fileId: _id });

        // Step C: Non-blocking activity logging
        logActivity({
          userId: foundUser._id,
          resourceType: "file",
          resourceId: _id,
          action: "upload",
          details: {
            name: filename,
            extension,
          },
        });
      } catch (error) {
        // --- 4. DB Rollback if Mongo fails ---
        console.error("Database operation failed:", error);

        // Delete the physical file that was just successfully uploaded
        await cleanupFailedUpload();

        // Rollback the file document if it was inserted before the updateOne failed
        await File.deleteOne({ _id });

        if (!res.headersSent)
          res.status(500).json({ message: "Database error, upload cancelled" });
      }
    });

    // Start piping the request to the file system
    req.pipe(writeStream);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export const getFileById = async (req, res, next) => {
  const _id = req.params.id;
  const foundUser = req.foundUser;
  const isDownload = req.query.action === "download";
  try {
    // 1. ReBAC Evaluation: Admin, Owner, Direct Collaborator, or Parent Folder Inherited Access
    const auth = await authorizeAccess({
      user: foundUser,
      action: isDownload ? "download" : "read",
      resourceType: "file",
      resourceId: _id,
      options: {
        cookies: req.signedCookies,
        ticket: req.query.ticket || req.headers["x-share-ticket"],
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message,
        requiresPassword: Boolean(auth.requiresPassword),
        shareToken: auth.shareToken || null,
      });
    }

    const fileData = auth.resource;

    // 2. Normalize extension format and locate file in storage directory
    const ext = fileData.extension?.startsWith(".")
      ? fileData.extension
      : `.${fileData.extension || ""}`;
    const fullFileName = `${_id}${ext}`;
    const storageDir = getStorageDirectory();
    let filePath = path.join(storageDir, fullFileName);

    // Fallback checks if file on disk was saved without extension or with alternate format
    if (!fs.existsSync(filePath)) {
      const altPath = path.join(storageDir, `${_id}${fileData.extension || ""}`);
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      } else {
        const noExtPath = path.join(storageDir, `${_id}`);
        if (fs.existsSync(noExtPath)) {
          filePath = noExtPath;
        }
      }
    }

    // 3. Centralized handler for streaming aborts, missing files, and client disconnects
    const handleFileError = (err) => {
      if (!err) return;

      // Safe to ignore: browser aborted/seeked video stream or closed connection
      if (
        res.headersSent ||
        req.destroyed ||
        res.writableEnded ||
        err.code === "ECONNABORTED" ||
        err.code === "ECANCELED"
      ) {
        return;
      }

      // Record exists in DB, but the file is missing on the disk
      if (err.code === "ENOENT") {
        return res
          .status(404)
          .json({ error: "File missing on storage server" });
      }
      next(err);
    };

    // 4. Download mode
    if (req.query.action === "download") {
      if (foundUser?._id) {
        logActivity({
          userId: foundUser._id,
          resourceType: "file",
          resourceId: fileData._id,
          action: "download",
          details: {
            name: fileData.name,
            extension: fileData.extension,
            source: fileData.source,
          },
        });
      }
      return res.download(filePath, fileData.name, handleFileError);
    }

    // 5. Preview / streaming mode
    if (foundUser?._id) {
      logActivity({
        userId: foundUser._id,
        resourceType: "file",
        resourceId: fileData._id,
        action: "view",
        details: {
          name: fileData.name,
          extension: fileData.extension,
          source: fileData.source,
        },
      });
    }
    const streamFilename = req.params.filename || req.query.streamFilename || fileData.name;
    const isDownload = req.query.action === "download";
    res.setHeader(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(streamFilename)}"`
    );
    res.sendFile(filePath, handleFileError);
  } catch (error) {
    next(error);
  }
};

export const updateFileById = async (req, res) => {
  const _id = req.params.id;
  const newFilename = req.body.newFilename;
  const foundUser = req.foundUser;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "write",
      resourceType: "file",
      resourceId: _id,
      options: {
        cookies: req.signedCookies,
        ticket: req.query.ticket || req.headers["x-share-ticket"],
      },
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        error: auth.message,
        requiresPassword: Boolean(auth.requiresPassword),
        shareToken: auth.shareToken || null,
      });
    }

    const previousName = auth.resource?.name || "";
    await File.updateOne({ _id }, { name: newFilename });

    logActivity({
      userId: foundUser._id,
      resourceType: "file",
      resourceId: _id,
      action: "rename",
      details: {
        name: newFilename,
        previousName,
        extension: auth.resource?.extension,
        source: auth.resource?.source,
      },
    });

    res.json({ message: "File Renamed Successfully" });
  } catch (err) {
    console.error(err);
    res.status(404).json({ message: "Error Occurred" });
  }
};

export const deleteFileById = async (req, res, next) => {
  const _id = req.params.id;
  const foundUser = req.foundUser;
  try {
    const auth = await authorizeAccess({
      user: foundUser,
      action: "delete",
      resourceType: "file",
      resourceId: _id,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({ message: auth.message });
    }

    const fileData = auth.resource;

    // 1. Delete physical file from storage using robust multi-path & prefix cleanup
    await deletePhysicalFile(_id, fileData.extension);

    // 2. Delete file document from MongoDB
    await File.deleteOne({ _id });

    // 3. Delete any associated share record
    await Share.deleteOne({ resourceType: "file", resourceId: _id }).catch(() => {});

    // 4. Delete any associated starred records
    await Starred.deleteMany({ resourceType: "file", resourceId: _id }).catch(() => {});

    return res.status(200).json({ message: "File Deleted Successfully" });
  } catch (err) {
    console.error("Error deleting file:", err);
    return res.status(500).json({ message: err.message || "Failed to delete file" });
  }
};
