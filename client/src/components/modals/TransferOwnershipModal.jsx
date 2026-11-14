import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LuArrowRightLeft,
  LuX,
  LuMail,
  LuKeyRound,
  LuTriangleAlert,
  LuLoader,
  LuCheck,
  LuArrowLeft,
  LuShieldAlert,
} from "react-icons/lu";
import { authApi } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { sanitizeText } from "../../utils/sanitize";

export function TransferOwnershipModal({
  isOpen,
  onClose,
  initialTargetEmail = "",
}) {
  const { user, logout } = useAuth();
  const { showSuccess, showError, flashToast } = useToast();

  const [step, setStep] = useState(1); // Step 1: Target Email, Step 2: OTP Confirmation
  const [targetEmail, setTargetEmail] = useState("");
  const [recipientInfo, setRecipientInfo] = useState(null);
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
      setTargetEmail(initialTargetEmail || "");
      setRecipientInfo(null);
      setOtp("");
      setErrorMsg("");
      setIsLoading(false);
      setResendTimer(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, initialTargetEmail]);

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

  // Focus OTP input on step 2
  useEffect(() => {
    if (step === 2 && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Handle escape key
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

  // Step 1: Request OTP for ownership transfer
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanEmail = sanitizeText(targetEmail.trim().toLowerCase());
    if (!cleanEmail) {
      setErrorMsg("Please enter the recipient user's email address.");
      return;
    }

    if (cleanEmail === user?.email?.toLowerCase()) {
      setErrorMsg("You cannot transfer account ownership to yourself.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.requestOwnershipTransferOtp(cleanEmail);
      setRecipientInfo(res.recipient || { email: cleanEmail, name: "Recipient" });
      setStep(2);
      setResendTimer(60);
      showSuccess(res.message || `Confirmation code sent to ${user?.email}`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to initiate ownership transfer request.");
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
      const cleanEmail = sanitizeText(targetEmail.trim().toLowerCase());
      const res = await authApi.requestOwnershipTransferOtp(cleanEmail);
      setResendTimer(60);
      showSuccess(res.message || "New transfer confirmation code sent!");
    } catch (err) {
      setErrorMsg(err.message || "Failed to resend confirmation code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm Transfer and Delete Account
  const handleConfirmTransfer = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanOtp = sanitizeText(otp.trim());
    if (!cleanOtp || cleanOtp.length !== 4) {
      setErrorMsg("Please enter the valid 4-digit confirmation code.");
      return;
    }

    setIsLoading(true);
    try {
      const cleanEmail = sanitizeText(targetEmail.trim().toLowerCase());
      const res = await authApi.confirmOwnershipTransfer({
        targetEmail: cleanEmail,
        otp: cleanOtp,
      });

      flashToast({
        title: "Ownership Transferred",
        message:
          res.message ||
          `Ownership successfully transferred to ${cleanEmail}. Your account has been deleted.`,
        type: "success",
        duration: 7000,
      });

      onClose();

      try {
        await logout();
      } catch {}
      window.location.replace("/auth?message=" + encodeURIComponent(`Ownership successfully transferred to ${cleanEmail}. Your account has been deleted.`));
    } catch (err) {
      setErrorMsg(err.message || "Failed to complete account ownership transfer.");
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={!isLoading ? onClose : undefined}>
      <div
        className="modal-dialog transfer-ownership-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title" style={{ color: "#ef4444" }}>
            <LuShieldAlert size={20} />
            <span>Transfer & Delete Account</span>
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
            /* STEP 1: Enter Target Email */
            <form onSubmit={handleRequestOtp}>
              {/* Info Callout */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 16px",
                  background: "rgba(239, 68, 68, 0.06)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: "8px",
                  marginBottom: 20,
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <LuTriangleAlert
                  size={20}
                  style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>
                    Permanent Account Handoff
                  </strong>
                  All your files, folders, and shared items will be converted into a top-level folder inside the recipient's MeghVault drive. Once confirmed, your account will be <strong>permanently deleted</strong>.
                </div>
              </div>

              {/* Recipient Email Input */}
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
                  Recipient User Email
                </label>
                <div style={{ position: "relative" }}>
                  <LuMail
                    size={16}
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                  <input
                    type="email"
                    required
                    placeholder="Enter existing MeghVault user email..."
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 40px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 6, display: "block" }}>
                  The recipient must already have a registered MeghVault account.
                </span>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "0.84rem",
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Footer */}
              <div className="modal-footer" style={{ padding: "16px 0 0", marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isLoading || !targetEmail.trim()}
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    border: "1px solid #ef4444",
                    fontWeight: 600,
                    padding: "9px 20px",
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Validating & Sending Code...</span>
                    </>
                  ) : (
                    <>
                      <LuArrowRightLeft size={16} />
                      <span>Continue & Send Code</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: Enter OTP & Final Confirmation */
            <form onSubmit={handleConfirmTransfer}>
              {/* Recipient Target Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "8px",
                  marginBottom: 18,
                }}
              >
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block" }}>
                    Transferring ownership to:
                  </span>
                  <strong style={{ color: "var(--text-primary)", fontSize: "0.92rem" }}>
                    {recipientInfo?.name || "Recipient"} ({targetEmail})
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setErrorMsg("");
                  }}
                  disabled={isLoading}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--primary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <LuArrowLeft size={14} /> Change
                </button>
              </div>

              {/* OTP Instructions */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    marginBottom: 6,
                    color: "var(--text-primary)",
                  }}
                >
                  Enter Confirmation Code
                </label>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 12px" }}>
                  A 4-digit authorization code was sent to <strong>{user?.email}</strong>.
                </p>

                <div style={{ position: "relative" }}>
                  <LuKeyRound
                    size={16}
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                  <input
                    ref={otpInputRef}
                    type="text"
                    required
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    placeholder="• • • •"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 40px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      letterSpacing: "6px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Resend Link */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  {resendTimer > 0 ? (
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Resend code in {resendTimer}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isLoading}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--primary)",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>

              {/* Danger Warning Box */}
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "6px",
                  color: "#ef4444",
                  fontSize: "0.82rem",
                  lineHeight: 1.45,
                  marginBottom: 18,
                }}
              >
                <strong>Irreversible Action:</strong> Clicking confirm will immediately migrate all your data and permanently delete your MeghVault account. You will be logged out on all devices.
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "0.84rem",
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Footer */}
              <div className="modal-footer" style={{ padding: "16px 0 0", marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isLoading || otp.length !== 4}
                  style={{
                    background: "#dc2626",
                    color: "#ffffff",
                    border: "1px solid #dc2626",
                    fontWeight: 600,
                    padding: "9px 20px",
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Transferring & Deleting...</span>
                    </>
                  ) : (
                    <>
                      <LuCheck size={16} />
                      <span>Confirm Transfer & Delete Account</span>
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
