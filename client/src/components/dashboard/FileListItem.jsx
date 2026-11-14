import React from "react";
import {
  LuShare2,
  LuDownload,
  LuStar,
  LuEye,
  LuEllipsisVertical,
  LuLock,
  LuRotateCcw,
  LuTrash2,
  LuInfo,
  LuFilePen,
  LuFolderInput,
  LuCheck,
} from "react-icons/lu";
import { getFileInfo } from "../../utils/fileIcons";
import { formatFileSize, formatDate } from "../../utils/formatters";
import { fileApi } from "../../api/fileApi";
import { useToast } from "../../context/ToastContext";
import { usePreferences } from "../../context/PreferencesContext";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";

export function FileListItem({
  file,
  isStarred = false,
  isSelected = false,
  onToggleSelect,
  onToggleStar,
  onPreview,
  onDownload,
  onContextMenu,
  onShare,
  onShowDetails,
  isTrashView = false,
  onRestore,
  onDeleteForever,
  onRename,
  onDelete,
  onMove,
}) {
  const { showSuccess } = useToast();
  const { showAllActionsDirectly } = usePreferences();
  const fileItem = {
    ...file,
    isDirectory: false,
    type: "file",
  };
  const isSharedItem = Boolean(file.role && file.role !== "owner" && file.role !== "admin");
  const isInTrash = Boolean(isTrashView || file.isTrashed);
  const isOwner = !file.role || file.role === "owner" || file.role === "admin";
  const isEditor = file.role === "collaborator";
  const canRename = !isInTrash && (isOwner || isEditor);
  const canDelete = !isInTrash && isOwner;
  const fileInfo = getFileInfo(file.name, false);
  const Icon = fileInfo.icon;

  const handleCopyLink = (e) => {
    e.stopPropagation();
    const url = fileApi.getFileUrl(file.id, null, file.name);
    const fullUrl = window.location.origin + url;
    navigator.clipboard?.writeText(fullUrl).then(() => {
      showSuccess(`Link to "${file.name}" copied to clipboard`);
    }).catch(() => {
      showSuccess(`Link generated for "${file.name}"`);
    });
  };

  return (
    <div
      className={`file-modern-row ${isSelected ? "item-selected" : ""}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          onToggleSelect?.(fileItem, e);
          return;
        }
        onPreview(fileItem);
      }}
      onContextMenu={(e) => onContextMenu(e, fileItem)}
      tabIndex={0}
      role="button"
      draggable={!isInTrash}
      onDragStart={(e) => {
        const payload = JSON.stringify({ itemType: "file", itemId: file.id, name: file.name });
        e.dataTransfer.setData("application/json", payload);
        e.dataTransfer.setData("application/x-meghvault-item", payload);
        e.dataTransfer.effectAllowed = "move";
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(fileItem);
        }
      }}
    >
      {/* Checkbox for Multi-Selection */}
      {onToggleSelect && !isInTrash && (
        <button
          type="button"
          className={`row-select-checkbox ${isSelected ? "selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(fileItem, e);
          }}
          title={isSelected ? "Deselect file" : "Select file"}
          aria-label="Select file"
        >
          {isSelected && <LuCheck size={12} strokeWidth={3} />}
        </button>
      )}

      {/* File Icon Badge */}
      <div
        className="file-row-icon-badge"
        style={{
          color: fileInfo.color,
          backgroundColor: fileInfo.bgColor,
        }}
      >
        <Icon />
      </div>

      {/* File Details (Name & Size) */}
      <div className="file-row-info">
        <span className="file-row-name" title={file.name}>
          {file.name}
        </span>
        <div className="file-row-meta">
          {file.isPasswordProtected && (
            <span className="file-row-lock-pill" title="Password protected">
              <LuLock size={11} />
              <span>Protected</span>
            </span>
          )}
          {!isSharedItem && <SourceBrandBadge source={file.source} size={14} />}
          <span>{file.size ? formatFileSize(file.size) : fileInfo.label}</span>
          <span className="meta-separator">•</span>
          <span>{isInTrash && file.trashedAt ? `Trashed ${formatDate(file.trashedAt)}` : formatDate(file.createdAt || file.updatedAt)}</span>
        </div>
      </div>

      {/* Row Action Buttons */}
      <div className="file-row-actions" onClick={(e) => e.stopPropagation()}>
        {isInTrash ? (
          showAllActionsDirectly ? (
            <>
              {onRestore && (
                <button
                  className="row-action-btn"
                  onClick={() => onRestore("file", file.id, file.name)}
                  title="Restore file"
                  aria-label="Restore file"
                >
                  <LuRotateCcw />
                </button>
              )}
              {onDeleteForever && (
                <button
                  className="row-action-btn danger-hover"
                  onClick={() => onDeleteForever("file", file.id, file.name)}
                  title="Delete forever"
                  aria-label="Delete forever"
                >
                  <LuTrash2 />
                </button>
              )}
              {onShowDetails && (
                <button
                  className="row-action-btn"
                  onClick={() => onShowDetails(fileItem)}
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
                onContextMenu(e, fileItem);
              }}
              title="More options"
              aria-label="More file options"
            >
              <LuEllipsisVertical />
            </button>
          )
        ) : (
          showAllActionsDirectly ? (
            <>
              {onShare && !isSharedItem && (
                <button
                  className="row-action-btn"
                  onClick={() => onShare(fileItem)}
                  title="Share file"
                  aria-label="Share file"
                >
                  <LuShare2 />
                </button>
              )}

              <button
                className="row-action-btn"
                onClick={() => onDownload(file.id, file.name)}
                title="Download file"
                aria-label="Download file"
              >
                <LuDownload />
              </button>

              {onToggleStar && !isSharedItem && (
                <button
                  className={`row-action-btn star-action-btn ${isStarred ? "starred" : ""}`}
                  onClick={() => onToggleStar(file.id)}
                  title={isStarred ? "Starred" : "Star file"}
                  aria-label="Star file"
                >
                  <LuStar className={isStarred ? "fill-star" : ""} />
                </button>
              )}

              <button
                className="row-action-btn"
                onClick={() => onPreview(file)}
                title="Preview file"
                aria-label="Preview file"
              >
                <LuEye />
              </button>

              {onShowDetails && (
                <button
                  className="row-action-btn"
                  onClick={() => onShowDetails(fileItem)}
                  title="Details & info"
                  aria-label="Details & info"
                >
                  <LuInfo />
                </button>
              )}

              {canRename && onRename && (
                <button
                  className="row-action-btn"
                  onClick={() => onRename("file", file.id, file.name)}
                  title="Rename file"
                  aria-label="Rename file"
                >
                  <LuFilePen />
                </button>
              )}

              {onMove && !isInTrash && (
                <button
                  className="row-action-btn"
                  onClick={() => onMove(fileItem)}
                  title="Move file"
                  aria-label="Move file"
                >
                  <LuFolderInput />
                </button>
              )}

              {canDelete && onDelete && (
                <button
                  className="row-action-btn danger-hover"
                  onClick={() => onDelete("file", file.id, file.name)}
                  title="Move to trash"
                  aria-label="Move to trash"
                >
                  <LuTrash2 />
                </button>
              )}
            </>
          ) : (
            <button
              className="row-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e, fileItem);
              }}
              title="More options"
              aria-label="More file options"
            >
              <LuEllipsisVertical />
            </button>
          )
        )}
      </div>
    </div>
  );
}
