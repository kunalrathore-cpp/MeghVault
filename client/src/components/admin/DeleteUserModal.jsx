import React from "react";
import { createPortal } from "react-dom";
import { LuTriangleAlert, LuX, LuTrash2 } from "react-icons/lu";

export function DeleteUserModal({ isOpen, onClose, user, onConfirm, isDeleting = false }) {
  if (!isOpen || !user) return null;

  const isBlocked = user.role === "Admin" || user.isCurrentUser;
  const blockedMessage = user.isCurrentUser
    ? "Action not permitted: You cannot delete your own administrator account."
    : user.role === "Admin"
    ? "Action not permitted: Administrators cannot delete other administrators."
    : null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog delete-user-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title delete-title">
            <span className="delete-icon-wrap">
              <LuTriangleAlert size={20} />
            </span>
            <span>Delete User Account</span>
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

        {/* Content */}
        <div className="modal-body delete-user-body">
          {isBlocked ? (
            <div
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "8px",
                padding: "12px 14px",
                color: "var(--danger, #ef4444)",
                fontSize: "0.88rem",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              {blockedMessage}
            </div>
          ) : (
            <p className="delete-warning-text">
              Are you sure you want to delete the user account for{" "}
              <strong>{user.name}</strong> (<code>{user.email}</code>)?
            </p>
          )}

          <div className="delete-user-preview-box">
            <img
              src={user.avatar}
              alt={user.name}
              className="delete-user-avatar"
              onError={(e) => {
                e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;
              }}
            />
            <div className="delete-preview-info">
              <span className="preview-name">{user.name}</span>
              <span className="preview-meta">
                Role: <strong>{user.role}</strong>
              </span>
            </div>
          </div>

          <p className="delete-caution-subtext">
            {isBlocked
              ? "Administrator accounts are protected and cannot be deleted from the user dashboard."
              : "This action will permanently revoke all access, invalidate active sessions, and remove user files."}
          </p>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            {isBlocked ? "Close" : "Cancel"}
          </button>
          {!isBlocked && (
            <button
              type="button"
              className="btn btn-danger delete-confirm-btn"
              onClick={() => onConfirm(user.id)}
              disabled={isDeleting || isBlocked}
            >
              <LuTrash2 size={16} />
              <span>{isDeleting ? "Deleting..." : "Delete User"}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
