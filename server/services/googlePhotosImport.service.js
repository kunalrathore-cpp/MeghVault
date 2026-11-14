import fs from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import mongoose from "mongoose";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { getStorageDirectory, deletePhysicalFile } from "../utils/storagePath.js";
import { logActivity } from "../utils/logActivity.js";

const CONCURRENCY_LIMIT = 4;
const STREAM_HIGH_WATER_MARK = 256 * 1024; // 256KB buffer for high-throughput, backpressure-safe streaming
const PHOTOS_BASE_API = "https://photoslibrary.googleapis.com/v1";
const PICKER_BASE_API = "https://photospicker.googleapis.com/v1";

/**
 * SSRF Security Validator:
 * Validates that download URLs strictly target authorized Google media CDN domains
 * and blocks any private network or loopback IPs.
 */
export function validateGooglePhotosDownloadUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    throw new Error("Invalid download URL: URL must be a non-empty string");
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw new Error(`Invalid download URL format: ${err.message}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Security Error: Only secure HTTPS download URLs are permitted");
  }

  const hostname = parsed.hostname.toLowerCase();

  const allowedGoogleDomain =
    hostname === "lh3.googleusercontent.com" ||
    hostname.endsWith(".googleusercontent.com") ||
    hostname.endsWith(".photos.google.com") ||
    hostname.endsWith(".googleapis.com");

  if (!allowedGoogleDomain) {
    throw new Error(
      `Security Error: Download host "${hostname}" is not an authorized Google domain.`
    );
  }

  const isPrivateOrLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  if (isPrivateOrLoopback) {
    throw new Error(
      "Security Error: Private or loopback IP addresses are strictly blocked."
    );
  }

  return true;
}

/**
 * Create a new Google Photos Picking Session
 * Returns sessionId and pickerUri for Google's native picker popup
 */
export async function createPickerSession(accessToken) {
  const res = await fetch(`${PICKER_BASE_API}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to create Google Photos picker session: ${errorBody}`);
  }

  const data = await res.json();
  return {
    sessionId: data.id,
    pickerUri: `${data.pickerUri}/autoclose`,
    mediaItemsSet: Boolean(data.mediaItemsSet),
    expireTime: data.expireTime,
    pollingConfig: data.pollingConfig,
  };
}

/**
 * Check picking session status
 */
export async function getPickerSession(accessToken, sessionId) {
  const sessionPath = sessionId.startsWith("sessions/") ? sessionId : `sessions/${sessionId}`;
  const res = await fetch(`${PICKER_BASE_API}/${sessionPath}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to get Google Photos picker session: ${errorBody}`);
  }

  return await res.json();
}

/**
 * List media items chosen by the user in a picking session
 */
export async function listPickerSessionMediaItems(accessToken, sessionId, pageToken = null) {
  const rawId = sessionId.replace(/^sessions\//, "");
  const url = new URL(`${PICKER_BASE_API}/mediaItems`);
  url.searchParams.set("sessionId", rawId);
  url.searchParams.set("pageSize", "100");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to list picked Google Photos items: ${errorBody}`);
  }

  const data = await res.json();
  return {
    mediaItems: data.mediaItems || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Delete a picking session after media retrieval is complete
 */
export async function deletePickerSession(accessToken, sessionId) {
  try {
    const sessionPath = sessionId.startsWith("sessions/") ? sessionId : `sessions/${sessionId}`;
    await fetch(`${PICKER_BASE_API}/${sessionPath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    console.warn(`Could not delete picker session ${sessionId}:`, err.message);
  }
}

/**
 * Fetch list of albums from Google Photos
 */
export async function listPhotosAlbums(accessToken, pageToken = null) {
  const url = new URL(`${PHOTOS_BASE_API}/albums`);
  url.searchParams.set("pageSize", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to list Google Photos albums: ${errorBody}`);
  }

  const data = await res.json();
  return {
    albums: data.albums || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Fetch media items (photos & videos) from Google Photos Library or an Album
 */
export async function listPhotosMediaItems(accessToken, { albumId = null, pageToken = null, pageSize = 100 } = {}) {
  let url;
  let options;

  if (albumId) {
    url = `${PHOTOS_BASE_API}/mediaItems:search`;
    options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        albumId,
        pageSize,
        pageToken: pageToken || undefined,
      }),
    };
  } else {
    const u = new URL(`${PHOTOS_BASE_API}/mediaItems`);
    u.searchParams.set("pageSize", String(pageSize));
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    url = u.toString();
    options = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to list Google Photos items: ${errorBody}`);
  }

  const data = await res.json();
  return {
    mediaItems: data.mediaItems || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Detailed Progress Tracker for Google Photos
 */
export class DetailedPhotosProgressTracker {
  constructor({ rootFolderName = "Google Photos", onProgress = null, initialTotal = 0 }) {
    this.rootFolderName = rootFolderName;
    this.currentFolder = rootFolderName;
    this.currentFolderPath = rootFolderName;
    this.onProgress = onProgress;
    this.totalFiles = initialTotal;
    this.completedCount = 0;
    this.failedCount = 0;
    this.activeFiles = new Map();
    this.recentCompleted = [];
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

/**
 * Transactional Import Session tracker for Google Photos
 */
export class PhotosImportSession {
  constructor({ userId, signal = null, checkAborted = null }) {
    this.userId = userId;
    this.signal = signal;
    this.checkAborted = checkAborted;
    this.createdDirectoryIds = new Set();
    this.createdFiles = [];
    this.activeWriteStreams = new Set();
    this.activeFetchControllers = new Set();
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

  registerFile({ id, extension, filePath, writeStream, fetchController }) {
    this.createdFiles.push({ id, extension, filePath });
    if (writeStream) this.activeWriteStreams.add(writeStream);
    if (fetchController) this.activeFetchControllers.add(fetchController);
  }

  unregisterStream(writeStream, fetchController) {
    if (writeStream) this.activeWriteStreams.delete(writeStream);
    if (fetchController) this.activeFetchControllers.delete(fetchController);
  }

  async rollback() {
    if (this._rollbackPromise) return this._rollbackPromise;
    if (this.isRolledBack) return;

    this._rollbackPromise = this._doRollback();
    return this._rollbackPromise;
  }

  async _doRollback() {
    this.isRolledBack = true;

    console.warn("[PhotosImportSession] Rolling back Google Photos import...");

    // 1. Immediately abort active network fetches and file writes
    for (const ctrl of this.activeFetchControllers) {
      try { ctrl.abort(); } catch {}
    }
    this.activeFetchControllers.clear();

    for (const ws of this.activeWriteStreams) {
      try { ws.destroy(); } catch {}
    }
    this.activeWriteStreams.clear();

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 80));

    // 2. Unlink all physical files written to disk
    const fileIdsToDelete = [];
    for (const file of this.createdFiles) {
      fileIdsToDelete.push(file.id);
      try {
        if (file.filePath && fs.existsSync(file.filePath)) {
          await unlink(file.filePath);
        } else {
          await deletePhysicalFile(file.id, file.extension);
        }
      } catch {
        try {
          await deletePhysicalFile(file.id, file.extension);
        } catch (err) {
          console.warn(`[PhotosImportSession] Failed deleting file ${file.id} on disk:`, err.message);
        }
      }
    }

    // 3. Purge File documents from MongoDB
    if (fileIdsToDelete.length > 0) {
      try {
        await File.deleteMany({ _id: { $in: fileIdsToDelete } });
      } catch (err) {
        console.warn("[PhotosImportSession] Error deleting File records from MongoDB:", err.message);
      }
    }

    // 4. Purge Directory documents from MongoDB
    const dirIds = Array.from(this.createdDirectoryIds);
    if (dirIds.length > 0) {
      try {
        const dirObjectIds = dirIds.map((id) => new mongoose.Types.ObjectId(id));
        const orphanFiles = await File.find({
          parentDirId: { $in: dirObjectIds },
        }).select("_id extension").lean();

        await Promise.allSettled(
          orphanFiles.map((f) => deletePhysicalFile(f._id, f.extension))
        );

        if (orphanFiles.length > 0) {
          await File.deleteMany({ parentDirId: { $in: dirObjectIds } });
        }

        await Directory.deleteMany({ _id: { $in: dirObjectIds } });
      } catch (err) {
        console.warn("[PhotosImportSession] Error deleting Directory records from MongoDB:", err.message);
      }
    }

    console.warn(`[PhotosImportSession] Rollback complete. Cleaned ${fileIdsToDelete.length} files and ${dirIds.length} directories.`);
  }
}

/**
 * Concurrency runner for Google Photos tasks
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
 * Resolve filename and extension for a Google Photos media item
 * Supports both legacy Library API items and modern Picker API items
 * Applies path traversal protection, forbidden character sanitization, and length limits.
 */
export function resolvePhotosMediaNameAndExt(mediaItem) {
  const mf = mediaItem.mediaFile || mediaItem;
  let rawName = (mf.filename || mediaItem.filename || mediaItem.name || "Photo").trim();

  // 1. Sanitize filename against path traversal & dangerous characters
  let cleanName = rawName
    .replace(/\0/g, "")
    .replace(/\.\.+[/\\]/g, "")
    .replace(/^[/\\]+/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();

  let extension = path.extname(cleanName).toLowerCase();
  let baseName = path.basename(cleanName, extension).trim();

  if (!baseName) {
    baseName = `Photo_${Date.now()}`;
  }

  // Prevent filesystem filename buffer overflow
  if (baseName.length > 180) {
    baseName = baseName.substring(0, 180);
  }

  const mimeType = mf.mimeType || mediaItem.mimeType || "";
  const isVideo = Boolean(
    mediaItem.mediaMetadata?.video ||
    mediaItem.type === "VIDEO" ||
    mf.mediaFileMetadata?.video ||
    mimeType.startsWith("video/")
  );

  const ALLOWED_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif",
    ".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv",
  ]);

  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    if (isVideo) {
      extension = ".mp4";
    } else if (mimeType === "image/png") {
      extension = ".png";
    } else if (mimeType === "image/gif") {
      extension = ".gif";
    } else if (mimeType === "image/webp") {
      extension = ".webp";
    } else if (mimeType === "image/heic") {
      extension = ".heic";
    } else {
      extension = ".jpg";
    }
  }

  const fileName = `${baseName}${extension}`;
  return { fileName, extension, isVideo };
}

/**
 * Import a single Google Photos media item (photo or video) with memory-bounded streaming
 */
export async function importSingleGooglePhotosItem({
  accessToken = null,
  mediaItem,
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

  const fileId = mediaItem.id;
  const { fileName, extension, isVideo } = resolvePhotosMediaNameAndExt(mediaItem);

  // Derive download URL:
  // Photos: =d downloads the original full resolution photo
  // Videos: =dv downloads the original video stream
  const rawBaseUrl = mediaItem.baseUrl || mediaItem.mediaFile?.baseUrl || "";
  let cleanBaseUrl = rawBaseUrl;
  if (cleanBaseUrl.includes("=")) {
    cleanBaseUrl = cleanBaseUrl.replace(/=[^/=]*$/, "");
  }
  const downloadUrl = isVideo ? `${cleanBaseUrl}=dv` : `${cleanBaseUrl}=d`;

  // SSRF Protection: Validate target download URL against authorized Google domains
  validateGooglePhotosDownloadUrl(downloadUrl);

  if (progressTracker) {
    progressTracker.startFile({
      fileId,
      name: fileName,
      size: null,
      mimeType: mediaItem.mimeType || mediaItem.mediaFile?.mimeType,
      folderPath,
    });
  }

  const storageDir = getStorageDirectory();
  await mkdir(storageDir, { recursive: true });

  const mongoFileId = new mongoose.Types.ObjectId();
  const physicalFileName = `${mongoFileId}${extension}`;
  const localFilePath = path.join(storageDir, physicalFileName);

  const fetchController = new AbortController();
  const writeStream = fs.createWriteStream(localFilePath, {
    highWaterMark: STREAM_HIGH_WATER_MARK,
  });

  session?.registerFile({
    id: mongoFileId,
    extension,
    filePath: localFilePath,
    writeStream,
    fetchController,
  });

  const abortCombined = () => {
    fetchController.abort();
    writeStream.destroy();
  };

  if (signal) {
    signal.addEventListener("abort", abortCombined, { once: true });
  }

  try {
    const headers = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    console.log(`[GooglePhotosImport] Streaming download for "${fileName}" from: ${downloadUrl}`);

    let response = await fetch(downloadUrl, {
      headers,
      signal: fetchController.signal,
    });

    // If Bearer auth fails (some Google LH3 URLs are signed and reject Authorization header)
    if (!response.ok && (response.status === 400 || response.status === 401 || response.status === 403)) {
      console.warn(
        `[GooglePhotosImport] Download with Bearer token failed (${response.status}). Retrying without Authorization header...`
      );
      response = await fetch(downloadUrl, {
        signal: fetchController.signal,
      });
    }

    if (!response.ok) {
      throw new Error(`Google Photos download failed with HTTP status ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body received from Google Photos");
    }

    // Stream directly from response to disk
    await pipeline(response.body, writeStream);

    session?.unregisterStream(writeStream, fetchController);

    if (isCancelled()) {
      try { writeStream.destroy(); } catch {}
      await new Promise((r) => setImmediate(r));
      try { await unlink(localFilePath); } catch {}
      progressTracker?.finishFile({ fileId, name: fileName, folderPath, success: false });
      return null;
    }

    // Execute database insert within an atomic MongoDB transaction
    let mongoSession = null;
    try {
      mongoSession = await mongoose.startSession();
      mongoSession.startTransaction();
    } catch {
      mongoSession = null;
    }

    try {
      const [newFile] = await File.create(
        [
          {
            _id: mongoFileId,
            name: fileName,
            extension: extension || "",
            userId,
            parentDirId,
            source: "google-photos",
          },
        ],
        mongoSession ? { session: mongoSession } : {}
      );

      if (isCancelled()) {
        if (mongoSession) {
          try {
            await mongoSession.abortTransaction();
          } catch {}
        }
        try { await unlink(localFilePath); } catch {}
        await deletePhysicalFile(mongoFileId, extension);
        progressTracker?.finishFile({ fileId, name: fileName, folderPath, success: false });
        return null;
      }

      // Commit MongoDB transaction atomically
      if (mongoSession) {
        await mongoSession.commitTransaction();
      }

      progressTracker?.finishFile({
        fileId,
        name: fileName,
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
          source: "google-photos",
        },
      });

      return {
        success: true,
        file: newFile,
        id: mongoFileId.toString(),
        name: fileName,
      };
    } catch (dbError) {
      if (mongoSession) {
        try {
          await mongoSession.abortTransaction();
        } catch {}
      }
      throw dbError;
    } finally {
      if (mongoSession) {
        try {
          await mongoSession.endSession();
        } catch {}
      }
    }
  } catch (error) {
    session?.unregisterStream(writeStream, fetchController);
    try { writeStream.destroy(); } catch {}

    await new Promise((r) => setImmediate(r));
    try {
      await unlink(localFilePath);
    } catch {
      try { await deletePhysicalFile(mongoFileId, extension); } catch {}
    }

    progressTracker?.finishFile({ fileId, name: fileName, folderPath, success: false });

    if (isCancelled() || error.name === "AbortError") {
      return null;
    }

    throw error;
  }
}

/**
 * Import an entire Google Photos Album into a newly created MeghVault directory
 */
export async function importGooglePhotosAlbum({
  accessToken,
  albumItem,
  userId,
  parentDirId,
  signal = null,
  checkAborted = null,
  session = null,
  progressTracker = null,
}) {
  const isCancelled = () => Boolean(
    session?.isCancelled() || signal?.aborted || checkAborted?.()
  );

  if (isCancelled()) {
    return null;
  }

  const albumTitle = albumItem.title || "Google Photos Album";
  const newDirectoryId = new mongoose.Types.ObjectId();

  // Create directory in MongoDB
  const newDirectory = await Directory.create({
    _id: newDirectoryId,
    name: albumTitle,
    userId,
    parentDirId,
    source: "google-photos",
  });

  logActivity({
    userId,
    resourceType: "directory",
    resourceId: newDirectoryId,
    action: "import",
    details: {
      name: albumTitle,
      source: "google-photos",
    },
  });

  session?.registerDirectory(newDirectoryId);
  progressTracker?.setFolder(albumTitle, albumTitle);

  try {
    const importedFiles = [];
    let pageToken = null;

    do {
      if (isCancelled()) break;

      const res = await listPhotosMediaItems(accessToken, {
        albumId: albumItem.id,
        pageToken,
        pageSize: 100,
      });

      const mediaItems = res.mediaItems || [];
      if (progressTracker) {
        progressTracker.addDiscoveredFiles(mediaItems.length);
      }

      const fileResults = await asyncPool(
        CONCURRENCY_LIMIT,
        mediaItems,
        async (item) => {
          if (isCancelled()) return null;
          try {
            return await importSingleGooglePhotosItem({
              accessToken,
              mediaItem: item,
              userId,
              parentDirId: newDirectoryId,
              signal,
              checkAborted,
              session,
              progressTracker,
              folderPath: albumTitle,
            });
          } catch (err) {
            if (isCancelled()) return null;
            console.error(`Error importing photo ${item.filename || item.id}:`, err.message);
            return null;
          }
        },
        isCancelled
      );

      fileResults.filter(Boolean).forEach((r) => importedFiles.push(r));
      pageToken = res.nextPageToken;
    } while (pageToken && !isCancelled());

    if (isCancelled()) {
      return null;
    }

    return {
      success: true,
      directory: newDirectory,
      id: newDirectoryId.toString(),
      name: albumTitle,
      importedFilesCount: importedFiles.length,
    };
  } catch (error) {
    if (isCancelled()) {
      return null;
    }
    throw error;
  }
}

/**
 * Top-level import orchestrator for Google Photos items & albums
 */
export async function importGooglePhotosBatch({
  accessToken,
  items,
  userId,
  targetDirId,
  signal = null,
  checkAborted = null,
  onProgress = null,
}) {
  const session = new PhotosImportSession({ userId, signal, checkAborted });

  const rootFolderName =
    items.length === 1
      ? items[0].title || items[0].filename || "Google Photos Import"
      : `Google Photos (${items.length} items)`;

  const initialItemsCount = items.filter((it) => !it.isAlbum && it.type !== "album").length;

  const tracker = new DetailedPhotosProgressTracker({
    rootFolderName,
    onProgress,
    initialTotal: initialItemsCount,
  });

  const results = {
    importedFiles: [],
    importedFolders: [],
    failedItems: [],
  };

  try {
    const albums = items.filter((it) => it.isAlbum || it.type === "album");
    const mediaItems = items.filter((it) => !it.isAlbum && it.type !== "album");

    tracker.emit();

    // 1. Import individual media items concurrently
    const fileResults = await asyncPool(
      CONCURRENCY_LIMIT,
      mediaItems,
      async (item) => {
        if (session.isCancelled()) return null;
        try {
          const res = await importSingleGooglePhotosItem({
            accessToken,
            mediaItem: item,
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
          console.error(`Failed to import Google Photo ${item.filename || item.id}:`, err.message);
          return {
            success: false,
            failed: { id: item.id, name: item.filename, error: err.message },
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

    // 2. Import albums
    for (const album of albums) {
      if (session.isCancelled()) break;
      try {
        const albumRes = await importGooglePhotosAlbum({
          accessToken,
          albumItem: album,
          userId,
          parentDirId: targetDirId,
          signal,
          checkAborted,
          session,
          progressTracker: tracker,
        });
        if (albumRes) results.importedFolders.push(albumRes);
      } catch (err) {
        if (session.isCancelled()) break;
        console.error(`Failed to import album ${album.title || album.id}:`, err.message);
        results.failedItems.push({
          id: album.id,
          name: album.title,
          error: err.message,
        });
      }
    }

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
