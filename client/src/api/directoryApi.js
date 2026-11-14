import { API_BASE_URL, apiRequest } from "./client";

/**
 * Directory API Service
 */
export const directoryApi = {
  /**
   * Fetch directory details, files, and sub-directories
   * If dirId is empty or omitted, fetches root directory
   */
  async getDirectory(dirId, ticket = null) {
    const params = new URLSearchParams();
    if (ticket) params.append("ticket", ticket);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const endpoint = dirId ? `/api/directory/${dirId}${qs}` : `/api/directory/${qs}`;
    return apiRequest(endpoint, {
      method: "GET",
      headers: ticket ? { "x-share-ticket": ticket } : {},
    });
  },

  /**
   * Create a new directory under root or specified parent directory
   */
  async createDirectory(parentDirId, dirname) {
    const endpoint = parentDirId ? `/api/directory/${parentDirId}` : "/api/directory/";
    return apiRequest(endpoint, {
      method: "POST",
      headers: {
        dirname: dirname || "New Folder",
      },
    });
  },

  /**
   * Rename directory by ID
   */
  async renameDirectory(id, newDirName) {
    return apiRequest(`/api/directory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ newDirName }),
    });
  },

  /**
   * Delete directory by ID recursively
   */
  async deleteDirectory(id) {
    return apiRequest(`/api/directory/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Get direct URL to download a folder as a streamed zip archive
   */
  getFolderDownloadUrl(id, ticket = null, shareToken = null) {
    const params = new URLSearchParams();
    if (ticket) params.append("ticket", ticket);
    if (shareToken) params.append("shareToken", shareToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return `${API_BASE_URL}/api/directory/${id}/download${qs}`;
  },

  /**
   * Triggers a browser native streaming download of an entire folder hierarchy as a .zip file.
   * Directly delegates to browser download manager without buffering in JS memory.
   */
  downloadDirectory(id, dirName = "Folder", ticket = null, shareToken = null) {
    const url = this.getFolderDownloadUrl(id, ticket, shareToken);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.setAttribute("download", `${dirName || "Folder"}.zip`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  /**
   * Triggers a streaming zip download for multiple selected files and directories
   */
  downloadBulkZip(items, archiveName = "MeghVault-Archive") {
    if (!items || items.length === 0) return;
    const fileIds = items.filter((it) => !it.isDirectory && it.type !== "directory").map((it) => it.id);
    const dirIds = items.filter((it) => it.isDirectory || it.type === "directory").map((it) => it.id);
    const params = new URLSearchParams();
    if (fileIds.length > 0) params.append("files", fileIds.join(","));
    if (dirIds.length > 0) params.append("dirs", dirIds.join(","));
    if (archiveName) params.append("name", archiveName);
    const url = `${API_BASE_URL}/api/items/download-zip?${params.toString()}`;

    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.setAttribute("download", `${archiveName}.zip`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
