import React, { useState } from "react";
import {
  LuEllipsisVertical,
  LuStar,
  LuDownload,
  LuLock,
  LuRotateCcw,
  LuTrash2,
  LuCheck,
} from "react-icons/lu";
import { getFileInfo } from "../../utils/fileIcons";
import { formatDate, formatFileSize } from "../../utils/formatters";
import { fileApi } from "../../api/fileApi";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";
import { usePreferences } from "../../context/PreferencesContext";

export function FileCard({
  item,
  isStarred = false,
  isSelected = false,
  onToggleSelect,
  onToggleStar,
  onClick,
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
  const { showAllActionsDirectly } = usePreferences();
  const [imgError, setImgError] = useState(false);
  const isDir = Boolean(item.isDirectory || item.type === "directory");
  const cardItem = { ...item, isDirectory: isDir, type: isDir ? "directory" : "file" };
  const isSharedItem = Boolean(item.role && item.role !== "owner" && item.role !== "admin");
  const isInTrash = Boolean(isTrashView || item.isTrashed);
  const isOwner = !item.role || item.role === "owner" || item.role === "admin";
  const isEditor = item.role === "collaborator";
  const canRename = !isInTrash && (isOwner || isEditor);
  const canDelete = !isInTrash && isOwner;
  const fileInfo = getFileInfo(item.name, isDir);
  const Icon = fileInfo.icon;
  const isImage = fileInfo.category === "image" && !imgError && !isInTrash;

  const streamUrl = !isDir && !isInTrash ? fileApi.getFileUrl(item.id, null, item.name) : null;

  return (
    <div
      className={`file-modern-card ${isDir ? "is-folder" : ""} ${isSelected ? "item-selected" : ""}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          onToggleSelect?.(cardItem, e);
          return;
        }
        onClick(cardItem);
      }}
      onContextMenu={(e) => onContextMenu(e, cardItem)}
      tabIndex={0}
      role="button"
      draggable={!isInTrash}
      onDragStart={(e) => {
        const payload = JSON.stringify({ itemType: "file", itemId: item.id, name: item.name });
        e.dataTransfer.setData("application/json", payload);
        e.dataTransfer.setData("application/x-meghvault-item", payload);
        e.dataTransfer.effectAllowed = "move";
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(item);
        }
      }}
    >
      {/* Checkbox for Multi-Selection */}
      {onToggleSelect && !isInTrash && (
        <button
          type="button"
          className={`card-select-checkbox ${isSelected ? "selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(cardItem, e);
          }}
          title={isSelected ? "Deselect file" : "Select file"}
          aria-label="Select file"
        >
          {isSelected && <LuCheck size={12} strokeWidth={3} />}
        </button>
      )}

      {/* Visual Preview Banner */}
      <div
        className="file-card-preview"
        style={{ backgroundColor: fileInfo.bgColor }}
      >
        {isImage ? (
          <img
            src={streamUrl}
            alt={item.name}
            className="file-card-img-thumb"
            loading="lazy"
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="file-card-icon-hero" style={{ color: fileInfo.color }}>
            <Icon />
          </div>
        )}

        {/* Floating Quick Action Overlay */}
        <div className="file-card-overlay-actions" onClick={(e) => e.stopPropagation()}>
          {isInTrash ? (
            showAllActionsDirectly ? (
              <>
                {onRestore && (
                  <button
                    className="file-card-action-pill"
                    onClick={() => onRestore("file", item.id, item.name)}
                    title="Restore file"
                    aria-label="Restore file"
                  >
                    <LuRotateCcw />
                  </button>
                )}
                {onDeleteForever && (
                  <button
                    className="file-card-action-pill danger-hover"
                    onClick={() => onDeleteForever("file", item.id, item.name)}
                    title="Delete forever"
                    aria-label="Delete forever"
                  >
                    <LuTrash2 />
                  </button>
                )}
              </>
            ) : (
              <button
                className="file-card-action-pill"
                onClick={(e) => onContextMenu(e, cardItem)}
                title="Options"
                aria-label="File options"
              >
                <LuEllipsisVertical />
              </button>
            )
          ) : (
            <>
              {item.isPasswordProtected && (
                <span className="file-lock-badge" title="Password protected">
                  <LuLock size={12} />
                </span>
              )}
              {!isSharedItem && <SourceBrandBadge source={item.source} size={15} />}

              {/* Star Button */}
              {onToggleStar && !isSharedItem && (
                <button
                  className={`file-card-action-pill star-action-btn ${isStarred ? "starred" : ""}`}
                  onClick={() => onToggleStar(item.id)}
                  title={isStarred ? "Starred" : "Star file"}
                  aria-label="Star file"
                >
                  <LuStar className={isStarred ? "fill-star" : ""} />
                </button>
              )}

              {/* Direct 1-Click Download if Direct Actions mode is active */}
              {showAllActionsDirectly && onDownload && !isDir && (
                <button
                  className="file-card-action-pill"
                  onClick={() => onDownload(item.id, item.name)}
                  title="Download file"
                  aria-label="Download file"
                >
                  <LuDownload />
                </button>
              )}

              {/* More Options Menu (Share, Rename, Move, Details, Delete) */}
              <button
                className="file-card-action-pill"
                onClick={(e) => onContextMenu(e, cardItem)}
                title="Options"
                aria-label="File options"
              >
                <LuEllipsisVertical />
              </button>
            </>
          )}
        </div>
      </div>

      {/* File Card Details */}
      <div className="file-card-body">
        <div className="file-card-icon-mini" style={{ color: fileInfo.color }}>
          <Icon />
        </div>
        <div className="file-card-meta-wrap">
          <span className="file-card-title" title={item.name}>
            {item.name}
          </span>
          <div className="file-card-sub">
            <span>{item.size ? formatFileSize(item.size) : fileInfo.label}</span>
            <span className="sub-dot">•</span>
            <span>{isInTrash && item.trashedAt ? `Trashed ${formatDate(item.trashedAt)}` : formatDate(item.createdAt || item.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
