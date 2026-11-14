import React, { useState, useRef } from "react";
import { LuUpload } from "react-icons/lu";

export function UploadDropzoneCard({ onFilesSelected, viewMode = "grid" }) {
  const [isOver, setIsOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    if (e.dataTransfer && e.dataTransfer.types) {
      const types = Array.from(e.dataTransfer.types);
      if (types.includes("application/json") || types.includes("application/x-meghvault-item")) {
        return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };

  const handleDrop = (e) => {
    if (e.dataTransfer && e.dataTransfer.types) {
      const types = Array.from(e.dataTransfer.types);
      if (types.includes("application/json") || types.includes("application/x-meghvault-item")) {
        return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  if (viewMode === "list") {
    return (
      <div
        className={`upload-dropzone-row ${isOver ? "drag-active" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        title="Drag & drop files or click to upload"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleInputChange}
          id="dropzone-file-upload-list"
        />

        <div className="dropzone-row-icon-box">
          <LuUpload />
        </div>
        <div className="dropzone-row-text">
          <span className="dropzone-row-title">Drag & drop files here to upload, or</span>
          <span className="dropzone-row-browse">browse from computer</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`upload-dropzone-card ${isOver ? "drag-active" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      title="Drag & drop files or click to upload"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleInputChange}
        id="dropzone-file-upload"
      />

      <div className="dropzone-icon-box">
        <LuUpload />
      </div>
      <p className="dropzone-title">Drag & drop files here</p>
      <p className="dropzone-sub">or click to upload</p>
    </div>
  );
}
