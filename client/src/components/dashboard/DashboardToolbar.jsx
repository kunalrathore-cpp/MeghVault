import React from "react";
import {
  LuSearch,
  LuX,
  LuLayoutGrid,
  LuList,
  LuChevronDown,
  LuFolderPlus,
  LuCheck,
  LuSquareCheck,
  LuDownload,
  LuFolderInput,
} from "react-icons/lu";
import { BreadcrumbTrail } from "./BreadcrumbTrail";

export function DashboardToolbar({
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  breadcrumbs = [],
  onBreadcrumbClick,
  onNewFolderClick,
  onUploadClick,
  onDownloadCurrentFolder,
  onShowDetails,
  currentFolder = null,
  isSpecialView = false,
  // Multi-Selection Props
  selectedCount = 0,
  folderCount = 0,
  fileCount = 0,
  isAllSelected = false,
  totalItemsCount = 0,
  onSelectAll,
  onClearSelection,
  onBulkDownload,
  onBulkMove,
}) {
  return (
    <div className="dashboard-toolbar-container">
      {/* Search & Filter Row OR Active Selection Toolbar */}
      {selectedCount > 0 ? (
        <div className="dashboard-selection-card">
          <div className="selection-card-left">
            <button
              type="button"
              className="selection-master-checkbox-btn"
              onClick={onSelectAll}
              title={isAllSelected ? "Deselect all visible items (Ctrl+A)" : "Select all visible items (Ctrl+A)"}
              aria-label={isAllSelected ? "Deselect all visible items" : "Select all visible items"}
            >
              <span className={`selection-master-checkbox ${isAllSelected ? "checked" : "indeterminate"}`}>
                <LuCheck size={13} strokeWidth={3} />
              </span>
              <span className="selection-count-badge">
                <strong>{selectedCount}</strong> {selectedCount === 1 ? "item" : "items"} selected
              </span>
            </button>

            {(folderCount > 0 || fileCount > 0) && (
              <span className="selection-breakdown-tag">
                {folderCount > 0 && (
                  <span>
                    {folderCount} {folderCount === 1 ? "folder" : "folders"}
                  </span>
                )}
                {folderCount > 0 && fileCount > 0 && <span className="breakdown-dot">•</span>}
                {fileCount > 0 && (
                  <span>
                    {fileCount} {fileCount === 1 ? "file" : "files"}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="selection-card-actions">
            {onBulkDownload && (
              <button
                type="button"
                className="selection-action-btn primary"
                onClick={onBulkDownload}
                title="Download selected items as a zip archive"
              >
                <LuDownload size={15} />
                <span>Download {selectedCount > 1 ? "(.zip)" : ""}</span>
              </button>
            )}

            {onBulkMove && (
              <button
                type="button"
                className="selection-action-btn secondary"
                onClick={onBulkMove}
                title="Move selected items to another destination folder"
              >
                <LuFolderInput size={15} />
                <span>Move to...</span>
              </button>
            )}

            <div className="selection-actions-divider" />

            <button
              type="button"
              className="selection-clear-btn"
              onClick={onClearSelection}
              title="Clear selection (Esc)"
              aria-label="Clear selection"
            >
              <LuX size={16} />
              <span className="clear-btn-text">Cancel</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-search-card">
          <div className="search-field-wrapper">
            <LuSearch className="search-field-icon" />
            <input
              type="text"
              className="search-field-input"
              placeholder="Search files, folders, tags"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search files, folders, tags"
              spellCheck={false}
              autoComplete="off"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                title="Clear search"
              >
                <LuX size={15} />
              </button>
            )}
          </div>

          <div className="toolbar-controls-group">
            {/* Quick Select All Toggle Button */}
            {totalItemsCount > 0 && onSelectAll && (
              <button
                type="button"
                className="toolbar-select-toggle-btn"
                onClick={onSelectAll}
                title="Select all items (Ctrl+A)"
                aria-label="Select all items"
              >
                <LuSquareCheck size={16} />
                <span className="toolbar-select-btn-label">Select all</span>
              </button>
            )}

            {/* View Mode Toggle: Grid & List */}
            <div className="view-mode-pill">
              <button
                className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => onViewModeChange("grid")}
                title="Grid View"
                aria-label="Grid View"
              >
                <LuLayoutGrid />
              </button>
              <button
                className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
                onClick={() => onViewModeChange("list")}
                title="List View"
                aria-label="List View"
              >
                <LuList />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="sort-dropdown-wrapper">
              <select
                className="sort-select-input"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                aria-label="Sort files"
              >
                <option value="date-desc">Sort: Updated (Newest)</option>
                <option value="date-asc">Sort: Updated (Oldest)</option>
                <option value="name-asc">Sort: Name (A-Z)</option>
                <option value="name-desc">Sort: Name (Z-A)</option>
              </select>
              <LuChevronDown className="sort-select-arrow" />
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Path & Action Row */}
      <div className="dashboard-location-bar">
        <BreadcrumbTrail
          breadcrumbs={breadcrumbs}
          onBreadcrumbClick={onBreadcrumbClick}
          onNewFolderClick={onNewFolderClick}
          onUploadClick={onUploadClick}
          onDownloadCurrentFolder={onDownloadCurrentFolder}
          onShowDetails={onShowDetails}
          currentFolder={currentFolder}
          isSpecialView={isSpecialView}
        />

        {onNewFolderClick && (
          <button
            className="new-folder-action-btn"
            onClick={onNewFolderClick}
            title="Create New Folder"
          >
            <span className="btn-icon-accent">
              <LuFolderPlus />
            </span>
            <span>New Folder</span>
          </button>
        )}
      </div>
    </div>
  );
}
