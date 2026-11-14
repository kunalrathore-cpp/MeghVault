import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuLock, LuKey, LuX, LuEye, LuEyeOff } from "react-icons/lu";
import { shareApi } from "../../api/shareApi";

export function UnlockModal({
  isOpen,
  item,
  onClose,
  onSuccess,
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset and clean password whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setShowPassword(false);
      setError("");
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleClose = () => {
    setPassword("");
    setShowPassword(false);
    setError("");
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the security key");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const resourceType = item.type || (item.isDirectory ? "directory" : "file");
      let res;
      if (item.shareToken) {
        res = await shareApi.verifyPublicPassword(item.shareToken, password);
      } else {
        res = await shareApi.unlockSharedAsset(resourceType, item.id, password);
      }

      if (res?.verified) {
        // Clean password input field after submitting unlock access
        setPassword("");
        setShowPassword(false);
        setError("");
        onSuccess(item, res.authTicket);
        onClose();
      } else {
        setError(res?.error || "Incorrect security key");
      }
    } catch (err) {
      setError(err.message || "Failed to unlock item. Incorrect security key.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-dialog"
        style={{ maxWidth: "440px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LuLock size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Security Key Required</h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Password Protected Item
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close">
            <LuX />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
              <strong>{item.name}</strong> is protected with a security key by the owner. Enter the password below to unlock access.
            </p>

            <div className="unlock-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                className="unlock-password-input"
                placeholder="Enter security key..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                className="unlock-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
              </button>
            </div>

            {error && (
              <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.82rem", marginTop: "10px", marginBottom: 0 }}>
                {error}
              </p>
            )}
          </div>

          <div className="modal-footer" style={{ padding: "14px 24px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !password.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              <LuKey size={15} />
              <span>{loading ? "Unlocking..." : "Unlock Access"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
