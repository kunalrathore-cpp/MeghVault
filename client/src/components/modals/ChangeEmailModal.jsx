import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LuMail,
  LuX,
  LuArrowLeft,
  LuArrowRight,
  LuLoader,
  LuCheck,
  LuShieldCheck,
  LuArrowRightLeft,
  LuInfo,
} from "react-icons/lu";
import { authApi } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { sanitizeText } from "../../utils/sanitize";

export function ChangeEmailModal({ isOpen, onClose, onStartMigration }) {
  const { user, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const [step, setStep] = useState(1); // 1: Input email / migration suggestion, 2: Old OTP, 3: New OTP
  const [newEmail, setNewEmail] = useState("");
  const [existingUser, setExistingUser] = useState(null);
  const [oldOtp, setOldOtp] = useState("");
  const [newOtp, setNewOtp] = useState("");
  const [changeToken, setChangeToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const oldOtpInputRef = useRef(null);
  const newOtpInputRef = useRef(null);
  const timerRef = useRef(null);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setNewEmail("");
      setExistingUser(null);
      setOldOtp("");
      setNewOtp("");
      setChangeToken("");
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

  // Auto-focus OTP inputs when steps change
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => oldOtpInputRef.current?.focus(), 100);
    } else if (step === 3) {
      setTimeout(() => newOtpInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Escape key closes modal
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

  // Step 1: Submit new email & check availability
  const handleRequestOldOtp = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setExistingUser(null);

    const cleanEmail = sanitizeText(newEmail.trim().toLowerCase());
    if (!cleanEmail) {
      setErrorMsg("Please enter a valid new email address.");
      return;
    }

    if (cleanEmail === user?.email?.toLowerCase()) {
      setErrorMsg("This is already your active account email address.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.requestChangeEmailOldOtp(cleanEmail);

      if (res.exists && res.canMigrate) {
        // Email already registered: suggest migration
        setExistingUser(res.existingUser);
      } else {
        // Email free: proceed to Step 2
        setStep(2);
        setResendTimer(60);
        showSuccess(res.message || `Authorization code sent to ${user?.email}`);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to initiate email change request.");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP for Step 1 (Current Email)
  const handleResendOldOtp = async () => {
    if (resendTimer > 0 || isLoading) return;
    setErrorMsg("");
    setIsLoading(true);

    try {
      const cleanEmail = sanitizeText(newEmail.trim().toLowerCase());
      const res = await authApi.requestChangeEmailOldOtp(cleanEmail);
      setResendTimer(60);
      showSuccess(res.message || "New authorization code sent to your current email!");
    } catch (err) {
      setErrorMsg(err.message || "Failed to resend authorization code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify Old/Current Email OTP
  const handleVerifyOldOtp = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanOtp = sanitizeText(oldOtp.trim());
    if (!cleanOtp || cleanOtp.length !== 4) {
      setErrorMsg("Please enter the 4-digit authorization code.");
      return;
    }

    setIsLoading(true);
    try {
      const cleanEmail = sanitizeText(newEmail.trim().toLowerCase());
      const res = await authApi.verifyChangeEmailOldOtp({
        newEmail: cleanEmail,
        otp: cleanOtp,
      });

      setChangeToken(res.changeToken);
      setStep(3);
      setResendTimer(60);
      showSuccess(res.message || `Verification code sent to ${cleanEmail}`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to verify current email authorization code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP for Step 2 (New Email)
  const handleResendNewOtp = async () => {
    if (resendTimer > 0 || isLoading || !changeToken) return;
    setErrorMsg("");
    setIsLoading(true);

    try {
      const cleanEmail = sanitizeText(newEmail.trim().toLowerCase());
      const res = await authApi.resendChangeEmailNewOtp({
        newEmail: cleanEmail,
        changeToken,
      });
      setResendTimer(60);
      showSuccess(res.message || "New verification code sent to your new email!");
    } catch (err) {
      setErrorMsg(err.message || "Failed to resend verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Verify New Email OTP & Finalize
  const handleConfirmNewOtp = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanOtp = sanitizeText(newOtp.trim());
    if (!cleanOtp || cleanOtp.length !== 4) {
      setErrorMsg("Please enter the 4-digit verification code.");
      return;
    }

    setIsLoading(true);
    try {
      const cleanEmail = sanitizeText(newEmail.trim().toLowerCase());
      const res = await authApi.confirmChangeEmailNewOtp({
        newEmail: cleanEmail,
        otp: cleanOtp,
        changeToken,
      });

      showSuccess(res.message || `Email updated to ${cleanEmail}!`);
      if (refreshUser) {
        await refreshUser();
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to finalize email update.");
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={() => !isLoading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-email-modal-title"
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "520px",
          width: "92vw",
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            borderBottom: "1px solid var(--border-light)",
            padding: "20px 24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                background: "rgba(59, 130, 246, 0.12)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                flexShrink: 0,
              }}
            >
              <LuMail />
            </div>
            <div>
              <h2
                id="change-email-modal-title"
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                Change Account Email
              </h2>
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "var(--text-muted)",
                }}
              >
                {step === 1 && !existingUser && "Step 1: Enter new email"}
                {step === 1 && existingUser && "Account already registered"}
                {step === 2 && "Step 1 of 2: Authorize current email"}
                {step === 3 && "Step 2 of 2: Verify new email"}
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
          {step === 1 && !existingUser && (
            /* STEP 1: Enter New Email */
            <form onSubmit={handleRequestOldOtp}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 16px",
                  background: "rgba(59, 130, 246, 0.06)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: "10px",
                  marginBottom: 18,
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <LuShieldCheck
                  size={20}
                  style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong
                    style={{
                      color: "var(--text-primary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Dual-Verification Protection
                  </strong>
                  To protect your account, we will send an authorization code to your current email (<code>{user?.email}</code>), followed by a verification code to your new email.
                </div>
              </div>

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
                  New Email Address
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
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      if (errorMsg) setErrorMsg("");
                    }}
                    placeholder="Enter new email (e.g. name@gmail.com)"
                    autoFocus
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 40px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-input, var(--bg-surface))",
                      color: "var(--text-primary)",
                      fontSize: "0.92rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

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
                  className="profile-btn-primary"
                  disabled={isLoading || !newEmail.trim()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 18px",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor: !isLoading && newEmail.trim() ? "pointer" : "not-allowed",
                    opacity: !isLoading && newEmail.trim() ? 1 : 0.6,
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Checking Email...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <LuArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 1 && existingUser && (
            /* STEP 1 (BRANCH): Existing Email Suggests Migration */
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "16px",
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.28)",
                  borderRadius: "10px",
                  marginBottom: 18,
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <LuInfo
                  size={22}
                  style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong
                    style={{
                      color: "var(--text-primary)",
                      display: "block",
                      marginBottom: 4,
                      fontSize: "0.92rem",
                    }}
                  >
                    Account Already Exists
                  </strong>
                  An account with <strong>{existingUser.email}</strong> is already registered on MeghVault. You cannot directly change your email to an existing account.
                </div>
              </div>

              {/* Existing User Preview Card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "10px",
                  marginBottom: 20,
                }}
              >
                {existingUser.profile ? (
                  <img
                    src={existingUser.profile}
                    alt={existingUser.name}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {existingUser.name ? existingUser.name.charAt(0).toUpperCase() : "U"}
                  </div>
                )}
                <div>
                  <div
                    style={{
                      fontSize: "0.92rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {existingUser.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {existingUser.email}
                  </div>
                </div>
              </div>

              <p
                style={{
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  marginBottom: 20,
                  lineHeight: 1.5,
                }}
              >
                Would you like to <strong>transfer and migrate your files, folders, and storage</strong> from this account to <strong>{existingUser.email}</strong>?
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onStartMigration) {
                      onStartMigration(existingUser.email);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 18px",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                  }}
                >
                  <LuArrowRightLeft size={16} />
                  <span>Transfer & Migrate Storage to This Account</span>
                </button>

                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={() => {
                    setExistingUser(null);
                    setNewEmail("");
                  }}
                  style={{ justifyContent: "center" }}
                >
                  Try a Different Email Address
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            /* STEP 2: Verify Old/Current Email OTP */
            <form onSubmit={handleVerifyOldOtp}>
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
                <span>Change new email address</span>
              </div>

              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  borderRadius: "10px",
                  marginBottom: 20,
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <strong
                  style={{
                    color: "var(--primary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Step 1 of 2: Current Email Authorization
                </strong>
                A 4-digit security code was dispatched to your current email:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {user?.email}
                </strong>
                . Enter it below to authorize changing to <strong>{newEmail}</strong>.
              </div>

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
                  ref={oldOtpInputRef}
                  type="text"
                  maxLength={4}
                  value={oldOtp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setOldOtp(val);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder="&bull; &bull; &bull; &bull;"
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "2px solid rgba(59, 130, 246, 0.4)",
                    background: "var(--bg-input, var(--bg-surface))",
                    color: "var(--primary)",
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
                  Didn't receive the email?
                </span>
                {resendTimer > 0 ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    Resend in <strong>{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOldOtp}
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
                  disabled={isLoading || oldOtp.trim().length !== 4}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 18px",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor:
                      !isLoading && oldOtp.trim().length === 4
                        ? "pointer"
                        : "not-allowed",
                    opacity:
                      !isLoading && oldOtp.trim().length === 4 ? 1 : 0.6,
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Verifying Current Email...</span>
                    </>
                  ) : (
                    <>
                      <span>Authorize &amp; Continue</span>
                      <LuArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            /* STEP 3: Verify New Email OTP */
            <form onSubmit={handleConfirmNewOtp}>
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
                    setStep(2);
                    setErrorMsg("");
                  }
                }}
              >
                <LuArrowLeft size={14} />
                <span>Back to current email step</span>
              </div>

              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "10px",
                  marginBottom: 20,
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <strong
                  style={{
                    color: "#10b981",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Step 2 of 2: New Email Verification
                </strong>
                Almost done! A 4-digit confirmation code was sent to your new email:{" "}
                <strong style={{ color: "var(--text-primary)" }}>{newEmail}</strong>.
                Enter it below to confirm ownership and link this email to your account.
              </div>

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
                  4-Digit Verification Code
                </label>
                <input
                  ref={newOtpInputRef}
                  type="text"
                  maxLength={4}
                  value={newOtp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setNewOtp(val);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder="&bull; &bull; &bull; &bull;"
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "2px solid rgba(16, 185, 129, 0.4)",
                    background: "var(--bg-input, var(--bg-surface))",
                    color: "#10b981",
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
                  Didn't receive code in your new inbox?
                </span>
                {resendTimer > 0 ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    Resend in <strong>{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendNewOtp}
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
                  disabled={isLoading || newOtp.trim().length !== 4}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 18px",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor:
                      !isLoading && newOtp.trim().length === 4
                        ? "pointer"
                        : "not-allowed",
                    opacity:
                      !isLoading && newOtp.trim().length === 4 ? 1 : 0.6,
                  }}
                >
                  {isLoading ? (
                    <>
                      <LuLoader className="spin" size={16} />
                      <span>Updating Email...</span>
                    </>
                  ) : (
                    <>
                      <LuCheck size={16} />
                      <span>Confirm &amp; Update Email</span>
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

export default ChangeEmailModal;
