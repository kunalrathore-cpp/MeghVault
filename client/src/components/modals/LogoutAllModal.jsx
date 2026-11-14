import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LuMonitorSmartphone,
  LuX,
  LuCircleAlert,
  LuLoader,
} from "react-icons/lu";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

export function LogoutAllModal({ isOpen, onClose }) {
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, logoutAll } = useAuth();
  const { showSuccess } = useToast();

  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    try {
      await logoutAll();
      showSuccess("All devices and sessions logged out successfully");
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to log out all devices.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: "var(--danger)" }}>
            <LuMonitorSmartphone />
            <span>Log Out All Devices</span>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <LuX />
          </button>
        </div>

        <form onSubmit={handleConfirm}>
          <div className="modal-body">
            <p style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500 }}>
              Are you sure you want to log out of all devices?
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
              This will immediately terminate all active sessions for <strong>{user?.email}</strong> across all browsers, phones, and other devices.
            </p>

            {errorMsg && (
              <div
                className="auth-alert auth-alert-error"
                style={{ margin: "8px 0 0 0", padding: "10px 14px" }}
              >
                <LuCircleAlert style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LuLoader style={{ animation: "spin 1s linear infinite" }} />
                  <span>Logging out...</span>
                </>
              ) : (
                <>
                  <LuMonitorSmartphone />
                  <span>Log Out Everywhere</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
