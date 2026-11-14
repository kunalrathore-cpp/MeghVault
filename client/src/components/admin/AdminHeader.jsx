import React from "react";
import { LuShieldCheck, LuPanelLeftOpen } from "react-icons/lu";
import { useAuth } from "../../context/AuthContext";

export function AdminHeader({
  isSidebarCollapsed = false,
  onToggleSidebar,
}) {
  const { user } = useAuth();

  const displayName = user?.name || (user?.email ? user.email.split("@")[0] : "Admin");
  const displayEmail = user?.email || "";
  const avatarUrl =
    user?.profile ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayEmail || "admin")}`;

  return (
    <div className="admin-sub-header">
      {/* Left: Admin Portal Title and Sidebar Expand Button (Shown ONLY when sidebar is collapsed) */}
      <div className="admin-header-brand">
        {isSidebarCollapsed && onToggleSidebar && (
          <button
            type="button"
            className="sidebar-expand-btn"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar (Ctrl+B)"
          >
            <LuPanelLeftOpen size={20} />
          </button>
        )}

        <div className="admin-header-title-box">
          <h1 className="admin-page-title">Admin Dashboard</h1>
          <span className="admin-page-subtitle">Role-Based Access Control</span>
        </div>
      </div>

      {/* Right: Admin Identity Pill with Real User Profile Avatar */}
      <div className="admin-identity-pill">
        <div className="admin-avatar-wrap">
          <img
            src={avatarUrl}
            alt={displayName}
            className="admin-avatar-img"
            onError={(e) => {
              e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayEmail || "admin")}`;
            }}
          />
          <div className="admin-status-indicator" title="Online" />
        </div>

        <div className="admin-info-text">
          <span className="admin-name">{displayName}</span>
          <span className="admin-email">{displayEmail}</span>
        </div>

        <div className="admin-role-badge admin">
          <LuShieldCheck size={13} className="admin-badge-icon" />
          <span>Admin</span>
        </div>
      </div>
    </div>
  );
}
