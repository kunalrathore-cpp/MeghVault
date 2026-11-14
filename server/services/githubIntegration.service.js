import fs from "fs";
import { unlink, rm } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import mongoose from "mongoose";
import unzipper from "unzipper";
import User from "../models/user.model.js";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { getStorageDirectory, deletePhysicalFile } from "../utils/storagePath.js";
import { deleteDirectoryRecursively } from "../utils/deleteDirectoryRecursively.js";
import { DetailedProgressTracker, ImportSession } from "./googleDriveImport.service.js";
import { logActivity } from "../utils/logActivity.js";

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

const GITHUB_API_URL = "https://api.github.com";

/**
 * Fetch and validate GitHub credentials for a user
 * @param {string|mongoose.Types.ObjectId} userId
 */
export async function getGithubCredentials(userId) {
  const user = await User.findById(userId).select("integrations.github email").lean();
  if (!user || !user.integrations?.github?.connected || !user.integrations?.github?.accessToken) {
    const error = new Error("GitHub account is not connected. Please connect your GitHub account.");
    error.status = 401;
    throw error;
  }
  return {
    accessToken: user.integrations.github.accessToken,
    username: user.integrations.github.username,
    email: user.integrations.github.email,
    avatar: user.integrations.github.avatar,
  };
}

/**
 * Disconnect GitHub integration for a user
 * @param {string|mongoose.Types.ObjectId} userId
 */
export async function disconnectGithub(userId) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      "integrations.github": {
        connected: false,
        accessToken: null,
        username: null,
        email: null,
        avatar: null,
        connectedAt: null,
      },
    },
  });
  return { success: true, message: "GitHub disconnected successfully" };
}

/**
 * List repositories accessible to the user
 * Supports search query and filtering (all, public, private, forks, sources)
 */
export async function listUserRepositories(accessToken, { page = 1, perPage = 100, type = "all", search = "" } = {}) {
  const queryParams = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    sort: "updated",
    direction: "desc",
    affiliation: "owner,collaborator",
  });

  const res = await fetch(`${GITHUB_API_URL}/user/repos?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "MeghVault-App",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list GitHub repositories (${res.status}): ${errorText}`);
  }

  const rawRepos = await res.json();
  if (!Array.isArray(rawRepos)) {
    return { repos: [], total: 0 };
  }

  let filtered = rawRepos;

  // Filter by type
  if (type === "public") {
    filtered = filtered.filter((r) => !r.private);
  } else if (type === "private") {
    filtered = filtered.filter((r) => r.private);
  } else if (type === "forks") {
    filtered = filtered.filter((r) => r.fork);
  } else if (type === "sources") {
    filtered = filtered.filter((r) => !r.fork);
  }

  // Filter by search term
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }

  const mapped = filtered.map((repo) => ({
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login || "",
    isPrivate: Boolean(repo.private),
    isFork: Boolean(repo.fork),
    description: repo.description || "",
    defaultBranch: repo.default_branch || "main",
    language: repo.language || null,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    sizeKb: repo.size || 0,
    updatedAt: repo.updated_at,
    htmlUrl: repo.html_url,
  }));

  return { repos: mapped, total: mapped.length };
}

/**
 * List branches for a specific repository
 */
export async function listRepoBranches(accessToken, owner, repo) {
  const res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "MeghVault-App",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list branches for ${owner}/${repo} (${res.status}): ${errorText}`);
  }

  const branches = await res.json();
  if (!Array.isArray(branches)) {
    return [];
  }

  return branches.map((b) => ({
    name: b.name,
    commitSha: b.commit?.sha || null,
  }));
}

/**
 * Sanitize directory name to prevent collisions or invalid file system characters
 */
function sanitizeName(name) {
  return (name || "untitled").replace(/[/\\?%*:|"<>]/g, "_").trim();
}

/**
 * Ensure a directory name is unique in parent directory
 */
async function getUniqueDirectoryName(userId, parentDirId, baseName) {
  let finalName = baseName;
  let counter = 1;

  while (await Directory.findOne({ userId, parentDirId, name: finalName }).lean()) {
    finalName = `${baseName} (${counter})`;
    counter++;
  }

  return finalName;
}

/**
 * Ensure a file name is unique in parent directory
 */
async function getUniqueFileName(userId, parentDirId, baseName, extension) {
  let finalName = extension ? `${baseName}.${extension}` : baseName;
  let counter = 1;

  while (await File.findOne({ userId, parentDirId, name: finalName }).lean()) {
    finalName = extension ? `${baseName} (${counter}).${extension}` : `${baseName} (${counter})`;
    counter++;
  }

  return finalName;
}

/**
 * Import GitHub repositories with real-time NDJSON streaming, backpressure, and atomic rollback
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} options.userId - MeghVault user ID
 * @param {string|mongoose.Types.ObjectId} [options.targetDirId] - Destination directory ID
 * @param {Array<{ id: string, name: string, owner: string, branch?: string, format?: "folder"|"zip" }>} options.repos
 * @param {string} [options.globalFormat] - "folder" | "zip"
 * @param {Function} [options.onProgress] - NDJSON progress callback
 * @param {AbortSignal} [options.signal] - Cancellation signal
 * @param {Function} [options.checkAborted] - Connection drop check
 */
export async function importGithubRepositories({
  userId,
  targetDirId = null,
  repos = [],
  globalFormat = "folder",
  onProgress = null,
  signal = null,
  checkAborted = null,
}) {
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error("No repositories specified for import.");
  }

  // 1. Resolve user and target root directory
  const user = await User.findById(userId).select("rootDirId integrations.github").lean();
  if (!user) throw new Error("User not found.");

  const destinationDirId = targetDirId || user.rootDirId;
  const targetDir = await Directory.findOne({ _id: destinationDirId, userId }).lean();
  if (!targetDir) throw new Error("Destination directory not found.");

  const { accessToken } = await getGithubCredentials(userId);

  // 2. Initialize tracking and session management
  const tracker = new DetailedProgressTracker({
    rootFolderName: repos.length === 1 ? repos[0].name : "GitHub Repositories",
    onProgress,
    initialTotal: repos.length,
  });

  const session = new ImportSession({
    userId,
    signal,
    checkAborted,
  });

  const storageDir = getStorageDirectory();
  const importedResults = [];
  const failedItems = [];
  const pipelineOpts = signal ? [{ signal }] : [];

  try {
    for (const repoItem of repos) {
      if (session.isCancelled()) {
        break;
      }

      const repoOwner =
        (typeof repoItem.owner === "object" ? repoItem.owner?.login : repoItem.owner) ||
        (repoItem.fullName ? repoItem.fullName.split("/")[0] : "");
      const repoName = sanitizeName(repoItem.name);
      const branch = repoItem.branch || repoItem.defaultBranch || "main";
      const format = repoItem.format || globalFormat || "folder";

      let currentRepoRootDirId = null;
      let currentRepoFileId = null;

      tracker.setFolder(repoName, repoName);

      try {
        if (format === "zip") {
          // ==========================================
          // FORMAT A: Download as a single .ZIP Archive
          // ==========================================
          const zipFileNameBase = `${repoName}-${branch}`;
          const uniqueFileName = await getUniqueFileName(userId, destinationDirId, zipFileNameBase, "zip");
          const fileId = new mongoose.Types.ObjectId();
          currentRepoFileId = fileId;
          const physicalPath = path.join(storageDir, `${fileId}.zip`);

          tracker.startFile({
            fileId: String(fileId),
            name: uniqueFileName,
            mimeType: "application/zip",
            folderPath: repoName,
          });

          // Fetch archive stream from GitHub (handles 302 redirect automatically)
          const downloadUrl = `${GITHUB_API_URL}/repos/${repoOwner}/${repoName}/zipball/${encodeURIComponent(branch)}`;
          const archiveRes = await fetch(downloadUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "MeghVault-App",
            },
            signal,
          });

          if (!archiveRes.ok) {
            const errText = await archiveRes.text();
            throw new Error(`GitHub archive request failed (${archiveRes.status}): ${errText}`);
          }

          if (!archiveRes.body) throw new Error("Empty response body from GitHub.");

          const writeStream = fs.createWriteStream(physicalPath, { highWaterMark: 64 * 1024 });
          session.registerFile({ id: fileId, extension: "zip", filePath: physicalPath, writeStream });

          const nodeStream = Readable.fromWeb(archiveRes.body);
          try {
            await pipeline(nodeStream, writeStream, ...pipelineOpts);
          } finally {
            session.unregisterStream(writeStream);
          }

          if (session.isCancelled()) {
            await deletePhysicalFile(fileId, "zip");
            break;
          }

          const downloadedBytes = fs.statSync(physicalPath).size;

          // Atomic MongoDB record creation
          const createdFile = await File.create({
            _id: fileId,
            name: uniqueFileName,
            extension: "zip",
            parentDirId: destinationDirId,
            userId,
            source: "github",
          });

          logActivity({
            userId,
            resourceType: "file",
            resourceId: createdFile._id,
            action: "import",
            details: {
              name: uniqueFileName,
              extension: "zip",
              source: "github",
            },
          });

          tracker.finishFile({
            fileId: String(fileId),
            name: uniqueFileName,
            size: downloadedBytes,
            folderPath: repoName,
            success: true,
          });

          importedResults.push({
            id: repoItem.id,
            name: uniqueFileName,
            type: "file",
            fileId: createdFile._id,
          });
        } else {
          // ==========================================
          // FORMAT B: Extract as Full Project Folder
          // ==========================================
          const tempFileId = new mongoose.Types.ObjectId();
          const tempZipPath = path.join(storageDir, `${tempFileId}.tmp.zip`);
          let tempWriteStream = null;
          let rootDir = null;
          let uniqueRootName = repoName;
          let fileCount = 0;

          try {
            // 1. Fetch archive stream from GitHub
            const downloadUrl = `${GITHUB_API_URL}/repos/${repoOwner}/${repoName}/zipball/${encodeURIComponent(branch)}`;
            const archiveRes = await fetch(downloadUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "MeghVault-App",
              },
              signal,
            });

            if (!archiveRes.ok) {
              const errText = await archiveRes.text();
              throw new Error(`GitHub archive request failed (${archiveRes.status}): ${errText}`);
            }

            if (!archiveRes.body) throw new Error("Empty response body from GitHub.");

            // 2. Stream download zip to temp file on disk (handles backpressure and abort)
            tempWriteStream = fs.createWriteStream(tempZipPath, { highWaterMark: 64 * 1024 });
            session.registerFile({ id: tempFileId, extension: "tmp.zip", filePath: tempZipPath, writeStream: tempWriteStream });

            try {
              await pipeline(Readable.fromWeb(archiveRes.body), tempWriteStream, ...pipelineOpts);
            } finally {
              session.unregisterStream(tempWriteStream);
            }

            if (session.isCancelled()) {
              break;
            }

            // 3. Open archive central directory using unzipper.Open.file
            const archive = await unzipper.Open.file(tempZipPath);
            const contentFiles = archive.files.filter((f) => f.type === "File");

            // Update tracker with actual discovered file count
            if (contentFiles.length > 0) {
              tracker.addDiscoveredFiles(contentFiles.length);
            }

            // 4. Create root folder in MeghVault
            uniqueRootName = await getUniqueDirectoryName(userId, destinationDirId, repoName);
            rootDir = await Directory.create({
              name: uniqueRootName,
              parentDirId: destinationDirId,
              userId,
              source: "github",
            });
            currentRepoRootDirId = rootDir._id;
            session.registerDirectory(rootDir._id);

            logActivity({
              userId,
              resourceType: "directory",
              resourceId: rootDir._id,
              action: "import",
              details: {
                name: uniqueRootName,
                source: "github",
              },
            });

            // Map for subdirectories: relativePath -> Directory ObjectId
            const directoryMap = new Map();
            directoryMap.set("", rootDir._id);

            // Helper to get or recursively create directory hierarchy
            const ensureDirectoryHierarchy = async (relativeDirPath) => {
              const cleanPath = relativeDirPath.replace(/^\/+|\/+$/g, "");
              if (!cleanPath || directoryMap.has(cleanPath)) {
                return directoryMap.get(cleanPath) || rootDir._id;
              }
              if (session.isCancelled()) return rootDir._id;

              const segments = cleanPath.split("/").filter(Boolean);
              let currentPath = "";
              let currentParentId = rootDir._id;

              for (const segment of segments) {
                if (session.isCancelled()) return currentParentId;
                const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
                if (directoryMap.has(nextPath)) {
                  currentParentId = directoryMap.get(nextPath);
                } else {
                  const subDir = await Directory.create({
                    name: segment,
                    parentDirId: currentParentId,
                    userId,
                    source: "github",
                  });
                  session.registerDirectory(subDir._id);
                  directoryMap.set(nextPath, subDir._id);
                  currentParentId = subDir._id;
                }
                currentPath = nextPath;
              }

              return currentParentId;
            };

            // 5. Extract all files and directories
            for (const file of archive.files) {
              if (session.isCancelled()) {
                break;
              }

              const rawPath = file.path;
              // GitHub zipballs prefix all entries with "{owner}-{repo}-{commitSha}/"
              const segments = rawPath.split("/").filter(Boolean);
              if (segments.length <= 1) {
                // Root archive directory
                continue;
              }

              // Strip the top-level repo commit prefix
              const relativePath = segments.slice(1).join("/");

              // Zip-Slip Security Protection: Reject directory traversal sequences
              const normalized = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, "");
              if (normalized.includes("..") || path.isAbsolute(normalized)) {
                console.warn(`[Zip-Slip Prevented] Skipped unsafe entry: ${rawPath}`);
                continue;
              }

              if (file.type === "Directory") {
                await ensureDirectoryHierarchy(relativePath);
              } else {
                // It's a file
                const dirPart = path.dirname(relativePath).replace(/\\/g, "/");
                const cleanDirPart = dirPart === "." ? "" : dirPart;
                const fileName = path.basename(relativePath);
                const extname = path.extname(fileName).replace(/^\./, "").toLowerCase();

                const parentFolderId = await ensureDirectoryHierarchy(cleanDirPart);
                if (session.isCancelled()) break;

                const fileId = new mongoose.Types.ObjectId();
                const fullDiskFileName = extname ? `${fileId}.${extname}` : String(fileId);
                const physicalPath = path.join(storageDir, fullDiskFileName);

                tracker.startFile({
                  fileId: String(fileId),
                  name: fileName,
                  size: file.uncompressedSize || null,
                  folderPath: cleanDirPart ? `${repoName}/${cleanDirPart}` : repoName,
                });

                const writeStream = fs.createWriteStream(physicalPath, { highWaterMark: 64 * 1024 });
                const entryStream = file.stream();
                session.registerFile({ id: fileId, extension: extname, filePath: physicalPath, writeStream, readStream: entryStream });

                try {
                  await pipeline(entryStream, writeStream, ...pipelineOpts);
                } finally {
                  session.unregisterStream(writeStream, entryStream);
                }

                if (session.isCancelled()) {
                  await deletePhysicalFile(fileId, extname);
                  break;
                }

                // Ensure unique filename within the folder
                const uniqueFileName = await getUniqueFileName(
                  userId,
                  parentFolderId,
                  path.basename(fileName, path.extname(fileName)),
                  extname
                );

                await File.create({
                  _id: fileId,
                  name: uniqueFileName,
                  extension: extname,
                  parentDirId: parentFolderId,
                  userId,
                  source: "github",
                });

                fileCount++;
                tracker.finishFile({
                  fileId: String(fileId),
                  name: fileName,
                  size: file.uncompressedSize || null,
                  folderPath: cleanDirPart ? `${repoName}/${cleanDirPart}` : repoName,
                  success: true,
                });
              }
            }
          } finally {
            // Ensure tempWriteStream is completely released before unlinking
            if (tempWriteStream) {
              try {
                tempWriteStream.destroy();
              } catch {}
            }
            await unlinkWithRetry(tempZipPath).catch(() => {});
          }

          if (session.isCancelled()) {
            break;
          }

          importedResults.push({
            id: repoItem.id,
            name: uniqueRootName,
            type: "folder",
            dirId: rootDir._id,
            filesExtracted: fileCount,
          });
        }
      } catch (repoErr) {
        if (session.isCancelled() || repoErr.name === "AbortError") {
          console.warn(`[GitHub Import] Import cancelled during repo ${repoItem.name}`);
          break;
        }

        console.error(`Error importing repo ${repoItem.name}:`, repoErr);

        // Immediate rollback of any partial items created for this failed repository
        if (currentRepoRootDirId) {
          try {
            await deleteDirectoryRecursively(currentRepoRootDirId);
          } catch (e) {
            console.warn(`Failed cleaning up failed repo directory ${currentRepoRootDirId}:`, e.message);
          }
        }
        if (currentRepoFileId) {
          try {
            await deletePhysicalFile(currentRepoFileId, "zip");
            await File.deleteOne({ _id: currentRepoFileId });
          } catch (e) {
            console.warn(`Failed cleaning up failed zip file ${currentRepoFileId}:`, e.message);
          }
        }

        failedItems.push({
          id: repoItem.id,
          name: repoItem.name,
          error: repoErr.message || "Failed to import repository",
        });
        tracker.finishFile({
          fileId: repoItem.id,
          name: repoItem.name,
          success: false,
        });
      }
    }

    // If cancelled at ANY percentage, roll back ALL created artifacts completely
    if (session.isCancelled()) {
      console.warn("[GitHub Import] Import was cancelled. Rolling back session...");
      await session.rollback();
      return {
        success: false,
        cancelled: true,
        importedCount: 0,
        importedResults: [],
        failedItems: [],
      };
    }

    return {
      success: failedItems.length === 0,
      importedCount: importedResults.length,
      importedResults,
      failedItems,
    };
  } catch (err) {
    console.error("[GitHub Import] Critical failure or user abort. Rolling back...", err);
    await session.rollback();
    throw err;
  }
}
