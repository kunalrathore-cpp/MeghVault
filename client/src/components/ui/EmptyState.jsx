import React from "react";
import { LuFolderPlus, LuCloudUpload, LuFolderArchive } from "react-icons/lu";

export function EmptyState({ onUploadClick, onCreateFolderClick, isSearch = false, searchTerm = "" }) {
  if (isSearch) {
    return (
      <div className="empty-state-card animate-fade-in">
        <LuFolderArchive className="empty-state-icon" />
        <h3 className="empty-state-title">No matching files or folders</h3>
        <p className="empty-state-desc">
          We couldn't find anything matching &quot;{searchTerm}&quot;. Try checking for typos or searching for a different keyword.
        </p>
      </div>
    );
  }

  return (
    <div className="empty-state-card animate-fade-in">
      <LuCloudUpload className="empty-state-icon" />
      <h3 className="empty-state-title">This folder is empty</h3>
      <p className="empty-state-desc">
        Drag and drop files anywhere on the screen, or use the quick action buttons below to get started.
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        {onUploadClick && (
          <button className="btn btn-primary" onClick={onUploadClick}>
            <LuCloudUpload />
            <span>Upload Files</span>
          </button>
        )}
        {onCreateFolderClick && (
          <button className="btn btn-outline" onClick={onCreateFolderClick}>
            <LuFolderPlus />
            <span>New Folder</span>
          </button>
        )}
      </div>
    </div>
  );
}
