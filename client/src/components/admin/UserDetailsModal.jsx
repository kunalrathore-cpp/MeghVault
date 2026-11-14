import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuShield,
  LuCalendar,
  LuKey,
  LuCheck,
} from "react-icons/lu";

const ROLES = [
  {
    name: "Admin",
    desc: "Full administrative access to manage users, sessions, and roles.",
    color: "admin",
  },
  {
    name: "User",
    desc: "Standard user access to upload files, create folders, and collaborate.",
    color: "user",
  },
];

export function UserDetailsModal({
  isOpen,
  onClose,
  user,
  onUpdateRole,
  isUpdating = false,
}) {
  const [selectedRole, setSelectedRole] = useState("User");

  useEffect(() => {
    if (user?.role) {
      setSelectedRole(user.role);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const authProviderLabel =
    typeof user.authProvider === "object" && user.authProvider !== null
      ? user.authProvider.googleAuth
        ? "Google"
        : user.authProvider.githubAuth
        ? "GitHub"
        : "Email OTP"
      : user.authProvider || "Email OTP";

  const handleSave = () => {
    if (selectedRole !== user.role) {
      onUpdateRole(user.id, selectedRole);
    } else {
      onClose();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog user-details-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span className="source-icon-wrap user-details-header-icon">
              <LuShield size={20} />
            </span>
            <span>User Details & RBAC Permissions</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body user-details-body">
          {/* User Profile Banner */}
          <div className="user-profile-banner">
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id || "user"}`}
              alt={user.name || "User"}
              className="user-banner-avatar"
              onError={(e) => {
                e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id || "user"}`;
              }}
            />
            <div className="user-banner-info">
              <span className="user-banner-name">{user.name || "Unnamed User"}</span>
              <span className="user-banner-email">{user.email || ""}</span>
              <div className="user-meta-chips">
                <span className="meta-chip">
                  <LuKey size={11} /> {authProviderLabel}
                </span>
                <span className="meta-chip">
                  <LuCalendar size={11} /> Joined{" "}
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })
                    : "Recently"}
                </span>
              </div>
            </div>
          </div>

          {/* Role Selection (RBAC) */}
          <div className="user-details-section">
            <label className="section-label">
              <LuShield size={15} />
              <span>Assign Role (RBAC)</span>
            </label>

            <div className="roles-selection-grid">
              {ROLES.map((role) => {
                const isSelected = selectedRole === role.name;

                return (
                  <div
                    key={role.name}
                    className={`role-option-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedRole(role.name)}
                  >
                    <div className="role-radio-circle">
                      {isSelected && <div className="dot" />}
                    </div>
                    <div className="role-card-content">
                      <div className="role-card-header">
                        <span className="role-title">{role.name}</span>
                        {user.role === role.name && (
                          <span className="current-badge">Current</span>
                        )}
                      </div>
                      <p className="role-desc">{role.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isUpdating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isUpdating}
          >
            <LuCheck size={16} />
            <span>{isUpdating ? "Saving..." : "Save Role"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
