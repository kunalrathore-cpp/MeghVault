import React from "react";
import { LuFolderOpen, LuSearch, LuUpload, LuPlus } from "react-icons/lu";

export function EmptyFolderState({
  hasFolders = false,
  isRoot = false,
  searchTerm = "",
  onClearSearch = null,
  onUploadClick = null,
  onNewFolderClick = null,
  customTitle = null,
  customSubtitle = null,
}) {
  const isSearchActive = Boolean(searchTerm && searchTerm.trim());

  let title = customTitle || "No files in this folder";
  let subtitle = customSubtitle || "Drop files onto the upload card on the left, click upload, or import from your connected cloud services.";

  if (customTitle || customSubtitle) {
    if (customTitle) title = customTitle;
    if (customSubtitle) subtitle = customSubtitle;
  } else if (isSearchActive) {
    title = "No files matching your search";
    subtitle = `We couldn't find any files matching "${searchTerm}". Try searching for something else or clear the filter.`;
  } else if (hasFolders) {
    title = "No direct files in this directory";
    subtitle = "This directory currently contains folders, but no files have been uploaded directly here yet.";
  } else {
    title = isRoot ? "Your drive is empty" : "This folder is empty";
    subtitle = "Drop files onto the upload card on the left, click upload, or create a folder to get started.";
  }

  return (
    <div className="empty-files-placeholder-card">
      <div className="empty-files-icon-circle">
        {isSearchActive ? (
          <LuSearch size={24} />
        ) : (
          <LuFolderOpen size={24} />
        )}
      </div>

      <div className="empty-files-text-group">
        <h3 className="empty-files-title">{title}</h3>
        <p className="empty-files-subtitle">{subtitle}</p>
      </div>

      {((isSearchActive && onClearSearch) || onUploadClick || onNewFolderClick) && (
        <div className="empty-files-actions-row">
          {isSearchActive ? (
            onClearSearch && (
              <button
                type="button"
                className="empty-action-pill-btn secondary"
                onClick={onClearSearch}
              >
                Clear search filter
              </button>
            )
          ) : hasFolders ? (
            /* When folders exist, only provide direct upload option; avoid duplicate "+ New Folder" */
            onUploadClick && (
              <button
                type="button"
                className="empty-action-pill-btn primary"
                onClick={onUploadClick}
              >
                <LuUpload size={14} />
                <span>Upload File</span>
              </button>
            )
          ) : (
            /* When completely empty (no files and no folders), show both Upload and New Folder if provided */
            <>
              {onUploadClick && (
                <button
                  type="button"
                  className="empty-action-pill-btn primary"
                  onClick={onUploadClick}
                >
                  <LuUpload size={14} />
                  <span>Upload File</span>
                </button>
              )}
              {onNewFolderClick && (
                <button
                  type="button"
                  className="empty-action-pill-btn secondary"
                  onClick={onNewFolderClick}
                >
                  <LuPlus size={14} />
                  <span>New Folder</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
