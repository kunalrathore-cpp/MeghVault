import React, { useState, useEffect, useRef } from "react";
import {
  LuTrash2,
  LuTriangleAlert,
  LuLoader,
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

export function DeleteAccountCard({ onCancelled, onDeleted }) {
  const { user, logout } = useAuth();
  const { showSuccess, showError, flashToast } = useToast();

  const [step, setStep] = useState(1); // 1: Info & phrase confirm, 2: OTP verification
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const otpInputRef = useRef(null);
  const timerRef = useRef(null);

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
      showSuccess(res.message || `Deletion confirmation code sent to ${user?.email}`);
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

      if (onDeleted) onDeleted();

      try {
        await logout();
      } catch {}
      window.location.replace("/auth?deleted=true");
    } catch (err) {
      setErrorMsg(err.message || "Failed to execute permanent account deletion.");
      setIsLoading(false);
    }
  };

  return (
    <div
      className="profile-section-card danger-zone"
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div className="profile-card-header">
        <div className="profile-card-header-left">
          <div className="profile-card-header-icon danger">
            <LuShieldAlert />
          </div>
          <div className="profile-card-header-titles">
            <h2 className="profile-card-title" style={{ color: "#ef4444" }}>
              Delete My Account
            </h2>
            <span className="profile-card-desc">
              Irreversible, permanent account destruction and storage file purging
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 0" }}>
        {step === 1 ? (
          <form onSubmit={handleRequestOtp}>
            {/* Warning Callout */}
            <div
              style={{
                display: "flex",
                gap: 14,
                padding: "16px 18px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "12px",
                marginBottom: 20,
                fontSize: "0.88rem",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              <LuTriangleAlert
                size={24}
                style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }}
              />
              <div>
                <strong
                  style={{
                    color: "#ef4444",
                    display: "block",
                    marginBottom: 4,
                    fontSize: "0.95rem",
                  }}
                >
                  Warning: This action cannot be reversed
                </strong>
                Deleting your account will permanently wipe all files, folders, shared resources,
                and active browser sessions from MeghVault. Once executed, no administrator or engineer can restore your data.
              </div>
            </div>

            {/* Impact List */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 24,
                padding: "16px 18px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                <LuFileX size={18} style={{ color: "#ef4444", flexShrink: 0 }} />
                <span>All documents, photos, and files are permanently purged from disk storage.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                <LuLayers size={18} style={{ color: "#ef4444", flexShrink: 0 }} />
                <span>All folder trees and directories are completely deleted.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                <LuShare2 size={18} style={{ color: "#ef4444", flexShrink: 0 }} />
                <span>All shared links and collaborator permissions are immediately invalidated.</span>
              </div>
            </div>

            {/* Confirmation Input */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                To confirm, type <code style={{ color: "#ef4444", background: "rgba(239, 68, 68, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>{user?.email || "DELETE"}</code>:
              </label>
              <input
                type="text"
                value={confirmPhrase}
                onChange={(e) => {
                  setConfirmPhrase(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder={`Type ${user?.email || "DELETE"} to confirm`}
                disabled={isLoading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: isPhraseMatched
                    ? "1px solid #ef4444"
                    : "1px solid var(--border-light)",
                  background: "var(--bg-input, var(--bg-surface))",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "#ef4444",
                  fontSize: "0.86rem",
                  marginBottom: 16,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              {onCancelled && (
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={onCancelled}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              )}

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
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <>
                    <LuKeyRound size={16} />
                    <span>Send Verification Code</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmDelete}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "0.86rem",
                width: "fit-content",
              }}
              onClick={() => {
                if (!isLoading) {
                  setStep(1);
                  setErrorMsg("");
                }
              }}
            >
              <LuArrowLeft size={16} />
              <span>Back to safety</span>
            </div>

            <div
              style={{
                padding: "16px 18px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "12px",
                marginBottom: 20,
                fontSize: "0.88rem",
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
                Enter Authorization Code
              </strong>
              We have sent a 4-digit deletion authorization code to{" "}
              <strong style={{ color: "var(--text-primary)" }}>{user?.email}</strong>.
              Enter it below to authorize permanent deletion.
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
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
                  padding: "16px 20px",
                  borderRadius: "8px",
                  border: "2px solid rgba(239, 68, 68, 0.4)",
                  background: "var(--bg-input, var(--bg-surface))",
                  color: "#ef4444",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  letterSpacing: "14px",
                  textAlign: "center",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.84rem",
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

            {errorMsg && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "#ef4444",
                  fontSize: "0.86rem",
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
              }}
            >
              {onCancelled && (
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={onCancelled}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              )}

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
                    <span>Deleting Account...</span>
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
  );
}

export default DeleteAccountCard;
