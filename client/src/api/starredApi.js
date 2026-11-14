import { apiRequest } from "./client";

export const starredApi = {
  /**
   * Toggles the starred status of a file or directory
   * @param {"file"|"directory"} resourceType
   * @param {string} resourceId
   * @returns {Promise<{ isStarred: boolean, resourceId: string, message: string }>}
   */
  toggleStar: async (resourceType, resourceId) => {
    return await apiRequest("/api/starred/toggle", {
      method: "POST",
      body: JSON.stringify({ resourceType, resourceId }),
    });
  },

  /**
   * Retrieves all starred files and directories for the authenticated user
   * @returns {Promise<{ files: Array, directories: Array }>}
   */
  getStarred: async () => {
    return await apiRequest("/api/starred", {
      method: "GET",
    });
  },

  /**
   * Retrieves all starred IDs for fast UI badge and button sync
   * @returns {Promise<{ starredIds: string[] }>}
   */
  getStarredIds: async () => {
    return await apiRequest("/api/starred/ids", {
      method: "GET",
    });
  },
};
