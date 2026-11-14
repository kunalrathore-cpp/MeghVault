import { API_BASE_URL, apiRequest } from "./client";

/**
 * File API Service
 */
export const fileApi = {
  /**
   * Upload a raw file with real-time upload progress tracking via XHR
   * @param {Object} params
   * @param {string|null} params.parentDirId
   * @param {File} params.file
   * @param {Function} [params.onProgress] - callback with percentage (0-100)
   * @returns {{ promise: Promise<any>, abort: () => void }}
   */
  uploadFile({ parentDirId, file, onProgress }) {
    const xhr = new XMLHttpRequest();
    const endpoint = parentDirId
      ? `${API_BASE_URL}/api/file/${parentDirId}`
      : `${API_BASE_URL}/api/file/`;

    const promise = new Promise((resolve, reject) => {
      xhr.open("POST", endpoint, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("filename", file.name);

      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            onProgress(percent);
          }
        });
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            resolve({ message: "File uploaded successfully" });
          }
        } else {
          let errorMsg = `Upload failed (${xhr.status})`;
          try {
            const errorObj = JSON.parse(xhr.responseText);
            if (errorObj.message || errorObj.error) {
              errorMsg = errorObj.message || errorObj.error;
            }
          } catch {
            // fallback text
          }
          const err = new Error(errorMsg);
          err.status = xhr.status;
          reject(err);
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during file upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload aborted by user"));
      });

      xhr.send(file);
    });

    return {
      promise,
      abort: () => xhr.abort(),
    };
  },

  /**
   * Rename a file
   */
  async renameFile(id, newFilename) {
    return apiRequest(`/api/file/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ newFilename }),
    });
  },

  /**
   * Delete a file by ID
   */
  async deleteFile(id) {
    return apiRequest(`/api/file/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Helper to construct file preview / streaming or download URL
   * When filename is provided, routes through /api/file/:id/:filename
   * so browser native viewers (PDF viewer toolbar, audio/video controls, image save-as)
   * display and save the original filename instead of the MongoDB ID.
   */
  getFileUrl(id, action = null, filename = null, ticket = null) {
    const params = new URLSearchParams();
    if (action) params.append("action", action);
    if (ticket) params.append("ticket", ticket);
    const qs = params.toString() ? `?${params.toString()}` : "";
    if (filename) {
      return `/api/file/${id}/${encodeURIComponent(filename)}${qs}`;
    }
    return `${API_BASE_URL}/api/file/${id}${qs}`;
  },

  /**
   * Download a file ensuring the original filename is preserved across all browsers.
   * Fetches data as a Blob and uses a same-origin Blob URL with the download attribute.
   */
  async downloadFile(id, filename, ticket = null) {
    const url = this.getFileUrl(id, "download", filename, ticket);
    try {
      const headers = {};
      if (ticket) headers["x-share-ticket"] = ticket;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    } catch (err) {
      console.warn("Direct blob download failed, falling back to direct anchor:", err);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      if (filename) a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  },
};
