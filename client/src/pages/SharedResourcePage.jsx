import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LuLock,
  LuDownload,
  LuFile,
  LuFolder,
  LuShieldAlert,
  LuExternalLink,
  LuArrowLeft,
  LuClock,
  LuSun,
  LuMoon,
  LuX,
  LuFolderDown,
  LuFilePen,
  LuFolderOpen,
  LuChevronRight,
  LuLayoutGrid,
  LuList,
  LuSearch,
} from "react-icons/lu";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { shareApi } from "../api/shareApi";
import { fileApi } from "../api/fileApi";
import { directoryApi } from "../api/directoryApi";
import { canPreviewInBrowser } from "../utils/helpers";
import { formatFileSize } from "../utils/formatters";
import { getFileInfo, ColorfulFolderIcon } from "../utils/fileIcons";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FilePreviewModal } from "../components/modals/FilePreviewModal";
import { RenameModal } from "../components/modals/RenameModal";

export function SharedResourcePage() {
  const { token } = useParams();
  const { theme, toggleTheme } = useTheme();
  const { showSuccess, showError } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);

  // Auth ticket for password-protected session persistence across subresources
  const [authTicket, setAuthTicket] = useState(() => {
    return sessionStorage.getItem(`share_ticket_${token}`) || "";
  });

  // Password state
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Directory navigation & view state
  const [currentSubDirId, setCurrentSubDirId] = useState(null);
  const [previewingChildFile, setPreviewingChildFile] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("shared_resource_view_mode") || "grid";
  });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSubDirs = useMemo(() => {
    const list = data?.directoryContents?.directories || [];
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((d) => d.name.toLowerCase().includes(q));
  }, [data?.directoryContents?.directories, searchTerm]);

  const filteredChildFiles = useMemo(() => {
    const list = data?.directoryContents?.files || [];
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((f) => f.name.toLowerCase().includes(q));
  }, [data?.directoryContents?.files, searchTerm]);

  const loadPublicShare = useCallback(async (subDir = null) => {
    setIsLoading(true);
    setError(null);
    try {
      const ticketToUse = sessionStorage.getItem(`share_ticket_${token}`) || authTicket;
      const res = await shareApi.getPublicShareInfo(token, subDir, ticketToUse);
      setData(res);
      setCurrentSubDirId(subDir);
    } catch (err) {
      if (err.status === 410 || err.data?.code === "EXPIRED") {
        setIsExpired(true);
      } else if (err.status === 401 && err.data?.requiresAuth) {
        setRequiresAuth(true);
      } else {
        setError(err.message || "Failed to load shared item.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, authTicket]);

  useEffect(() => {
    loadPublicShare(null);
  }, [loadPublicShare]);

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setIsVerifyingPassword(true);
    setPasswordError("");
    try {
      const verifyRes = await shareApi.verifyPublicPassword(token, passwordInput.trim());
      if (verifyRes.authTicket) {
        sessionStorage.setItem(`share_ticket_${token}`, verifyRes.authTicket);
        setAuthTicket(verifyRes.authTicket);
      }
      setPasswordInput("");
      await loadPublicShare(currentSubDirId);
    } catch (err) {
      setPasswordError(err.message || "Invalid security key. Please try again.");
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleOpenSubDir = (subId) => {
    loadPublicShare(subId);
  };

  const streamUrl = shareApi.getPublicStreamUrl(token, null, null, authTicket);
  const downloadUrl = shareApi.getPublicStreamUrl(token, "download", null, authTicket);

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="shared-page-container">
        <LoadingSpinner size="lg" message="Accessing secure cloud storage..." />
      </div>
    );
  }

  // Expired state
  if (isExpired) {
    return (
      <div className="shared-page-container">
        <div className="shared-card error">
          <div className="shared-icon-circle warning">
            <LuClock size={36} />
          </div>
          <h2 className="shared-title">Share Link Expired</h2>
          <p className="shared-subtitle">
            The security link for this resource has expired and is no longer accessible.
          </p>
          <Link to="/" className="shared-btn primary">
            <LuArrowLeft size={16} />
            <span>Go to MeghVault</span>
          </Link>
        </div>
      </div>
    );
  }

  // Restricted / Requires Login state
  if (requiresAuth) {
    return (
      <div className="shared-page-container">
        <div className="shared-card">
          <div className="shared-icon-circle info">
            <LuLock size={36} />
          </div>
          <h2 className="shared-title">Restricted Access</h2>
          <p className="shared-subtitle">
            This link is restricted to invited collaborators only. Please sign in to your
            MeghVault account to view this item.
          </p>
          <Link to="/auth" className="shared-btn primary">
            <span>Log In to MeghVault</span>
          </Link>
        </div>
      </div>
    );
  }

  // Not Found or Error
  if (error || !data) {
    return (
      <div className="shared-page-container">
        <div className="shared-card error">
          <div className="shared-icon-circle danger">
            <LuShieldAlert size={36} />
          </div>
          <h2 className="shared-title">Item Unavailable</h2>
          <p className="shared-subtitle">
            {error || "This shared link does not exist or has been disabled by the owner."}
          </p>
          <Link to="/" className="shared-btn primary">
            <LuArrowLeft size={16} />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    );
  }

  // Password Verification Required
  if (data.requiresPassword) {
    return (
      <div className="shared-page-container">
        <div className="shared-card">
          <div className="shared-icon-circle orange">
            <LuLock size={36} />
          </div>
          <h2 className="shared-title">Password Protected</h2>
          <p className="shared-subtitle">
            <strong>{data.ownerName}</strong> has protected <em>{data.resourceName}</em> with a
            security key. Enter the password below to access this item.
          </p>

          <form className="shared-password-form" onSubmit={handleVerifyPassword}>
            <input
              type="password"
              className="shared-input"
              placeholder="Enter security key..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
              required
            />
            {passwordError && <span className="shared-form-error">{passwordError}</span>}

            <button
              type="submit"
              className="shared-btn primary full"
              disabled={isVerifyingPassword || !passwordInput.trim()}
            >
              <span>{isVerifyingPassword ? "Verifying..." : "Unlock Access"}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Success: Render shared file or folder
  const resource = data.resource;
  const isDir = resource.type === "directory";
  const previewType = isDir ? null : canPreviewInBrowser(resource.name);
  const fileInfo = isDir ? null : getFileInfo(resource.name, false);
  const FileIconComponent = fileInfo?.icon || LuFile;
  const allowDownload = data.linkSettings?.allowDownload !== false;
  const isEditorOrOwner =
    data.currentUserRole === "collaborator" ||
    data.currentUserRole === "owner" ||
    data.currentUserRole === "admin";
  const canRename = Boolean(data.isLoggedIn) && isEditorOrOwner;
  const canImport = Boolean(data.isLoggedIn) && isEditorOrOwner;

  const dirCount = data?.directoryContents?.directories?.length || 0;
  const fileCount = data?.directoryContents?.files?.length || 0;
  const totalItems = dirCount + fileCount;

  const handleImportAsset = async () => {
    setIsImporting(true);
    try {
      const res = await shareApi.importToRoot(resource.type, resource.id);
      showSuccess(res.message || `"${resource.name}" imported to your root folder`);
    } catch (err) {
      showError(err.message || "Failed to import asset into your root folder");
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmRename = async (newName) => {
    try {
      if (isDir) {
        await directoryApi.renameDirectory(resource.id, newName);
        showSuccess("Folder renamed successfully");
      } else {
        await fileApi.renameFile(resource.id, newName);
        showSuccess("File renamed successfully");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              resource: { ...prev.resource, name: newName },
            }
          : prev
      );
    } catch (err) {
      showError(err.message || "Failed to rename item");
      throw err;
    }
  };

  return (
    <div className="shared-page-wrapper">
      {/* Top Navbar */}
      <header className="shared-header">
        <Link to="/" className="shared-brand">
          <img src="/meghvault-logo.svg" alt="MeghVault" className="shared-logo" />
          <span className="shared-brand-name">
            Megh<span className="shared-brand-accent">Vault</span>
          </span>
        </Link>

        <div className="shared-header-meta">
          <span className="shared-owner-pill">
            Shared by <strong>{data.owner.name}</strong>
          </span>

          <button
            type="button"
            className="shared-theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <LuSun size={17} /> : <LuMoon size={17} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="shared-main-content">
        <div className="shared-content-container">
          {/* Breadcrumbs for directory navigation (only shown when navigating into subfolders) */}
          {isDir && data.directoryContents?.breadcrumbs && data.directoryContents.breadcrumbs.length > 1 && (
            <nav className="shared-path-bar" aria-label="Folder Navigation">
              <div className="shared-path-crumbs">
                <LuFolderOpen className="shared-path-root-icon" size={16} />
                {data.directoryContents.breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === data.directoryContents.breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.id || idx}>
                      {idx > 0 && <LuChevronRight className="shared-path-divider" size={13} />}
                      {isLast ? (
                        <span className="shared-path-current">{crumb.name}</span>
                      ) : (
                        <button
                          type="button"
                          className="shared-path-link"
                          onClick={() => handleOpenSubDir(crumb.id === resource.rootId ? null : crumb.id)}
                        >
                          {crumb.name}
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </nav>
          )}

          {/* File / Folder Card Banner */}
          <div className="shared-resource-banner">
            <div className="shared-resource-left">
              <div
                className={`shared-resource-badge ${isDir ? "folder" : ""}`}
                style={
                  !isDir && fileInfo?.bgColor
                    ? { backgroundColor: fileInfo.bgColor, borderColor: fileInfo.color + "33" }
                    : {}
                }
              >
                {isDir ? (
                  <ColorfulFolderIcon size={30} color="#3b82f6" backColor="#1d4ed8" />
                ) : (
                  <FileIconComponent style={{ color: fileInfo?.color }} />
                )}
              </div>
              <div className="shared-resource-text">
                <h1 className="shared-resource-name">{resource.name}</h1>
                <span className="shared-resource-subtext">
                  {isDir
                    ? `Cloud Shared Folder • ${totalItems} ${totalItems === 1 ? "item" : "items"} • Secure Cloud Access`
                    : `${formatFileSize(resource.size)} • Secure Cloud Access`}
                </span>
              </div>
            </div>

            <div className="shared-banner-actions">
              {canRename && (
                <button
                  type="button"
                  className="shared-rename-btn"
                  onClick={() => setShowRenameModal(true)}
                  title="Rename asset"
                >
                  <LuFilePen size={16} />
                  <span>Rename</span>
                </button>
              )}

              {canImport && (
                <button
                  type="button"
                  className="shared-import-btn"
                  onClick={handleImportAsset}
                  disabled={isImporting}
                  title="Import into your root folder"
                >
                  <LuFolderDown size={17} />
                  <span>{isImporting ? "Importing..." : "Import"}</span>
                </button>
              )}

              {allowDownload && (
                isDir ? (
                  <a
                    href={`/api/share/public/${token}/download${authTicket ? `?ticket=${encodeURIComponent(authTicket)}` : ""}`}
                    className="shared-action-btn"
                    download={`${resource.name || "Folder"}.zip`}
                    title="Download entire shared folder as a zip archive"
                  >
                    <LuDownload size={17} />
                    <span>Download Folder (.zip)</span>
                  </a>
                ) : (
                  <a
                    href={downloadUrl}
                    className="shared-action-btn"
                    download={resource.name}
                  >
                    <LuDownload size={17} />
                    <span>Download</span>
                  </a>
                )
              )}
            </div>
          </div>

          {/* Viewer Area */}
          <div className={`shared-viewer-frame ${isDir ? "is-folder" : ""}`}>
            {previewType === "image" && (
              <img src={streamUrl} alt={resource.name} className="shared-preview-img" />
            )}

            {previewType === "video" && (
              <video src={streamUrl} controls autoPlay className="shared-preview-video">
                Your browser does not support the video tag.
              </video>
            )}

            {previewType === "audio" && (
              <div className="shared-preview-audio-box">
                <audio src={streamUrl} controls autoPlay className="shared-audio-player">
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {(previewType === "pdf" || previewType === "text") && (
              <iframe src={streamUrl} title={resource.name} className="shared-preview-iframe" />
            )}

            {/* Folder Contents View */}
            {isDir && data.directoryContents && (
              <div className={`shared-folder-contents-wrapper ${viewMode === "list" ? "is-list" : ""}`}>
                {isLoading && (
                  <div className="shared-folder-loading-overlay">
                    <LoadingSpinner size="sm" message="Loading folder contents..." />
                  </div>
                )}

                {/* Search & Grid/List View Toggles Toolbar */}
                <div className="shared-folder-toolbar">
                  <div className="shared-search-wrapper">
                    <LuSearch size={14} className="shared-search-icon" />
                    <input
                      type="text"
                      placeholder="Search within this folder..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="shared-search-input"
                    />
                    {searchTerm && (
                      <button className="shared-search-clear" onClick={() => setSearchTerm("")}>
                        <LuX size={13} />
                      </button>
                    )}
                  </div>

                  <div className="view-mode-pill">
                    <button
                      className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("grid");
                        localStorage.setItem("shared_resource_view_mode", "grid");
                      }}
                      title="Grid View"
                      aria-label="Grid View"
                    >
                      <LuLayoutGrid size={15} />
                    </button>
                    <button
                      className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("list");
                        localStorage.setItem("shared_resource_view_mode", "list");
                      }}
                      title="List View"
                      aria-label="List View"
                    >
                      <LuList size={15} />
                    </button>
                  </div>
                </div>

                {/* Subdirectories Section */}
                {filteredSubDirs.length > 0 && (
                  <div className="shared-folder-section">
                    <div className="shared-folder-section-header">
                      <h3 className="shared-folder-section-title">Folders</h3>
                      <span className="shared-section-count">
                        {filteredSubDirs.length}
                      </span>
                    </div>
                    <div className="shared-subfolders-grid">
                      {filteredSubDirs.map((sub) => (
                        <div
                          key={sub.id}
                          className="shared-subfolder-card"
                          onClick={() => handleOpenSubDir(sub.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleOpenSubDir(sub.id);
                            }
                          }}
                          title={`Open folder: ${sub.name}`}
                        >
                          <div className="shared-subfolder-icon">
                            <ColorfulFolderIcon size={24} color="#3b82f6" backColor="#1d4ed8" />
                          </div>
                          <span className="shared-subfolder-name">{sub.name}</span>
                          <LuChevronRight className="shared-subfolder-arrow" size={16} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files Section */}
                {filteredChildFiles.length > 0 && (
                  <div className="shared-folder-section">
                    <div className="shared-folder-section-header">
                      <h3 className="shared-folder-section-title">Files</h3>
                      <span className="shared-section-count">
                        {filteredChildFiles.length}
                      </span>
                    </div>
                    <div className="shared-files-grid">
                      {filteredChildFiles.map((f) => {
                        const childFileInfo = getFileInfo(f.name, false);
                        const ChildIcon = childFileInfo.icon;
                        const childStreamUrl = shareApi.getPublicStreamUrl(token, null, f.id, authTicket);
                        const childDownloadUrl = shareApi.getPublicStreamUrl(token, "download", f.id, authTicket);

                        return (
                          <div
                            key={f.id}
                            className="shared-file-card"
                            title={f.name}
                          >
                            <div
                              className="shared-file-card-main"
                              onClick={() => {
                                setPreviewingChildFile({
                                  id: f.id,
                                  name: f.name,
                                  url: childStreamUrl,
                                  downloadUrl: childDownloadUrl,
                                });
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setPreviewingChildFile({
                                    id: f.id,
                                    name: f.name,
                                    url: childStreamUrl,
                                    downloadUrl: childDownloadUrl,
                                  });
                                }
                              }}
                            >
                              <div
                                className="shared-file-icon-badge"
                                style={{
                                  color: childFileInfo.color,
                                  backgroundColor: childFileInfo.bgColor,
                                }}
                              >
                                <ChildIcon />
                              </div>
                              <div className="shared-file-meta-box">
                                <span className="shared-file-name">{f.name}</span>
                                <span className="shared-file-size">
                                  {f.size > 0 ? formatFileSize(f.size) : "0 B"}
                                </span>
                              </div>
                            </div>

                            {allowDownload && (
                              <a
                                href={childDownloadUrl}
                                className="shared-file-dl-btn"
                                download={f.name}
                                title={`Download ${f.name}`}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Download ${f.name}`}
                              >
                                <LuDownload size={15} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty folder state */}
                {!data.directoryContents.directories?.length &&
                  !data.directoryContents.files?.length && (
                    <div className="shared-empty-folder-box">
                      <div className="shared-empty-folder-icon">
                        <LuFolderOpen size={40} />
                      </div>
                      <h4>This folder is empty</h4>
                      <p>No files or subfolders have been added here yet.</p>
                    </div>
                  )}
              </div>
            )}

            {!previewType && !isDir && (
              <div className="shared-generic-box">
                <LuFile size={54} className="shared-generic-icon" />
                <h3>No inline browser preview available</h3>
                <p>This file format cannot be displayed directly inside the web browser.</p>
                {allowDownload && (
                  <a href={downloadUrl} className="shared-btn primary" download={resource.name}>
                    <LuDownload size={16} />
                    <span>Download File</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        type={resource.type}
        currentName={resource.name}
        onClose={() => setShowRenameModal(false)}
        onSubmit={handleConfirmRename}
      />

      {/* Child File Preview Modal inside shared directory */}
      {previewingChildFile && (
        <FilePreviewModal
          file={previewingChildFile}
          onClose={() => setPreviewingChildFile(null)}
          onDownload={() => {
            if (previewingChildFile.downloadUrl) {
              const a = document.createElement("a");
              a.href = previewingChildFile.downloadUrl;
              a.download = previewingChildFile.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
          }}
        />
      )}
    </div>
  );
}
