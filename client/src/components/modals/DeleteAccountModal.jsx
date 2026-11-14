import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LuTrash2,
  LuX,
  LuTriangleAlert,
  LuLoader,
  LuCheck,
  LuArrowLeft,
  LuShieldAlert,
  LuKeyRound,
  LuFileX,
  LuShare2,
  LuLayers,
} from "react-icons/lu";
import { authApi } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { sanitizeText } from "../../utils/sanitize";

export function DeleteAccountModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { showSuccess, showError, flashToast } = useToast();

  const [step, setStep] = useState(1); // 1: Warning & phrase confirm, 2: OTP verification
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const otpInputRef = useRef(null);
  const timerRef = useRef(null);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmPhrase("");
      setOtp("");
      setErrorMsg("");
      setIsLoading(false);
      setResendTimer(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendTimer]);

  // Focus OTP input when step 2 opens
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  // Expected confirmation phrase is user's email or "DELETE"
  const expectedPhrase = user?.email || "DELETE";
  const isPhraseMatched =
    confirmPhrase.trim().toLowerCase() === expectedPhrase.toLowerCase() ||
    confirmPhrase.trim().toUpperCase() === "DELETE";

  // Step 1: Request Deletion OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!isPhraseMatched) {
      setErrorMsg(`Please type your email (${user?.email}) or "DELETE" to confirm.`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.requestDeleteAccountOtp();
      setStep(2);
      setResendTimer(60);
      showSuccess(res.message || `Deletion confirmation code dispatched to ${user?.email}`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to initiate account deletion request.");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isLoading) return;
    setErrorMsg("");
    setIsLoading(true);

    try {
      const res = await authApi.requestDeleteAccountOtp();
      setResendTimer(60);
      showSuccess(res.message || "New deletion verification code sent!");
    } catch (err) {
      setErrorMsg(err.message || "Failed to resend deletion code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm and Permanently Delete Account
  const handleConfirmDelete = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanOtp = sanitizeText(otp.trim());
    if (!cleanOtp || cleanOtp.length !== 4) {
      setErrorMsg("Please enter the 4-digit verification code.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.confirmDeleteAccount({
        otp: cleanOtp,
        confirmationText: confirmPhrase,
      });

      // Persist success toast across session termination and redirect
      flashToast({
        title: "Account Permanently Deleted",
        message:
          res.message ||
          "Your account, profile, and all associated cloud files have been permanently wiped.",
        type: "success",
        duration: 7000,
      });

      onClose();

      // Gracefully terminate local session and redirect to auth screen
      try {
        await logout();
      } catch {
        // Fallback hard redirect if auth state is cleared by cookie
      }
      window.location.replace("/auth?deleted=true");
    } catch (err) {
      setErrorMsg(err.message || "Failed to execute permanent account deletion.");
      setIsLoading(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={() => !isLoading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "520px",
          width: "92vw",
          border: "1px solid rgba(239, 68, 68, 0.35)",
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            borderBottom: "1px solid var(--border-light)",
            padding: "20px 24px",
            background: "rgba(239, 68, 68, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                flexShrink: 0,
              }}
            >
              <LuShieldAlert />
            </div>
            <div>
              <h2
                id="delete-account-modal-title"
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "#ef4444",
                }}
              >
                Delete My Account
              </h2>
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "var(--text-muted)",
                }}
              >
                {step === 1
                  ? "Permanent, irreversible data wiping"
                  : "Security OTP Verification"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close modal"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: "20px 24px" }}>
          {step === 1 ? (
            /* STEP 1: Warning Notice & Phrase Confirmation */
            <form onSubmit={handleRequestOtp}>
              {/* Critical Alert Banner */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 16px",
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "10px",
                  marginBottom: 18,
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <LuTriangleAlert
                  size={22}
                  style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong
                    style={{
                      color: "#ef4444",
                      display: "block",
                      marginBottom: 4,
                      fontSize: "0.88rem",
                    }}
                  >
                    Action is Permanent and Irreversible
                  </strong>
                  Deleting your account will immediately wipe your files, folders, shared links, and user records. This action cannot be undone under any circumstances.
                </div>
              </div>

              {/* Data Loss Breakdown List */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 20,
                  padding: "12px 14px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.84rem", color: "var(--text-primary)" }}>
                  <LuFileX size={16} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span>All your files and documents will be shredded from storage.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.84rem", color: "var(--text-primary)" }}>
                  <LuLayers size={16} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span>All folders and folder structures will be erased.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.84rem", color: "var(--text-primary)" }}>
                  <LuShare2 size={16} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span>All active share links and collaborator rights will be revoked.</span>
                </div>
              </div>

              {/* Confirmation Phrase Input */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "var(--text-primary)",
                  }}
                >
                  To proceed, type <code style={{ color: "#ef4444", background: "rgba(239, 68, 68, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>{user?.email || "DELETE"}</code>:
                </label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => {
                    setConfirmPhrase(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder={`Type ${user?.email || "DELETE"} to confirm`}
                  autoFocus
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: "8px",
                    border: isPhraseMatched
                      ? "1px solid #ef4444"
                      : "1px solid var(--border-light)",
                    background: "var(--bg-input, var(--bg-surface))",
                    color: "var(--text-primary)",
                    fontSize: "0.92rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    color: "#ef4444",
                    fontSize: "0.84rem",
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="profile-btn-danger"
                  disabled={isLoading || !isPhraseMatched}
                  style={{
                    opacity: isPhraseMatched && !isLoading ? 1 : 0.55,
                    cursor: isPhraseMatched && !isLoading ? "pointer" : "not-allowed",
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <>
                      <LuKeyRound size={16} />
                      <span>Send Verification OTP</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: Enter 4-Digit Deletion OTP */
            <form onSubmit={handleConfirmDelete}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "0.84rem",
                  width: "fit-content",
                }}
                onClick={() => {
                  if (!isLoading) {
                    setStep(1);
                    setErrorMsg("");
                  }
                }}
              >
                <LuArrowLeft size={14} />
                <span>Back to confirmation</span>
              </div>

              {/* Notice Banner */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "10px",
                  marginBottom: 20,
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <strong
                  style={{
                    color: "#ef4444",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Final Confirmation Step
                </strong>
                A 4-digit authorization code was sent to{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {user?.email}
                </strong>
                . Enter the code below to finalize permanent deletion.
              </div>

              {/* OTP Input Field */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "var(--text-primary)",
                  }}
                >
                  4-Digit Security Code
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setOtp(val);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder="&bull; &bull; &bull; &bull;"
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "2px solid rgba(239, 68, 68, 0.4)",
                    background: "var(--bg-input, var(--bg-surface))",
                    color: "#ef4444",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    letterSpacing: "12px",
                    textAlign: "center",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Resend Link & Timer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.82rem",
                  marginBottom: 20,
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>
                  Didn't receive the code?
                </span>
                {resendTimer > 0 ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    Resend in <strong>{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isLoading}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary)",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Resend Code
                  </button>
                )}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    color: "#ef4444",
                    fontSize: "0.84rem",
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="profile-btn-danger"
                  disabled={isLoading || otp.trim().length !== 4}
                  style={{
                    opacity: otp.trim().length === 4 && !isLoading ? 1 : 0.6,
                    cursor: otp.trim().length === 4 && !isLoading ? "pointer" : "not-allowed",
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Purging Account...</span>
                    </>
                  ) : (
                    <>
                      <LuTrash2 size={16} />
                      <span>Permanently Delete My Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default DeleteAccountModal;
