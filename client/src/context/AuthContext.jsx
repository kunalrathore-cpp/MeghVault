import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi } from "../api/authApi";
import { isGoogleAuthEnabled, buildGoogleAuthUrl } from "../utils/googleAuth";
import { isGithubAuthEnabled, buildGithubAuthUrl } from "../utils/githubAuth";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const profile = await authApi.getProfile();
      if (profile && profile.email) {
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Unified Authentication (Passwordless Email + OTP)
   */
  const authenticate = async ({ email, otp }) => {
    await authApi.authenticate({ email, otp });
    const profile = await authApi.getProfile();
    setUser(profile);
    return profile;
  };

  /**
   * Google OAuth 2.0 (OpenID Connect) Popup Flow
   */
  const loginWithGoogle = useCallback(async () => {
    // 1. Open popup window synchronously on user click to prevent popup blockers
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "about:blank",
      "google_oauth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );

    try {
      // 2. Fetch the secure authorization URL with CSRF state
      const { url, state } = await authApi.getGoogleAuthUrl();
      const targetUrl = isGoogleAuthEnabled && state ? buildGoogleAuthUrl({ state }) : url;

      if (popup) {
        popup.location.href = targetUrl;
      } else {
        // Fallback if popup is blocked by browser policy
        window.location.href = targetUrl;
        return;
      }

      // 3. Listen for completion message from popup across postMessage, BroadcastChannel, and localStorage
      return await new Promise((resolve, reject) => {
        let checkPopupInterval = null;
        let isResolved = false;

        const handleSuccess = async () => {
          if (isResolved) return;
          isResolved = true;
          cleanup();
          try {
            const profile = await authApi.getProfile();
            setUser(profile);
            resolve(profile);
          } catch (err) {
            reject(err);
          }
        };

        const handleError = (errMsg) => {
          if (isResolved) return;
          isResolved = true;
          cleanup();
          reject(new Error(errMsg || "Google authentication failed"));
        };

        // 1. PostMessage listener (when window.opener is attached)
        const messageListener = async (event) => {
          const allowedOrigins = ["http://localhost:4000", window.location.origin];
          if (!allowedOrigins.includes(event.origin)) return;

          if (event.data?.type === "GOOGLE_OAUTH_SUCCESS") {
            handleSuccess();
          } else if (event.data?.type === "GOOGLE_OAUTH_ERROR") {
            handleError(event.data.error);
          }
        };
        window.addEventListener("message", messageListener);

        // 2. BroadcastChannel listener (works cross-window even if window.opener was severed)
        let channel = null;
        try {
          channel = new BroadcastChannel("meghvault_oauth_channel");
          channel.onmessage = (event) => {
            if (event.data?.type === "GOOGLE_OAUTH_SUCCESS") {
              handleSuccess();
            } else if (event.data?.type === "GOOGLE_OAUTH_ERROR") {
              handleError(event.data.error);
            }
          };
        } catch {}

        // 3. LocalStorage event listener (cross-window storage fallback)
        const storageListener = (event) => {
          if (event.key === "meghvault_oauth_event" && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              if (data.type === "GOOGLE_OAUTH_SUCCESS") {
                handleSuccess();
              } else if (data.type === "GOOGLE_OAUTH_ERROR") {
                handleError(data.error);
              }
            } catch {}
          }
        };
        window.addEventListener("storage", storageListener);

        const cleanup = () => {
          window.removeEventListener("message", messageListener);
          window.removeEventListener("storage", storageListener);
          if (channel) {
            try { channel.close(); } catch {}
          }
          if (checkPopupInterval) clearInterval(checkPopupInterval);
          if (popup && !popup.closed) {
            try { popup.close(); } catch {}
          }
        };

        // Check if user manually closed popup without finishing
        checkPopupInterval = setInterval(() => {
          if (popup.closed) {
            setTimeout(() => {
              if (!isResolved) {
                cleanup();
                reject(new Error("Google sign-in was closed before completing"));
              }
            }, 600);
          }
        }, 1000);
      });
    } catch (err) {
      if (popup && !popup.closed) {
        popup.close();
      }
      throw err;
    }
  }, []);

  /**
   * GitHub OAuth 2.0 Popup Flow
   */
  const loginWithGithub = useCallback(async () => {
    // 1. Open popup window synchronously on user click to prevent popup blockers
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "about:blank",
      "github_oauth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );

    try {
      // 2. Fetch the secure authorization URL with CSRF state
      const { url, state } = await authApi.getGithubAuthUrl();
      const targetUrl = isGithubAuthEnabled && state ? buildGithubAuthUrl({ state }) : url;

      if (popup) {
        popup.location.href = targetUrl;
      } else {
        // Fallback if popup is blocked by browser policy
        window.location.href = targetUrl;
        return;
      }

      // 3. Listen for completion message from popup across postMessage, BroadcastChannel, and localStorage
      return await new Promise((resolve, reject) => {
        let checkPopupInterval = null;
        let isResolved = false;

        const handleSuccess = async () => {
          if (isResolved) return;
          isResolved = true;
          cleanup();
          try {
            const profile = await authApi.getProfile();
            setUser(profile);
            resolve(profile);
          } catch (err) {
            reject(err);
          }
        };

        const handleError = (errMsg) => {
          if (isResolved) return;
          isResolved = true;
          cleanup();
          reject(new Error(errMsg || "GitHub authentication failed"));
        };

        // 1. PostMessage listener (when window.opener is attached)
        const messageListener = async (event) => {
          const allowedOrigins = ["http://localhost:4000", window.location.origin];
          if (!allowedOrigins.includes(event.origin)) return;

          if (event.data?.type === "GITHUB_OAUTH_SUCCESS") {
            handleSuccess();
          } else if (event.data?.type === "GITHUB_OAUTH_ERROR") {
            handleError(event.data.error);
          }
        };
        window.addEventListener("message", messageListener);

        // 2. BroadcastChannel listener (works cross-window even if window.opener was severed)
        let channel = null;
        try {
          channel = new BroadcastChannel("meghvault_oauth_channel");
          channel.onmessage = (event) => {
            if (event.data?.type === "GITHUB_OAUTH_SUCCESS") {
              handleSuccess();
            } else if (event.data?.type === "GITHUB_OAUTH_ERROR") {
              handleError(event.data.error);
            }
          };
        } catch {}

        // 3. LocalStorage event listener (cross-window storage fallback)
        const storageListener = (event) => {
          if (event.key === "meghvault_oauth_event" && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              if (data.type === "GITHUB_OAUTH_SUCCESS") {
                handleSuccess();
              } else if (data.type === "GITHUB_OAUTH_ERROR") {
                handleError(data.error);
              }
            } catch {}
          }
        };
        window.addEventListener("storage", storageListener);

        const cleanup = () => {
          window.removeEventListener("message", messageListener);
          window.removeEventListener("storage", storageListener);
          if (channel) {
            try { channel.close(); } catch {}
          }
          if (checkPopupInterval) clearInterval(checkPopupInterval);
          if (popup && !popup.closed) {
            try { popup.close(); } catch {}
          }
        };

        // Check if user manually closed popup without finishing
        checkPopupInterval = setInterval(() => {
          if (popup.closed) {
            setTimeout(() => {
              if (!isResolved) {
                cleanup();
                reject(new Error("GitHub sign-in was closed before completing"));
              }
            }, 600);
          }
        }, 1000);
      });
    } catch (err) {
      if (popup && !popup.closed) {
        popup.close();
      }
      throw err;
    }
  }, []);

  const sendOTP = async (email) => {
    return authApi.sendOTP(email);
  };

  const verifyOTP = async (email, otp) => {
    return authApi.verifyOTP(email, otp);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
    }
  };

  const logoutAll = async () => {
    try {
      await authApi.logoutAll();
    } catch (err) {
      console.error("Logout all error:", err);
      throw err;
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        authenticate,
        login: authenticate,
        register: authenticate,
        loginWithGoogle,
        isGoogleAuthEnabled,
        loginWithGithub,
        isGithubAuthEnabled,
        logout,
        logoutAll,
        sendOTP,
        verifyOTP,
        refreshUser: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
