import Directory from "../models/directory.model.js";

/**
 * Builds canonical breadcrumb trail for a directory up to the user's root or top ancestor.
 * @param {string|import("mongoose").Types.ObjectId} dirId - Directory ID
 * @param {string|import("mongoose").Types.ObjectId} [rootDirId] - Current user's rootDirId
 * @returns {Promise<Array<{ id: string|null, name: string }>>}
 */
export async function buildDirectoryBreadcrumbs(dirId, rootDirId = null) {
  if (!dirId) {
    return [{ id: null, name: "My Drive" }];
  }

  const dirIdStr = dirId.toString();
  const rootDirIdStr = rootDirId ? rootDirId.toString() : null;

  if (rootDirIdStr && dirIdStr === rootDirIdStr) {
    return [{ id: null, name: "My Drive" }];
  }

  const trail = [];
  let currId = dirId;
  const visited = new Set();
  let guard = 0;

  while (currId && guard < 30) {
    const currStr = currId.toString();
    if (visited.has(currStr)) break;
    visited.add(currStr);

    if (rootDirIdStr && currStr === rootDirIdStr) {
      break;
    }

    const doc = await Directory.findById(currId)
      .select("_id name parentDirId")
      .lean();

    if (!doc) break;

    // If it's a root directory document (parentDirId is null or root- prefix)
    if (!doc.parentDirId || (doc.name && doc.name.startsWith("root-"))) {
      break;
    }

    trail.unshift({
      id: doc._id.toString(),
      name: doc.name || "Folder",
    });

    currId = doc.parentDirId;
    guard++;
  }

  trail.unshift({ id: null, name: "My Drive" });
  return trail;
}
