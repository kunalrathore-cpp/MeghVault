import fs from "fs";
import { readdir, rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Canonical storage directory is always located in server/storage
export const CANONICAL_STORAGE_DIR = path.resolve(__dirname, "../storage");

/**
 * Returns all potential storage directory paths to guarantee file discovery
 * regardless of how or from where Node was started (e.g. root vs server folder).
 */
export function getStorageDirectories() {
  const dirs = [
    CANONICAL_STORAGE_DIR,
    path.resolve(process.cwd(), "storage"),
    path.resolve(process.cwd(), "server", "storage"),
  ];

  return Array.from(new Set(dirs));
}

/**
 * Returns the primary storage directory and ensures it exists on disk
 */
export function getStorageDirectory() {
  if (!fs.existsSync(CANONICAL_STORAGE_DIR)) {
    fs.mkdirSync(CANONICAL_STORAGE_DIR, { recursive: true });
  }
  return CANONICAL_STORAGE_DIR;
}

/**
 * Locates the exact physical file path on disk across candidate storage directories.
 * Returns the resolved string path if found, or null if missing.
 */
export function getPhysicalFilePath(fileId, extension = "") {
  if (!fileId) return null;
  const idStr = fileId.toString();
  const ext = extension?.startsWith(".") ? extension : `.${extension || ""}`;
  const dirs = getStorageDirectories();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const targetWithExt = path.join(dir, `${idStr}${ext}`);
    if (fs.existsSync(targetWithExt)) return targetWithExt;

    if (extension) {
      const rawTarget = path.join(dir, `${idStr}${extension}`);
      if (fs.existsSync(rawTarget)) return rawTarget;
    }

    const targetNoExt = path.join(dir, idStr);
    if (fs.existsSync(targetNoExt)) return targetNoExt;

    // Fallback prefix search in directory
    try {
      const diskFiles = fs.readdirSync(dir);
      const match = diskFiles.find((f) => f.startsWith(idStr));
      if (match) return path.join(dir, match);
    } catch {}
  }

  return null;
}

/**
 * Calculates physical file size on disk for a given file ID and optional extension
 */
export function getPhysicalFileSize(fileId, extension = "") {
  if (!fileId) return 0;
  try {
    const filePath = getPhysicalFilePath(fileId, extension);
    if (filePath && fs.existsSync(filePath)) {
      return fs.statSync(filePath).size;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Deletes a physical file from backend storage by its file ID,
 * checking all candidate directories and matching any file starting with fileId.
 */
export async function deletePhysicalFile(fileId, extension = "") {
  if (!fileId) return;
  const idStr = fileId.toString();
  const dirs = getStorageDirectories();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    // 1. Direct targeted deletion attempts
    const ext = extension || "";
    const cleanExt = ext.replace(/^\./, "");
    const directTargets = new Set([
      path.join(dir, `${idStr}${ext}`),
      path.join(dir, `${idStr}.${cleanExt}`),
      path.join(dir, idStr),
    ]);

    for (const targetPath of directTargets) {
      try {
        if (fs.existsSync(targetPath)) {
          await rm(targetPath, { force: true });
        }
      } catch (err) {
        console.warn(`Could not delete direct target ${targetPath}:`, err.message);
      }
    }

    // 2. Directory scan: remove any file starting with this ObjectId
    try {
      const diskFiles = await readdir(dir);
      for (const diskFile of diskFiles) {
        if (diskFile.startsWith(idStr)) {
          const filePath = path.join(dir, diskFile);
          try {
            await rm(filePath, { force: true });
          } catch (err) {
            console.warn(`Failed deleting disk file ${filePath}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn(`Error reading directory ${dir}:`, err.message);
    }
  }
}
