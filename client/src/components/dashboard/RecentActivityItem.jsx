import React from "react";
import {
  LuUpload,
  LuEye,
  LuDownload,
  LuFilePen,
  LuShare2,
  LuStar,
  LuRotateCcw,
  LuEllipsisVertical,
  LuTrash2,
  LuCloudDownload,
  LuFolderInput,
  LuInfo,
} from "react-icons/lu";
import { getFileInfo } from "../../utils/fileIcons";
import { formatFileSize, formatDate, formatExactTime } from "../../utils/formatters";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";
import { usePreferences } from "../../context/PreferencesContext";

const ACTION_CONFIG = {
  upload: {
    label: "Uploaded",
    icon: LuUpload,
    className: "activity-badge-upload",
  },
  view: {
    label: "Viewed",
    icon: LuEye,
    className: "activity-badge-view",
  },
  download: {
    label: "Downloaded",
    icon: LuDownload,
    className: "activity-badge-download",
  },
  rename: {
    label: "Renamed",
    icon: LuFilePen,
    className: "activity-badge-rename",
  },
  share: {
    label: "Shared",
    icon: LuShare2,
    className: "activity-badge-share",
  },
  star: {
    label: "Starred",
    icon: LuStar,
    className: "activity-badge-star",
  },
  restore: {
    label: "Restored",
    icon: LuRotateCcw,
    className: "activity-badge-restore",
  },
  trash: {
    label: "Moved to Trash",
    icon: LuTrash2,
    className: "activity-badge-trash",
  },
  import: {
    label: "Imported",
    icon: LuCloudDownload,
    className: "activity-badge-import",
  },
  move: {
    label: "Moved",
    icon: LuFolderInput,
    className: "activity-badge-move",
  },
};

export function RecentActivityItem({
  activity,
  viewMode = "list",
  isStarred = false,
  onToggleStar,
  onPreview,
  onDownload,
  onOpenFolder,
  onContextMenu,
  onShare,
  onDelete,
  onShowDetails,
  onRename,
}) {
  const { showAllActionsDirectly } = usePreferences();
  const isDir = Boolean(activity.isDirectory || activity.resourceType === "directory");
  const fileInfo = getFileInfo(activity.name, isDir);
  const Icon = fileInfo.icon;
  const isAlive = activity.status === "active";
  const isTrashed = activity.status === "trashed";
  const isDeleted = activity.status === "deleted";

  const actionCfg = ACTION_CONFIG[activity.action] || {
    label: activity.action,
    icon: LuEye,
    className: "activity-badge-view",
  };
  const ActionIcon = actionCfg.icon;

  const handleRowClick = () => {
    if (!isAlive) return;
    if (isDir) {
      onOpenFolder?.(activity.resourceId);
    } else {
      onPreview?.({
        id: activity.resourceId,
        name: activity.name,
        extension: activity.extension,
        size: activity.size,
        source: activity.source,
        isDirectory: false,
      });
    }
  };

  const getSubtext = () => {
    if (activity.action === "rename" && activity.previousName) {
      return `Renamed from "${activity.previousName}"`;
    }
    if (activity.action === "share" && activity.sharedWithEmail) {
      return `Shared with ${activity.sharedWithEmail}`;
    }
    if (activity.action === "trash") {
      return "Moved to Trash";
    }
    if (activity.action === "move") {
      if (activity.fromDirectoryName && activity.toDirectoryName) {
        return `Moved from "${activity.fromDirectoryName}" to "${activity.toDirectoryName}"`;
      }
      if (activity.toDirectoryName) {
        return `Moved to "${activity.toDirectoryName}"`;
      }
      return "Moved to another folder";
    }
    if (activity.action === "import") {
      const sourceNames = {
        "google-drive": "Imported from Google Drive",
        "google-photos": "Imported from Google Photos",
        "github": "Imported from GitHub",
        "meghvault": "Imported from MeghVault Shared",
      };
      return sourceNames[activity.source] || "Imported via Cloud";
    }
    if (isDir) {
      return "Folder";
    }
    return activity.size ? formatFileSize(activity.size) : fileInfo.label;
  };

  const resourcePayload = {
    id: activity.resourceId,
    name: activity.name,
    extension: activity.extension,
    size: activity.size,
    source: activity.source,
    isDirectory: isDir,
    type: isDir ? "directory" : "file",
    isTrashed,
  };

  if (viewMode === "grid") {
    return (
      <div
        className={`activity-card-item ${!isAlive ? "is-unavailable" : ""}`}
        onClick={handleRowClick}
        onContextMenu={(e) => isAlive && onContextMenu(e, resourcePayload)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
      >
        <div className="activity-card-header">
          <div
            className="activity-card-icon-badge"
            style={{
              color: fileInfo.color,
              backgroundColor: fileInfo.bgColor,
            }}
          >
            <Icon />
          </div>

          <div className="activity-card-badges">
            <span className={`activity-action-badge ${actionCfg.className}`}>
              <ActionIcon size={11} />
              <span>{actionCfg.label}</span>
            </span>
            <SourceBrandBadge source={activity.source} size={15} />
          </div>
        </div>

        <div className="activity-card-body">
          <h4 className="activity-card-name" title={activity.name}>
            {activity.name}
          </h4>
          <div className="activity-card-meta">
            <span className="activity-card-sub">{getSubtext()}</span>
            <span className="meta-separator">•</span>
            <span className="activity-card-time">
              {formatExactTime(activity.createdAt) || formatDate(activity.createdAt)}
            </span>
          </div>
        </div>

        {/* Card Quick Action Bar */}
        {isAlive && (
          <div className="activity-card-actions" onClick={(e) => e.stopPropagation()}>
            {showAllActionsDirectly ? (
              <>
                {onShowDetails && (
                  <button
                    className="card-action-btn"
                    onClick={() => onShowDetails(resourcePayload)}
                    title="Details & info"
                    aria-label="Details & info"
                  >
                    <LuInfo size={14} />
                  </button>
                )}

                {onToggleStar && (
                  <button
                    className={`card-action-btn ${isStarred ? "starred" : ""}`}
                    onClick={() => onToggleStar(activity.resourceId, isDir ? "directory" : "file")}
                    title={isStarred ? "Remove Star" : "Add Star"}
                    aria-label="Star"
                  >
                    <LuStar size={14} className={isStarred ? "fill-star" : ""} />
                  </button>
                )}

                {!isDir && onPreview && (
                  <button
                    className="card-action-btn"
                    onClick={() => onPreview(resourcePayload)}
                    title="Preview file"
                    aria-label="Preview file"
                  >
                    <LuEye size={14} />
                  </button>
                )}

                {!isDir && onDownload && (
                  <button
                    className="card-action-btn"
                    onClick={() => onDownload(activity.resourceId, activity.name)}
                    title="Download file"
                    aria-label="Download file"
                  >
                    <LuDownload size={14} />
                  </button>
                )}

                {onShare && (
                  <button
                    className="card-action-btn"
                    onClick={() => onShare(resourcePayload)}
                    title="Share"
                    aria-label="Share"
                  >
                    <LuShare2 size={14} />
                  </button>
                )}

                {onRename && (
                  <button
                    className="card-action-btn"
                    onClick={() => onRename(isDir ? "directory" : "file", activity.resourceId, activity.name)}
                    title="Rename"
                    aria-label="Rename"
                  >
                    <LuFilePen size={14} />
                  </button>
                )}

                {onDelete && (
                  <button
                    className="card-action-btn danger-hover"
                    onClick={() => onDelete(isDir ? "directory" : "file", activity.resourceId, activity.name)}
                    title="Move to trash"
                    aria-label="Move to trash"
                  >
                    <LuTrash2 size={14} />
                  </button>
                )}
              </>
            ) : (
              <button
                className="card-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextMenu(e, resourcePayload);
                }}
                title="More options"
                aria-label="More options"
              >
                <LuEllipsisVertical size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`activity-timeline-row ${!isAlive ? "is-unavailable" : ""}`}
      onClick={handleRowClick}
      onContextMenu={(e) => isAlive && onContextMenu(e, resourcePayload)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      {/* File or Folder Color Icon */}
      <div
        className="activity-icon-badge"
        style={{
          color: fileInfo.color,
          backgroundColor: fileInfo.bgColor,
        }}
      >
        <Icon />
      </div>

      {/* Main Details */}
      <div className="activity-info-col">
        <div className="activity-name-row">
          <span className="activity-item-name" title={activity.name}>
            {activity.name}
          </span>

          {/* Action Badge */}
          <span className={`activity-action-badge ${actionCfg.className}`}>
            <ActionIcon size={12} />
            <span>{actionCfg.label}</span>
          </span>

          {/* Trashed or Deleted Status Indicator */}
          {isTrashed && activity.action !== "trash" && (
            <span className="activity-status-pill trashed">
              <LuTrash2 size={11} />
              <span>In Trash</span>
            </span>
          )}
          {isDeleted && (
            <span className="activity-status-pill deleted">
              Deleted
            </span>
          )}
        </div>

        <div className="activity-meta-row">
          <SourceBrandBadge source={activity.source} size={14} />
          <span className="activity-subtext">{getSubtext()}</span>
          <span className="meta-separator">•</span>
          <span className="activity-time-tag">
            {formatExactTime(activity.createdAt) || formatDate(activity.createdAt)}
          </span>
        </div>
      </div>

      {/* Right Quick Action Buttons */}
      {isAlive && (
        <div className="activity-row-actions" onClick={(e) => e.stopPropagation()}>
          {showAllActionsDirectly ? (
            <>
              {onShare && (
                <button
                  className="row-action-btn"
                  onClick={() => onShare(resourcePayload)}
                  title="Share"
                  aria-label="Share"
                >
                  <LuShare2 />
                </button>
              )}

              {!isDir && onDownload && (
                <button
                  className="row-action-btn"
                  onClick={() => onDownload(activity.resourceId, activity.name)}
                  title="Download file"
                  aria-label="Download file"
                >
                  <LuDownload />
                </button>
              )}

              {onToggleStar && (
                <button
                  className={`row-action-btn star-action-btn ${isStarred ? "starred" : ""}`}
                  onClick={() => onToggleStar(activity.resourceId, isDir ? "directory" : "file")}
                  title={isStarred ? "Remove Star" : "Add Star"}
                  aria-label="Star"
                >
                  <LuStar className={isStarred ? "fill-star" : ""} />
                </button>
              )}

              {!isDir && onPreview && (
                <button
                  className="row-action-btn"
                  onClick={() => onPreview(resourcePayload)}
                  title="Preview file"
                  aria-label="Preview file"
                >
                  <LuEye />
                </button>
              )}

              {onRename && (
                <button
                  className="row-action-btn"
                  onClick={() => onRename(isDir ? "directory" : "file", activity.resourceId, activity.name)}
                  title="Rename"
                  aria-label="Rename"
                >
                  <LuFilePen />
                </button>
              )}

              {onDelete && (
                <button
                  className="row-action-btn danger-hover"
                  onClick={() => onDelete(isDir ? "directory" : "file", activity.resourceId, activity.name)}
                  title="Move to trash"
                  aria-label="Move to trash"
                >
                  <LuTrash2 />
                </button>
              )}

              {onShowDetails && (
                <button
                  className="row-action-btn"
                  onClick={() => onShowDetails(resourcePayload)}
                  title="Details & info"
                  aria-label="Details & info"
                >
                  <LuInfo />
                </button>
              )}
            </>
          ) : (
            <button
              className="row-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e, resourcePayload);
              }}
              title="More options"
              aria-label="More options"
            >
              <LuEllipsisVertical />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
