import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  LuFolderInput,
  LuFolder,
  LuFolderOpen,
  LuFolderPlus,
  LuChevronRight,
  LuSearch,
  LuCheck,
  LuX,
  LuHardDrive,
  LuLoader,
  LuTriangleAlert,
} from "react-icons/lu";
import { ColorfulFolderIcon, getFileInfo } from "../../utils/fileIcons";
import { moveApi } from "../../api/moveApi";
import { directoryApi } from "../../api/directoryApi";
import { useToast } from "../../context/ToastContext";

export function MoveItemModal({
  isOpen,
  item = null,
  items = null,
  onClose,
  onSuccess,
}) {
  const { showSuccess, showError } = useToast();

  // Normalize items array: supports either single `item` or array `items`
  const activeItems = useMemo(() => {
    if (items && Array.isArray(items) && items.length > 0) return items;
    if (item) return [item];
    return [];
  }, [items, item]);

  const isBulk = activeItems.length > 1;
  const singleItem = activeItems.length === 1 ? activeItems[0] : null;
  const isDir = Boolean(singleItem?.isDirectory || singleItem?.type === "directory");
  const itemType = isDir ? "directory" : "file";

  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [folderTree, setFolderTree] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = My Drive (root)
  const [selectedFolderId, setSelectedFolderId] = useState(null); // the destination target ID
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen || activeItems.length === 0) return;

    setIsLoadingTree(true);
    setIsSubmitting(false);
    setCurrentFolderId(null);
    setSelectedFolderId(null);
    setSearchTerm("");
    setIsCreatingFolder(false);
    setNewFolderName("");
    setConflictPrompt(null);

    // Fetch folder tree, excluding all directories being moved (to prevent cycles)
    const dirIdsToExclude = activeItems
      .filter((it) => it.isDirectory || it.type === "directory")
      .map((it) => it.id);

    moveApi
      .getFolderTree(dirIdsToExclude.length > 0 ? dirIdsToExclude : null)
      .then((data) => {
        setFolderTree(data?.folders || []);
        // Pre-select current parent directory or root
        setSelectedFolderId(null);
      })
      .catch((err) => {
        console.error("Failed to load folder tree:", err);
        showError("Could not load folder list");
      })
      .finally(() => {
        setIsLoadingTree(false);
      });
  }, [isOpen, activeItems, showError]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  // Map of folders by ID for fast lookups
  const folderMap = useMemo(() => {
    const map = new Map();
    for (const f of folderTree) {
      map.set(f.id, f);
    }
    return map;
  }, [folderTree]);

  // Compute breadcrumb path for current viewed folder
  const currentPath = useMemo(() => {
    const crumbs = [{ id: null, name: "My Drive" }];
    let curr = currentFolderId;
    const visited = new Set();
    const ancestry = [];

    while (curr && folderMap.has(curr) && !visited.has(curr)) {
      visited.add(curr);
      const f = folderMap.get(curr);
      ancestry.unshift({ id: f.id, name: f.name });
      curr = f.parentDirId;
    }

    return [...crumbs, ...ancestry];
  }, [currentFolderId, folderMap]);

  // Folders directly inside currentFolderId
  const visibleFolders = useMemo(() => {
    return folderTree.filter((f) => {
      const isChild = (f.parentDirId || null) === (currentFolderId || null);
      if (!isChild) return false;
      if (searchTerm.trim()) {
        return f.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
      }
      return true;
    });
  }, [folderTree, currentFolderId, searchTerm]);

  // Name of selected destination folder
  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return "My Drive";
    return folderMap.get(selectedFolderId)?.name || "Selected Folder";
  }, [selectedFolderId, folderMap]);

  // Check if moving to the same parent where it already lives
  const isAlreadyInDestination = useMemo(() => {
    if (activeItems.length === 0) return false;
    if (!isBulk && singleItem) {
      const currentParent = singleItem.parentDirId || null;
      return (currentParent || null) === (selectedFolderId || null);
    }
    return activeItems.every((it) => (it.parentDirId || null) === (selectedFolderId || null));
  }, [activeItems, isBulk, singleItem, selectedFolderId]);

  if (!isOpen || activeItems.length === 0) return null;

  // Handle inline folder creation
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;

    try {
      const res = await directoryApi.createDirectory(currentFolderId, name);
      const createdId = res?.id || res?._id;
      showSuccess(`Folder "${name}" created`);

      // Refresh tree
      const dirIdsToExclude = activeItems
        .filter((it) => it.isDirectory || it.type === "directory")
        .map((it) => it.id);
      const updatedTree = await moveApi.getFolderTree(dirIdsToExclude.length > 0 ? dirIdsToExclude : null);
      setFolderTree(updatedTree?.folders || []);
      setNewFolderName("");
      setIsCreatingFolder(false);

      if (createdId) {
        setSelectedFolderId(createdId);
      }
    } catch (err) {
      console.error(err);
      showError(err.message || "Failed to create folder");
    }
  };

  // Execute Move (single or bulk)
  const handleExecuteMove = async (resolution = "conflict") => {
    if (isAlreadyInDestination) {
      showError("Item(s) already in this folder");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isBulk) {
        const payload = activeItems.map((it) => ({
          itemId: it.id,
          itemType: it.isDirectory || it.type === "directory" ? "directory" : "file",
        }));
        const res = await moveApi.bulkMoveItems(payload, selectedFolderId, resolution);
        showSuccess(res.message || `Moved ${activeItems.length} items to "${selectedFolderName}"`);
        onSuccess?.(res);
        onClose();
      } else if (singleItem) {
        const res = await moveApi.moveItem(itemType, singleItem.id, selectedFolderId, resolution);
        showSuccess(res.message || `Moved "${singleItem.name}" to "${selectedFolderName}"`);
        onSuccess?.(res);
        onClose();
      }
    } catch (err) {
      console.error("Move error:", err);
      if (err.status === 409 || err.hasConflict) {
        setConflictPrompt({
          message: err.message || `An item with this name already exists in "${selectedFolderName}".`,
        });
      } else {
        showError(err.message || "Failed to move item(s)");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog move-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="move-modal-title"
      >
        {/* Modal Header */}
        <div className="modal-header move-modal-header">
          <div className="modal-title" id="move-modal-title">
            <span className="move-title-icon-wrap">
              <LuFolderInput size={18} />
            </span>
            <div>
              <span className="move-title-main">
                {isBulk ? `Move ${activeItems.length} Items` : `Move ${isDir ? "Folder" : "File"}`}
              </span>
              <span className="move-title-sub">Select destination in your drive</span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={isSubmitting}
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Item Preview Strip */}
        <div className="move-item-banner">
          <span className="move-banner-label">Moving:</span>
          {isBulk ? (
            <span className="move-banner-bulk-badge">
              <strong>{activeItems.length}</strong> items selected
            </span>
          ) : singleItem ? (
            <div className="move-banner-chip" title={singleItem.name}>
              {isDir ? (
                <ColorfulFolderIcon size={16} />
              ) : (
                getFileInfo(singleItem.name).icon
              )}
              <span className="move-banner-name">{singleItem.name}</span>
            </div>
          ) : null}
        </div>

        {/* Modal Body: Location Navigator */}
        <div className="modal-body move-modal-body">
          {/* Breadcrumb Path Bar */}
          <div className="move-path-bar custom-scrollbar">
            {currentPath.map((crumb, idx) => (
              <React.Fragment key={crumb.id || "root"}>
                {idx > 0 && <LuChevronRight size={13} className="move-path-sep" />}
                <button
                  type="button"
                  className={`move-path-node ${idx === currentPath.length - 1 ? "active" : ""}`}
                  onClick={() => {
                    setCurrentFolderId(crumb.id);
                    setSelectedFolderId(crumb.id);
                  }}
                >
                  {idx === 0 ? <LuHardDrive size={13} /> : <LuFolder size={13} />}
                  <span>{crumb.name}</span>
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Action Strip: Search & New Folder */}
          <div className="move-toolbar-row">
            <div className="move-search-wrap">
              <LuSearch size={14} className="move-search-icon" />
              <input
                type="text"
                placeholder="Filter subfolders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="move-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="move-search-clear"
                  onClick={() => setSearchTerm("")}
                >
                  <LuX size={12} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="move-new-folder-btn"
              onClick={() => setIsCreatingFolder((prev) => !prev)}
              title="Create new folder here"
            >
              <LuFolderPlus size={14} />
              <span>New Folder</span>
            </button>
          </div>

          {/* Inline Folder Creation Form */}
          {isCreatingFolder && (
            <form onSubmit={handleCreateFolder} className="move-inline-create-form">
              <input
                type="text"
                autoFocus
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="move-inline-input"
              />
              <div className="move-inline-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={!newFolderName.trim()}>
                  Create
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setIsCreatingFolder(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Current Folder Selection Pill */}
          <div
            className={`move-target-card ${selectedFolderId === currentFolderId ? "is-selected" : ""}`}
            onClick={() => setSelectedFolderId(currentFolderId)}
            role="button"
            tabIndex={0}
          >
            <div className="move-target-info">
              {currentFolderId === null ? (
                <LuHardDrive size={18} className="move-target-icon" />
              ) : (
                <LuFolderOpen size={18} className="move-target-icon" />
              )}
              <div>
                <span className="move-target-title">
                  {currentFolderId === null ? "My Drive (Root)" : `Move into "${selectedFolderName}"`}
                </span>
                <span className="move-target-sub">
                  {selectedFolderId === currentFolderId
                    ? "✓ Currently selected destination"
                    : "Click to select this folder as destination"}
                </span>
              </div>
            </div>
            {selectedFolderId === currentFolderId && (
              <span className="move-selected-badge">
                <LuCheck size={14} />
              </span>
            )}
          </div>

          {/* Folder List / Subfolders Browser */}
          <div className="move-folder-list-container custom-scrollbar">
            {isLoadingTree ? (
              <div className="move-loading-state">
                <LuLoader size={20} className="spinner" />
                <span>Loading folders...</span>
              </div>
            ) : visibleFolders.length === 0 ? (
              <div className="move-empty-folders">
                <p>
                  {searchTerm
                    ? `No subfolders matching "${searchTerm}"`
                    : "No subfolders inside this location"}
                </p>
              </div>
            ) : (
              visibleFolders.map((f) => {
                const isSelected = selectedFolderId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`move-folder-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedFolderId(f.id)}
                    onDoubleClick={() => {
                      setCurrentFolderId(f.id);
                      setSelectedFolderId(f.id);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="move-folder-item-left">
                      <ColorfulFolderIcon size={20} />
                      <span className="move-folder-name" title={f.name}>
                        {f.name}
                      </span>
                    </div>

                    <div className="move-folder-item-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="move-folder-enter-btn"
                        onClick={() => {
                          setCurrentFolderId(f.id);
                          setSelectedFolderId(f.id);
                        }}
                        title={`Open and browse into "${f.name}"`}
                      >
                        <span>Open</span>
                        <LuChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Conflict Resolution Prompt Banner */}
          {conflictPrompt && (
            <div className="move-conflict-banner">
              <LuTriangleAlert size={18} className="move-conflict-icon" />
              <div className="move-conflict-content">
                <span className="move-conflict-msg">{conflictPrompt.message}</span>
                <div className="move-conflict-btns">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleExecuteMove("rename")}
                    disabled={isSubmitting}
                  >
                    Keep Both (Auto-Rename)
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setConflictPrompt(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer move-modal-footer">
          <div className="move-footer-dest">
            <span className="move-dest-label">Destination:</span>
            <span className="move-dest-val" title={selectedFolderName}>
              {selectedFolderName}
            </span>
            {isAlreadyInDestination && (
              <span className="move-already-tag">(Already here)</span>
            )}
          </div>

          <div className="move-footer-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary move-submit-btn"
              onClick={() => handleExecuteMove("conflict")}
              disabled={isSubmitting || isAlreadyInDestination}
            >
              {isSubmitting ? (
                <>
                  <LuLoader size={15} className="spinner" />
                  <span>Moving...</span>
                </>
              ) : (
                <>
                  <LuFolderInput size={15} />
                  <span>Move Here</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
