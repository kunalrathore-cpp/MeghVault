import { apiRequest, apiStreamRequest } from "./client";

export const githubApi = {
  /**
   * Get GitHub OAuth authorization URL for repo access
   */
  getAuthUrl: () => apiRequest("/api/github/auth-url"),

  /**
   * Check connection status
   */
  getStatus: () => apiRequest("/api/github/status"),

  /**
   * Disconnect GitHub repository integration
   */
  disconnect: () =>
    apiRequest("/api/github/disconnect", {
      method: "POST",
    }),

  /**
   * List repositories accessible to the user
   * @param {{ page?: number, perPage?: number, type?: string, search?: string }} options
   */
  listRepositories: ({ page = 1, perPage = 100, type = "all", search = "" } = {}) => {
    const params = new URLSearchParams();
    if (page) params.append("page", String(page));
    if (perPage) params.append("perPage", String(perPage));
    if (type) params.append("type", type);
    if (search) params.append("search", search);
    return apiRequest(`/api/github/repos?${params.toString()}`);
  },

  /**
   * List branches for a specific repository
   * @param {string} owner
   * @param {string} repo
   */
  listBranches: (owner, repo) =>
    apiRequest(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`),

  /**
   * Import repositories with real-time NDJSON streaming progress
   * @param {{ repos: Array, targetDirId?: string, format?: "folder"|"zip" }} payload
   * @param {Object} [options] - Options (e.g. signal for AbortController)
   * @param {Function} [onProgress] - Real-time NDJSON callback
   */
  importRepositories: (payload, options = {}, onProgress = null) =>
    apiStreamRequest(
      "/api/github/import",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
      onProgress
    ),
};
