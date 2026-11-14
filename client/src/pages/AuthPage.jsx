import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuMail,
  LuArrowRight,
  LuArrowLeft,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuLoader,
  LuShieldCheck,
  LuCloudUpload,
  LuCloud,
} from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { sanitizeText } from "../utils/sanitize";

export function AuthPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [step1Error, setStep1Error] = useState("");

  const { authenticate, sendOTP, loginWithGoogle, loginWithGithub, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Handle notification or error query parameter if redirected
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const messageParam = params.get("message");
    const deletedParam = params.get("deleted");

    if (errorParam) {
      showError(decodeURIComponent(errorParam));
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (deletedParam || messageParam) {
      try {
        if (!sessionStorage.getItem("meghvault_flash_toast_shown")) {
          showSuccess(
            messageParam
              ? decodeURIComponent(messageParam)
              : "Your account, profile, and all associated cloud files have been permanently wiped."
          );
        }
      } catch {
        showSuccess(
          messageParam
            ? decodeURIComponent(messageParam)
            : "Your account, profile, and all associated cloud files have been permanently wiped."
        );
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showError, showSuccess]);

  // Email validation rule
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Countdown timer for resend OTP in Step 2
  useEffect(() => {
    let interval = null;
    if (step === 2 && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, resendTimer]);

  // Step 1: Send OTP and Proceed to Step 2
  const handleProceedToOtp = async (e) => {
    e.preventDefault();
    if (!isEmailValid || isSendingOtp) return;

    setIsSendingOtp(true);
    setStep1Error("");

    try {
      const cleanEmail = sanitizeText(email);
      await sendOTP(cleanEmail);
      setStep(2);
      setOtp("");
      setOtpError("");
      setOtpSuccess("Verification code sent to your email!");
      setResendTimer(60);
      showSuccess(`Verification code sent to ${cleanEmail}`);
    } catch (err) {
      const msg = err.message || "Failed to send verification code. Please try again.";
      setStep1Error(msg);
      showError(msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Resend Code
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isSendingOtp) return;

    setIsSendingOtp(true);
    setOtpError("");
    setOtpSuccess("");

    try {
      const cleanEmail = sanitizeText(email);
      await sendOTP(cleanEmail);
      setResendTimer(60);
      setOtp("");
      setOtpSuccess("New 4-digit verification code sent to your email!");
      showSuccess(`Verification code resent to ${cleanEmail}`);
    } catch (err) {
      const msg = err.message || "Failed to resend verification code.";
      setOtpError(msg);
      showError(msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Verify & Authenticate
  const handleVerifyAndAuth = async (e) => {
    e.preventDefault();
    setOtpError("");

    const cleanOtp = sanitizeText(otp);
    if (cleanOtp.length !== 4) {
      setOtpError("Please enter a valid 4-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authenticate({
        email: sanitizeText(email),
        otp: cleanOtp,
      });

      showSuccess("Welcome to MeghVault!");
      navigate("/", { replace: true });
    } catch (err) {
      setOtpError(err.message || "Invalid credentials or verification code.");
      showError(err.message || "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google OAuth 2.0 (OpenID Connect) Handler
  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);

    try {
      await loginWithGoogle();
      showSuccess("Welcome to MeghVault!");
      navigate("/", { replace: true });
    } catch (err) {
      if (!err.message?.includes("closed before completing")) {
        showError(err.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // GitHub OAuth 2.0 Handler
  const handleGithubSignIn = async () => {
    if (isGithubLoading) return;
    setIsGithubLoading(true);

    try {
      await loginWithGithub();
      showSuccess("Welcome to MeghVault!");
      navigate("/", { replace: true });
    } catch (err) {
      if (!err.message?.includes("closed before completing")) {
        showError(err.message || "GitHub sign-in failed. Please try again.");
      }
    } finally {
      setIsGithubLoading(false);
    }
  };

  // Other OAuth providers placeholder
  const handleOAuthClick = (providerName) => {
    showSuccess(`${providerName} authentication is coming soon!`);
  };

  return (
    <div className="auth-page">
      <div className="auth-glow-1" />
      <div className="auth-glow-2" />

      <div className="auth-card register-redesign-card">
        {/* Brand Header */}
        <div className="auth-header">
          <Link to="/" className="auth-brand-logo-link" title="MeghVault">
            <img
              src="/meghvault-logo.svg"
              alt="MeghVault"
              className="auth-brand-logo"
            />
            <span className="auth-brand-name">
              Megh<span className="brand-vault-text">Vault</span>
            </span>
          </Link>

          <h1 className="auth-title">
            {step === 1 ? "Welcome to MeghVault" : "Verify Your Identity"}
          </h1>
          <p className="auth-subtitle">
            {step === 1
              ? "Enter your email to sign in or create your account"
              : "Enter the verification code sent to your email"}
          </p>
        </div>

        {/* Stepper Progress Bar */}
        <div className="auth-stepper-container">
          <div className="auth-stepper-track">
            {/* Step 1 Node */}
            <div className={`stepper-node ${step >= 1 ? "active" : ""}`}>
              <div className="stepper-circle">
                {step > 1 ? <LuCheck size={16} /> : "1"}
              </div>
              <span className="stepper-label">Account</span>
            </div>

            {/* Connecting Line */}
            <div className="stepper-line-wrapper">
              <div
                className={`stepper-line-fill ${step === 2 ? "completed" : ""}`}
              />
            </div>

            {/* Step 2 Node */}
            <div className={`stepper-node ${step === 2 ? "active" : ""}`}>
              <div className="stepper-circle">2</div>
              <span className="stepper-label">Verify Email</span>
            </div>
          </div>
        </div>

        {/* ========================================================
            STEP 1: Email Form (Passwordless)
           ======================================================== */}
        {step === 1 && (
          <form className="auth-form" onSubmit={handleProceedToOtp}>
            {/* Email Address */}
            <div className="form-field">
              <label htmlFor="auth-email" className="form-label">
                Email Address
              </label>
              <div className="input-icon-group">
                <LuMail className="input-leading-icon" />
                <input
                  id="auth-email"
                  type="email"
                  name="email"
                  className="auth-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (step1Error) setStep1Error("");
                  }}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {/* Step 1 Error Alert */}
            {step1Error && (
              <div className="auth-alert auth-alert-error">
                <LuCircleAlert style={{ flexShrink: 0, fontSize: "1.1rem" }} />
                <span>{step1Error}</span>
              </div>
            )}

            {/* Continue Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={!isEmailValid || isSendingOtp}
            >
              {isSendingOtp ? (
                <>
                  <LuLoader style={{ animation: "spin 1s linear infinite" }} />
                  <span>Sending Verification Code...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <LuArrowRight size={18} />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="auth-divider">
              <span className="divider-line" />
              <span className="divider-text">Or continue with</span>
              <span className="divider-line" />
            </div>

            {/* OAuth Buttons Stack (Official Color Brand Icons) */}
            <div className="oauth-buttons-stack">
              <button
                type="button"
                className="oauth-provider-btn"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                title="Sign in with Google"
              >
                {isGoogleLoading ? (
                  <>
                    <LuLoader
                      size={18}
                      className="oauth-btn-icon"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <FcGoogle size={20} className="oauth-btn-icon" />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="oauth-provider-btn"
                onClick={handleGithubSignIn}
                disabled={isGithubLoading}
                title="Sign in with GitHub"
              >
                {isGithubLoading ? (
                  <>
                    <LuLoader
                      size={18}
                      className="oauth-btn-icon"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    <span>Connecting to GitHub...</span>
                  </>
                ) : (
                  <>
                    <FaGithub size={19} className="oauth-btn-icon github-oauth-icon" />
                    <span>Continue with GitHub</span>
                  </>
                )}
              </button>
            </div>

            {/* Trust & Security Feature Badges */}
            <div className="auth-trust-badges-row">
              <div className="trust-badge-item">
                <LuShieldCheck className="trust-badge-icon" />
                <span>Secure & Private</span>
              </div>
              <div className="trust-badge-item">
                <LuCloudUpload className="trust-badge-icon" />
                <span>Fast Upload</span>
              </div>
              <div className="trust-badge-item">
                <LuCloud className="trust-badge-icon" />
                <span>Cloud Storage</span>
              </div>
            </div>

            {/* Terms and Privacy Policy Note */}
            <p className="auth-terms-note">
              By continuing, you agree to our <a href="#terms">Terms of Service</a>. Learn how we collect, use, and protect your information in our <a href="#privacy">Privacy Policy</a>.
            </p>
          </form>
        )}

        {/* ========================================================
            STEP 2: OTP Email Verification Form
           ======================================================== */}
        {step === 2 && (
          <form className="auth-form" onSubmit={handleVerifyAndAuth}>
            {/* Email Sent Banner */}
            <div className="otp-email-sent-pill">
              <span>We've sent a 4-digit verification code to</span>
              <strong className="sent-email-highlight">{email}</strong>
            </div>

            {/* OTP Success Status */}
            {otpSuccess && !otpError && (
              <div className="auth-alert auth-alert-success">
                <LuCircleCheck style={{ flexShrink: 0, fontSize: "1.1rem" }} />
                <span>{otpSuccess}</span>
              </div>
            )}

            {/* OTP Expired Notice */}
            {resendTimer === 0 && !otpError && (
              <div className="otp-expired-warning">
                OTP expired
              </div>
            )}

            {/* OTP Error Status */}
            {otpError && (
              <div className="auth-alert auth-alert-error">
                <LuCircleAlert style={{ flexShrink: 0, fontSize: "1.1rem" }} />
                <span>{otpError}</span>
              </div>
            )}

            {/* Verification Code Input */}
            <div className="form-field">
              <label htmlFor="auth-otp-input" className="form-label">
                Verification Code
              </label>
              <div className="otp-input-wrapper">
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  className={`auth-input otp-digit-input ${otpError ? "has-error" : ""}`}
                  placeholder="Enter 4-digit code"
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setOtp(val);
                    if (otpError) setOtpError("");
                  }}
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Back to Details & Resend Code Controls */}
            <div className="otp-controls-row">
              <button
                type="button"
                className="otp-back-link-btn"
                onClick={() => {
                  setStep(1);
                  setOtpError("");
                  setOtpSuccess("");
                  setStep1Error("");
                }}
              >
                <LuArrowLeft size={16} />
                <span>Back to Details</span>
              </button>

              <button
                type="button"
                className={`otp-resend-link-btn ${resendTimer > 0 || isSendingOtp ? "disabled" : ""}`}
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || isSendingOtp}
              >
                {isSendingOtp
                  ? "Sending..."
                  : resendTimer > 0
                  ? `Resend Code (${resendTimer}s)`
                  : "Resend Code"}
              </button>
            </div>

            {/* Verify & Sign In Submit Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isSubmitting || otp.trim().length !== 4}
            >
              {isSubmitting ? (
                <>
                  <LuLoader style={{ animation: "spin 1s linear infinite" }} />
                  <span>Verifying & Signing in...</span>
                </>
              ) : (
                <>
                  <span>Verify & Continue</span>
                  <LuArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
