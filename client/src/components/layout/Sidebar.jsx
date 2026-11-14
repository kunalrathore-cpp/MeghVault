import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LuHardDrive,
  LuClock,
  LuStar,
  LuSun,
  LuMoon,
  LuX,
  LuPanelLeftClose,
  LuShieldCheck,
  LuUsers,
  LuTrash2,
  LuSettings,
} from "react-icons/lu";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  const isSharedActive = location.pathname === "/shared-with-me";
  const isRecentActive = location.pathname === "/recent";
  const isStarredActive = location.pathname === "/starred";
  const isTrashActive = location.pathname === "/trash";
  const isSettingsActive =
    location.pathname === "/settings" || location.pathname === "/profile";
  const isMyDriveActive =
    (location.pathname === "/" || location.pathname.startsWith("/directory")) &&
    !isSharedActive &&
    !isRecentActive &&
    !isStarredActive &&
    !isTrashActive &&
    !isSettingsActive;
  const isAdminActive = location.pathname.startsWith("/admin");

  return (
    <>
      <aside
        className={`app-sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""}`}
      >
        <div className="sidebar-header">
          <Link
            to="/"
            className="brand-logo"
            onClick={onClose}
            title="MeghVault"
          >
            <img
              src="/meghvault-logo.svg"
              alt="MeghVault"
              className="sidebar-brand-logo"
            />
            <span className="brand-name">
              Megh<span className="brand-vault-text">Vault</span>
            </span>
          </Link>

          <div className="sidebar-header-actions">
            {/* Desktop Collapse Button */}
            <button
              type="button"
              className="sidebar-action-toggle-btn desktop-only"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar (Ctrl+B)"
            >
              <LuPanelLeftClose size={18} />
            </button>

            {/* Mobile Close Button */}
            {isOpen && (
              <button
                type="button"
                className="sidebar-action-toggle-btn mobile-only"
                onClick={onClose}
                aria-label="Close sidebar"
              >
                <LuX size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          <div>
            <div className="nav-section-title">Navigation</div>
            <ul className="nav-list">
              <li>
                <Link
                  to="/"
                  className={`nav-item-btn ${isMyDriveActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="nav-item-icon">
                    <LuHardDrive />
                  </span>
                  <span>My Drive</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/shared-with-me"
                  className={`nav-item-btn ${isSharedActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="nav-item-icon">
                    <LuUsers />
                  </span>
                  <span>Shared with me</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/recent"
                  className={`nav-item-btn ${isRecentActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="nav-item-icon">
                    <LuClock />
                  </span>
                  <span>Recent</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/starred"
                  className={`nav-item-btn starred-nav-item ${isStarredActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="nav-item-icon">
                    <LuStar />
                  </span>
                  <span>Starred</span>
                </Link>
              </li>
              {user?.role === "Admin" && (
                <li>
                  <Link
                    to="/admin"
                    className={`nav-item-btn ${isAdminActive ? "active" : ""}`}
                    onClick={onClose}
                  >
                    <span className="nav-item-icon">
                      <LuShieldCheck />
                    </span>
                    <span>Admin</span>
                  </Link>
                </li>
              )}
              <li>
                <Link
                  to="/trash"
                  className={`nav-item-btn trash-nav-item ${isTrashActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="nav-item-icon">
                    <LuTrash2 />
                  </span>
                  <span>Trash</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Bottom Settings Link in the marked area */}
          <div className="sidebar-bottom-nav">
            <Link
              to="/settings"
              className={`nav-item-btn ${isSettingsActive ? "active" : ""}`}
              onClick={onClose}
              title="Settings & Preferences"
            >
              <span className="nav-item-icon">
                <LuSettings />
              </span>
              <span>Settings</span>
            </Link>
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-theme-toggle-btn"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            <div className="theme-toggle-icon-wrap">
              {theme === "dark" ? (
                <LuSun className="theme-icon sun" />
              ) : (
                <LuMoon className="theme-icon moon" />
              )}
            </div>
            <span className="theme-toggle-text">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
            <div
              className={`theme-toggle-pill ${theme === "dark" ? "active" : ""}`}
            >
              <div className="theme-toggle-knob" />
            </div>
          </button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
    </>
  );
}
