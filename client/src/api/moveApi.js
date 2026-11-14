import { apiRequest } from "./client";

/**
 * Move API Service
 */
export const moveApi = {
  /**
   * Move a single item (file or directory) to a destination directory
   * @param {"file"|"directory"} itemType
   * @param {string} itemId
   * @param {string|null} targetDirId - Destination directory ID (null or "root" for My Drive)
   * @param {"conflict"|"rename"} conflictResolution
   */
  async moveItem(itemType, itemId, targetDirId = null, conflictResolution = "conflict") {
    return apiRequest("/api/items/move", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemType,
        itemId,
        targetDirId: targetDirId || null,
        conflictResolution,
      }),
    });
  },

  /**
   * Move multiple items (files and directories) in a single batch
   * @param {Array<{ itemId: string, itemType: "file"|"directory" }>} items
   * @param {string|null} targetDirId - Destination directory ID
   * @param {"rename"|"conflict"} conflictResolution
   */
  async bulkMoveItems(items, targetDirId = null, conflictResolution = "rename") {
    return apiRequest("/api/items/bulk-move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        targetDirId: targetDirId || null,
        conflictResolution,
      }),
    });
  },

  /**
   * Fetch folder hierarchy tree for destination folder picker
   * @param {string|string[]} [excludeDirIds] - ID(s) of folder(s) being moved to prevent circular loops
   */
  async getFolderTree(excludeDirIds = null) {
    let qs = "";
    if (excludeDirIds) {
      const idsStr = Array.isArray(excludeDirIds) ? excludeDirIds.join(",") : excludeDirIds;
      qs = `?excludeDirIds=${encodeURIComponent(idsStr)}`;
    }
    return apiRequest(`/api/items/folder-tree${qs}`, {
      method: "GET",
    });
  },
};
