import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LuFolderPlus, LuX } from "react-icons/lu";
import { sanitizeText } from "../../utils/sanitize";

export function CreateFolderModal({ isOpen, onClose, onSubmit }) {
  const [folderName, setFolderName] = useState("New Folder");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName("New Folder");
      setIsSubmitting(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = sanitizeText(folderName);
    if (!cleanName) return;

    setIsSubmitting(true);
    try {
      await onSubmit(cleanName);
      onClose();
    } catch {
      // Handled in parent via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <LuFolderPlus style={{ color: "var(--primary)" }} />
            <span>New Folder</span>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <LuX />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-field">
              <label htmlFor="folder-name-input" className="form-label">
                Folder name
              </label>
              <input
                id="folder-name-input"
                ref={inputRef}
                type="text"
                className="form-input"
                placeholder="e.g. Work, Photos, Documents"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !folderName.trim()}
            >
              {isSubmitting ? "Creating..." : "Create Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
