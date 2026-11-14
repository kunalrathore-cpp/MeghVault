import React from "react";
import { Link } from "react-router-dom";
import {
  LuPlus,
  LuMenu,
  LuPanelLeftOpen,
} from "react-icons/lu";
import { useAuth } from "../../context/AuthContext";

export function Navbar({
  onMobileToggle,
  onUploadClick,
  isSidebarCollapsed,
  onToggleSidebar,
}) {
  const { user } = useAuth();

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : "K";
  const displayName = user?.name || "Kunal Developer";
  const displayEmail = user?.email || "kunaldeveloper@gmail.com";
  const userAvatar = user?.profile;

  return (
    <header className="app-navbar">
      <div className="navbar-left">
        {/* Mobile menu toggle */}
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={onMobileToggle}
          aria-label="Open sidebar"
        >
          <LuMenu size={20} />
        </button>

        {/* Desktop Expand Button: ONLY shown when sidebar is collapsed (never shown when expanded) */}
        {isSidebarCollapsed && (
          <button
            type="button"
            className="sidebar-expand-btn desktop-only"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar (Ctrl+B)"
          >
            <LuPanelLeftOpen size={20} />
          </button>
        )}

        {/* Brand Logo in Navbar: Shown when sidebar is collapsed, hidden on desktop when expanded */}
        <Link
          to="/"
          className={`navbar-brand ${!isSidebarCollapsed ? "hidden-on-desktop-expanded" : ""}`}
          onClick={() => {
            if (isSidebarCollapsed) {
              onToggleSidebar();
            }
          }}
          title="MeghVault Dashboard"
        >
          <img
            src="/meghvault-logo.svg"
            alt="MeghVault"
            className="navbar-brand-logo"
          />
          <span className="navbar-brand-text">
            Megh<span className="brand-vault-text">Vault</span>
          </span>
        </Link>
      </div>

      <div className="navbar-right">
        {/* Prominent + Upload Button */}
        {onUploadClick && (
          <button
            className="navbar-upload-btn"
            onClick={onUploadClick}
            aria-label="Upload files"
          >
            <LuPlus className="upload-plus-icon" />
            <span>Upload</span>
          </button>
        )}

        {/* User Profile Chip: Links directly to Settings with no expanding dropdown */}
        <Link
          to="/settings"
          className="user-profile-chip"
          title="Account Settings"
        >
          <div className="user-chip-avatar">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={displayName}
                className="user-chip-img"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="user-chip-initial">{userInitial}</span>
            )}
          </div>
          <div className="user-chip-meta">
            <span className="user-chip-name">{displayName}</span>
            <span className="user-chip-email">{displayEmail}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
