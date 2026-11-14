import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuTrash2,
  LuGlobe,
  LuCopy,
  LuCheck,
  LuClock,
  LuShieldCheck,
  LuLock,
  LuKey,
  LuVideo,
  LuFile,
  LuFolder,
  LuSearch,
  LuEye,
  LuFilePen,
  LuShare2,
} from "react-icons/lu";
import { shareApi } from "../../api/shareApi";
import { useToast } from "../../context/ToastContext";
import { formatFileSize } from "../../utils/formatters";
import { sanitizeText } from "../../utils/sanitize";

export function ShareModal({ isOpen, onClose, item }) {
  const { addToast } = useToast();
  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [activeTab, setActiveTab] = useState("collaborators");
  const [isLoading, setIsLoading] = useState(true);
  const [shareData, setShareData] = useState(null);

  // Collaborator search & selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedRole, setSelectedRole] = useState("viewer"); // "viewer" | "collaborator"
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Link settings state
  const [isCopied, setIsCopied] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [showPlainPassword, setShowPlainPassword] = useState(false);

  const prevOpenRef = useRef(false);
  const prevResourceIdRef = useRef(null);

  const resourceType = item?.isDirectory || item?.type === "directory" ? "directory" : "file";
  const resourceId = item?.id;

  // Load share settings from API
  const loadShareSettings = useCallback(async (type, id) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await shareApi.getShareSettings(type, id);
      setShareData(data);
    } catch (err) {
      console.error("Failed to load share settings:", err);
      addToastRef.current?.({
        type: "error",
        title: "Load Failed",
        message: err.message || "Could not retrieve sharing settings.",
      });
      onCloseRef.current?.();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ONLY initialize / reset tab when the modal opens or item changes!
  useEffect(() => {
    const isNowOpen = Boolean(isOpen && resourceId);
    const wasOpen = prevOpenRef.current;
    const isDifferentItem = prevResourceIdRef.current !== resourceId;

    if (isNowOpen && (!wasOpen || isDifferentItem)) {
      loadShareSettings(resourceType, resourceId);
      setActiveTab("collaborators");
      setSearchQuery("");
      setSelectedUserIds(new Set());
      setSelectedRole("viewer");
      setIsEditingPassword(false);
      setShowPasswordSetup(false);
      setNewPasswordInput("");
      setShowPlainPassword(false);
      setIsCopied(false);
    }

    prevOpenRef.current = isNowOpen;
    prevResourceIdRef.current = resourceId;
  }, [isOpen, resourceId, resourceType, loadShareSettings]);

  // Debounced search for shareable users
  useEffect(() => {
    if (!isOpen || !resourceId || activeTab !== "collaborators") return;

    let isCurrent = true;
    const delay = searchQuery ? 250 : 0;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const cleanQuery = sanitizeText(searchQuery);
        const res = await shareApi.searchUsers(cleanQuery, resourceType, resourceId);
        if (isCurrent) {
          setSearchResults(res.users || []);
        }
      } catch (err) {
        if (isCurrent) {
          console.error("Failed to search users:", err);
        }
      } finally {
        if (isCurrent) {
          setIsSearching(false);
        }
      }
    }, delay);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isOpen, resourceId, resourceType, activeTab, searchQuery]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  // Toggle selection of a user
  const toggleUserSelect = (userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Clear selected users
  const handleCancelSelection = () => {
    setSelectedUserIds(new Set());
    setSearchQuery("");
  };

  // Batch Share with selected users
  const handleBatchShare = async () => {
    if (selectedUserIds.size === 0) return;
    setIsSubmittingInvite(true);
    try {
      const userIds = Array.from(selectedUserIds);
      const res = await shareApi.inviteCollaboratorsBatch(
        resourceType,
        resourceId,
        userIds,
        selectedRole
      );
      setShareData((prev) => (prev ? { ...prev, collaborators: res.collaborators } : prev));
      setSelectedUserIds(new Set());
      setSearchQuery("");

      // Refresh search list to update isCollaborator flag
      try {
        const refRes = await shareApi.searchUsers("", resourceType, resourceId);
        setSearchResults(refRes.users || []);
      } catch {
        // ignore
      }

      addToast({
        type: "success",
        title: "Collaborators Added",
        message: `${userIds.length} user${userIds.length > 1 ? "s" : ""} added as ${
          selectedRole === "collaborator" ? "Editor" : "Viewer"
        }.`,
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "Share Failed",
        message: err.message || "Failed to invite collaborators.",
      });
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  // Remove Collaborator
  const handleRemoveCollaborator = async (targetUserId, name) => {
    try {
      const res = await shareApi.removeCollaborator(resourceType, resourceId, targetUserId);
      setShareData((prev) => (prev ? { ...prev, collaborators: res.collaborators } : prev));

      // Refresh search results
      try {
        const refRes = await shareApi.searchUsers(searchQuery.trim(), resourceType, resourceId);
        setSearchResults(refRes.users || []);
      } catch {
        // ignore
      }

      addToast({
        type: "info",
        title: "Access Revoked",
        message: `Removed ${name || "collaborator"} from this resource.`,
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "Action Failed",
        message: err.message || "Failed to remove collaborator.",
      });
    }
  };

  // Update Collaborator Role
  const handleUpdateRole = async (targetUserId, newRole) => {
    try {
      const res = await shareApi.updateCollaboratorRole(
        resourceType,
        resourceId,
        targetUserId,
        newRole
      );
      setShareData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          collaborators: prev.collaborators.map((c) =>
            c.userId === targetUserId ? { ...c, role: res.collaborator.role } : c
          ),
        };
      });
      addToast({
        type: "success",
        title: "Role Updated",
        message: `Collaborator permission updated to ${newRole === "collaborator" ? "Editor" : "Viewer"}.`,
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "Update Failed",
        message: err.message || "Could not update collaborator role.",
      });
    }
  };

  // Update Link Settings Patch
  const handlePatchLink = async (patchObj, successMessage = null) => {
    setIsSavingLink(true);
    try {
      const res = await shareApi.updateLinkSettings(resourceType, resourceId, patchObj);
      setShareData((prev) => (prev ? { ...prev, linkSettings: res.linkSettings } : prev));
      if (successMessage) {
        addToast({
          type: "success",
          title: "Settings Saved",
          message: successMessage,
        });
      }
    } catch (err) {
      addToast({
        type: "error",
        title: "Update Failed",
        message: err.message || "Could not update link settings.",
      });
    } finally {
      setIsSavingLink(false);
    }
  };

  // Copy Link to clipboard
  const handleCopyLink = () => {
    const token = shareData?.linkSettings?.shareToken;
    if (!token) return;
    const fullUrl = `${window.location.origin}/share/${token}`;
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
      addToast({
        type: "success",
        title: "Link Copied",
        message: "Secure share link copied to clipboard.",
      });
    });
  };

  // Helpers
  const isVideo = item.name?.match(/\.(mp4|mkv|webm|mov)$/i);
  const isFolder = resourceType === "directory";
  const displaySize = shareData?.resource?.size ? formatFileSize(shareData.resource.size) : null;
  const shareUrl = shareData?.linkSettings?.shareToken
    ? `${window.location.origin}/share/${shareData.linkSettings.shareToken}`
    : "";

  const existingCollabIds = new Set(shareData?.collaborators?.map((c) => c.userId) || []);
  const hasPassword = Boolean(shareData?.linkSettings?.hasPassword);
  const isPasswordProtected = Boolean(shareData?.linkSettings?.isPasswordProtected);

  return createPortal(
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <div className="share-header-left">
            <div className={`share-resource-icon-badge ${isFolder ? "folder" : ""}`}>
              {isFolder ? <LuFolder /> : isVideo ? <LuVideo /> : <LuFile />}
            </div>
            <div className="share-header-meta">
              <div className="share-title-row">
                <span className="share-resource-name" title={item.name}>
                  {item.name}
                </span>
                {displaySize && <span className="share-size-badge">{displaySize}</span>}
              </div>
              <span className="share-subtitle">Secure Cloud Share Settings</span>
            </div>
          </div>

          <button
            type="button"
            className="share-close-btn"
            onClick={onClose}
            aria-label="Close share settings"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="share-tabs-wrap">
          <div className="share-tabs-capsule">
            <button
              type="button"
              className={`share-tab-btn ${activeTab === "collaborators" ? "active" : ""}`}
              onClick={() => setActiveTab("collaborators")}
            >
              COLLABORATORS
            </button>
            <button
              type="button"
              className={`share-tab-btn ${activeTab === "link" ? "active" : ""}`}
              onClick={() => setActiveTab("link")}
            >
              LINK SETTINGS
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="share-modal-body">
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
              Loading share permissions...
            </div>
          ) : activeTab === "collaborators" ? (
            /* TAB 1: COLLABORATORS */
            <>
              {/* 2-Column Search & Permission Definition Grid */}
              <div className="share-collab-grid">
                {/* Left Column: Search & Results */}
                <div className="share-collab-left">
                  <div className="share-search-bar">
                    <LuSearch className="share-search-icon" size={16} />
                    <input
                      type="text"
                      className="share-search-input"
                      placeholder="Search users by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="share-search-clear"
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear search"
                      >
                        <LuX size={13} />
                      </button>
                    )}
                  </div>

                  <div className="share-list-section-title">
                    <span>SEARCH RESULTS</span>
                    {searchResults.length > 0 && (
                      <span className="share-result-count">{searchResults.length}</span>
                    )}
                  </div>

                  <div className="share-picker-user-list">
                    {isSearching ? (
                      <div className="share-picker-empty">Searching registered users...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="share-picker-empty">
                        {searchQuery
                          ? `No users found matching "${searchQuery}".`
                          : "No other registered users found."}
                      </div>
                    ) : (
                      searchResults.map((u) => {
                        const isExisting = u.isCollaborator || existingCollabIds.has(u.id);
                        const isSelected = selectedUserIds.has(u.id);

                        return (
                          <div
                            key={u.id}
                            className={`share-picker-user-card ${isSelected ? "selected" : ""} ${
                              isExisting ? "disabled" : ""
                            }`}
                            onClick={() => {
                              if (!isExisting) toggleUserSelect(u.id);
                            }}
                          >
                            <div className="share-picker-user-info">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt={u.name}
                                  className="share-picker-avatar"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="share-picker-avatar-fallback">
                                  {(u.name || "U").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="share-picker-text">
                                <span className="share-picker-name">{u.name}</span>
                                <span className="share-picker-email">{u.email}</span>
                              </div>
                            </div>

                            <div className="share-picker-status">
                              {isExisting ? (
                                <span className="share-added-pill">Added</span>
                              ) : (
                                <div
                                  className={`share-checkbox-circle ${
                                    isSelected ? "checked" : ""
                                  }`}
                                >
                                  {isSelected && <LuCheck size={12} />}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Column: Permission Cards */}
                <div className="share-collab-right">
                  <div className="share-list-section-title">
                    <span>PERMISSION</span>
                  </div>

                  <div className="share-role-cards-wrap">
                    {/* Viewer Card */}
                    <div
                      className={`share-role-card ${selectedRole === "viewer" ? "active" : ""}`}
                      onClick={() => setSelectedRole("viewer")}
                    >
                      <div className="share-role-card-top">
                        <div className="share-role-icon-box viewer">
                          <LuEye size={18} />
                        </div>
                        {selectedRole === "viewer" && (
                          <div className="share-role-active-check">
                            <LuCheck size={14} />
                          </div>
                        )}
                      </div>
                      <div className="share-role-card-content">
                        <span className="share-role-title">Viewer</span>
                        <span className="share-role-desc">Read-only access</span>
                      </div>
                    </div>

                    {/* Editor Card */}
                    <div
                      className={`share-role-card ${
                        selectedRole === "collaborator" ? "active" : ""
                      }`}
                      onClick={() => setSelectedRole("collaborator")}
                    >
                      <div className="share-role-card-top">
                        <div className="share-role-icon-box editor">
                          <LuFilePen size={18} />
                        </div>
                        {selectedRole === "collaborator" && (
                          <div className="share-role-active-check">
                            <LuCheck size={14} />
                          </div>
                        )}
                      </div>
                      <div className="share-role-card-content">
                        <span className="share-role-title">Editor</span>
                        <span className="share-role-desc">
                          {isFolder ? "Can edit folder" : "Can edit file"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer: Cancel & Share Button */}
              <div className="share-picker-footer">
                <button
                  type="button"
                  className="share-footer-cancel-btn"
                  onClick={handleCancelSelection}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="share-footer-submit-btn"
                  disabled={selectedUserIds.size === 0 || isSubmittingInvite}
                  onClick={handleBatchShare}
                >
                  <LuShare2 size={15} />
                  <span>
                    {isSubmittingInvite
                      ? "Sharing..."
                      : `Share ${isFolder ? "Folder" : "File"}${
                          selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ""
                        }`}
                  </span>
                </button>
              </div>

              {/* Currently Accessing Section */}
              <div className="share-current-section">
                <div className="share-list-section-title">
                  <span>CURRENTLY ACCESSING ({1 + (shareData?.collaborators?.length || 0)})</span>
                </div>

                <div className="share-users-card">
                  {/* Owner Row */}
                  {shareData?.owner && (
                    <div className="share-user-row">
                      <div className="share-user-left">
                        {shareData.owner.avatar ? (
                          <img
                            src={shareData.owner.avatar}
                            alt={shareData.owner.name}
                            className="share-user-avatar"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="share-user-initial-avatar">
                            {(shareData.owner.name || "O").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="share-user-meta">
                          <div className="share-user-name-box">
                            <span className="share-user-name">{shareData.owner.name}</span>
                            {shareData.owner.isCurrentUser && (
                              <span className="share-you-pill">YOU</span>
                            )}
                          </div>
                          <span className="share-user-email">{shareData.owner.email}</span>
                        </div>
                      </div>

                      <div className="share-user-right">
                        <span className="share-role-pill owner">OWNER</span>
                      </div>
                    </div>
                  )}

                  {/* Collaborator Rows */}
                  {shareData?.collaborators?.map((collab) => (
                    <div key={collab.userId} className="share-user-row">
                      <div className="share-user-left">
                        {collab.avatar ? (
                          <img
                            src={collab.avatar}
                            alt={collab.name}
                            className="share-user-avatar"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="share-user-initial-avatar">
                            {(collab.name || "C").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="share-user-meta">
                          <div className="share-user-name-box">
                            <span className="share-user-name">{collab.name}</span>
                            {collab.isCurrentUser && <span className="share-you-pill">YOU</span>}
                          </div>
                          <span className="share-user-email">{collab.email}</span>
                        </div>
                      </div>

                      <div className="share-user-right">
                        {shareData.isOwner ? (
                          <select
                            className="share-role-select"
                            value={collab.role}
                            onChange={(e) => handleUpdateRole(collab.userId, e.target.value)}
                          >
                            <option value="collaborator">EDITOR</option>
                            <option value="viewer">VIEWER</option>
                          </select>
                        ) : (
                          <span className="share-role-pill">
                            {collab.role === "collaborator" ? "EDITOR" : "VIEWER"}
                          </span>
                        )}

                        {shareData.isOwner && (
                          <button
                            type="button"
                            className="share-remove-btn"
                            onClick={() => handleRemoveCollaborator(collab.userId, collab.name)}
                            title="Remove collaborator"
                            aria-label={`Remove ${collab.name}`}
                          >
                            <LuTrash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* TAB 2: LINK SETTINGS */
            <>
              {/* Share Link Status Toggle */}
              <div className="share-link-status-card">
                <div className="share-status-title-box">
                  <LuGlobe className="share-status-icon" />
                  <span>SHARE LINK STATUS</span>
                </div>
                <label className="share-toggle-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(shareData?.linkSettings?.isEnabled)}
                    disabled={isSavingLink || !shareData?.isOwner}
                    onChange={(e) =>
                      handlePatchLink(
                        { isEnabled: e.target.checked },
                        e.target.checked ? "Share link activated" : "Share link disabled"
                      )
                    }
                  />
                  <span className="share-toggle-slider" />
                </label>
              </div>

              {/* URL Display Box */}
              {shareData?.linkSettings?.isEnabled && (
                <div className="share-url-box">
                  <span className="share-url-text" title={shareUrl}>
                    {shareUrl}
                  </span>
                  <button
                    type="button"
                    className="share-copy-btn"
                    onClick={handleCopyLink}
                    title="Copy share link"
                  >
                    {isCopied ? <LuCheck size={14} /> : <LuCopy size={14} />}
                    <span>{isCopied ? "Copied" : "Copy Link"}</span>
                  </button>
                </div>
              )}

              {/* Link Visibility & Expiration Row */}
              <div className="share-options-grid">
                {/* Visibility */}
                <div className="share-option-card">
                  <div className="share-option-title">
                    <LuGlobe size={14} />
                    <span>LINK VISIBILITY</span>
                  </div>
                  <div className="share-visibility-toggle">
                    <button
                      type="button"
                      className={`share-vis-btn ${
                        shareData?.linkSettings?.visibility === "public" ? "active" : ""
                      }`}
                      disabled={isSavingLink || !shareData?.isOwner}
                      onClick={() => handlePatchLink({ visibility: "public" })}
                    >
                      PUBLIC
                    </button>
                    <button
                      type="button"
                      className={`share-vis-btn ${
                        shareData?.linkSettings?.visibility === "restricted" ? "active" : ""
                      }`}
                      disabled={isSavingLink || !shareData?.isOwner}
                      onClick={() => handlePatchLink({ visibility: "restricted" })}
                    >
                      RESTRICTED
                    </button>
                  </div>
                </div>

                {/* Expiration */}
                <div className="share-option-card">
                  <div className="share-option-title">
                    <LuClock size={14} />
                    <span>EXPIRATION TIME</span>
                  </div>
                  <select
                    className="share-dropdown-select"
                    disabled={isSavingLink || !shareData?.isOwner}
                    defaultValue="never"
                    onChange={(e) => handlePatchLink({ expirationOption: e.target.value })}
                  >
                    <option value="never">Never</option>
                    <option value="1h">1 Hour</option>
                    <option value="24h">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                  </select>
                </div>
              </div>

              {/* Link Permissions: Allow Downloads */}
              <div className="share-feature-toggle-card">
                <div className="share-feature-title">
                  <LuShieldCheck size={16} style={{ color: "#10b981" }} />
                  <span>Allow Downloads</span>
                </div>
                <label className="share-toggle-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(shareData?.linkSettings?.allowDownload)}
                    disabled={isSavingLink || !shareData?.isOwner}
                    onChange={(e) =>
                      handlePatchLink(
                        { allowDownload: e.target.checked },
                        e.target.checked ? "Downloads enabled" : "Downloads restricted"
                      )
                    }
                  />
                  <span className="share-toggle-slider" />
                </label>
              </div>

              {/* Password Protection Toggle */}
              <div className="share-feature-toggle-card">
                <div className="share-feature-title header-mode">
                  <LuLock size={15} style={{ color: "#f59e0b" }} />
                  <span>PASSWORD PROTECTION</span>
                </div>
                <label className="share-toggle-switch orange">
                  <input
                    type="checkbox"
                    checked={Boolean(isPasswordProtected || showPasswordSetup)}
                    disabled={isSavingLink || !shareData?.isOwner}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        setShowPasswordSetup(false);
                        setIsEditingPassword(false);
                        handlePatchLink(
                          { isPasswordProtected: false },
                          "Password protection removed"
                        );
                      } else {
                        if (hasPassword) {
                          handlePatchLink(
                            { isPasswordProtected: true },
                            "Password protection enabled"
                          );
                        } else {
                          setShowPasswordSetup(true);
                        }
                      }
                    }}
                  />
                  <span className="share-toggle-slider" />
                </label>
              </div>

              {/* Password State Presentation Card */}
              {shareData?.isOwner && (
                <>
                  {/* Case A: Password already set and active */}
                  {hasPassword && isPasswordProtected && (
                    <div className="share-password-status-card configured">
                      <div className="share-pwd-status-header">
                        <div className="share-pwd-badge-row">
                          <div className="share-pwd-icon-circle active">
                            <LuLock size={16} />
                          </div>
                          <div>
                            <div className="share-pwd-title-text">Password Protection Active</div>
                            <div className="share-pwd-subtitle-text">
                              This link is secured. Visitors must enter the key to open.
                            </div>
                          </div>
                        </div>
                        <span className="share-pwd-active-pill">
                          <LuCheck size={12} /> Key Set
                        </span>
                      </div>

                      {!isEditingPassword ? (
                        <div className="share-pwd-display-row">
                          <div className="share-masked-key-box">
                            <span className="share-masked-dots">••••••••••••</span>
                            <span className="share-masked-label">Current Key Saved</span>
                          </div>
                          <div className="share-pwd-action-btns">
                            <button
                              type="button"
                              className="share-pwd-btn edit"
                              onClick={() => {
                                setIsEditingPassword(true);
                                setNewPasswordInput("");
                              }}
                            >
                              <LuKey size={13} />
                              <span>Update Key</span>
                            </button>
                            <button
                              type="button"
                              className="share-pwd-btn remove"
                              onClick={() =>
                                handlePatchLink(
                                  { isPasswordProtected: false },
                                  "Password protection removed"
                                )
                              }
                            >
                              <LuTrash2 size={13} />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="share-pwd-edit-row">
                          <div className="share-pwd-input-group">
                            <input
                              type={showPlainPassword ? "text" : "password"}
                              className="share-password-input"
                              placeholder="Enter new secure key..."
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="share-pwd-eye-btn"
                              onClick={() => setShowPlainPassword((prev) => !prev)}
                              title={showPlainPassword ? "Hide key" : "Show key"}
                            >
                              <LuEye size={15} />
                            </button>
                          </div>
                          <div className="share-pwd-edit-actions">
                            <button
                              type="button"
                              className="share-pwd-apply-btn"
                              disabled={isSavingLink || !newPasswordInput.trim()}
                              onClick={async () => {
                                await handlePatchLink(
                                  { securityKey: newPasswordInput.trim() },
                                  "Security key updated successfully"
                                );
                                setNewPasswordInput("");
                                setIsEditingPassword(false);
                              }}
                            >
                              Save New Key
                            </button>
                            <button
                              type="button"
                              className="share-pwd-cancel-btn"
                              onClick={() => {
                                setIsEditingPassword(false);
                                setNewPasswordInput("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Case B: Setting up password for the first time */}
                  {(!hasPassword && (isPasswordProtected || showPasswordSetup)) && (
                    <div className="share-password-status-card setting-up">
                      <div className="share-pwd-status-header">
                        <div className="share-pwd-badge-row">
                          <div className="share-pwd-icon-circle pending">
                            <LuKey size={16} />
                          </div>
                          <div>
                            <div className="share-pwd-title-text">Set Security Key</div>
                            <div className="share-pwd-subtitle-text">
                              Enter a secret key to activate password protection on this link.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="share-pwd-edit-row">
                        <div className="share-pwd-input-group">
                          <input
                            type={showPlainPassword ? "text" : "password"}
                            className="share-password-input"
                            placeholder="Create secure key..."
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="share-pwd-eye-btn"
                            onClick={() => setShowPlainPassword((prev) => !prev)}
                            title={showPlainPassword ? "Hide key" : "Show key"}
                          >
                            <LuEye size={15} />
                          </button>
                        </div>
                        <div className="share-pwd-edit-actions">
                          <button
                            type="button"
                            className="share-pwd-apply-btn"
                            disabled={isSavingLink || !newPasswordInput.trim()}
                            onClick={async () => {
                              await handlePatchLink(
                                { securityKey: newPasswordInput.trim() },
                                "Password protection activated"
                              );
                              setNewPasswordInput("");
                              setShowPasswordSetup(false);
                            }}
                          >
                            Apply Key
                          </button>
                          <button
                            type="button"
                            className="share-pwd-cancel-btn"
                            onClick={() => {
                              setShowPasswordSetup(false);
                              setNewPasswordInput("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
