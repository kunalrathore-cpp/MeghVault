import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LuDownload,
  LuExternalLink,
  LuX,
  LuMusic,
  LuFile,
} from "react-icons/lu";
import { fileApi } from "../../api/fileApi";
import { canPreviewInBrowser } from "../../utils/helpers";
import { getFileInfo } from "../../utils/fileIcons";
import { sanitizeText, sanitizeUrl } from "../../utils/sanitize";

export function FilePreviewModal({
  file,
  onClose,
  onDownload,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && file) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, onClose]);

  if (!file) return null;

  const cleanFileName = sanitizeText(file.name) || "file";
  const previewType = canPreviewInBrowser(cleanFileName);
  const rawStreamUrl =
    file.url && !file.url.includes("action=download")
      ? file.url
      : fileApi.getFileUrl(file.id, null, cleanFileName, file.ticket);
  const streamUrl = sanitizeUrl(rawStreamUrl) || "";
  const fileInfo = getFileInfo(cleanFileName, false);
  const Icon = fileInfo.icon;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-large"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" style={{ maxWidth: "70%" }}>
            <div
              style={{
                color: fileInfo.color,
                display: "flex",
                alignItems: "center",
                fontSize: "1.25rem",
              }}
            >
              <Icon />
            </div>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={file.name}
            >
              {file.name}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="icon-btn"
              onClick={() => onDownload(file.id, file.name)}
              title="Download file"
              aria-label="Download file"
            >
              <LuDownload />
            </button>
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn"
              title="Open raw file in new tab"
              aria-label="Open in new tab"
            >
              <LuExternalLink />
            </a>
            <button
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close preview"
            >
              <LuX />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: "16px" }}>
          <div className="preview-viewer-container">
            {previewType === "image" && (
              <img
                src={streamUrl}
                alt={file.name}
                className="preview-image"
              />
            )}

            {previewType === "video" && (
              <video
                src={streamUrl}
                controls
                autoPlay
                className="preview-video"
              >
                Your browser does not support video playback.
              </video>
            )}

            {previewType === "audio" && (
              <div className="preview-audio-wrapper">
                <div className="audio-disk-visual">
                  <LuMusic />
                </div>
                <audio
                  src={streamUrl}
                  controls
                  autoPlay
                  className="audio-controls"
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {(previewType === "pdf" || previewType === "text") && (
              <iframe
                src={streamUrl}
                title={file.name}
                className="preview-iframe"
              />
            )}

            {!previewType && (
              <div className="preview-generic-box">
                <LuFile className="preview-generic-icon" style={{ color: "var(--text-muted)" }} />
                <h3>No browser preview available</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  This file format cannot be displayed directly in your web browser.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => onDownload(file.id, file.name)}
                >
                  <LuDownload />
                  <span>Download File</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
