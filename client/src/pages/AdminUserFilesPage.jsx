import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuShieldCheck, LuPanelLeftOpen } from "react-icons/lu";
import { AppLayout } from "../components/layout/AppLayout";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { FolderCard } from "../components/dashboard/FolderCard";
import { FolderListItem } from "../components/dashboard/FolderListItem";
import { FileListItem } from "../components/dashboard/FileListItem";
import { FileCard } from "../components/files/FileCard";
import { EmptyFolderState } from "../components/dashboard/EmptyFolderState";
import { ContextMenu } from "../components/files/ContextMenu";
import { FilePreviewModal } from "../components/modals/FilePreviewModal";
import { ShareModal } from "../components/modals/ShareModal";
import { RenameModal } from "../components/modals/RenameModal";
import { DeleteModal } from "../components/modals/DeleteModal";
import { ItemDetailsModal } from "../components/modals/ItemDetailsModal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useContextMenu } from "../hooks/useContextMenu";
import { adminService } from "../services/adminService";
import { fileApi } from "../api/fileApi";
import { directoryApi } from "../api/directoryApi";
import { starredApi } from "../api/starredApi";

export function AdminUserFilesPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentAdmin } = useAuth();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [targetUser, setTargetUser] = useState(null);
  const [currentDirId, setCurrentDirId] = useState("root");
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: "root", name: "root" }]);
  const [directories, setDirectories] = useState([]);
  const [files, setFiles] = useState([]);

  // Toolbar & View state
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("admin_drive_view_mode") || "list";
  });
  const [sortBy, setSortBy] = useState("date-desc");
  const [starredIds, setStarredIds] = useState(() => new Set());
  const [previewFile, setPreviewFile] = useState(null);

  // Modals state for Rename, Delete, Share, and Details
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);

  const handleOpenShare = useCallback((item) => setShareTarget(item), []);
  const handleCloseShare = useCallback(() => setShareTarget(null), []);
  const handleShowDetails = useCallback((item) => setDetailsTarget(item), []);

  // Context Menu Hook
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  // Fetch storage records for the user and current directory
  const loadUserStorage = useCallback(
    async (dirId = "root", showSpinner = false) => {
      if (showSpinner) setIsLoading(true);
      try {
        const data = await adminService.getUserStorage(userId, dirId);
        setTargetUser(data.user);
        setDirectories(data.directories || []);
        setFiles(data.files || []);
        setBreadcrumbs(data.breadcrumbs || [{ id: "root", name: "root" }]);
        setCurrentDirId(dirId);
      } catch (err) {
        console.error("Failed to load user storage:", err);
        addToast({
          type: "error",
          title: "Storage Error",
          message: err.message || "Could not retrieve user files and folders.",
        });
      } finally {
        if (showSpinner) setIsLoading(false);
      }
    },
    [userId, addToast]
  );

  useEffect(() => {
    loadUserStorage("root", true);
  }, [loadUserStorage]);

  const handleOpenDirectory = (dirId) => {
    loadUserStorage(dirId, false);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem("admin_drive_view_mode", mode);
  };

  useEffect(() => {
    starredApi
      .getStarredIds()
      .then((res) => {
        if (res?.starredIds) {
          setStarredIds(new Set(res.starredIds));
        }
      })
      .catch(() => {});
  }, []);

  const toggleStar = async (id, itemTypeHint) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      const isDir =
        itemTypeHint === "directory" ||
        directories.some((d) => d.id === id);
      const resType = isDir ? "directory" : "file";
      const res = await starredApi.toggleStar(resType, id);
      addToast({
        type: "success",
        title: res.message || "Star updated",
      });
    } catch (err) {
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      addToast({
        type: "error",
        title: "Failed to update star",
        message: err.message,
      });
    }
  };

  const handleDownloadFile = async (idOrFile, fileName) => {
    const fileId = typeof idOrFile === "object" ? idOrFile.id : idOrFile;
    const name = typeof idOrFile === "object" ? idOrFile.name : fileName;

    addToast({
      type: "info",
      title: "Downloading File",
      message: `Starting download for "${name || "file"}"...`,
    });

    try {
      await fileApi.downloadFile(fileId, name);
    } catch (err) {
      addToast({
        type: "error",
        title: "Download Failed",
        message: err.message || "Failed to download file.",
      });
    }
  };

  // Rename Handlers (Admin can rename any file or directory)
  const handleStartRename = (type, id, name) => {
    let resolvedType = type;
    if (!resolvedType || (resolvedType !== "directory" && resolvedType !== "file")) {
      const isFolder = directories.some((d) => d.id === id);
      resolvedType = isFolder ? "directory" : "file";
    }
    setRenameTarget({ type: resolvedType, id, name });
  };

  const handleConfirmRename = async (newName) => {
    if (!renameTarget) return;
    try {
      const isDirectory =
        renameTarget.type === "directory" ||
        directories.some((d) => d.id === renameTarget.id);

      if (isDirectory) {
        await directoryApi.renameDirectory(renameTarget.id, newName);
        addToast({
          type: "success",
          title: "Folder Renamed",
          message: `Folder successfully renamed to "${newName}".`,
        });
      } else {
        await fileApi.renameFile(renameTarget.id, newName);
        addToast({
          type: "success",
          title: "File Renamed",
          message: `File successfully renamed to "${newName}".`,
        });
      }
      setRenameTarget(null);
      await loadUserStorage(currentDirId, false);
    } catch (err) {
      addToast({
        type: "error",
        title: "Rename Failed",
        message: err.message || "Failed to rename item.",
      });
      throw err;
    }
  };

  // Delete Handlers (Admin can delete any file or directory)
  const handleStartDelete = (type, id, name) => {
    let resolvedType = type;
    if (!resolvedType || (resolvedType !== "directory" && resolvedType !== "file")) {
      const isFolder = directories.some((d) => d.id === id);
      resolvedType = isFolder ? "directory" : "file";
    }
    setDeleteTarget({ type: resolvedType, id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const isDirectory =
        deleteTarget.type === "directory" ||
        directories.some((d) => d.id === deleteTarget.id);

      if (isDirectory) {
        await directoryApi.deleteDirectory(deleteTarget.id);
        addToast({
          type: "success",
          title: "Folder Deleted",
          message: `Folder "${deleteTarget.name || ""}" deleted successfully.`,
        });
      } else {
        await fileApi.deleteFile(deleteTarget.id);
        addToast({
          type: "success",
          title: "File Deleted",
          message: `File "${deleteTarget.name || ""}" deleted successfully.`,
        });
      }
      setDeleteTarget(null);
      await loadUserStorage(currentDirId, false);
    } catch (err) {
      addToast({
        type: "error",
        title: "Delete Failed",
        message: err.message || "Failed to delete item.",
      });
      throw err;
    }
  };

  // Filter and sort items
  const filteredFolders = useMemo(() => {
    if (!searchTerm.trim()) return directories;
    const q = searchTerm.toLowerCase();
    return directories.filter((d) => d.name.toLowerCase().includes(q));
  }, [directories, searchTerm]);

  const filteredFiles = useMemo(() => {
    let list = [...files];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "size-asc":
          return (a.size || 0) - (b.size || 0);
        case "size-desc":
          return (b.size || 0) - (a.size || 0);
        case "date-asc":
          return new Date(a.createdAt || a.updatedAt) - new Date(b.createdAt || b.updatedAt);
        case "date-desc":
        default:
          return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt);
      }
    });

    return list;
  }, [files, searchTerm, sortBy]);

  const adminName =
    currentAdmin?.name ||
    (currentAdmin?.email ? currentAdmin.email.split("@")[0] : "Admin");
  const adminEmail = currentAdmin?.email || "";
  const adminAvatar =
    currentAdmin?.profile ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(adminEmail || "admin")}`;

  return (
    <AppLayout showNavbar={false}>
      {({ isSidebarCollapsed, onToggleSidebar }) => (
        <div className="admin-page-container user-files-page">
          {/* Sub Header: [Sidebar Expand (when collapsed)], [← Back to Home] and Admin Identity */}
          <div className="admin-sub-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {isSidebarCollapsed && onToggleSidebar && (
                <button
                  type="button"
                  className="sidebar-expand-btn"
                  onClick={onToggleSidebar}
                  aria-label="Expand sidebar"
                  title="Expand sidebar (Ctrl+B)"
                >
                  <LuPanelLeftOpen size={18} />
                </button>
              )}

              <button
                type="button"
                className="admin-back-btn"
                onClick={() => navigate("/admin")}
                title="Return to Admin User Management"
              >
                <LuArrowLeft size={16} />
                <span>Back to Home</span>
              </button>
            </div>

            <div className="admin-identity-pill">
              <div className="admin-avatar-wrap">
                <img
                  src={adminAvatar}
                  alt={adminName}
                  className="admin-avatar-img"
                  onError={(e) => {
                    e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(adminEmail || "admin")}`;
                  }}
                />
                <div className="admin-status-indicator" title="Online" />
              </div>

              <div className="admin-info-text">
                <span className="admin-name">{adminName}</span>
                <span className="admin-email">{adminEmail}</span>
              </div>

              <div className="admin-role-badge admin">
                <LuShieldCheck size={13} className="admin-badge-icon" />
                <span>Admin</span>
              </div>
            </div>
          </div>

          {/* User Context Info Pill */}
          {targetUser && (
            <div className="user-files-meta-row">
              <div className="target-user-badge">
                <span className="target-user-label">Inspecting User Files:</span>
                <img
                  src={targetUser.avatar}
                  alt={targetUser.name}
                  className="target-user-avatar"
                  onError={(e) => {
                    e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUser.id}`;
                  }}
                />
                <span className="target-user-name">{targetUser.name}</span>
                <span className="target-user-email">({targetUser.email})</span>
              </div>
            </div>
          )}

          {/* Native MeghVault Dashboard Toolbar */}
          <DashboardToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            sortBy={sortBy}
            onSortChange={setSortBy}
            breadcrumbs={breadcrumbs}
            onBreadcrumbClick={handleOpenDirectory}
            onShowDetails={handleShowDetails}
          />

          {/* Directory Content Area */}
          {isLoading ? (
            <div className="admin-loading-state">
              <LoadingSpinner size="lg" message="Retrieving user files & folders..." />
            </div>
          ) : (
            <section className="your-files-container">
              {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                <EmptyFolderState
                  hasFolders={false}
                  isRoot={currentDirId === "root"}
                  searchTerm={searchTerm}
                  onClearSearch={() => setSearchTerm("")}
                  customTitle="No items stored"
                  customSubtitle="This directory currently contains no files or folders."
                />
              ) : viewMode === "list" ? (
                /* List View: Unified stack of FolderListItem and FileListItem */
                <div className="admin-files-full-wrapper">
                  {filteredFolders.length > 0 && (
                    <>
                      {filteredFiles.length > 0 && (
                        <div className="section-type-label" style={{ marginTop: 0 }}>Folders</div>
                      )}
                      <div className="files-items-stack" style={{ marginBottom: filteredFiles.length > 0 ? "18px" : "0" }}>
                        {filteredFolders.map((folder, index) => (
                          <FolderListItem
                            key={folder.id}
                            folder={folder}
                            index={index}
                            isStarred={starredIds.has(folder.id)}
                            onToggleStar={toggleStar}
                            onClick={() => handleOpenDirectory(folder.id)}
                            onContextMenu={openContextMenu}
                            onShare={handleOpenShare}
                            onShowDetails={handleShowDetails}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {filteredFiles.length > 0 && (
                    <>
                      {filteredFolders.length > 0 && (
                        <div className="section-type-label">Files</div>
                      )}
                      <div className="files-items-stack">
                        {filteredFiles.map((file) => (
                          <FileListItem
                            key={file.id}
                            file={file}
                            isStarred={starredIds.has(file.id)}
                            onToggleStar={toggleStar}
                            onPreview={(f) => setPreviewFile(f)}
                            onDownload={handleDownloadFile}
                            onContextMenu={openContextMenu}
                            onShare={handleOpenShare}
                            onShowDetails={handleShowDetails}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Grid View: Folders in cards grid, followed by Files in cards grid */
                <div className="files-grid-section">
                  {filteredFolders.length > 0 && (
                    <>
                      {filteredFiles.length > 0 && (
                        <div className="section-type-label" style={{ marginTop: 0 }}>Folders</div>
                      )}
                      <div className="folders-cards-grid" style={{ marginBottom: filteredFiles.length > 0 ? "24px" : "0" }}>
                        {filteredFolders.map((folder, index) => (
                          <FolderCard
                            key={folder.id}
                            folder={folder}
                            index={index}
                            isStarred={starredIds.has(folder.id)}
                            onToggleStar={toggleStar}
                            onClick={() => handleOpenDirectory(folder.id)}
                            onContextMenu={openContextMenu}
                            onShowDetails={handleShowDetails}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {filteredFiles.length > 0 && (
                    <>
                      {filteredFolders.length > 0 && (
                        <div className="section-type-label">Files</div>
                      )}
                      <div className="file-grid-cards">
                        {filteredFiles.map((file) => (
                          <FileCard
                            key={file.id}
                            item={{ ...file, isDirectory: false }}
                            isStarred={starredIds.has(file.id)}
                            onToggleStar={toggleStar}
                            onClick={(f) => setPreviewFile(f)}
                            onDownload={handleDownloadFile}
                            onContextMenu={openContextMenu}
                            onShare={handleOpenShare}
                            onShowDetails={handleShowDetails}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Floating Context Menu with Rename, Delete, Share, and Details */}
          <ContextMenu
            contextMenu={contextMenu}
            onClose={closeContextMenu}
            onOpenDirectory={handleOpenDirectory}
            onPreviewFile={(f) => setPreviewFile(f)}
            onDownloadFile={handleDownloadFile}
            onRename={handleStartRename}
            onDelete={handleStartDelete}
            onShare={handleOpenShare}
            onShowDetails={handleShowDetails}
            starredIds={starredIds}
            onToggleStar={toggleStar}
          />

          {/* File Preview Modal */}
          <FilePreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            onDownload={(id, name) =>
              handleDownloadFile(previewFile || { id, name })
            }
          />

          {/* Secure Cloud Share Modal (ReBAC) */}
          <ShareModal
            isOpen={!!shareTarget}
            item={shareTarget}
            onClose={handleCloseShare}
          />

          {/* Rename Modal */}
          <RenameModal
            isOpen={!!renameTarget}
            type={renameTarget?.type || "file"}
            currentName={renameTarget?.name || ""}
            onClose={() => setRenameTarget(null)}
            onSubmit={handleConfirmRename}
          />

          {/* Delete Confirmation Modal */}
          <DeleteModal
            isOpen={!!deleteTarget}
            type={deleteTarget?.type || "file"}
            itemName={deleteTarget?.name || ""}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleConfirmDelete}
          />

          {/* Item Details Drawer Modal */}
          <ItemDetailsModal
            isOpen={Boolean(detailsTarget)}
            item={detailsTarget}
            onClose={() => setDetailsTarget(null)}
            onPreview={(f) => setPreviewFile(f)}
            onDownload={handleDownloadFile}
            onOpenFolder={handleOpenDirectory}
            onShare={handleOpenShare}
            isStarred={detailsTarget ? starredIds.has(detailsTarget.id) : false}
            onToggleStar={toggleStar}
          />
        </div>
      )}
    </AppLayout>
  );
}
