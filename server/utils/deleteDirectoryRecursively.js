import mongoose from "mongoose";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import Starred from "../models/starred.model.js";
import Share from "../models/share.model.js";
import { deletePhysicalFile } from "./storagePath.js";

/**
 * Recursively deletes a directory, all its subdirectories, and all descendant files
 * in bulk with proper physical disk cleanup and database integrity.
 */
export const deleteDirectoryRecursively = async (directoryId) => {
  if (!directoryId) return;

  // Ensure root directory ID is cast to ObjectId
  const rootObjectId =
    directoryId instanceof mongoose.Types.ObjectId
      ? directoryId
      : new mongoose.Types.ObjectId(directoryId.toString());

  // 1. Gather all descendant directory ObjectIds
  const allDirIds = [rootObjectId];
  const queue = [rootObjectId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const subDirs = await Directory.find({ parentDirId: currentId })
      .select("_id")
      .lean();
    for (const sub of subDirs) {
      allDirIds.push(sub._id);
      queue.push(sub._id);
    }
  }

  // 2. Find ALL files across all these directories in a single query
  const allFiles = await File.find({
    parentDirId: { $in: allDirIds },
  })
    .select("_id extension")
    .lean();

  // 3. Delete physical files from disk in parallel using robust deletePhysicalFile
  await Promise.allSettled(
    allFiles.map((f) => deletePhysicalFile(f._id, f.extension))
  );

  // 4. Bulk delete all file documents from MongoDB in one query
  await File.deleteMany({ parentDirId: { $in: allDirIds } });

  // 5. Bulk delete all directory documents from MongoDB in one query
  await Directory.deleteMany({ _id: { $in: allDirIds } });

  // 6. Bulk delete all associated starred and share records
  const fileIds = allFiles.map((f) => f._id);
  await Promise.allSettled([
    Starred.deleteMany({
      $or: [
        { resourceType: "directory", resourceId: { $in: allDirIds } },
        { resourceType: "file", resourceId: { $in: fileIds } },
      ],
    }),
    Share.deleteMany({
      $or: [
        { resourceType: "directory", resourceId: { $in: allDirIds } },
        { resourceType: "file", resourceId: { $in: fileIds } },
      ],
    }),
  ]);
};
