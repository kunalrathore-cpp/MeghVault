import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import googleDriveIcon from "@iconify-icons/logos/google-drive-2020";
import {
  LuX,
  LuSearch,
  LuFolder,
  LuChevronRight,
  LuCheck,
  LuRefreshCw,
  LuSquareCheck,
  LuSquare,
  LuArrowLeft,
  LuShieldAlert,
} from "react-icons/lu";
import { googleDriveApi } from "../../api/googleDriveApi";
import { openNativeGooglePicker } from "../../utils/googlePicker";
import { getFileInfo } from "../../utils/fileIcons";
import { formatFileSize, formatDate } from "../../utils/formatters";
import { useToast } from "../../context/ToastContext";
import { useUpload } from "../../context/UploadContext";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export function GoogleDrivePickerModal({
  isOpen,
  onClose,
  targetDirId = null,
  userEmail = null,
  onImportSuccess,
}) {
  const { showError } = useToast();
  const { enqueueCloudImport } = useUpload();

  const [currentFolder, setCurrentFolder] = useState({ id: "root", name: "My Drive" });
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: "root", name: "My Drive" }]);
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Map()); // id -> item object
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [showShieldNote, setShowShieldNote] = useState(true);

  // Load items in the current Google Drive folder
  const loadFolderItems = useCallback(
    async (folderId, search = "") => {
      setIsLoading(true);
      try {
        const res = await googleDriveApi.listFiles(folderId, search);
        setItems(res.files || []);
      } catch (err) {
        showError(err.message || "Failed to load Google Drive items");
      } finally {
        setIsLoading(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    if (isOpen) {
      setCurrentFolder({ id: "root", name: "My Drive" });
      setBreadcrumbs([{ id: "root", name: "My Drive" }]);
      setSelectedItems(new Map());
      setSearchTerm("");
      setActiveSearch("");
      loadFolderItems("root", "");
    }
  }, [isOpen, loadFolderItems]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearch(searchTerm.trim());
    loadFolderItems(currentFolder.id, searchTerm.trim());
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setActiveSearch("");
    loadFolderItems(currentFolder.id, "");
  };

  // Navigate into a folder
  const handleOpenFolder = (folder) => {
    const nextFolder = { id: folder.id, name: folder.name };
    setCurrentFolder(nextFolder);
    setBreadcrumbs((prev) => [...prev, nextFolder]);
    setSearchTerm("");
    setActiveSearch("");
    loadFolderItems(folder.id, "");
  };

  // Navigate via breadcrumbs
  const handleBreadcrumbClick = (crumb, index) => {
    if (index === breadcrumbs.length - 1) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolder(crumb);
    setSearchTerm("");
    setActiveSearch("");
    loadFolderItems(crumb.id, "");
  };

  // Toggle item selection
  const handleToggleSelect = (item, e) => {
    if (e) e.stopPropagation();
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  };

  // Select all or Deselect all in current view
  const handleToggleSelectAll = () => {
    if (selectedItems.size === items.length && items.length > 0) {
      setSelectedItems(new Map());
    } else {
      const next = new Map();
      items.forEach((it) => next.set(it.id, it));
      setSelectedItems(next);
    }
  };

  // Run batch import using universal upload progress tracker
  const handleImportSelected = () => {
    const itemsToImport = Array.from(selectedItems.values());
    if (itemsToImport.length === 0) return;

    enqueueCloudImport({
      items: itemsToImport,
      source: "google-drive",
      targetDirId,
    });

    if (onImportSuccess) {
      onImportSuccess();
    }
    onClose();
  };

  // Launch Google's Official Native Drive Picker dialog
  const handleLaunchNativeDrivePicker = async () => {
    try {
      const status = await googleDriveApi.getStatus();
      if (!status?.accessToken) {
        showError("Google Drive token not available. Please reconnect.");
        return;
      }
      onClose(); // Automatically close MeghVault modal immediately
      await openNativeGooglePicker({
        accessToken: status.accessToken,
        onPicked: (docs) => {
          const itemsToImport = docs.map((doc) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.sizeBytes || null,
            type: doc.mimeType === "application/vnd.google-apps.folder" ? "directory" : "file",
          }));
          enqueueCloudImport({
            items: itemsToImport,
            source: "google-drive",
            targetDirId,
          });
          if (onImportSuccess) onImportSuccess();
        },
        onCancel: () => {},
        onError: (err) => {
          showError(err.message || "Failed to open Google Drive picker");
        },
      });
    } catch (err) {
      showError(err.message || "Failed to launch Google Drive picker");
    }
  };

  // Separate folders and files
  const { folders, files } = useMemo(() => {
    const fList = [];
    const docList = [];
    for (const it of items) {
      if (it.mimeType === FOLDER_MIME) {
        fList.push(it);
      } else {
        docList.push(it);
      }
    }
    return { folders: fList, files: docList };
  }, [items]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-large gdrive-explorer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="gdrive-modal-header">
          <div className="gdrive-header-title-group">
            <span className="gdrive-header-icon">
              <Icon icon={googleDriveIcon} width={26} height={26} />
            </span>
            <div>
              <h3 className="gdrive-title">Select from Google Drive</h3>
              {userEmail && <span className="gdrive-email-badge">{userEmail}</span>}
            </div>
          </div>

          <div className="gdrive-header-actions">
            <button
              type="button"
              className="gdrive-native-picker-link-btn"
              onClick={handleLaunchNativeDrivePicker}
              title="Open Google's official Native Drive Picker"
            >
              <Icon icon={googleDriveIcon} width={16} height={16} />
              <span>Google Official Picker</span>
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <LuX />
            </button>
          </div>
        </div>

        {/* Simple & Clear Brave / Shield Advisory Banner */}
        {showShieldNote && (
          <div className="gdrive-privacy-advisory">
            <LuShieldAlert className="advisory-icon" size={17} />
            <span className="advisory-text">
              <strong>Using Brave?</strong> If Google Drive gets stuck or won't load, click the <strong>Brave Lion icon</strong> in your address bar and turn <strong>Shields DOWN</strong> for this site.
            </span>
            <button
              type="button"
              className="advisory-dismiss-btn"
              onClick={() => setShowShieldNote(false)}
              title="Dismiss note"
              aria-label="Dismiss notice"
            >
              <LuX size={14} />
            </button>
          </div>
        )}

        {/* Search & Breadcrumb Bar */}
        <div className="gdrive-explorer-toolbar">
          {/* Breadcrumbs */}
          <div className="gdrive-breadcrumbs">
            {breadcrumbs.length > 1 && (
              <button
                type="button"
                className="gdrive-back-btn"
                onClick={() =>
                  handleBreadcrumbClick(
                    breadcrumbs[breadcrumbs.length - 2],
                    breadcrumbs.length - 2
                  )
                }
                title="Go up one folder"
              >
                <LuArrowLeft size={16} />
              </button>
            )}
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <LuChevronRight className="breadcrumb-separator" size={14} />}
                <button
                  type="button"
                  className={`gdrive-breadcrumb-node ${
                    idx === breadcrumbs.length - 1 ? "active" : ""
                  }`}
                  onClick={() => handleBreadcrumbClick(crumb, idx)}
                >
                  {idx === 0 ? "My Drive" : crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search Input */}
          <form className="gdrive-search-form" onSubmit={handleSearchSubmit}>
            <LuSearch className="gdrive-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search in Google Drive..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="gdrive-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="gdrive-search-clear"
                onClick={handleClearSearch}
              >
                <LuX size={14} />
              </button>
            )}
          </form>
        </div>

        {/* Selection Toolbar */}
        <div className="gdrive-sub-toolbar">
          <button
            type="button"
            className="gdrive-select-all-btn"
            onClick={handleToggleSelectAll}
            disabled={items.length === 0 || isLoading}
          >
            {selectedItems.size > 0 && selectedItems.size === items.length ? (
              <LuSquareCheck className="select-icon selected" size={16} />
            ) : (
              <LuSquare className="select-icon" size={16} />
            )}
            <span>
              {selectedItems.size === items.length && items.length > 0
                ? "Deselect All"
                : "Select All"}
            </span>
          </button>

          <span className="gdrive-items-count">
            {isLoading
              ? "Loading..."
              : activeSearch
              ? `Found ${items.length} result(s)`
              : `${folders.length} folder(s), ${files.length} file(s)`}
          </span>
        </div>

        {/* Content Body */}
        <div className="gdrive-content-scroll">
          {isLoading ? (
            <div className="gdrive-loading-state">
              <LuRefreshCw className="gdrive-spin-icon" size={28} />
              <p>Fetching Google Drive contents...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="gdrive-empty-state">
              <LuFolder size={44} style={{ opacity: 0.35, marginBottom: "8px" }} />
              <p>
                {activeSearch
                  ? `No items found matching "${activeSearch}"`
                  : "This folder is empty."}
              </p>
            </div>
          ) : (
            <div className="gdrive-items-list">
              {/* Folders first */}
              {folders.map((folder) => {
                const isSelected = selectedItems.has(folder.id);
                return (
                  <div
                    key={folder.id}
                    className={`gdrive-item-row folder-row ${
                      isSelected ? "is-selected" : ""
                    }`}
                    onClick={() => handleOpenFolder(folder)}
                  >
                    <div
                      className="gdrive-checkbox-wrap"
                      onClick={(e) => handleToggleSelect(folder, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Select folder ${folder.name}`}
                      />
                    </div>

                    <div className="gdrive-item-icon folder-icon">
                      <LuFolder size={20} />
                    </div>

                    <div className="gdrive-item-details">
                      <span className="gdrive-item-name" title={folder.name}>
                        {folder.name}
                      </span>
                      <span className="gdrive-item-meta">Folder</span>
                    </div>

                    <div className="gdrive-folder-enter-hint">
                      <span className="open-folder-pill">Open</span>
                      <LuChevronRight size={16} />
                    </div>
                  </div>
                );
              })}

              {/* Files next */}
              {files.map((file) => {
                const isSelected = selectedItems.has(file.id);
                const fileInfo = getFileInfo(file.name, false);
                const IconComponent = fileInfo.icon;

                return (
                  <div
                    key={file.id}
                    className={`gdrive-item-row file-row ${
                      isSelected ? "is-selected" : ""
                    }`}
                    onClick={(e) => handleToggleSelect(file, e)}
                  >
                    <div
                      className="gdrive-checkbox-wrap"
                      onClick={(e) => handleToggleSelect(file, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Select file ${file.name}`}
                      />
                    </div>

                    <div
                      className="gdrive-item-icon file-icon"
                      style={{
                        color: fileInfo.color,
                        backgroundColor: fileInfo.bgColor,
                      }}
                    >
                      <IconComponent size={18} />
                    </div>

                    <div className="gdrive-item-details">
                      <span className="gdrive-item-name" title={file.name}>
                        {file.name}
                      </span>
                      <div className="gdrive-item-meta">
                        <span>{file.size ? formatFileSize(file.size) : fileInfo.label}</span>
                        {file.modifiedTime && (
                          <>
                            <span className="meta-dot">•</span>
                            <span>{formatDate(file.modifiedTime)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="gdrive-modal-footer">
          <div className="gdrive-footer-selected-count">
            {selectedItems.size > 0 ? (
              <span className="selection-count-pill">
                <LuCheck size={14} />
                <span>{selectedItems.size} item(s) selected</span>
              </span>
            ) : (
              <span className="selection-hint">Select files or folders to import</span>
            )}
          </div>

          <div className="gdrive-footer-buttons">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImportSelected}
              disabled={selectedItems.size === 0}
            >
              <span>Import Selected ({selectedItems.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
