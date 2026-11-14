import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LuInfo,
  LuX,
  LuCopy,
  LuCheck,
  LuDownload,
  LuEye,
  LuShare2,
  LuStar,
  LuFolderInput,
  LuLock,
  LuFolderOpen,
  LuCalendar,
  LuHardDrive,
  LuFolderTree,
  LuUsers,
  LuShieldCheck,
  LuFileText,
} from "react-icons/lu";
import { getFileInfo, ColorfulFolderIcon } from "../../utils/fileIcons";
import { formatFileSize, formatDate, formatExactTime } from "../../utils/formatters";
import { fileApi } from "../../api/fileApi";
import { detailsApi } from "../../api/detailsApi";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";
import { useToast } from "../../context/ToastContext";

export function ItemDetailsModal({
  isOpen,
  item,
  onClose,
  onPreview,
  onDownload,
  onOpenFolder,
  onShare,
  isStarred = false,
  onToggleStar,
  onMove,
}) {
  const { showSuccess } = useToast();
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load detailed backend metadata
  useEffect(() => {
    if (!isOpen || !item) {
      setDetails(null);
      setCopiedPath(false);
      setCopiedName(false);
      setImgError(false);
      return;
    }

    const isDir = Boolean(item.isDirectory || item.type === "directory");
    const resType = isDir ? "directory" : "file";

    let isMounted = true;
    setIsLoading(true);

    detailsApi
      .getDetails(resType, item.id)
      .then((data) => {
        if (isMounted) {
          setDetails(data);
        }
      })
      .catch((err) => {
        console.warn("Could not load extended details:", err.message);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const isDir = Boolean(item.isDirectory || item.type === "directory");
  const fileInfo = getFileInfo(item.name, isDir);
  const Icon = fileInfo.icon;
  const isImage = !isDir && fileInfo.category === "image" && !imgError;
  const streamUrl = !isDir ? fileApi.getFileUrl(item.id, null, item.name) : null;

  // Use enriched details or fallback to item props
  const displayName = details?.name || item.name;
  const displaySize = details?.size !== undefined ? details.size : item.size || 0;
  const createdAt = details?.createdAt || item.createdAt;
  const updatedAt = details?.updatedAt || item.updatedAt;
  const fullPath = details?.fullPath || (isDir ? `My Drive / ${displayName}` : `My Drive / ${displayName}`);
  const sharing = details?.sharing;

  const handleCopyPath = () => {
    navigator.clipboard?.writeText(fullPath).then(() => {
      setCopiedPath(true);
      showSuccess("Path copied to clipboard");
      setTimeout(() => setCopiedPath(false), 2000);
    });
  };

  const handleCopyName = () => {
    navigator.clipboard?.writeText(displayName).then(() => {
      setCopiedName(true);
      showSuccess("Name copied to clipboard");
      setTimeout(() => setCopiedName(false), 2000);
    });
  };

  return createPortal(
    <div className="details-drawer-backdrop" onClick={onClose}>
      <aside
        className="details-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Item Details"
      >
        {/* Drawer Header */}
        <div className="details-drawer-header">
          <div className="details-header-title">
            <div className="details-header-icon">
              <LuInfo size={16} />
            </div>
            <span>{isDir ? "Folder Details" : "File Details"}</span>
          </div>

          <button
            className="details-close-btn"
            onClick={onClose}
            aria-label="Close details"
            title="Close (Esc)"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="details-drawer-body custom-scrollbar">
          {/* Visual Hero Preview Card */}
          <div className="details-hero-card">
            <div
              className="details-preview-container"
              style={{ backgroundColor: isDir ? "rgba(59, 130, 246, 0.08)" : fileInfo.bgColor }}
            >
              {isImage ? (
                <img
                  src={streamUrl}
                  alt={displayName}
                  className="details-img-thumb"
                  onError={() => setImgError(true)}
                />
              ) : isDir ? (
                <ColorfulFolderIcon size={64} />
              ) : (
                <div className="details-icon-hero" style={{ color: fileInfo.color }}>
                  <Icon size={56} />
                </div>
              )}
            </div>

            <div className="details-hero-info">
              <div className="details-name-row">
                <h3 className="details-item-name" title={displayName}>
                  {displayName}
                </h3>
                <button
                  className="details-mini-copy-btn"
                  onClick={handleCopyName}
                  title="Copy item name"
                >
                  {copiedName ? <LuCheck size={13} className="text-emerald" /> : <LuCopy size={13} />}
                </button>
              </div>

              <div className="details-subtitle-row">
                <span className="details-type-tag">
                  {isDir ? "Directory Folder" : fileInfo.label}
                </span>
                <span className="meta-separator">•</span>
                <span className="details-size-tag">
                  {isDir
                    ? details?.fileCount !== undefined
                      ? `${details.fileCount} file${details.fileCount === 1 ? "" : "s"}${
                          displaySize > 0 ? ` • ${formatFileSize(displaySize)}` : ""
                        }`
                      : "Folder"
                    : formatFileSize(displaySize)}
                </span>
              </div>

              <div className="details-badges-row">
                <SourceBrandBadge source={item.source} size={15} />
                {item.isPasswordProtected && (
                  <span className="details-badge protected">
                    <LuLock size={11} /> Protected
                  </span>
                )}
                {isStarred && (
                  <span className="details-badge starred">
                    <LuStar size={11} className="fill-star" /> Starred
                  </span>
                )}
                {item.isTrashed && (
                  <span className="details-badge trashed">In Trash</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="details-actions-bar">
            {isDir ? (
              <>
                <button
                  className="details-action-pill primary"
                  onClick={() => {
                    onClose();
                    onOpenFolder?.(item.id);
                  }}
                >
                  <LuFolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
                {onDownload && !item.isTrashed && (
                  <button
                    className="details-action-pill"
                    onClick={() => onDownload(item.id, item.name, item)}
                    title="Download entire folder as a zip archive"
                  >
                    <LuDownload size={14} />
                    <span>Download (.zip)</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {onPreview && (
                  <button
                    className="details-action-pill primary"
                    onClick={() => {
                      onClose();
                      onPreview(item);
                    }}
                  >
                    <LuEye size={14} />
                    <span>Preview</span>
                  </button>
                )}
                {onDownload && (
                  <button
                    className="details-action-pill"
                    onClick={() => onDownload(item.id, item.name, item)}
                  >
                    <LuDownload size={14} />
                    <span>Download</span>
                  </button>
                )}
              </>
            )}

            {onShare && (
              <button
                className="details-action-pill"
                onClick={() => {
                  onClose();
                  onShare(item);
                }}
              >
                <LuShare2 size={14} />
                <span>Share</span>
              </button>
            )}

            {onMove && !item.isTrashed && (
              <button
                className="details-action-pill"
                onClick={() => {
                  onClose();
                  onMove(item);
                }}
              >
                <LuFolderInput size={14} />
                <span>Move</span>
              </button>
            )}

            {onToggleStar && (
              <button
                className={`details-action-pill star-action-btn ${isStarred ? "starred" : ""}`}
                onClick={() => onToggleStar(item.id, isDir ? "directory" : "file")}
              >
                <LuStar size={14} className={isStarred ? "fill-star" : ""} />
                <span>{isStarred ? "Starred" : "Star"}</span>
              </button>
            )}
          </div>

          {/* Properties / File Information Section */}
          <div className="details-section">
            <h4 className="details-section-title">
              <LuFileText size={14} />
              <span>{isDir ? "Folder Information" : "File Information"}</span>
            </h4>

            <div className="details-props-grid">
              {/* Type */}
              <div className="details-prop-row">
                <span className="prop-label">Type</span>
                <span className="prop-value">
                  {isDir
                    ? "Folder"
                    : `${fileInfo.label}${item.extension ? ` (.${item.extension.replace(/^\./, "")})` : ""}`}
                </span>
              </div>

              {/* Size */}
              <div className="details-prop-row">
                <span className="prop-label">Size</span>
                <span className="prop-value">
                  {isDir
                    ? displaySize > 0
                      ? `${formatFileSize(displaySize)} (${displaySize.toLocaleString()} bytes)`
                      : "Calculating..."
                    : `${formatFileSize(displaySize)} (${displaySize.toLocaleString()} bytes)`}
                </span>
              </div>

              {/* Contents (if folder) */}
              {isDir && details?.fileCount !== undefined && (
                <div className="details-prop-row">
                  <span className="prop-label">Contents</span>
                  <span className="prop-value">
                    {details.fileCount} file{details.fileCount === 1 ? "" : "s"}
                    {details.folderCount > 0
                      ? `, ${details.folderCount} folder${details.folderCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </div>
              )}

              {/* Location Path */}
              <div className="details-prop-row path-row">
                <span className="prop-label">Path</span>
                <div className="prop-value path-value">
                  {details?.pathTrail && details.pathTrail.length > 0 ? (
                    <div className="path-breadcrumbs-wrap">
                      {details.pathTrail.map((crumb, idx) => (
                        <React.Fragment key={crumb.id || `root_${idx}`}>
                          {onOpenFolder ? (
                            <button
                              type="button"
                              className="path-breadcrumb-link"
                              onClick={() => {
                                onClose();
                                onOpenFolder(crumb.id || null);
                              }}
                              title={`Navigate to ${crumb.name}`}
                            >
                              {crumb.name}
                            </button>
                          ) : (
                            <span className="path-breadcrumb-text">{crumb.name}</span>
                          )}
                          <span className="path-breadcrumb-sep">/</span>
                        </React.Fragment>
                      ))}
                      <span className="path-breadcrumb-current" title={displayName}>
                        {displayName}
                      </span>
                    </div>
                  ) : (
                    <span className="path-text" title={fullPath}>
                      {fullPath}
                    </span>
                  )}
                  <button
                    className="prop-copy-btn"
                    onClick={handleCopyPath}
                    title="Copy full path"
                  >
                    {copiedPath ? (
                      <LuCheck size={12} className="text-emerald" />
                    ) : (
                      <LuCopy size={12} />
                    )}
                  </button>
                </div>
              </div>

              {/* Created Date */}
              {createdAt && (
                <div className="details-prop-row">
                  <span className="prop-label">Created</span>
                  <span className="prop-value">
                    {formatExactTime(createdAt) || formatDate(createdAt)}
                  </span>
                </div>
              )}

              {/* Modified Date */}
              {updatedAt && (
                <div className="details-prop-row">
                  <span className="prop-label">Modified</span>
                  <span className="prop-value">
                    {formatExactTime(updatedAt) || formatDate(updatedAt)}
                  </span>
                </div>
              )}

              {/* Storage Source */}
              <div className="details-prop-row">
                <span className="prop-label">Storage</span>
                <span className="prop-value storage-value">
                  <SourceBrandBadge source={item.source} size={14} />
                  <span>
                    {item.source === "google-drive"
                      ? "Google Drive Import"
                      : item.source === "google-photos"
                      ? "Google Photos Import"
                      : item.source === "github"
                      ? "GitHub Repository"
                      : "MeghVault Cloud"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Sharing & Access Section */}
          <div className="details-section">
            <h4 className="details-section-title">
              <LuUsers size={14} />
              <span>Access & Permissions</span>
            </h4>

            <div className="details-sharing-card">
              {sharing?.isShared ? (
                <div className="sharing-status-info">
                  <div className="sharing-status-header">
                    <span className="sharing-dot shared" />
                    <strong>Shared Access</strong>
                  </div>
                  <p className="sharing-status-desc">
                    {sharing.collaboratorsCount > 0
                      ? `Shared with ${sharing.collaboratorsCount} collaborator${
                          sharing.collaboratorsCount === 1 ? "" : "s"
                        }`
                      : "Shared via link"}
                    {sharing.isPublic ? " • Public link enabled" : ""}
                  </p>
                </div>
              ) : (
                <div className="sharing-status-info">
                  <div className="sharing-status-header">
                    <span className="sharing-dot private" />
                    <strong>Private to you</strong>
                  </div>
                  <p className="sharing-status-desc">
                    Only you can view and access this {isDir ? "folder" : "file"}.
                  </p>
                </div>
              )}

              {onShare && (
                <button
                  className="details-manage-share-btn"
                  onClick={() => {
                    onClose();
                    onShare(item);
                  }}
                >
                  <LuShare2 size={13} />
                  <span>{sharing?.isShared ? "Manage access" : "Share"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Recent Activity Section */}
          {details?.recentActivities && details.recentActivities.length > 0 && (
            <div className="details-section">
              <h4 className="details-section-title">
                <LuCalendar size={14} />
                <span>Recent Activity</span>
              </h4>

              <div className="details-activity-list">
                {details.recentActivities.map((act) => (
                  <div key={act.id} className="details-activity-item">
                    <span className="activity-dot" />
                    <div className="activity-text-col">
                      <span className="activity-action-name">
                        {act.action === "upload"
                          ? "Uploaded"
                          : act.action === "rename"
                          ? `Renamed to "${act.details?.name || displayName}"`
                          : act.action === "trash"
                          ? "Moved to Trash"
                          : act.action === "restore"
                          ? "Restored from Trash"
                          : act.action === "share"
                          ? "Shared"
                          : act.action === "star"
                          ? "Starred"
                          : act.action === "import"
                          ? "Imported"
                          : "Accessed"}
                      </span>
                      <span className="activity-time">
                        {formatExactTime(act.createdAt) || formatDate(act.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
