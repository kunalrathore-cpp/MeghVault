import { apiRequest } from "./client";

/**
 * Authentication API Service (Unified Passwordless Email + OTP)
 */
export const authApi = {
  /**
   * Get current authenticated user profile
   */
  async getProfile() {
    return apiRequest("/api/user", { method: "GET" });
  },

  /**
   * Authenticate user with Email and 4-digit OTP
   * (Auto-provisions new users or signs in existing users)
   * @param {{ email: string, otp: string }} credentials
   */
  async authenticate(credentials) {
    return apiRequest("/api/auth", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  /**
   * Backward-compatible login alias
   */
  async login(credentials) {
    return this.authenticate(credentials);
  },

  /**
   * Backward-compatible register alias
   */
  async register(data) {
    return this.authenticate(data);
  },

  /**
   * Send 4-digit OTP to user's email
   * @param {string} email
   */
  async sendOTP(email) {
    return apiRequest("/api/otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Verify OTP for email (standalone check if needed)
   * @param {string} email
   * @param {string} otp
   */
  async verifyOTP(email, otp) {
    return apiRequest("/api/otp/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  },

  /**
   * Get Google OAuth 2.0 authorization URL
   */
  async getGoogleAuthUrl() {
    return apiRequest("/api/auth/google/url", {
      method: "GET",
    });
  },

  /**
   * Get GitHub OAuth 2.0 authorization URL
   */
  async getGithubAuthUrl() {
    return apiRequest("/api/auth/github/url", {
      method: "GET",
    });
  },

  /**
   * Update user profile settings
   * @param {{ name?: string, preferences?: { showAllActionsDirectly?: boolean } }} data
   */
  async updateProfile(data) {
    return apiRequest("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /**
   * Log out current user
   */
  async logout() {
    return apiRequest("/api/user/logout", {
      method: "POST",
    });
  },

  /**
   * Log out user from all devices / sessions
   */
  async logoutAll() {
    return apiRequest("/api/user/logout-all", {
      method: "POST",
    });
  },

  /**
   * Request OTP code for account ownership transfer to target email
   * @param {string} targetEmail
   */
  async requestOwnershipTransferOtp(targetEmail) {
    return apiRequest("/api/user/transfer-ownership/request-otp", {
      method: "POST",
      body: JSON.stringify({ targetEmail }),
    });
  },

  /**
   * Confirm and execute ownership transfer and permanent account deletion
   * @param {{ targetEmail: string, otp: string }} data
   */
  async confirmOwnershipTransfer(data) {
    return apiRequest("/api/user/transfer-ownership/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Request OTP code for permanent self account deletion
   */
  async requestDeleteAccountOtp() {
    return apiRequest("/api/user/delete-account/request-otp", {
      method: "POST",
    });
  },

  /**
   * Confirm and execute permanent self account deletion
   * @param {{ otp: string, confirmationText?: string }} data
   */
  async confirmDeleteAccount(data) {
    return apiRequest("/api/user/delete-account/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Step 1: Request Email Change & Dispatch OTP to Old/Current Email
   * (Also checks if email already exists to suggest migration)
   * @param {string} newEmail
   */
  async requestChangeEmailOldOtp(newEmail) {
    return apiRequest("/api/user/change-email/request-old-otp", {
      method: "POST",
      body: JSON.stringify({ newEmail }),
    });
  },

  /**
   * Step 2: Verify Old/Current Email OTP & Dispatch OTP to New Email
   * @param {{ newEmail: string, otp: string }} data
   */
  async verifyChangeEmailOldOtp(data) {
    return apiRequest("/api/user/change-email/verify-old-otp", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Resend OTP to New Email during Step 2
   * @param {{ newEmail: string, changeToken: string }} data
   */
  async resendChangeEmailNewOtp(data) {
    return apiRequest("/api/user/change-email/resend-new-otp", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Step 3: Verify New Email OTP & Atomically Commit Email Update
   * @param {{ newEmail: string, otp: string, changeToken: string }} data
   */
  async confirmChangeEmailNewOtp(data) {
    return apiRequest("/api/user/change-email/confirm-new-otp", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
