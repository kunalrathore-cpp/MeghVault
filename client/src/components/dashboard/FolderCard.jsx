import React, { useState } from "react";
import {
  LuStar,
  LuEllipsisVertical,
  LuLock,
  LuRotateCcw,
  LuTrash2,
  LuDownload,
  LuCheck,
} from "react-icons/lu";
import { ColorfulFolderIcon } from "../../utils/fileIcons";
import { formatDate } from "../../utils/formatters";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";
import { usePreferences } from "../../context/PreferencesContext";

// Distinct color presets matching the attached inspired design
export const FOLDER_THEMES = [
  { color: "#3b82f6", backColor: "#1d4ed8", bg: "rgba(59, 130, 246, 0.12)" }, // Blue (Projects / Pictures)
  { color: "#8b5cf6", backColor: "#6d28d9", bg: "rgba(139, 92, 246, 0.12)" }, // Purple (Documents)
  { color: "#ec4899", backColor: "#be185d", bg: "rgba(236, 72, 153, 0.12)" }, // Pink (Videos)
  { color: "#10b981", backColor: "#047857", bg: "rgba(16, 185, 129, 0.12)" }, // Green (Images)
  { color: "#f59e0b", backColor: "#b45309", bg: "rgba(245, 158, 11, 0.12)" }, // Amber
  { color: "#06b6d4", backColor: "#0e7490", bg: "rgba(6, 182, 212, 0.12)" },  // Cyan
];

export function FolderCard({
  folder,
  index = 0,
  isStarred = false,
  isSelected = false,
  onToggleSelect,
  onToggleStar,
  onClick,
  onContextMenu,
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
      className={`folder-modern-card ${isDragOver ? "drag-over-folder" : ""} ${isSelected ? "item-selected" : ""}`}
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
          className={`card-select-checkbox ${isSelected ? "selected" : ""}`}
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

      <div className="folder-card-header">
        {/* Proper Colorful Dual-Tone Folder Icon matching Inspired Design */}
        <div className="folder-icon-circle" style={{ backgroundColor: theme.bg }}>
          <ColorfulFolderIcon
            color={theme.color}
            backColor={theme.backColor}
            size={38}
          />
        </div>

        {/* Action icons: Source Badge, Star & Context Menu */}
        <div className="folder-actions-group" onClick={(e) => e.stopPropagation()}>
          {isInTrash ? (
            showAllActionsDirectly ? (
              <>
                {onRestore && (
                  <button
                    className="folder-action-btn"
                    onClick={() => onRestore("directory", folder.id, folder.name)}
                    title="Restore folder"
                    aria-label="Restore folder"
                  >
                    <LuRotateCcw />
                  </button>
                )}
                {onDeleteForever && (
                  <button
                    className="folder-action-btn danger-hover"
                    onClick={() => onDeleteForever("directory", folder.id, folder.name)}
                    title="Delete forever"
                    aria-label="Delete forever"
                  >
                    <LuTrash2 />
                  </button>
                )}
              </>
            ) : (
              <button
                className="folder-action-btn"
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
            <>
              {folder.isPasswordProtected && (
                <span className="folder-lock-badge" title="Password protected">
                  <LuLock size={12} />
                </span>
              )}
              {!isSharedItem && <SourceBrandBadge source={folder.source} size={15} />}

              {/* Star Quick Toggle */}
              {onToggleStar && !isSharedItem && (
                <button
                  className={`folder-action-btn star-action-btn ${isStarred ? "starred" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(folder.id);
                  }}
                  title={isStarred ? "Remove Star" : "Add Star"}
                  aria-label="Star folder"
                >
                  <LuStar className={isStarred ? "fill-star" : ""} />
                </button>
              )}

              {/* Direct 1-Click Download if Direct Actions mode is active */}
              {showAllActionsDirectly && onDownload && !isInTrash && (
                <button
                  className="folder-action-btn"
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

              {/* Clean More Options Dropdown Trigger (Contains Rename, Move, Share, Details, Delete) */}
              <button
                className="folder-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextMenu(e, folderItem);
                }}
                title="More options"
                aria-label="More folder options"
              >
                <LuEllipsisVertical />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="folder-card-details">
        <h4 className="folder-card-name" title={folder.name}>
          {folder.name}
        </h4>
        <div className="folder-card-meta">
          <span>{isInTrash && folder.trashedAt ? `Trashed ${formatDate(folder.trashedAt)}` : (folder.itemCount ?? "Folder")}</span>
        </div>
        <div className="folder-card-date">
          {formatDate(folder.createdAt || folder.updatedAt)}
        </div>
      </div>
    </div>
  );
}
