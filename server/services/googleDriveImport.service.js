import fs from "fs";
import { mkdir, unlink, rm } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import mongoose from "mongoose";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { deleteDirectoryRecursively } from "../utils/deleteDirectoryRecursively.js";
import { getStorageDirectory, deletePhysicalFile } from "../utils/storagePath.js";
import { logActivity } from "../utils/logActivity.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// Production-tuned concurrency: 2 parallel downloads prevents RAM spikes
// and avoids disk I/O saturation on large files (e.g. 4K videos, heavy images)
const CONCURRENCY_LIMIT = 2;

// Production stream buffer: 64KB ensures backpressure engages immediately
// preventing Node.js from buffering large video/image chunks in memory
const STREAM_HIGH_WATER_MARK = 64 * 1024;

// Google Workspace documents export specifications
const GOOGLE_DOCS_EXPORT_MAP = {
  "application/vnd.google-apps.document": {
    exportMime: "application/pdf",
    defaultExt: ".pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    exportMime:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    defaultExt: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    exportMime: "application/pdf",
    defaultExt: ".pdf",
  },
  "application/vnd.google-apps.drawing": {
    exportMime: "image/png",
    defaultExt: ".png",
  },
  "application/vnd.google-apps.script": {
    exportMime: "application/vnd.google-apps.script+json",
    defaultExt: ".json",
  },
};

// Common MIME types to file extension dictionary
const MIME_TO_EXTENSION_MAP = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/markdown": ".md",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/x-rar-compressed": ".rar",
  "application/x-7z-compressed": ".7z",
  "application/x-tar": ".tar",
  "application/gzip": ".gz",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

/**
 * Detailed Progress Tracker:
 * Emits rich, real-time events showing:
 * - rootFolder & current parent folder path (e.g. "PHOTOS / WhatsApp Images")
 * - currently active file streaming (name, size, mimeType)
 * - completed count, total count, and waiting count
 * - list of recent completed files
 */
export class DetailedProgressTracker {
  constructor({ rootFolderName = "", onProgress = null, initialTotal = 0 }) {
    this.rootFolderName = rootFolderName;
    this.currentFolder = rootFolderName;
    this.currentFolderPath = rootFolderName;
    this.onProgress = onProgress;
    this.totalFiles = initialTotal;
    this.completedCount = 0;
    this.failedCount = 0;
    this.activeFiles = new Map(); // fileId -> { name, size, mimeType, folderPath }
    this.recentCompleted = []; // Array of { name, folderPath, size, time }
  }

  addDiscoveredFiles(count) {
    this.totalFiles += count;
    this.emit();
  }

  setFolder(folderName, folderPath) {
    this.currentFolder = folderName;
    this.currentFolderPath = folderPath || folderName;
    this.emit();
  }

  startFile({ fileId, name, size, mimeType, folderPath }) {
    this.activeFiles.set(fileId, {
      name,
      size: size ? Number(size) : null,
      mimeType,
      folderPath: folderPath || this.currentFolderPath,
      startTime: Date.now(),
    });
    this.emit();
  }

  finishFile({ fileId, name, size, folderPath, success = true }) {
    this.activeFiles.delete(fileId);
    if (success) {
      this.completedCount++;
      this.recentCompleted.push({
        name,
        size: size ? Number(size) : null,
        folderPath: folderPath || this.currentFolderPath,
        time: Date.now(),
      });
      if (this.recentCompleted.length > 8) {
        this.recentCompleted.shift();
      }
    } else {
      this.failedCount++;
    }
    this.emit();
  }

  emit() {
    if (!this.onProgress) return;

    // Pick primary active file for UI display
    const activeFilesList = Array.from(this.activeFiles.values());
    const primaryActiveFile = activeFilesList[0] || null;

    const waiting = Math.max(
      0,
      this.totalFiles - this.completedCount - this.failedCount - activeFilesList.length
    );

    const percent = Math.min(
      Math.max(
        Math.round((this.completedCount / Math.max(this.totalFiles, 1)) * 100),
        this.completedCount > 0 ? 1 : 5
      ),
      99
    );

    this.onProgress({
      type: "progress",
      rootFolder: this.rootFolderName,
      currentFolder: this.currentFolder,
      folderPath: this.currentFolderPath,
      activeFile: primaryActiveFile,
      activeFiles: activeFilesList,
      completed: this.completedCount,
      failed: this.failedCount,
      total: Math.max(this.totalFiles, this.completedCount),
      waiting,
      percent,
      recentCompleted: [...this.recentCompleted].reverse(),
    });
  }
}

async function unlinkWithRetry(filePath, maxRetries = 10, delayMs = 100) {
  if (!filePath) return;
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        await unlink(filePath);
      }
      return true;
    } catch (err) {
      if (err.code === "EBUSY" || err.code === "EPERM") {
        await new Promise((r) => setTimeout(r, delayMs));
      } else if (err.code === "ENOENT") {
        return true;
      } else {
        throw err;
      }
    }
  }
  try {
    if (fs.existsSync(filePath)) {
      await rm(filePath, { force: true });
    }
  } catch (err) {
    console.warn(`[unlinkWithRetry] Failed to remove ${filePath} after retries:`, err.message);
  }
}

/**
 * Production-Grade Import Session Tracker:
 * Tracks every directory and file created during an import batch or folder operation.
 * Eliminates the 60-second MongoDB multi-document transaction limit and WiredTiger RAM caching,
 * while providing 100% database & storage rollback consistency on cancel or error.
 */
export class ImportSession {
  constructor({ userId, signal = null, checkAborted = null }) {
    this.userId = userId;
    this.signal = signal;
    this.checkAborted = checkAborted;
    this.createdDirectoryIds = new Set();
    this.createdFiles = []; // Array of { id: ObjectId, extension: string, filePath: string }
    this.activeWriteStreams = new Set();
    this.activeReadStreams = new Set();
    this.isRolledBack = false;
    this._rollbackPromise = null;
  }

  isCancelled() {
    return Boolean(
      this.isRolledBack ||
      this.signal?.aborted ||
      this.checkAborted?.()
    );
  }

  registerDirectory(dirId) {
    if (dirId) {
      this.createdDirectoryIds.add(dirId.toString());
    }
  }

  registerFile({ id, extension, filePath, writeStream, readStream }) {
    this.createdFiles.push({ id, extension, filePath });
    if (writeStream) this.activeWriteStreams.add(writeStream);
    if (readStream) this.activeReadStreams.add(readStream);
  }

  unregisterStream(writeStream, readStream) {
    if (writeStream) this.activeWriteStreams.delete(writeStream);
    if (readStream) this.activeReadStreams.delete(readStream);
  }

  /**
   * Full transactional rollback — destroys all active streams, deletes all physical files from disk,
   * and removes all MongoDB documents created during this import session.
   * Safe to call multiple times (idempotent).
   */
  async rollback() {
    if (this._rollbackPromise) return this._rollbackPromise;
    if (this.isRolledBack) return;

    this._rollbackPromise = this._doRollback();
    return this._rollbackPromise;
  }

  async _doRollback() {
    this.isRolledBack = true;

    console.warn("[ImportSession] Rolling back import session...");

    // 1. Immediately abort & destroy all ongoing stream writes and downloads
    for (const ws of this.activeWriteStreams) {
      try {
        ws.destroy();
      } catch {}
    }
    this.activeWriteStreams.clear();

    for (const rs of this.activeReadStreams) {
      try {
        rs.destroy();
      } catch {}
    }
    this.activeReadStreams.clear();

    // 2. Allow event loop tick for Windows OS file handles to release
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 120));

    // 3. Delete every physical file written to disk with Windows retry protection
    const fileIdsToDelete = [];
    for (const file of this.createdFiles) {
      fileIdsToDelete.push(file.id);
      try {
        if (file.filePath) {
          await unlinkWithRetry(file.filePath);
        }
        await deletePhysicalFile(file.id, file.extension);
      } catch (err) {
        console.warn(`[ImportSession] Failed deleting file ${file.id} on disk:`, err.message);
      }
    }

    // 4. Purge all tracked File documents from MongoDB
    if (fileIdsToDelete.length > 0) {
      try {
        await File.deleteMany({ _id: { $in: fileIdsToDelete } });
      } catch (err) {
        console.warn("[ImportSession] Error deleting File records from MongoDB:", err.message);
      }
    }

    // 5. Purge all tracked Directory documents from MongoDB and clean up all descendants recursively
    const dirIds = Array.from(this.createdDirectoryIds);
    if (dirIds.length > 0) {
      try {
        // Recursively delete each created directory (cleans nested subdirectories, files, and physical disk files)
        for (const dirId of dirIds) {
          try {
            await deleteDirectoryRecursively(dirId);
          } catch (err) {
            console.warn(`[ImportSession] Recursive deletion for directory ${dirId}:`, err.message);
          }
        }

        // Secondary guarantee: purge any directories matching the IDs
        const dirObjectIds = dirIds.map((id) => new mongoose.Types.ObjectId(id));
        await Directory.deleteMany({ _id: { $in: dirObjectIds } });
        await File.deleteMany({ parentDirId: { $in: dirObjectIds } });
      } catch (err) {
        console.warn("[ImportSession] Error deleting Directory records from MongoDB:", err.message);
      }
    }

    console.warn(`[ImportSession] Rollback complete. Cleaned ${fileIdsToDelete.length} files and ${dirIds.length} directories.`);
  }
}

/**
 * Concurrency runner: runs at most `concurrency` async tasks in parallel.
 * Employs proper backpressure and event loop yielding between tasks.
 */
async function asyncPool(concurrency, items, asyncFn, isCancelled = null) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    if (isCancelled?.()) {
      break;
    }

    const promise = Promise.resolve().then(async () => {
      const res = await asyncFn(item);
      await new Promise((r) => setImmediate(r));
      return res;
    });

    results.push(promise);
    executing.add(promise);

    const cleanup = () => executing.delete(promise);
    promise.then(cleanup, cleanup);

    if (executing.size >= concurrency) {
      try {
        await Promise.race(executing);
      } catch {}
    }
  }

  const settled = await Promise.allSettled(results);
  return settled.map((r) => (r.status === "fulfilled" ? r.value : null));
}

/**
 * Derives a clean filename and valid extension from file metadata and mimeType
 */
export function resolveFileNameAndExtension(name, mimeType) {
  let fileName = (name || "Untitled").trim();
  let extension = path.extname(fileName).toLowerCase();

  if (!extension || extension === "") {
    if (GOOGLE_DOCS_EXPORT_MAP[mimeType]) {
      extension = GOOGLE_DOCS_EXPORT_MAP[mimeType].defaultExt;
    } else if (MIME_TO_EXTENSION_MAP[mimeType]) {
      extension = MIME_TO_EXTENSION_MAP[mimeType];
    } else {
      extension = "";
    }

    if (extension && !fileName.toLowerCase().endsWith(extension)) {
      fileName = `${fileName}${extension}`;
    }
  }

  return { fileName, extension };
}

/**
 * Import a single Google Drive file with memory-bounded streaming
 */
export async function importSingleGoogleDriveFile({
  drive,
  driveFile,
  userId,
  parentDirId,
  signal = null,
  checkAborted = null,
  session = null,
  progressTracker = null,
  folderPath = "",
}) {
  const isCancelled = () => Boolean(
    session?.isCancelled() || signal?.aborted || checkAborted?.()
  );

  if (isCancelled()) {
    return null;
  }

  const fileId = driveFile.id;
  const mimeType = driveFile.mimeType || "";

  // Skip Google Shortcuts
  if (mimeType === "application/vnd.google-apps.shortcut") {
    return null;
  }

  const { fileName, extension } = resolveFileNameAndExtension(
    driveFile.name,
    mimeType
  );

  // Notify tracker that this file is starting download
  if (progressTracker) {
    progressTracker.startFile({
      fileId,
      name: fileName,
      size: driveFile.size,
      mimeType,
      folderPath,
    });
  }

  const storageDir = getStorageDirectory();
  await mkdir(storageDir, { recursive: true });

  const mongoFileId = new mongoose.Types.ObjectId();
  let readStream = null;

  const isGoogleDoc = Boolean(GOOGLE_DOCS_EXPORT_MAP[mimeType]);

  if (isCancelled()) {
    progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });
    return null;
  }

  try {
    if (isGoogleDoc) {
      const exportSpec = GOOGLE_DOCS_EXPORT_MAP[mimeType];
      const response = await drive.files.export(
        {
          fileId,
          mimeType: exportSpec.exportMime,
        },
        { responseType: "stream", signal: signal || undefined }
      );
      readStream = response.data;
    } else {
      const response = await drive.files.get(
        {
          fileId,
          alt: "media",
        },
        { responseType: "stream", signal: signal || undefined }
      );
      readStream = response.data;
    }
  } catch (err) {
    progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });
    if (isCancelled()) return null;
    throw err;
  }

  if (isCancelled()) {
    try { readStream?.destroy(); } catch {}
    progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });
    return null;
  }

  const physicalFileName = `${mongoFileId}${extension}`;
  const localFilePath = path.join(storageDir, physicalFileName);

  const writeStream = fs.createWriteStream(localFilePath, {
    highWaterMark: STREAM_HIGH_WATER_MARK,
  });

  session?.registerFile({
    id: mongoFileId,
    extension,
    filePath: localFilePath,
    writeStream,
    readStream,
  });

  try {
    if (signal) {
      await pipeline(readStream, writeStream, { signal });
    } else {
      await pipeline(readStream, writeStream);
    }

    session?.unregisterStream(writeStream, readStream);

    if (isCancelled()) {
      try { writeStream.destroy(); } catch {}
      try { readStream?.destroy(); } catch {}
      await new Promise((r) => setImmediate(r));
      try { await unlink(localFilePath); } catch {}
      progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });
      return null;
    }

    // Insert record into MongoDB files collection
    const newFile = await File.create({
      _id: mongoFileId,
      name: fileName,
      extension: extension || "",
      userId,
      parentDirId,
      source: "google-drive",
    });

    if (isCancelled()) {
      try { await unlink(localFilePath); } catch {}
      await deletePhysicalFile(mongoFileId, extension);
      await File.deleteOne({ _id: mongoFileId });
      progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });
      return null;
    }

    // Notify tracker of completed file
    progressTracker?.finishFile({
      fileId,
      name: fileName,
      size: driveFile.size,
      folderPath,
      success: true,
    });

    logActivity({
      userId,
      resourceType: "file",
      resourceId: mongoFileId,
      action: "import",
      details: {
        name: fileName,
        extension: extension || "",
        source: "google-drive",
      },
    });

    readStream = null;

    return {
      success: true,
      file: newFile,
      id: mongoFileId.toString(),
      name: fileName,
    };
  } catch (error) {
    session?.unregisterStream(writeStream, readStream);
    try { writeStream.destroy(); } catch {}
    try { readStream?.destroy(); } catch {}

    await new Promise((r) => setImmediate(r));
    try {
      await unlink(localFilePath);
    } catch {
      try { await deletePhysicalFile(mongoFileId, extension); } catch {}
    }

    progressTracker?.finishFile({ fileId, name: fileName, size: driveFile.size, folderPath, success: false });

    if (isCancelled() || error.name === "AbortError" || error.code === "ABORT_ERR") {
      return null;
    }

    throw error;
  }
}

/**
 * Recursively imports an entire Google Drive folder structure with memory-bounded streaming
 * and detailed path & file progress reporting.
 */
export async function importGoogleDriveFolderRecursively({
  drive,
  folderItem,
  userId,
  parentDirId,
  depth = 0,
  maxDepth = 8,
  signal = null,
  checkAborted = null,
  session = null,
  progressTracker = null,
  currentPath = "",
}) {
  const isCancelled = () => Boolean(
    session?.isCancelled() || signal?.aborted || checkAborted?.()
  );

  if (isCancelled()) {
    return null;
  }

  if (depth > maxDepth) {
    console.warn(`Max folder recursion depth (${maxDepth}) reached for:`, folderItem.name);
    return null;
  }

  const folderName = folderItem.name || "Imported Folder";
  const folderPath = currentPath ? `${currentPath} / ${folderName}` : folderName;

  // Inform tracker of the current folder path
  progressTracker?.setFolder(folderName, folderPath);

  const newDirectoryId = new mongoose.Types.ObjectId();

  const newDirectory = await Directory.create({
    _id: newDirectoryId,
    name: folderName,
    userId,
    parentDirId,
    source: "google-drive",
  });

  logActivity({
    userId,
    resourceType: "directory",
    resourceId: newDirectoryId,
    action: "import",
    details: {
      name: folderName,
      source: "google-drive",
    },
  });

  session?.registerDirectory(newDirectoryId);

  try {
    const importedFiles = [];
    const importedSubdirectories = [];

    let pageToken = null;
    do {
      if (isCancelled()) break;

      let listResponse;
      try {
        listResponse = await drive.files.list(
          {
            q: `'${folderItem.id}' in parents and trashed = false`,
            fields: "nextPageToken, files(id, name, mimeType, size)",
            pageSize: 100,
            pageToken,
          },
          { signal: signal || undefined }
        );
      } catch (err) {
        if (isCancelled()) break;
        throw err;
      }

      const children = listResponse.data.files || [];
      const childFolders = children.filter((c) => c.mimeType === FOLDER_MIME_TYPE);
      const childFiles = children.filter((c) => c.mimeType !== FOLDER_MIME_TYPE);

      if (progressTracker) {
        progressTracker.addDiscoveredFiles(childFiles.length);
      }

      // Process files with bounded concurrency (CONCURRENCY_LIMIT = 2)
      const fileResults = await asyncPool(
        CONCURRENCY_LIMIT,
        childFiles,
        async (child) => {
          if (isCancelled()) return null;
          try {
            return await importSingleGoogleDriveFile({
              drive,
              driveFile: child,
              userId,
              parentDirId: newDirectoryId,
              signal,
              checkAborted,
              session,
              progressTracker,
              folderPath,
            });
          } catch (err) {
            if (isCancelled()) return null;
            console.error(`Error importing file ${child.name}:`, err.message);
            return null;
          }
        },
        isCancelled
      );

      fileResults.filter(Boolean).forEach((res) => importedFiles.push(res));

      if (isCancelled()) break;

      // Process subdirectories recursively
      for (const subFolder of childFolders) {
        if (isCancelled()) break;
        try {
          const subDirResult = await importGoogleDriveFolderRecursively({
            drive,
            folderItem: subFolder,
            userId,
            parentDirId: newDirectoryId,
            depth: depth + 1,
            maxDepth,
            signal,
            checkAborted,
            session,
            progressTracker,
            currentPath: folderPath,
          });
          if (subDirResult) {
            importedSubdirectories.push(subDirResult);
          }
        } catch (err) {
          if (isCancelled()) break;
          console.error(`Error importing subfolder ${subFolder.name}:`, err.message);
        }
      }

      pageToken = listResponse.data.nextPageToken;
    } while (pageToken && !isCancelled());

    if (isCancelled()) {
      return null;
    }

    return {
      success: true,
      directory: newDirectory,
      id: newDirectoryId.toString(),
      name: folderName,
      importedFilesCount: importedFiles.length,
      importedSubdirectoriesCount: importedSubdirectories.length,
    };
  } catch (error) {
    if (isCancelled()) {
      return null;
    }
    throw error;
  }
}

/**
 * Top-level import orchestrator handling arrays of selected files & folders.
 * Features:
 * - Real-time detailed progress reporting with root folder, subfolder path, active file, and queue metrics.
 * - Memory-bounded streaming with 64KB buffers and concurrency = 2.
 * - 100% rollback on cancel or error at any percentage.
 */
export async function importGoogleDriveBatch({
  drive,
  items,
  userId,
  targetDirId,
  signal = null,
  checkAborted = null,
  onProgress = null,
}) {
  const session = new ImportSession({ userId, signal, checkAborted });

  const rootFolderName =
    items.length === 1
      ? items[0].name || "Google Drive Import"
      : `Google Drive (${items.length} items)`;

  const initialFilesCount = items.filter((it) => it.mimeType !== FOLDER_MIME_TYPE).length;

  const tracker = new DetailedProgressTracker({
    rootFolderName,
    onProgress,
    initialTotal: initialFilesCount,
  });

  const results = {
    importedFiles: [],
    importedFolders: [],
    failedItems: [],
  };

  try {
    const folders = items.filter((it) => it.mimeType === FOLDER_MIME_TYPE);
    const files = items.filter((it) => it.mimeType !== FOLDER_MIME_TYPE);

    // Initial progress event
    tracker.emit();

    // 1. Import files concurrently (CONCURRENCY_LIMIT = 2)
    const fileResults = await asyncPool(
      CONCURRENCY_LIMIT,
      files,
      async (item) => {
        if (session.isCancelled()) return null;
        try {
          const res = await importSingleGoogleDriveFile({
            drive,
            driveFile: item,
            userId,
            parentDirId: targetDirId,
            signal,
            checkAborted,
            session,
            progressTracker: tracker,
            folderPath: "",
          });

          return { success: true, item: res };
        } catch (err) {
          if (session.isCancelled()) return null;
          console.error(`Failed to import file ${item.name || item.id}:`, err.message);
          return {
            success: false,
            failed: { id: item.id, name: item.name, error: err.message },
          };
        }
      },
      () => session.isCancelled()
    );

    for (const r of fileResults.filter(Boolean)) {
      if (r.success && r.item) {
        results.importedFiles.push(r.item);
      } else if (r.failed) {
        results.failedItems.push(r.failed);
      }
    }

    // 2. Import folders
    for (const folder of folders) {
      if (session.isCancelled()) break;
      try {
        const folderRes = await importGoogleDriveFolderRecursively({
          drive,
          folderItem: folder,
          userId,
          parentDirId: targetDirId,
          signal,
          checkAborted,
          session,
          progressTracker: tracker,
          currentPath: "",
        });
        if (folderRes) results.importedFolders.push(folderRes);
      } catch (err) {
        if (session.isCancelled()) break;
        console.error(`Failed to import folder ${folder.name || folder.id}:`, err.message);
        results.failedItems.push({
          id: folder.id,
          name: folder.name,
          error: err.message,
        });
      }
    }

    // If cancelled at ANY percentage, roll back ALL created artifacts completely
    if (session.isCancelled()) {
      await session.rollback();
      return {
        importedFiles: [],
        importedFolders: [],
        failedItems: [],
        cancelled: true,
      };
    }

    return results;
  } catch (error) {
    await session.rollback();
    throw error;
  } finally {
    if (session.isCancelled() && !session.isRolledBack) {
      await session.rollback();
    }
  }
}
