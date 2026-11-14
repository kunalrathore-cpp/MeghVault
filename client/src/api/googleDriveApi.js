import { apiRequest, apiStreamRequest } from "./client";

export const googleDriveApi = {
  /**
   * Get Google Drive OAuth authorization URL
   */
  getAuthUrl: () => apiRequest("/api/google-drive/auth-url"),

  /**
   * Check connection status and get fresh access token
   */
  getStatus: () => apiRequest("/api/google-drive/status"),

  /**
   * List files and folders from user's Google Drive (server-to-server)
   * @param {string} [folderId='root']
   * @param {string} [search='']
   */
  listFiles: (folderId = "root", search = "") => {
    const params = new URLSearchParams();
    if (folderId) params.append("folderId", folderId);
    if (search) params.append("search", search);
    return apiRequest(`/api/google-drive/files?${params.toString()}`);
  },

  /**
   * Import picked Google Drive files/folders into a destination directory
   * with real-time NDJSON progress streaming.
   * @param {{ items: Array, targetDirId?: string }} payload
   * @param {Object} [options] - Fetch options (e.g. signal for AbortController)
   * @param {Function} [onProgress] - Real-time progress callback
   */
  importItems: (payload, options = {}, onProgress = null) =>
    apiStreamRequest(
      "/api/google-drive/import",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
      onProgress
    ),

  /**
   * Disconnect Google Drive integration
   */
  disconnect: () =>
    apiRequest("/api/google-drive/disconnect", {
      method: "POST",
    }),
};
