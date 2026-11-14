import React, { useEffect } from "react";
import {
  LuCheck,
  LuDownload,
  LuFolderInput,
  LuX,
  LuFolder,
  LuFile,
  LuTrash2,
  LuRotateCcw,
} from "react-icons/lu";

export function BulkActionBar({
  selectedCount = 0,
  folderCount = 0,
  fileCount = 0,
  isAllSelected = false,
  onSelectAll,
  onClearSelection,
  onDownload,
  onMove,
  onTrash,
  onRestore,
  isTrashView = false,
}) {
  // Listen for Escape key to clear selection, and Delete/Backspace to move to trash
  useEffect(() => {
    const handleKeyDown = (e) => {
      const targetTag = e.target?.tagName?.toLowerCase();
      if (
        targetTag === "input" ||
        targetTag === "textarea" ||
        e.target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape" && selectedCount > 0) {
        onClearSelection?.();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedCount > 0 &&
        onTrash
      ) {
        e.preventDefault();
        onTrash();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, onClearSelection, onTrash]);

  if (selectedCount === 0) return null;

  return (
    <div className="bulk-action-bar-wrapper">
      <div className="bulk-action-bar-pill">
        {/* Selection Count & Select All Toggle */}
        <div className="bulk-selection-info">
          <button
            type="button"
            className="bulk-select-toggle-btn"
            onClick={onSelectAll}
            title={isAllSelected ? "Deselect all visible items" : "Select all visible items"}
          >
            <span className={`bulk-checkbox-box ${isAllSelected ? "checked" : ""}`}>
              {isAllSelected && <LuCheck size={12} strokeWidth={3} />}
            </span>
            <span className="bulk-count-text">
              <strong>{selectedCount}</strong> {selectedCount === 1 ? "item" : "items"} selected
            </span>
          </button>

          {(folderCount > 0 || fileCount > 0) && (
            <span className="bulk-breakdown-pill">
              {folderCount > 0 && (
                <span className="breakdown-segment">
                  <LuFolder size={12} /> {folderCount}
                </span>
              )}
              {fileCount > 0 && (
                <span className="breakdown-segment">
                  <LuFile size={12} /> {fileCount}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="bulk-bar-divider" />

        {/* Primary Action Buttons */}
        <div className="bulk-action-buttons">
          {/* Trash View Restore Button */}
          {isTrashView && onRestore && (
            <button
              type="button"
              className="bulk-action-btn primary"
              onClick={onRestore}
              title="Restore selected items from trash"
            >
              <LuRotateCcw size={15} />
              <span>Restore ({selectedCount})</span>
            </button>
          )}

          {/* Active Drive Download Button */}
          {!isTrashView && onDownload && (
            <button
              type="button"
              className="bulk-action-btn primary"
              onClick={onDownload}
              title="Download selected items as a single zip archive"
            >
              <LuDownload size={15} />
              <span>Download {selectedCount > 1 ? "(.zip)" : ""}</span>
            </button>
          )}

          {/* Active Drive Move Button */}
          {!isTrashView && onMove && (
            <button
              type="button"
              className="bulk-action-btn"
              onClick={onMove}
              title="Move selected items to another destination folder"
            >
              <LuFolderInput size={15} />
              <span>Move to...</span>
            </button>
          )}

          {/* Delete / Move to Trash Button */}
          {onTrash && (
            <button
              type="button"
              className="bulk-action-btn danger"
              onClick={onTrash}
              title={isTrashView ? "Permanently delete selected items" : "Move selected items to Trash"}
            >
              <LuTrash2 size={15} />
              <span>{isTrashView ? "Delete Forever" : "Move to Trash"}</span>
            </button>
          )}
        </div>

        <div className="bulk-bar-divider" />

        {/* Dismiss / Clear Button */}
        <button
          type="button"
          className="bulk-clear-btn"
          onClick={onClearSelection}
          title="Clear selection (Esc)"
          aria-label="Clear selection"
        >
          <LuX size={16} />
        </button>
      </div>
    </div>
  );
}
