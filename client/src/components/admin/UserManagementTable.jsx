import React, { useState } from "react";
import {
  LuUsers,
  LuShieldCheck,
  LuCircleCheck,
  LuSearch,
  LuRefreshCw,
  LuEye,
  LuUserCog,
  LuX,
} from "react-icons/lu";

export function UserManagementTable({
  users = [],
  totalCount = 0,
  activeFilter = "all",
  onFilterChange,
  searchTerm = "",
  onSearchChange,
  onRefresh,
  isRefreshing = false,
  onLogoutUser,
  onDeleteUser,
  onViewFiles,
  onEditRole,
  onViewUser,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 6;

  // Calculate counts for tab badges
  const adminsCount = users.filter((u) => u.role === "Admin").length;
  const activeCount = users.filter((u) => u.status === "Active").length;

  // Pagination slice
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE) || 1;
  const paginatedUsers = users.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="admin-card user-management-card">
      {/* Card Header */}
      <div className="user-management-header">
        <div className="header-titles">
          <h2 className="section-title">User Management</h2>
          <p className="section-subtitle">
            {totalCount || users.length} Total Users • Active: {activeCount}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Toolbar */}
      <div className="table-toolbar">
        {/* Left Filter Tabs (Omitted 'Deleted' tab as requested) */}
        <div className="filter-tabs-pills">
          <button
            type="button"
            className={`filter-pill-btn ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => {
              onFilterChange("all");
              setCurrentPage(1);
            }}
          >
            <LuUsers size={15} />
            <span>All Users</span>
          </button>

          <button
            type="button"
            className={`filter-pill-btn ${activeFilter === "admins" ? "active" : ""}`}
            onClick={() => {
              onFilterChange("admins");
              setCurrentPage(1);
            }}
          >
            <LuShieldCheck size={15} />
            <span>Admins</span>
          </button>

          <button
            type="button"
            className={`filter-pill-btn ${activeFilter === "active" ? "active" : ""}`}
            onClick={() => {
              onFilterChange("active");
              setCurrentPage(1);
            }}
          >
            <LuCircleCheck size={15} />
            <span>Active</span>
          </button>
        </div>

        {/* Right Search & Refresh Controls */}
        <div className="table-controls-right">
          <div className="admin-search-wrap">
            <LuSearch size={15} className="admin-search-icon" />
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                className="admin-search-clear"
                onClick={() => {
                  onSearchChange("");
                  setCurrentPage(1);
                }}
                title="Clear search"
              >
                <LuX size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`admin-refresh-btn ${isRefreshing ? "refreshing" : ""}`}
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh user data"
          >
            <LuRefreshCw size={14} className={isRefreshing ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* User Table */}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="col-name">Name</th>
              <th className="col-role">Role</th>
              <th className="col-status">Status</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.length > 0 ? (
              paginatedUsers.map((user) => {
                return (
                  <tr key={user.id} className="admin-table-row">
                    {/* 1. Name & Avatar */}
                    <td className="col-name">
                      <div className="user-profile-cell">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="user-avatar-small"
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;
                          }}
                        />
                        <div className="user-name-stack">
                          <span className="user-full-name">{user.name}</span>
                          <span className="user-email-text">{user.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Role */}
                    <td className="col-role">
                      <span
                        className={`role-pill ${user.role.toLowerCase()}`}
                      >
                        {user.role}
                      </span>
                    </td>

                    {/* 4. Status */}
                    <td className="col-status">
                      <span
                        className={`status-pill ${
                          user.status === "Active" ? "active" : "inactive"
                        }`}
                      >
                        <span className="status-dot" />
                        <span>{user.status}</span>
                      </span>
                    </td>

                    {/* 5. Actions */}
                    <td className="col-actions">
                      <div className="actions-cell-group">
                        {/* Logout Button (Disabled if already logged out) */}
                        {(() => {
                          const isLogoutDisabled = user.status !== "Active";
                          const logoutTooltip = isLogoutDisabled
                            ? "User is already logged out"
                            : "Terminate active session";

                          return (
                            <button
                              type="button"
                              className={`action-btn-logout ${isLogoutDisabled ? "disabled" : ""}`}
                              disabled={isLogoutDisabled}
                              onClick={() => !isLogoutDisabled && onLogoutUser(user)}
                              title={logoutTooltip}
                            >
                              Logout
                            </button>
                          );
                        })()}

                        {/* Delete Button (Enforces: Cannot delete self & Cannot delete other admin) */}
                        {(() => {
                          const isDeleteDisabled =
                            user.canDelete === false ||
                            user.isCurrentUser ||
                            user.role === "Admin";
                          const deleteTooltip = user.isCurrentUser
                            ? "You cannot delete your own admin account"
                            : user.role === "Admin"
                            ? "Admins cannot delete other administrators"
                            : "Delete user account";

                          return (
                            <button
                              type="button"
                              className={`action-btn-delete ${isDeleteDisabled ? "disabled" : ""}`}
                              disabled={isDeleteDisabled}
                              onClick={() => !isDeleteDisabled && onDeleteUser(user)}
                              title={deleteTooltip}
                            >
                              Delete
                            </button>
                          );
                        })()}

                        {/* Manage Role & Permissions Button */}
                        <button
                          type="button"
                          className="action-btn-role"
                          onClick={() => (onEditRole || onViewUser)?.(user)}
                          title="Manage Role & Permissions"
                        >
                          <LuUserCog size={16} />
                        </button>

                        {/* View User Files Eye Button */}
                        <button
                          type="button"
                          className="action-btn-view"
                          onClick={() => (onViewFiles || onViewUser)?.(user)}
                          title="View User Files & Folders"
                        >
                          <LuEye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="empty-table-cell">
                  <div className="empty-table-wrap">
                    <LuUsers size={32} className="empty-table-icon" />
                    <p className="empty-table-title">No users found</p>
                    <p className="empty-table-desc">
                      {searchTerm
                        ? `No users match "${searchTerm}". Try a different search.`
                        : "There are currently no users in this view category."}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {users.length > USERS_PER_PAGE && (
        <div className="admin-table-pagination">
          <span className="pagination-info">
            Showing {(currentPage - 1) * USERS_PER_PAGE + 1}–
            {Math.min(currentPage * USERS_PER_PAGE, users.length)} of{" "}
            {users.length} users
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="pagination-nav-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </button>
            <span className="pagination-current-page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="pagination-nav-btn"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
