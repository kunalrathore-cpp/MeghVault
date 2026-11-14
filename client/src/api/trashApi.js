import { apiRequest } from "./client";

export const trashApi = {
  /**
   * Retrieves all directly trashed files and folders for the authenticated user
   * @returns {Promise<{ files: Array, directories: Array }>}
   */
  getTrash: async () => {
    return await apiRequest("/api/trash", {
      method: "GET",
    });
  },

  /**
   * Moves a file or directory to trash (Soft Delete)
   * @param {"file"|"directory"} resourceType
   * @param {string} resourceId
   * @returns {Promise<{ message: string, id: string }>}
   */
  moveToTrash: async (resourceType, resourceId) => {
    return await apiRequest(`/api/trash/${resourceType}/${resourceId}`, {
      method: "POST",
    });
  },

  /**
   * Restores a trashed file or directory back to its folder or root
   * @param {"file"|"directory"} resourceType
   * @param {string} resourceId
   * @returns {Promise<{ message: string, id: string }>}
   */
  restore: async (resourceType, resourceId) => {
    return await apiRequest(`/api/trash/${resourceType}/${resourceId}/restore`, {
      method: "POST",
    });
  },

  /**
   * Permanently deletes a single file or directory from trash and disk
   * @param {"file"|"directory"} resourceType
   * @param {string} resourceId
   * @returns {Promise<{ message: string }>}
   */
  permanentlyDelete: async (resourceType, resourceId) => {
    return await apiRequest(`/api/trash/${resourceType}/${resourceId}`, {
      method: "DELETE",
    });
  },

  /**
   * Permanently deletes all items in trash and purges disk storage
   * @returns {Promise<{ message: string, deletedFilesCount: number, deletedFoldersCount: number }>}
   */
  emptyTrash: async () => {
    return await apiRequest("/api/trash/empty", {
      method: "DELETE",
    });
  },
};
