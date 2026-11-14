import React from "react";
import { LuCloudUpload } from "react-icons/lu";

export function DropzoneOverlay({ isVisible }) {
  if (!isVisible) return null;

  return (
    <div className="dropzone-overlay">
      <div className="dropzone-card">
        <LuCloudUpload className="dropzone-icon" />
        <h2 className="dropzone-title">Drop your files here</h2>
        <p className="dropzone-subtitle">Release files to instantly upload them to this folder</p>
      </div>
    </div>
  );
}
