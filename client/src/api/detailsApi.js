import { apiRequest } from "./client";

export const detailsApi = {
  /**
   * Retrieves comprehensive metadata, path, storage size, and sharing status for a file or directory
   * @param {"file"|"directory"} resourceType
   * @param {string} id
   * @returns {Promise<Object>}
   */
  getDetails: async (resourceType, id) => {
    return await apiRequest(`/api/details/${resourceType}/${id}`, {
      method: "GET",
    });
  },
};
