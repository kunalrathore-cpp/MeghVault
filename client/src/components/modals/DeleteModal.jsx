import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuTrash2, LuTriangleAlert, LuX } from "react-icons/lu";

export function DeleteModal({
  isOpen,
  type,
  itemName,
  itemCount = 0,
  isBulk = false,
  onClose,
  onConfirm,
  isPermanent = false,
  isEmptyTrash = false,
  isClearRecent = false,
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsDeleting(false);
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

  const isFolder = type === "directory";
  const isMultiple = Boolean(isBulk || itemCount > 1);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Handled in parent
    } finally {
      setIsDeleting(false);
    }
  };

  const getTitle = () => {
    if (isClearRecent) return "Clear Recent Activity?";
    if (isEmptyTrash) return "Empty Trash?";
    if (isMultiple) {
      return isPermanent ? `Delete ${itemCount} Items Forever` : `Move ${itemCount} Items to Trash`;
    }
    if (isPermanent) return `Delete ${isFolder ? "Folder" : "File"} Forever`;
    return "Move to Trash";
  };

  const getDescription = () => {
    if (isClearRecent) {
      return "All recorded activity history from the last 24 hours will be cleared from your timeline. Your actual files and folders will remain safe and unaffected.";
    }
    if (isEmptyTrash) {
      return "All files and folders currently in the trash will be permanently deleted from cloud storage. This action cannot be undone.";
    }
    if (isMultiple) {
      return isPermanent
        ? `All ${itemCount} selected items and any nested subfolders will be permanently deleted from cloud storage. This action cannot be undone.`
        : `All ${itemCount} selected items will be moved to Trash. You can restore them anytime from the Trash view.`;
    }
    if (isPermanent) {
      return isFolder
        ? "All files and nested subfolders inside this folder will be permanently deleted from cloud storage. This action cannot be undone."
        : "This file will be permanently deleted from cloud storage. This action cannot be undone.";
    }
    return isFolder
      ? "This folder and its contents will be moved to Trash. You can restore them anytime."
      : "This file will be moved to Trash. You can restore it anytime.";
  };

  const getButtonText = () => {
    if (isDeleting) return "Processing...";
    if (isClearRecent) return "Clear Activity";
    if (isEmptyTrash) return "Empty Trash";
    if (isPermanent) return isMultiple ? `Delete ${itemCount} Forever` : "Delete Forever";
    return isMultiple ? `Move ${itemCount} to Trash` : "Move to Trash";
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: "var(--danger)" }}>
            {isPermanent || isEmptyTrash || isClearRecent ? <LuTriangleAlert /> : <LuTrash2 />}
            <span>{getTitle()}</span>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <LuX />
          </button>
        </div>

        <div className="modal-body">
          {!isEmptyTrash && !isClearRecent && (
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {isMultiple
                ? isPermanent
                  ? `Are you sure you want to permanently delete these ${itemCount} items?`
                  : `Move ${itemCount} selected items to Trash?`
                : isPermanent
                ? `Are you sure you want to permanently delete "${itemName}"?`
                : `Move "${itemName}" to Trash?`}
            </p>
          )}
          {isClearRecent && (
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              Are you sure you want to clear your recent activity history?
            </p>
          )}
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            {getDescription()}
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            <LuTrash2 />
            <span>{getButtonText()}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
