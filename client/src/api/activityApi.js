import { apiRequest } from "./client";

export const activityApi = {
  /**
   * Retrieves chronological recent activities for the authenticated user
   * @param {number} [page=1]
   * @param {number} [limit=50]
   * @returns {Promise<{ activities: Array, totalCount: number, page: number, limit: number }>}
   */
  getRecent: async (page = 1, limit = 50) => {
    return await apiRequest(`/api/recent?page=${page}&limit=${limit}`, {
      method: "GET",
    });
  },

  /**
   * Clears all recent activity history for the current user
   * @returns {Promise<{ message: string, deletedCount: number }>}
   */
  clearAll: async () => {
    return await apiRequest("/api/recent/clear", {
      method: "DELETE",
    });
  },
};
