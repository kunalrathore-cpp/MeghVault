import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuSettings,
  LuPalette,
  LuShieldCheck,
  LuCircleUser,
  LuSun,
  LuMoon,
  LuSlidersHorizontal,
  LuListChecks,
  LuEllipsisVertical,
  LuShare2,
  LuDownload,
  LuStar,
  LuEye,
  LuInfo,
  LuFilePen,
  LuTrash2,
  LuCheck,
  LuFileText,
  LuSave,
  LuCamera,
  LuUpload,
  LuRefreshCw,
  LuLogOut,
  LuMonitorSmartphone,
  LuKey,
  LuMail,
  LuShieldAlert,
  LuArrowRightLeft,
} from "react-icons/lu";
import { FaGoogle, FaGithub } from "react-icons/fa";
import { AppLayout } from "../components/layout/AppLayout";
import { LogoutAllModal } from "../components/modals/LogoutAllModal";
import { TransferOwnershipModal } from "../components/modals/TransferOwnershipModal";
import { DeleteAccountModal } from "../components/modals/DeleteAccountModal";
import { ChangeEmailModal } from "../components/modals/ChangeEmailModal";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { authApi } from "../api/authApi";

const SETTINGS_TABS = [
  {
    id: "appearance",
    label: "Appearance",
    icon: LuPalette,
  },
  {
    id: "security",
    label: "Privacy & Security",
    icon: LuShieldCheck,
  },
  {
    id: "account",
    label: "Account",
    icon: LuCircleUser,
  },
];

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showAllActionsDirectly, setShowAllActionsDirectly } = usePreferences();
  const { showSuccess, showError } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabFromUrl = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState(() => {
    if (
      currentTabFromUrl &&
      SETTINGS_TABS.some((t) => t.id === currentTabFromUrl)
    ) {
      return currentTabFromUrl;
    }
    return "appearance";
  });

  const [name, setName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showLogoutAllModal, setShowLogoutAllModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [migrationTargetEmail, setMigrationTargetEmail] = useState("");
  const fileInputRef = useRef(null);

  // Sync tab with URL search parameter if changed externally
  useEffect(() => {
    if (
      currentTabFromUrl &&
      SETTINGS_TABS.some((t) => t.id === currentTabFromUrl) &&
      currentTabFromUrl !== activeTab
    ) {
      setActiveTab(currentTabFromUrl);
    }
  }, [currentTabFromUrl, activeTab]);

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    } else if (user?.email) {
      setName(user.email.split("@")[0]);
    }
  }, [user?.name, user?.email]);

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showError("Display name cannot be empty");
      return;
    }

    setIsSavingName(true);
    try {
      await authApi.updateProfile({ name: name.trim() });
      await refreshUser?.();
      showSuccess("Display name updated successfully");
    } catch (err) {
      console.error("Save name error:", err);
      showError(err.message || "Failed to update display name");
    } finally {
      setIsSavingName(false);
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showError("Please select a valid image file (PNG, JPG, WebP)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError("Image size must be under 10MB");
      return;
    }

    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Crop and optimize to 320x320 for sharp display and low footprint
          const canvas = document.createElement("canvas");
          const size = 320;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");

          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
          const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.88);

          await authApi.updateProfile({ profile: optimizedDataUrl });
          await refreshUser?.();
          showSuccess("Profile picture updated successfully");
        } catch (err) {
          console.error("Upload photo error:", err);
          showError(err.message || "Failed to update profile picture");
        } finally {
          setIsUploadingPhoto(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      img.onerror = () => {
        showError("Failed to process selected image");
        setIsUploadingPhoto(false);
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      showError("Failed to read image file");
      setIsUploadingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    setIsUploadingPhoto(true);
    try {
      await authApi.updateProfile({ profile: null });
      await refreshUser?.();
      showSuccess("Profile picture reset to default avatar");
    } catch (err) {
      console.error("Reset photo error:", err);
      showError(err.message || "Failed to reset profile picture");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSelectMode = (direct) => {
    setShowAllActionsDirectly(direct);
    if (direct) {
      showSuccess("Action buttons mode set to 'Direct Inline Actions'");
    } else {
      showSuccess("Action buttons mode set to 'More Options Menu (...)'");
    }
  };

  const formatAuthProvider = (provider) => {
    if (!provider) return "Email OTP";
    if (typeof provider === "string") return provider;
    const list = [];
    if (provider.googleAuth) list.push("Google");
    if (provider.githubAuth) list.push("GitHub");
    if (provider.emailAuth || list.length === 0) list.push("Email OTP");
    return list.join(", ");
  };

  const userInitial = (user?.name || user?.email || "U")
    .charAt(0)
    .toUpperCase();
  const roleName = user?.role || "User";
  const authProviderLabel = formatAuthProvider(user?.authProvider);

  return (
    <AppLayout canUpload={false}>
      <div className="profile-page-container">
        {/* Modern Hero Header Matching Design Reference */}
        <header className="settings-hero-header">
          <div className="settings-hero-icon-box">
            <LuSettings />
          </div>
          <div className="settings-hero-text">
            <h1 className="settings-hero-title">Settings</h1>
            <p className="settings-hero-subtitle">
              Customize your MeghVault experience and manage your preferences.
            </p>
          </div>
        </header>

        {/* Navigation Tabs Bar */}
        <nav
          className="settings-tabs-nav"
          role="tablist"
          aria-label="Settings categories"
        >
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`settings-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => handleTabSelect(tab.id)}
              >
                <Icon className="settings-tab-icon" />
                <span>{tab.label}</span>
                {isActive && <span className="settings-tab-indicator" />}
              </button>
            );
          })}
        </nav>

        {/* =========================================================================
            TAB 1: APPEARANCE
            ========================================================================= */}
        {activeTab === "appearance" && (
          <div
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="tab-appearance"
          >
            {/* Section: Interface Theme Mode */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuPalette />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Interface Theme</h2>
                    <span className="profile-card-desc">
                      Select your preferred visual style and contrast
                    </span>
                  </div>
                </div>
              </div>

              <div className="profile-mode-selector-grid">
                {/* Dark Theme Card */}
                <div
                  className={`profile-mode-card ${theme === "dark" ? "selected" : ""}`}
                  onClick={() => setTheme("dark")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setTheme("dark");
                  }}
                >
                  <div className="profile-mode-card-top">
                    <div className="profile-mode-card-title-group">
                      <div className="profile-mode-icon-circle">
                        <LuMoon />
                      </div>
                      <h3 className="profile-mode-card-title">Dark Mode</h3>
                    </div>
                    <span
                      className={`profile-mode-status-badge ${
                        theme === "dark" ? "active-badge" : "inactive-badge"
                      }`}
                    >
                      {theme === "dark" ? (
                        <>
                          <LuCheck size={12} /> Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </span>
                  </div>
                  <p className="profile-mode-card-desc">
                    Deep modern palette designed for comfortable viewing in low light.
                  </p>
                  <div className="theme-dark-preview">
                    <div className="theme-mock-sidebar" />
                    <div className="theme-mock-body">
                      <div className="theme-mock-topbar" />
                      <div className="theme-mock-cards-row">
                        <div className="theme-mock-card" />
                        <div className="theme-mock-card" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Light Theme Card */}
                <div
                  className={`profile-mode-card ${theme === "light" ? "selected" : ""}`}
                  onClick={() => setTheme("light")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setTheme("light");
                  }}
                >
                  <div className="profile-mode-card-top">
                    <div className="profile-mode-card-title-group">
                      <div className="profile-mode-icon-circle">
                        <LuSun />
                      </div>
                      <h3 className="profile-mode-card-title">Light Mode</h3>
                    </div>
                    <span
                      className={`profile-mode-status-badge ${
                        theme === "light" ? "active-badge" : "inactive-badge"
                      }`}
                    >
                      {theme === "light" ? (
                        <>
                          <LuCheck size={12} /> Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </span>
                  </div>
                  <p className="profile-mode-card-desc">
                    Clean, bright high-contrast layout optimized for daylight clarity.
                  </p>
                  <div className="theme-light-preview">
                    <div className="theme-mock-sidebar" />
                    <div className="theme-mock-body">
                      <div className="theme-mock-topbar" />
                      <div className="theme-mock-cards-row">
                        <div className="theme-mock-card" />
                        <div className="theme-mock-card" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Action Menu Style Preference */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuSlidersHorizontal />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Action Menu Style</h2>
                    <span className="profile-card-desc">
                      Choose how actions (Share, Download, Star, Preview, Delete) appear across file rows and cards
                    </span>
                  </div>
                </div>
              </div>

              <div className="profile-mode-selector-grid">
                {/* Mode A: Clean More Option Button */}
                <div
                  className={`profile-mode-card ${!showAllActionsDirectly ? "selected" : ""}`}
                  onClick={() => handleSelectMode(false)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleSelectMode(false);
                  }}
                >
                  <div className="profile-mode-card-top">
                    <div className="profile-mode-card-title-group">
                      <div className="profile-mode-icon-circle">
                        <LuEllipsisVertical />
                      </div>
                      <h3 className="profile-mode-card-title">
                        More Option Menu (...)
                      </h3>
                    </div>
                    <span
                      className={`profile-mode-status-badge ${
                        !showAllActionsDirectly ? "active-badge" : "inactive-badge"
                      }`}
                    >
                      {!showAllActionsDirectly ? (
                        <>
                          <LuCheck size={12} /> Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </span>
                  </div>

                  <p className="profile-mode-card-desc">
                    Shows only the vertical three-dots button. Clean, clutter-free minimalist interface where all actions open inside a tidy dropdown.
                  </p>

                  <div className="profile-preview-box">
                    <div className="profile-preview-item">
                      <LuFileText className="profile-preview-file-icon" />
                      <span>Document.pdf</span>
                    </div>
                    <div className="profile-preview-actions-strip">
                      <div
                        className="profile-preview-mini-btn more-btn"
                        title="More Options"
                      >
                        <LuEllipsisVertical size={14} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mode B: Direct Inline Actions */}
                <div
                  className={`profile-mode-card ${showAllActionsDirectly ? "selected" : ""}`}
                  onClick={() => handleSelectMode(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleSelectMode(true);
                  }}
                >
                  <div className="profile-mode-card-top">
                    <div className="profile-mode-card-title-group">
                      <div className="profile-mode-icon-circle">
                        <LuListChecks />
                      </div>
                      <h3 className="profile-mode-card-title">
                        Direct Inline Actions
                      </h3>
                    </div>
                    <span
                      className={`profile-mode-status-badge ${
                        showAllActionsDirectly ? "active-badge" : "inactive-badge"
                      }`}
                    >
                      {showAllActionsDirectly ? (
                        <>
                          <LuCheck size={12} /> Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </span>
                  </div>

                  <p className="profile-mode-card-desc">
                    Shows all action buttons directly on each file and folder without hiding them behind a menu. Ideal for rapid one-click file operations.
                  </p>

                  <div className="profile-preview-box">
                    <div className="profile-preview-item">
                      <LuFileText className="profile-preview-file-icon" />
                      <span>Document.pdf</span>
                    </div>
                    <div className="profile-preview-actions-strip">
                      <div className="profile-preview-mini-btn" title="Share">
                        <LuShare2 size={12} />
                      </div>
                      <div className="profile-preview-mini-btn" title="Download">
                        <LuDownload size={12} />
                      </div>
                      <div className="profile-preview-mini-btn" title="Star">
                        <LuStar size={12} />
                      </div>
                      <div className="profile-preview-mini-btn" title="Preview">
                        <LuEye size={12} />
                      </div>
                      <div className="profile-preview-mini-btn" title="Info">
                        <LuInfo size={12} />
                      </div>
                      <div className="profile-preview-mini-btn" title="Rename">
                        <LuFilePen size={12} />
                      </div>
                      <div
                        className="profile-preview-mini-btn trash-btn"
                        title="Trash"
                      >
                        <LuTrash2 size={12} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 2: PRIVACY & SECURITY
            ========================================================================= */}
        {activeTab === "security" && (
          <div
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="tab-security"
          >
            {/* Section: Security & Active Sessions */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuShieldCheck />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Security & Sessions</h2>
                    <span className="profile-card-desc">
                      Manage authenticated devices and active browser logins
                    </span>
                  </div>
                </div>
              </div>

              <div className="profile-settings-row">
                <div className="profile-settings-row-info">
                  <span className="profile-settings-row-title">
                    Session Management
                  </span>
                  <span className="profile-settings-row-desc">
                    Log out from this browser session or revoke all active logins across all your devices.
                  </span>
                </div>
                <div className="profile-security-actions">
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={logout}
                  >
                    <LuLogOut size={16} />
                    <span>Log out</span>
                  </button>

                  <button
                    type="button"
                    className="profile-btn-danger-outline"
                    onClick={() => setShowLogoutAllModal(true)}
                  >
                    <LuMonitorSmartphone size={16} />
                    <span>Log out all devices</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Section: Linked Authentication Credentials */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuKey />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Authentication Methods</h2>
                    <span className="profile-card-desc">
                      Verified sign-in providers and credentials linked to your MeghVault account
                    </span>
                  </div>
                </div>
              </div>

              <div className="security-auth-list">
                {/* 1. Email Verification */}
                <div className="security-auth-row">
                  <div className="security-auth-row-left">
                    <div className="security-auth-icon-wrap email">
                      <LuMail />
                    </div>
                    <div className="security-auth-info">
                      <span className="security-auth-name">
                        Email OTP Verification
                      </span>
                      <span className="security-auth-detail">
                        Primary passwordless login &bull; {user?.email}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setShowChangeEmailModal(true)}
                      className="profile-btn-secondary"
                      style={{ padding: "5px 12px", fontSize: "0.8rem", borderRadius: "9999px" }}
                    >
                      Change Email
                    </button>
                    <span className="security-auth-badge connected">
                      <LuCheck size={12} /> Primary &amp; Verified
                    </span>
                  </div>
                </div>

                {/* 2. Google OAuth */}
                <div className="security-auth-row">
                  <div className="security-auth-row-left">
                    <div className="security-auth-icon-wrap google">
                      <FaGoogle />
                    </div>
                    <div className="security-auth-info">
                      <span className="security-auth-name">
                        Google Account
                      </span>
                      <span className="security-auth-detail">
                        {user?.authProvider?.googleAuth
                          ? "Linked Google OAuth 2.0 profile for single sign-on"
                          : "Connect your Google account for one-click secure sign-in"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`security-auth-badge ${
                      user?.authProvider?.googleAuth ? "connected" : "unconnected"
                    }`}
                  >
                    {user?.authProvider?.googleAuth ? (
                      <>
                        <LuCheck size={12} /> Connected
                      </>
                    ) : (
                      "Not Linked"
                    )}
                  </span>
                </div>

                {/* 3. GitHub OAuth */}
                <div className="security-auth-row">
                  <div className="security-auth-row-left">
                    <div className="security-auth-icon-wrap github">
                      <FaGithub />
                    </div>
                    <div className="security-auth-info">
                      <span className="security-auth-name">
                        GitHub Account
                      </span>
                      <span className="security-auth-detail">
                        {user?.authProvider?.githubAuth
                          ? "Linked GitHub developer account for fast authentication"
                          : "Connect your GitHub account for developer SSO access"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`security-auth-badge ${
                      user?.authProvider?.githubAuth ? "connected" : "unconnected"
                    }`}
                  >
                    {user?.authProvider?.githubAuth ? (
                      <>
                        <LuCheck size={12} /> Connected
                      </>
                    ) : (
                      "Not Linked"
                    )}
                  </span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 3: ACCOUNT
            ========================================================================= */}
        {activeTab === "account" && (
          <div
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="tab-account"
          >
            {/* Section: User Profile Identity */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuCircleUser />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">User Identity</h2>
                    <span className="profile-card-desc">
                      Your public name, avatar, email, and account status
                    </span>
                  </div>
                </div>
              </div>

              <div className="profile-identity-layout">
                <div className="profile-avatar-column">
                  <div
                    className="profile-avatar-wrapper"
                    onClick={() => fileInputRef.current?.click()}
                    title="Click to change profile picture"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        fileInputRef.current?.click();
                    }}
                  >
                    {user?.profile ? (
                      <img
                        src={user.profile}
                        alt={user.name || "User Avatar"}
                        className="profile-avatar-img"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="profile-avatar-fallback">{userInitial}</div>
                    )}

                    <div className="profile-avatar-overlay">
                      <LuCamera size={20} />
                      <span>Change</span>
                    </div>

                    <div className="profile-avatar-badge" title="Change photo">
                      <LuCamera size={14} />
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={handlePhotoSelect}
                  />

                  <div className="profile-avatar-actions">
                    <button
                      type="button"
                      className="profile-avatar-action-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      title="Upload image from your computer"
                    >
                      <LuUpload size={13} />
                      <span>{isUploadingPhoto ? "Saving..." : "Upload Photo"}</span>
                    </button>

                    <button
                      type="button"
                      className="profile-avatar-action-btn danger-action"
                      onClick={handleRemovePhoto}
                      disabled={isUploadingPhoto}
                      title="Reset to generated avatar"
                    >
                      <LuRefreshCw size={13} />
                      <span>Reset Avatar</span>
                    </button>
                  </div>
                </div>

                <div className="profile-identity-details">
                  <div className="profile-badges-row">
                    <span
                      className={`profile-badge ${
                        roleName === "Admin" ? "badge-role-admin" : "badge-role-user"
                      }`}
                    >
                      <LuShieldCheck size={13} />
                      <span>{roleName}</span>
                    </span>
                    <span className="profile-badge badge-provider">
                      Provider: {authProviderLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowChangeEmailModal(true)}
                      className="profile-badge badge-provider"
                      style={{
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                      title="Click to change account email"
                    >
                      <LuMail size={12} />
                      <span>{user?.email}</span>
                      <span style={{ color: "var(--primary)", fontWeight: 700, marginLeft: 2 }}>
                        &bull; Change
                      </span>
                    </button>
                  </div>

                  <form className="profile-name-form" onSubmit={handleSaveName}>
                    <div className="profile-input-wrap">
                      <input
                        type="text"
                        className="profile-input-text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter display name"
                        aria-label="Display Name"
                      />
                    </div>
                    <button
                      type="submit"
                      className="profile-save-btn"
                      disabled={isSavingName || !name.trim()}
                    >
                      <LuSave size={16} />
                      <span>{isSavingName ? "Saving..." : "Save Name"}</span>
                    </button>
                  </form>
                </div>
              </div>
            </section>

            {/* Section: Account Overview & Details */}
            <section className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon">
                    <LuInfo />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Account Details</h2>
                    <span className="profile-card-desc">
                      Membership information and system identifiers
                    </span>
                  </div>
                </div>
              </div>

              <div className="account-meta-grid">
                <div className="account-meta-card">
                  <span className="account-meta-label">User ID</span>
                  <span className="account-meta-value">{user?.id || "N/A"}</span>
                </div>
                <div className="account-meta-card">
                  <span className="account-meta-label">Role Access</span>
                  <span className="account-meta-value">{roleName}</span>
                </div>
                <div className="account-meta-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="account-meta-label">Primary Email</span>
                    <button
                      type="button"
                      onClick={() => setShowChangeEmailModal(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--primary)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Change
                    </button>
                  </div>
                  <span className="account-meta-value">{user?.email || "N/A"}</span>
                </div>
                <div className="account-meta-card">
                  <span className="account-meta-label">Account Status</span>
                  <span className="account-meta-value" style={{ color: "#10b981" }}>
                    ● Active & Verified
                  </span>
                </div>
              </div>
            </section>

            {/* Section: Danger Zone & Irreversible Actions */}
            <section className="profile-section-card danger-zone">
              <div className="profile-card-header">
                <div className="profile-card-header-left">
                  <div className="profile-card-header-icon danger">
                    <LuShieldAlert />
                  </div>
                  <div className="profile-card-header-titles">
                    <h2 className="profile-card-title">Danger Zone</h2>
                    <span className="profile-card-desc">
                      Irreversible account destruction and storage ownership handoff actions
                    </span>
                  </div>
                </div>
              </div>

              {/* Action 1: Ownership Transfer */}
              <div className="profile-settings-row">
                <div className="profile-settings-row-info">
                  <span className="profile-settings-row-title">
                    Transfer & Delete Account
                  </span>
                  <span className="profile-settings-row-desc">
                    Transfer all your files, folders, and shared items to another registered MeghVault user. Once transferred, your account will be permanently deleted.
                  </span>
                </div>
                <div className="profile-security-actions">
                  <button
                    type="button"
                    className="profile-btn-danger"
                    onClick={() => setShowTransferModal(true)}
                  >
                    <LuArrowRightLeft size={16} />
                    <span>Transfer Account</span>
                  </button>
                </div>
              </div>

              {/* Action 2: Direct Permanent Account Deletion */}
              <div
                className="profile-settings-row"
                style={{
                  borderTop: "1px solid rgba(239, 68, 68, 0.15)",
                  paddingTop: "16px",
                  marginTop: "16px",
                }}
              >
                <div className="profile-settings-row-info">
                  <span className="profile-settings-row-title" style={{ color: "#ef4444" }}>
                    Delete My Account
                  </span>
                  <span className="profile-settings-row-desc">
                    Permanently delete your MeghVault account, files, folders, shared links, and all profile data. All disk files are scrubbed immediately.
                  </span>
                </div>
                <div className="profile-security-actions">
                  <button
                    type="button"
                    className="profile-btn-danger"
                    onClick={() => setShowDeleteAccountModal(true)}
                  >
                    <LuTrash2 size={16} />
                    <span>Delete My Account</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Logout All Sessions Modal */}
      <LogoutAllModal
        isOpen={showLogoutAllModal}
        onClose={() => setShowLogoutAllModal(false)}
      />

      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setMigrationTargetEmail("");
        }}
        initialTargetEmail={migrationTargetEmail}
      />

      {/* Delete My Account Modal */}
      <DeleteAccountModal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
      />

      {/* Change Account Email Modal */}
      <ChangeEmailModal
        isOpen={showChangeEmailModal}
        onClose={() => setShowChangeEmailModal(false)}
        onStartMigration={(targetEmail) => {
          setMigrationTargetEmail(targetEmail);
          setShowTransferModal(true);
        }}
      />
    </AppLayout>
  );
}

export default SettingsPage;
