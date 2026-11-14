import { apiRequest, apiStreamRequest } from "./client";

export const googlePhotosApi = {
  /**
   * Get Google Photos OAuth authorization URL
   */
  getAuthUrl: () => apiRequest("/api/google-photos/auth-url"),

  /**
   * Check connection status and get fresh access token
   */
  getStatus: () => apiRequest("/api/google-photos/status"),

  /**
   * List albums from user's Google Photos Library
   * @param {string} [pageToken]
   */
  listAlbums: (pageToken = null) => {
    const params = new URLSearchParams();
    if (pageToken) params.append("pageToken", pageToken);
    return apiRequest(`/api/google-photos/albums?${params.toString()}`);
  },

  /**
   * List photos & videos from user's Google Photos Library or an Album
   * @param {Object} [params]
   * @param {string} [params.albumId]
   * @param {string} [params.pageToken]
   * @param {number} [params.pageSize=100]
   */
  listMediaItems: ({ albumId = null, pageToken = null, pageSize = 100 } = {}) => {
    const params = new URLSearchParams();
    if (albumId) params.append("albumId", albumId);
    if (pageToken) params.append("pageToken", pageToken);
    if (pageSize) params.append("pageSize", String(pageSize));
    return apiRequest(`/api/google-photos/media-items?${params.toString()}`);
  },

  /**
   * Import chosen Google Photos and Albums into MeghVault with real-time NDJSON progress streaming.
   * @param {{ items: Array, targetDirId?: string }} payload
   * @param {Object} [options] - Fetch options (e.g. signal for AbortController)
   * @param {Function} [onProgress] - Real-time progress callback
   */
  importItems: (payload, options = {}, onProgress = null) =>
    apiStreamRequest(
      "/api/google-photos/import",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
      onProgress
    ),

  /**
   * Disconnect Google Photos integration
   */
  disconnect: () =>
    apiRequest("/api/google-photos/disconnect", {
      method: "POST",
    }),

  /**
   * Google Photos Native Picker API (photospicker.googleapis.com)
   */
  createPickerSession: () =>
    apiRequest("/api/google-photos/picker-session", {
      method: "POST",
    }),

  getPickerSessionStatus: (sessionId) =>
    apiRequest(`/api/google-photos/picker-session/${sessionId}/status`),

  getPickerSessionItems: (sessionId, pageToken = null) => {
    const params = new URLSearchParams();
    if (pageToken) params.append("pageToken", pageToken);
    return apiRequest(`/api/google-photos/picker-session/${sessionId}/items?${params.toString()}`);
  },
};
