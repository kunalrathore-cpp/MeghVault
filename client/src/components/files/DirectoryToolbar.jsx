import React, { useRef } from "react";
import {
  LuFolderPlus,
  LuCloudUpload,
  LuArrowUpDown,
  LuFolder,
} from "react-icons/lu";
import { Breadcrumbs } from "../layout/Breadcrumbs";

export function DirectoryToolbar({
  directoryName,
  breadcrumbs,
  totalItems,
  onNewFolderClick,
  onFilesSelected,
  sortBy,
  onSortChange,
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <div className="directory-toolbar animate-fade-in">
      <div className="toolbar-heading-group">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="toolbar-title">
          <LuFolder style={{ color: "var(--primary)" }} />
          <span>{directoryName}</span>
        </h1>
        <div className="toolbar-stats">
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="toolbar-actions">
        {/* Sort selector */}
        <div className="sort-select-wrapper">
          <LuArrowUpDown />
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort files and folders"
          >
            <option value="name-asc">Name (A to Z)</option>
            <option value="name-desc">Name (Z to A)</option>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
          </select>
        </div>

        {/* New Folder Button */}
        <button
          className="btn btn-outline"
          onClick={onNewFolderClick}
          title="Create a new subfolder"
        >
          <LuFolderPlus />
          <span>New Folder</span>
        </button>

        {/* Upload Files Button */}
        <button
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          title="Upload files to this directory"
        >
          <LuCloudUpload />
          <span>Upload Files</span>
        </button>

        {/* Hidden Multi-file input */}
        <input
          id="file-upload"
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
