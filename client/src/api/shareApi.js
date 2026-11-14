import { API_BASE_URL, apiRequest } from "./client";

/**
 * Share & Fine-Grained Authorization API Client
 */
export const shareApi = {
  /**
   * Get current share settings and collaborators for a resource
   */
  async getShareSettings(resourceType, resourceId) {
    return apiRequest(`/api/share/${resourceType}/${resourceId}`, {
      method: "GET",
    });
  },

  /**
   * Search registered users to add as collaborators
   */
  async searchUsers(query = "", resourceType = null, resourceId = null) {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (resourceType) params.append("resourceType", resourceType);
    if (resourceId) params.append("resourceId", resourceId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/api/share/users/search${qs}`, {
      method: "GET",
    });
  },

  /**
   * Invite a single collaborator by email address
   */
  async inviteCollaborator(resourceType, resourceId, email, role = "collaborator") {
    return apiRequest(`/api/share/${resourceType}/${resourceId}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  /**
   * Invite multiple collaborators in batch
   */
  async inviteCollaboratorsBatch(resourceType, resourceId, userIds, role = "viewer") {
    return apiRequest(`/api/share/${resourceType}/${resourceId}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ userIds, role }),
    });
  },

  /**
   * Import a shared file or directory into the current user's root folder (Editor / Owner only)
   */
  async importToRoot(resourceType, resourceId, ticket = null) {
    const qs = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
    return apiRequest(`/api/share/${resourceType}/${resourceId}/import-to-root${qs}`, {
      method: "POST",
      headers: ticket ? { "x-share-ticket": ticket } : {},
    });
  },

  /**
   * Remove a collaborator from a resource
   */
  async removeCollaborator(resourceType, resourceId, targetUserId) {
    return apiRequest(
      `/api/share/${resourceType}/${resourceId}/collaborators/${targetUserId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Update collaborator role (viewer vs collaborator)
   */
  async updateCollaboratorRole(resourceType, resourceId, targetUserId, role) {
    return apiRequest(
      `/api/share/${resourceType}/${resourceId}/collaborators/${targetUserId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    );
  },

  /**
   * Update Link Settings (Status, Visibility, Expiration, Allow Download, Password Protection)
   */
  async updateLinkSettings(resourceType, resourceId, settings) {
    return apiRequest(`/api/share/${resourceType}/${resourceId}/link`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  },

  /**
   * Get public resource details by share token (supports subfolder navigation and auth ticket)
   */
  async getPublicShareInfo(token, subDirId = null, ticket = null) {
    const params = new URLSearchParams();
    if (subDirId) params.append("subDirId", subDirId);
    if (ticket) params.append("ticket", ticket);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/api/share/public/${token}${qs}`, {
      method: "GET",
    });
  },

  /**
   * Verify password for password-protected share token
   */
  async verifyPublicPassword(token, password) {
    return apiRequest(`/api/share/public/${token}/verify-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  /**
   * Unlock a password-protected shared file or directory directly by resource ID
   */
  async unlockSharedAsset(resourceType, resourceId, password) {
    return apiRequest(`/api/share/${resourceType}/${resourceId}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  /**
   * Retrieve all files and folders shared with the currently logged-in user
   */
  async getSharedWithMe() {
    return apiRequest("/api/share/shared-with-me", {
      method: "GET",
    });
  },

  /**
   * Helper to construct public stream / download URL
   * Supports relative URL pathing, individual file streaming from a shared folder, and ticket pass-through
   */
  getPublicStreamUrl(token, action = null, fileId = null, ticket = null) {
    const params = new URLSearchParams();
    if (action) params.append("action", action);
    if (fileId) params.append("fileId", fileId);
    if (ticket) params.append("ticket", ticket);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const endpoint = fileId
      ? `/api/share/public/${token}/stream/${fileId}${qs}`
      : `/api/share/public/${token}/stream${qs}`;
    return endpoint;
  },
};
