import React, { useState } from "react";
import {
  LuFolderOpen,
  LuShare2,
  LuStar,
  LuEllipsisVertical,
  LuLock,
  LuRotateCcw,
  LuTrash2,
  LuInfo,
  LuFilePen,
  LuFolderInput,
  LuDownload,
  LuCheck,
} from "react-icons/lu";
import { ColorfulFolderIcon } from "../../utils/fileIcons";
import { formatDate } from "../../utils/formatters";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";
import { usePreferences } from "../../context/PreferencesContext";
import { FOLDER_THEMES } from "./FolderCard";

export function FolderListItem({
  folder,
  index = 0,
  isStarred = false,
  isSelected = false,
  onToggleSelect,
  onToggleStar,
  onClick,
  onContextMenu,
  onShare,
  onShowDetails,
  onDownload,
  isTrashView = false,
  onRestore,
  onDeleteForever,
  onRename,
  onDelete,
  onMove,
  onDropItem,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { showAllActionsDirectly } = usePreferences();
  const theme = FOLDER_THEMES[index % FOLDER_THEMES.length];
  const isSharedItem = Boolean(folder.role && folder.role !== "owner" && folder.role !== "admin");
  const isOwner = !folder.role || folder.role === "owner" || folder.role === "admin";
  const isEditor = folder.role === "collaborator";
  const isInTrash = Boolean(isTrashView || folder.isTrashed);
  const canRename = !isInTrash && (isOwner || isEditor);
  const canDelete = !isInTrash && isOwner;
  const folderItem = {
    ...folder,
    isDirectory: true,
    type: "directory",
  };

  return (
    <div
      className={`file-modern-row folder-modern-row ${isDragOver ? "drag-over-folder" : ""} ${isSelected ? "item-selected" : ""}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          onToggleSelect?.(folderItem, e);
          return;
        }
        onClick(folderItem);
      }}
      onContextMenu={(e) => onContextMenu(e, folderItem)}
      tabIndex={0}
      role="button"
      draggable={!isInTrash}
      onDragStart={(e) => {
        const payload = JSON.stringify({ itemType: "directory", itemId: folder.id, name: folder.name });
        e.dataTransfer.setData("application/json", payload);
        e.dataTransfer.setData("application/x-meghvault-item", payload);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (isInTrash || !onDropItem) return;
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes("application/json") || types.includes("application/x-meghvault-item")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        if (isInTrash || !onDropItem) return;
        try {
          const dataStr =
            e.dataTransfer.getData("application/x-meghvault-item") ||
            e.dataTransfer.getData("application/json");
          if (!dataStr) return;
          const data = JSON.parse(dataStr);
          if (data.itemId === folder.id) return; // Cannot drop onto self
          e.preventDefault();
          e.stopPropagation();
          onDropItem(data, folder.id, folder.name);
        } catch (err) {
          console.error(err);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(folderItem);
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
            onToggleSelect(folderItem, e);
          }}
          title={isSelected ? "Deselect folder" : "Select folder"}
          aria-label="Select folder"
        >
          {isSelected && <LuCheck size={12} strokeWidth={3} />}
        </button>
      )}

      {/* Dual-Tone Folder Icon Badge */}
      <div
        className="file-row-icon-badge folder-row-icon-badge"
        style={{
          backgroundColor: theme.bg,
        }}
      >
        <ColorfulFolderIcon
          color={theme.color}
          backColor={theme.backColor}
          size={24}
        />
      </div>

      {/* Folder Details */}
      <div className="file-row-info">
        <span className="file-row-name" title={folder.name}>
          {folder.name}
        </span>
        <div className="file-row-meta">
          {folder.isPasswordProtected && (
            <span className="file-row-lock-pill" title="Password protected">
              <LuLock size={11} />
              <span>Protected</span>
            </span>
          )}
          {!isSharedItem && <SourceBrandBadge source={folder.source} size={14} />}
          <span>
            {isInTrash && folder.trashedAt
              ? `Trashed ${formatDate(folder.trashedAt)}`
              : folder.itemCount ?? "Folder"}
          </span>
          <span className="meta-separator">•</span>
          <span>{formatDate(folder.createdAt || folder.updatedAt)}</span>
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
                  onClick={() => onRestore("directory", folder.id, folder.name)}
                  title="Restore folder"
                  aria-label="Restore folder"
                >
                  <LuRotateCcw />
                </button>
              )}
              {onDeleteForever && (
                <button
                  className="row-action-btn danger-hover"
                  onClick={() => onDeleteForever("directory", folder.id, folder.name)}
                  title="Delete forever"
                  aria-label="Delete forever"
                >
                  <LuTrash2 />
                </button>
              )}
              {onShowDetails && (
                <button
                  className="row-action-btn"
                  onClick={() => onShowDetails(folderItem)}
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
                onContextMenu(e, folderItem);
              }}
              title="More options"
              aria-label="More folder options"
            >
              <LuEllipsisVertical />
            </button>
          )
        ) : (
          showAllActionsDirectly ? (
            <>
              <button
                className="row-action-btn"
                onClick={() => onClick(folderItem)}
                title="Open folder"
                aria-label="Open folder"
              >
                <LuFolderOpen />
              </button>

              {onShare && !isSharedItem && (
                <button
                  className="row-action-btn"
                  onClick={() => onShare(folderItem)}
                  title="Share folder"
                  aria-label="Share folder"
                >
                  <LuShare2 />
                </button>
              )}

              {onToggleStar && !isSharedItem && (
                <button
                  className={`row-action-btn star-action-btn ${isStarred ? "starred" : ""}`}
                  onClick={() => onToggleStar(folder.id)}
                  title={isStarred ? "Remove Star" : "Add Star"}
                  aria-label="Star folder"
                >
                  <LuStar className={isStarred ? "fill-star" : ""} />
                </button>
              )}

              {onShowDetails && (
                <button
                  className="row-action-btn"
                  onClick={() => onShowDetails(folderItem)}
                  title="Details & info"
                  aria-label="Details & info"
                >
                  <LuInfo />
                </button>
              )}

              {onDownload && !isInTrash && (
                <button
                  className="row-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(folder.id, folder.name, folder);
                  }}
                  title="Download folder as zip"
                  aria-label="Download folder"
                >
                  <LuDownload />
                </button>
              )}

              {canRename && onRename && (
                <button
                  className="row-action-btn"
                  onClick={() => onRename("directory", folder.id, folder.name)}
                  title="Rename folder"
                  aria-label="Rename folder"
                >
                  <LuFilePen />
                </button>
              )}

              {onMove && !isInTrash && (
                <button
                  className="row-action-btn"
                  onClick={() => onMove(folderItem)}
                  title="Move folder"
                  aria-label="Move folder"
                >
                  <LuFolderInput />
                </button>
              )}

              {canDelete && onDelete && (
                <button
                  className="row-action-btn danger-hover"
                  onClick={() => onDelete("directory", folder.id, folder.name)}
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
                onContextMenu(e, folderItem);
              }}
              title="More options"
              aria-label="More folder options"
            >
              <LuEllipsisVertical />
            </button>
          )
        )}
      </div>
    </div>
  );
}
