import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LuFilePen, LuX } from "react-icons/lu";
import { sanitizeText } from "../../utils/sanitize";

export function RenameModal({
  isOpen,
  type,
  currentName,
  onClose,
  onSubmit,
}) {
  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName || "");
      setIsSubmitting(false);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // For files with extensions, select name excluding extension
          if (type === "file" && currentName) {
            const lastDot = currentName.lastIndexOf(".");
            if (lastDot > 0) {
              inputRef.current.setSelectionRange(0, lastDot);
              return;
            }
          }
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, currentName, type]);

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
    const cleanName = sanitizeText(newName);
    if (!cleanName || cleanName === currentName) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(cleanName);
      onClose();
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFolder = type === "directory";

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <LuFilePen style={{ color: "var(--primary)" }} />
            <span>Rename {isFolder ? "Folder" : "File"}</span>
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
              <label htmlFor="rename-input" className="form-label">
                Name
              </label>
              <input
                id="rename-input"
                ref={inputRef}
                type="text"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
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
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
