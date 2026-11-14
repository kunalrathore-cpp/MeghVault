import { apiRequest } from "../api/client";

/**
 * Admin Service (RBAC & System Telemetry)
 * Communicates with backend endpoints: /api/admin/*
 */
export const adminService = {
  /**
   * Fetch system-wide storage & user statistics
   */
  async getAdminStats() {
    return apiRequest("/api/admin/stats");
  },

  /**
   * Get filtered user list
   * @param {{ filter?: "all" | "admins" | "active", search?: string }} options
   */
  async getUsers({ filter = "all", search = "" } = {}) {
    const params = new URLSearchParams();
    if (filter && filter !== "all") params.append("filter", filter);
    if (search && search.trim()) params.append("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/api/admin/users${query}`);
  },

  /**
   * Get target user details by ID
   * @param {string} userId
   */
  async getUserById(userId) {
    return apiRequest(`/api/admin/users/${userId}`);
  },

  /**
   * Get real files and folders belonging to a target user
   * @param {string} userId
   * @param {string|null} dirId
   */
  async getUserStorage(userId, dirId = null) {
    const query = dirId && dirId !== "root" ? `?dirId=${encodeURIComponent(dirId)}` : "";
    return apiRequest(`/api/admin/users/${userId}/storage${query}`);
  },

  /**
   * Force log out a user by ID
   * @param {string} userId
   */
  async logoutUser(userId) {
    return apiRequest(`/api/admin/users/${userId}/logout`, {
      method: "POST",
    });
  },

  /**
   * Delete a user account by ID
   * @param {string} userId
   */
  async deleteUser(userId) {
    return apiRequest(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });
  },

  /**
   * Update role for a user (RBAC: "Admin" | "User")
   * @param {string} userId
   * @param {"Admin" | "User"} newRole
   */
  async updateUserRole(userId, newRole) {
    return apiRequest(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
  },

  /**
   * Refresh telemetry / data sync
   */
  async refreshData() {
    return { success: true };
  },
};
