import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LuTrash2, LuRotateCcw } from "react-icons/lu";
import { AppLayout } from "../components/layout/AppLayout";
import { StorageMetricsCard } from "../components/dashboard/StorageMetricsCard";
import { ImportSourcesBar } from "../components/dashboard/ImportSourcesBar";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { FolderCard } from "../components/dashboard/FolderCard";
import { FolderListItem } from "../components/dashboard/FolderListItem";
import { UploadDropzoneCard } from "../components/dashboard/UploadDropzoneCard";
import { EmptyFolderState } from "../components/dashboard/EmptyFolderState";
import { FileListItem } from "../components/dashboard/FileListItem";
import { FileCard } from "../components/files/FileCard";
import { RecentActivityItem } from "../components/dashboard/RecentActivityItem";
import { ContextMenu } from "../components/files/ContextMenu";
import { CreateFolderModal } from "../components/modals/CreateFolderModal";
import { RenameModal } from "../components/modals/RenameModal";
import { DeleteModal } from "../components/modals/DeleteModal";
import { FilePreviewModal } from "../components/modals/FilePreviewModal";
import { ShareModal } from "../components/modals/ShareModal";
import { UnlockModal } from "../components/modals/UnlockModal";
import { ItemDetailsModal } from "../components/modals/ItemDetailsModal";
import { MoveItemModal } from "../components/modals/MoveItemModal";
import { BulkActionBar } from "../components/dashboard/BulkActionBar";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { useDirectory } from "../hooks/useDirectory";
import { useContextMenu } from "../hooks/useContextMenu";
import { useUpload } from "../context/UploadContext";
import { useToast } from "../context/ToastContext";
import { directoryApi } from "../api/directoryApi";
import { fileApi } from "../api/fileApi";
import { shareApi } from "../api/shareApi";
import { starredApi } from "../api/starredApi";
import { trashApi } from "../api/trashApi";
import { activityApi } from "../api/activityApi";
import { moveApi } from "../api/moveApi";
import { getActivityTimeBucket } from "../utils/formatters";

export function DrivePage({ view = "drive" }) {
  const isRecentView = view === "recent";
  const isSharedView = view === "shared";
  const isStarredView = view === "starred";
  const isTrashView = view === "trash";
  const isSpecialView = isSharedView || isStarredView || isTrashView || isRecentView;
  const { dirId } = useParams();
  const navigate = useNavigate();

  const { showSuccess, showError } = useToast();
  const { enqueueFiles } = useUpload();
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  // Permanent global file input ref for top navbar, empty states, and toolbar uploads
  const globalFileInputRef = useRef(null);

  const handleUploadClick = useCallback(() => {
    if (isSpecialView) return;
    globalFileInputRef.current?.click();
  }, [isSpecialView]);

  // Search, View & Sort state
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("drive_view_mode") || "list";
  });
  const [sortBy, setSortBy] = useState("date-desc");

  // Starred items state (persisted in DB with fast local cache)
  const [starredIds, setStarredIds] = useState(() => {
    try {
      const saved = localStorage.getItem("drive_starred_items");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Sync starred item IDs from backend on mount
  useEffect(() => {
    starredApi
      .getStarredIds()
      .then((res) => {
        if (res?.starredIds) {
          setStarredIds(new Set(res.starredIds));
          try {
            localStorage.setItem("drive_starred_items", JSON.stringify(res.starredIds));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const toggleStar = async (id, itemTypeHint) => {
    // 1. Optimistic UI update
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem("drive_starred_items", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    try {
      // 2. Resolve resource type
      const isDir =
        itemTypeHint === "directory" ||
        directories.some((d) => d.id === id) ||
        sharedData.directories.some((d) => d.id === id) ||
        starredData.directories.some((d) => d.id === id);
      const resType = isDir ? "directory" : "file";

      // 3. Persist to server
      const res = await starredApi.toggleStar(resType, id);
      showSuccess(res.message);

      // If in Starred view and an item was unstarred, remove it from list
      if (isStarredView && !res.isStarred) {
        setStarredData((prev) => ({
          files: prev.files.filter((f) => f.id !== id),
          directories: prev.directories.filter((d) => d.id !== id),
        }));
      }

      if (isRecentView) {
        fetchRecent();
      }
    } catch (err) {
      // Revert optimistic update on failure
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      showError(err.message || "Failed to update star");
    }
  };

  // Modals state
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null); // { type, id, name }
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, id, name, isPermanent }
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [showClearRecentModal, setShowClearRecentModal] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [unlockTarget, setUnlockTarget] = useState(null); // { item, action }
  const [moveTarget, setMoveTarget] = useState(null);

  const handleOpenShare = useCallback((item) => setShareTarget(item), []);
  const handleCloseShare = useCallback(() => setShareTarget(null), []);
  const handleShowDetails = useCallback((item) => setDetailsTarget(item), []);
  const handleStartMove = useCallback((item) => setMoveTarget(item), []);

  // Directory data & Uploads
  const {
    directoryData,
    files,
    directories,
    isLoading,
    error,
    breadcrumbs,
    refetch,
  } = useDirectory(isSpecialView ? null : dirId);

  // Shared With Me data
  const [sharedData, setSharedData] = useState({ files: [], directories: [] });
  const [isSharedLoading, setIsSharedLoading] = useState(isSharedView);

  const fetchShared = useCallback(async () => {
    if (!isSharedView) return;
    setIsSharedLoading(true);
    try {
      const data = await shareApi.getSharedWithMe();
      setSharedData(data || { files: [], directories: [] });
    } catch (err) {
      console.error("Failed to load shared with me:", err);
      showError(err.message || "Failed to load shared items");
    } finally {
      setIsSharedLoading(false);
    }
  }, [isSharedView, showError]);

  useEffect(() => {
    if (isSharedView) {
      fetchShared();
    }
  }, [isSharedView, fetchShared]);

  // Starred view data
  const [starredData, setStarredData] = useState({ files: [], directories: [] });
  const [isStarredLoading, setIsStarredLoading] = useState(isStarredView);

  const fetchStarred = useCallback(async () => {
    if (!isStarredView) return;
    setIsStarredLoading(true);
    try {
      const data = await starredApi.getStarred();
      setStarredData(data || { files: [], directories: [] });
    } catch (err) {
      console.error("Failed to load starred items:", err);
      showError(err.message || "Failed to load starred items");
    } finally {
      setIsStarredLoading(false);
    }
  }, [isStarredView, showError]);

  useEffect(() => {
    if (isStarredView) {
      fetchStarred();
    }
  }, [isStarredView, fetchStarred]);

  // Trash view data
  const [trashData, setTrashData] = useState({ files: [], directories: [] });
  const [isTrashLoading, setIsTrashLoading] = useState(isTrashView);

  const fetchTrash = useCallback(async () => {
    if (!isTrashView) return;
    setIsTrashLoading(true);
    try {
      const data = await trashApi.getTrash();
      setTrashData(data || { files: [], directories: [] });
    } catch (err) {
      console.error("Failed to load trash:", err);
      showError(err.message || "Failed to load trash");
    } finally {
      setIsTrashLoading(false);
    }
  }, [isTrashView, showError]);

  useEffect(() => {
    if (isTrashView) {
      fetchTrash();
    }
  }, [isTrashView, fetchTrash]);

  // Recent Activity Feed data
  const [recentActivities, setRecentActivities] = useState([]);
  const [isRecentLoading, setIsRecentLoading] = useState(isRecentView);

  const fetchRecent = useCallback(async () => {
    if (!isRecentView) return;
    setIsRecentLoading(true);
    try {
      const data = await activityApi.getRecent(1, 100);
      setRecentActivities(data?.activities || []);
    } catch (err) {
      console.error("Failed to load recent activity:", err);
      showError(err.message || "Failed to load recent activity");
    } finally {
      setIsRecentLoading(false);
    }
  }, [isRecentView, showError]);

  useEffect(() => {
    if (isRecentView) {
      fetchRecent();
    }
  }, [isRecentView, fetchRecent]);

  // Grouped activities for Recent view
  const { groupedActivities, filteredActivitiesCount } = useMemo(() => {
    if (!isRecentView) return { groupedActivities: {}, filteredActivitiesCount: 0 };
    let list = recentActivities;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((act) => act.name.toLowerCase().includes(q));
    }

    // De-duplicate list so each unique file/folder appears only once with its latest interaction
    const seenResourceIds = new Set();
    const uniqueList = [];
    for (const act of list) {
      const key = act.resourceId || act.id;
      if (!seenResourceIds.has(key)) {
        seenResourceIds.add(key);
        uniqueList.push(act);
      }
    }

    const buckets = {
      Today: [],
      Yesterday: [],
      "Earlier this week": [],
      "Earlier this month": [],
      Older: [],
    };

    for (const act of uniqueList) {
      const bucket = getActivityTimeBucket(act.createdAt);
      if (buckets[bucket]) {
        buckets[bucket].push(act);
      } else {
        buckets.Older.push(act);
      }
    }

    return { groupedActivities: buckets, filteredActivitiesCount: uniqueList.length };
  }, [isRecentView, recentActivities, searchTerm]);

  const activeFiles = isTrashView
    ? trashData.files
    : isSharedView
    ? sharedData.files
    : isStarredView
    ? starredData.files
    : files;

  const activeFolders = isTrashView
    ? trashData.directories
    : isSharedView
    ? sharedData.directories
    : isStarredView
    ? starredData.directories
    : directories;

  const activeLoading = isRecentView
    ? isRecentLoading
    : isTrashView
    ? isTrashLoading
    : isSharedView
    ? isSharedLoading
    : isStarredView
    ? isStarredLoading
    : isLoading;

  const activeBreadcrumbs = isRecentView
    ? [{ id: null, name: "Recent" }]
    : isTrashView
    ? [{ id: null, name: "Trash" }]
    : isSharedView
    ? [{ id: null, name: "Shared with me" }]
    : isStarredView
    ? [{ id: null, name: "Starred" }]
    : breadcrumbs;

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem("drive_view_mode", mode);
  };

  // Robust timestamp extractor supporting explicit timestamps and MongoDB ObjectId timestamps
  const getItemTimestamp = useCallback((item) => {
    if (!item) return 0;
    if (item.updatedAt) {
      const t = new Date(item.updatedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (item.createdAt) {
      const t = new Date(item.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    const idStr = item.id || item._id;
    if (idStr && typeof idStr === "string" && idStr.length === 24) {
      try {
        const ts = parseInt(idStr.substring(0, 8), 16) * 1000;
        if (!isNaN(ts) && ts > 0) return ts;
      } catch {}
    }
    return 0;
  }, []);

  // Filter & Sort directories and files (for standard drive views)
  const filteredFolders = useMemo(() => {
    let result = activeFolders;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    return result.slice().sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base", numeric: true });
      }

      const timeA = getItemTimestamp(a);
      const timeB = getItemTimestamp(b);

      if (sortBy === "date-asc") {
        // Sort: Updated / Created (Oldest first)
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      }

      // Default: date-desc (Sort: Updated / Created - Newest first)
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    });
  }, [activeFolders, searchTerm, sortBy, getItemTimestamp]);

  const filteredFiles = useMemo(() => {
    let result = activeFiles;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    return result.slice().sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base", numeric: true });
      }

      const timeA = getItemTimestamp(a);
      const timeB = getItemTimestamp(b);

      if (sortBy === "date-asc") {
        // Sort: Updated / Created (Oldest first)
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      }

      // Default: date-desc (Sort: Updated / Created - Newest first)
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    });
  }, [activeFiles, searchTerm, sortBy, getItemTimestamp]);

  // Multi-Selection State & Management
  const [selectedItems, setSelectedItems] = useState(new Map());
  const [bulkMoveItemsTarget, setBulkMoveItemsTarget] = useState(null);

  // Clear selection on view or folder change
  useEffect(() => {
    setSelectedItems(new Map());
    setBulkMoveItemsTarget(null);
  }, [view, dirId]);

  const selectedCount = selectedItems.size;
  const selectedList = useMemo(() => Array.from(selectedItems.values()), [selectedItems]);
  const selectedFolderCount = useMemo(
    () => selectedList.filter((it) => it.isDirectory || it.type === "directory").length,
    [selectedList]
  );
  const selectedFileCount = useMemo(
    () => selectedList.filter((it) => !it.isDirectory && it.type !== "directory").length,
    [selectedList]
  );

  const allVisibleItems = useMemo(() => {
    const dirs = filteredFolders.map((d) => ({ ...d, isDirectory: true, type: "directory" }));
    const fls = filteredFiles.map((f) => ({ ...f, isDirectory: false, type: "file" }));
    return [...dirs, ...fls];
  }, [filteredFolders, filteredFiles]);

  const isAllSelected = useMemo(() => {
    if (allVisibleItems.length === 0) return false;
    return allVisibleItems.every((it) => selectedItems.has(it.id));
  }, [allVisibleItems, selectedItems]);

  // Automatically prune selectedItems whenever visible items change
  // When items are moved to trash, deleted, moved away, or filtered out, ghost items are pruned immediately
  useEffect(() => {
    setSelectedItems((prev) => {
      if (prev.size === 0) return prev;
      const visibleIdSet = new Set(allVisibleItems.map((it) => it.id));
      let hasOrphans = false;
      const next = new Map();
      for (const [id, item] of prev.entries()) {
        if (visibleIdSet.has(id)) {
          next.set(id, item);
        } else {
          hasOrphans = true;
        }
      }
      return hasOrphans ? next : prev;
    });
  }, [allVisibleItems]);

  const lastSelectedIdRef = useRef(null);

  const handleToggleSelect = useCallback(
    (item, event) => {
      setSelectedItems((prev) => {
        const next = new Map(prev);

        // Range selection with Shift+Click
        if (event?.shiftKey && lastSelectedIdRef.current && allVisibleItems.length > 0) {
          const lastIdx = allVisibleItems.findIndex((it) => it.id === lastSelectedIdRef.current);
          const currIdx = allVisibleItems.findIndex((it) => it.id === item.id);

          if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            for (let i = start; i <= end; i++) {
              const it = allVisibleItems[i];
              next.set(it.id, {
                id: it.id,
                name: it.name,
                isDirectory: Boolean(it.isDirectory || it.type === "directory"),
                type: it.isDirectory || it.type === "directory" ? "directory" : "file",
                parentDirId: it.parentDirId,
                size: it.size,
                extension: it.extension,
                isPasswordProtected: it.isPasswordProtected,
              });
            }
            return next;
          }
        }

        // Single item selection
        if (next.has(item.id)) {
          next.delete(item.id);
          if (lastSelectedIdRef.current === item.id) {
            lastSelectedIdRef.current = null;
          }
        } else {
          next.set(item.id, {
            id: item.id,
            name: item.name,
            isDirectory: Boolean(item.isDirectory || item.type === "directory"),
            type: item.isDirectory || item.type === "directory" ? "directory" : "file",
            parentDirId: item.parentDirId,
            size: item.size,
            extension: item.extension,
            isPasswordProtected: item.isPasswordProtected,
          });
          lastSelectedIdRef.current = item.id;
        }
        return next;
      });
    },
    [allVisibleItems]
  );

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedItems(new Map());
      lastSelectedIdRef.current = null;
    } else {
      const next = new Map();
      for (const it of allVisibleItems) {
        next.set(it.id, {
          id: it.id,
          name: it.name,
          isDirectory: Boolean(it.isDirectory || it.type === "directory"),
          type: it.isDirectory || it.type === "directory" ? "directory" : "file",
          parentDirId: it.parentDirId,
          size: it.size,
          extension: it.extension,
          isPasswordProtected: it.isPasswordProtected,
        });
      }
      setSelectedItems(next);
      if (allVisibleItems.length > 0) {
        lastSelectedIdRef.current = allVisibleItems[allVisibleItems.length - 1].id;
      }
    }
  }, [isAllSelected, allVisibleItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedItems(new Map());
    lastSelectedIdRef.current = null;
  }, []);

  // Global Keyboard Shortcuts: Ctrl+A / Cmd+A to select all, Escape to clear selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      const targetTag = e.target?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || e.target?.isContentEditable) {
        return;
      }

      if (e.key === "Escape" && selectedItems.size > 0) {
        e.preventDefault();
        handleClearSelection();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        if (allVisibleItems.length > 0) {
          e.preventDefault();
          handleSelectAll();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItems.size, allVisibleItems.length, handleClearSelection, handleSelectAll]);

  // Download handlers
  const handleDownloadFile = useCallback(async (fileId, fileName, ticket = null) => {
    if (isTrashView) {
      showError(`File is in Trash. Restore it to download.`);
      return;
    }
    if (isSharedView && !ticket) {
      const foundFile = sharedData.files.find((f) => f.id === fileId);
      if (foundFile?.isPasswordProtected) {
        setUnlockTarget({ item: foundFile, action: "download" });
        return;
      }
    }
    try {
      showSuccess(`Starting download for "${fileName || "file"}"...`);
      await fileApi.downloadFile(fileId, fileName, ticket);
    } catch (err) {
      if (err?.status === 401 || err?.message?.toLowerCase().includes("password")) {
        const foundFile = sharedData.files.find((f) => f.id === fileId);
        if (foundFile) {
          setUnlockTarget({ item: foundFile, action: "download" });
          return;
        }
      }
      showError(err.message || "Failed to download file");
    }
  }, [isTrashView, isSharedView, sharedData.files, showSuccess, showError]);

  const handleDownloadDirectory = useCallback(async (directoryId, dirName, item = null, ticket = null) => {
    if (isTrashView) {
      showError(`Folder is in Trash. Restore it to download.`);
      return;
    }
    if (isSharedView && !ticket) {
      const foundFolder = sharedData.directories.find((d) => d.id === directoryId);
      if (foundFolder?.isPasswordProtected) {
        setUnlockTarget({ item: foundFolder, action: "downloadFolder" });
        return;
      }
    }
    try {
      showSuccess(`Preparing zip download for "${dirName || "Folder"}"...`);
      directoryApi.downloadDirectory(directoryId, dirName, ticket);
    } catch (err) {
      if (err?.status === 401 || err?.message?.toLowerCase().includes("password")) {
        const foundFolder = item || sharedData.directories.find((d) => d.id === directoryId);
        if (foundFolder) {
          setUnlockTarget({ item: foundFolder, action: "downloadFolder" });
          return;
        }
      }
      showError(err.message || "Failed to download folder");
    }
  }, [isTrashView, isSharedView, sharedData.directories, showSuccess, showError]);

  const handleDownloadItem = useCallback(async (itemId, itemName, item = null, ticket = null) => {
    const isDir = Boolean(item?.isDirectory || item?.type === "directory");
    if (isDir) {
      return handleDownloadDirectory(itemId, itemName, item, ticket);
    }
    return handleDownloadFile(itemId, itemName, ticket);
  }, [handleDownloadDirectory, handleDownloadFile]);

  const handleDownloadCurrentFolder = useCallback(() => {
    const targetId = dirId || directoryData?._id;
    if (!targetId) {
      showError("No folder selected to download.");
      return;
    }
    const folderName = directoryData?.name || "Folder";
    handleDownloadDirectory(targetId, folderName, directoryData);
  }, [dirId, directoryData, showError, handleDownloadDirectory]);

  const handleBulkDownload = useCallback(() => {
    const validItems = selectedList.filter((s) => allVisibleItems.some((v) => v.id === s.id));
    if (validItems.length === 0) {
      setSelectedItems(new Map());
      showError("Selected items are no longer available in this folder.");
      return;
    }
    if (validItems.length === 1 && !validItems[0].isDirectory && validItems[0].type !== "directory") {
      handleDownloadFile(validItems[0].id, validItems[0].name);
      return;
    }
    if (validItems.length === 1 && (validItems[0].isDirectory || validItems[0].type === "directory")) {
      handleDownloadDirectory(validItems[0].id, validItems[0].name, validItems[0]);
      return;
    }
    const archiveName = directoryData?.name ? `${directoryData.name}-Selected` : "MeghVault-Archive";
    showSuccess(`Preparing zip archive for ${validItems.length} items...`);
    directoryApi.downloadBulkZip(validItems, archiveName);
  }, [selectedList, allVisibleItems, directoryData, showSuccess, showError, handleDownloadFile, handleDownloadDirectory]);

  const handleOpenBulkMove = useCallback(() => {
    const validItems = selectedList.filter((s) => allVisibleItems.some((v) => v.id === s.id));
    if (validItems.length === 0) {
      setSelectedItems(new Map());
      showError("Selected items are no longer available to move.");
      return;
    }
    setBulkMoveItemsTarget(validItems);
  }, [selectedList, allVisibleItems, showError]);

  // File click / preview handler
  const handleFileClick = (file) => {
    if (file.isTrashed || isTrashView) {
      showError(`"${file.name}" is in Trash. Restore it to view or preview.`);
      return;
    }
    if (file.status === "deleted") {
      showError(`"${file.name}" has been permanently deleted.`);
      return;
    }
    if (isSharedView && file.isPasswordProtected) {
      setUnlockTarget({ item: file, action: "preview" });
      return;
    }
    setPreviewFile(file);
  };

  // Navigation handlers
  const handleOpenDirectory = (targetDirId) => {
    if (isTrashView) {
      showError("Folders in Trash cannot be opened. Restore the folder to view its contents.");
      return;
    }
    if (isSharedView) {
      const foundFolder = sharedData.directories.find((d) => d.id === targetDirId);
      if (foundFolder?.isPasswordProtected) {
        setUnlockTarget({ item: foundFolder, action: "openFolder" });
        return;
      }
    }
    // If targetDirId is falsy, "root", or "null", navigate to root "/"
    if (!targetDirId || targetDirId === "root" || targetDirId === "null") {
      navigate("/");
    } else {
      navigate(`/directory/${targetDirId}`);
    }
  };

  const handleUnlockSuccess = (item, authTicket) => {
    showSuccess(`Security key verified for "${item.name}"`);

    if (unlockTarget?.action === "preview") {
      setPreviewFile({ ...item, ticket: authTicket });
    } else if (unlockTarget?.action === "download") {
      fileApi.downloadFile(item.id, item.name, authTicket).catch((err) => {
        showError(err.message || "Download failed");
      });
    } else if (unlockTarget?.action === "downloadFolder") {
      directoryApi.downloadDirectory(item.id, item.name, authTicket);
    } else if (unlockTarget?.action === "openFolder") {
      navigate(item.id ? `/directory/${item.id}?ticket=${encodeURIComponent(authTicket || "")}` : "/");
    } else if (unlockTarget?.action === "import") {
      handleImportToRoot(item, authTicket);
    }
    setUnlockTarget(null);
  };

  const handleImportToRoot = async (item, ticket = null) => {
    if (isSharedView && item.isPasswordProtected && !ticket) {
      setUnlockTarget({ item, action: "import" });
      return;
    }
    try {
      showSuccess(`Importing "${item.name}" to your root folder...`);
      const resourceType = item.type || (item.isDirectory ? "directory" : "file");
      const res = await shareApi.importToRoot(resourceType, item.id, ticket);
      showSuccess(res?.message || `"${item.name}" imported to your root folder`);
    } catch (err) {
      if (err?.status === 401 || err?.message?.toLowerCase().includes("password")) {
        setUnlockTarget({ item, action: "import" });
        return;
      }
      showError(err.message || "Failed to import asset into your root folder");
    }
  };

  // Create folder
  const handleCreateFolder = async (folderName) => {
    try {
      await directoryApi.createDirectory(dirId, folderName);
      showSuccess(`Folder "${folderName}" created`);
      refetch();
    } catch (err) {
      showError(err.message || "Failed to create folder");
      throw err;
    }
  };

  // Rename
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
        showSuccess("Folder renamed successfully");
      } else {
        await fileApi.renameFile(renameTarget.id, newName);
        showSuccess("File renamed successfully");
      }
      if (isSharedView) {
        fetchShared();
      } else if (isStarredView) {
        fetchStarred();
      } else if (isRecentView) {
        fetchRecent();
      } else {
        refetch();
      }
    } catch (err) {
      showError(err.message || "Failed to rename item");
      throw err;
    }
  };

  // Move success refresh handler
  const handleMoveSuccess = useCallback(() => {
    if (isSharedView) {
      fetchShared();
    } else if (isStarredView) {
      fetchStarred();
    } else if (isRecentView) {
      fetchRecent();
    } else {
      refetch();
    }
  }, [isSharedView, fetchShared, isStarredView, fetchStarred, isRecentView, fetchRecent, refetch]);

  // Quick drag & drop move handler
  const handleQuickDropMove = useCallback(
    async (dragData, targetFolderId, targetFolderName) => {
      if (!dragData || !dragData.itemId) return;
      if (dragData.itemId === targetFolderId) return; // Cannot drop onto self

      try {
        const res = await moveApi.moveItem(
          dragData.itemType,
          dragData.itemId,
          targetFolderId,
          "conflict"
        );
        showSuccess(res.message || `Moved "${dragData.name}" into "${targetFolderName}"`);
        handleMoveSuccess();
      } catch (err) {
        console.error("Drop move error:", err);
        if (err.status === 409 || err.hasConflict) {
          // If conflict, open modal so user can choose to auto-rename
          setMoveTarget({
            id: dragData.itemId,
            name: dragData.name,
            isDirectory: dragData.itemType === "directory",
            type: dragData.itemType,
          });
        } else {
          showError(err.message || "Failed to move item");
        }
      }
    },
    [showSuccess, showError, handleMoveSuccess]
  );

  // Delete & Trash handlers
  const handleStartDelete = (type, id, name) => {
    let resolvedType = type;
    if (!resolvedType || (resolvedType !== "directory" && resolvedType !== "file")) {
      const isFolder =
        directories.some((d) => d.id === id) ||
        trashData.directories.some((d) => d.id === id);
      resolvedType = isFolder ? "directory" : "file";
    }
    setDeleteTarget({
      type: resolvedType,
      id,
      name,
      isPermanent: isTrashView,
      isBulk: false,
    });
  };

  const handleStartDeleteForever = (type, id, name) => {
    let resolvedType = type;
    if (!resolvedType || (resolvedType !== "directory" && resolvedType !== "file")) {
      const isFolder =
        trashData.directories.some((d) => d.id === id) ||
        directories.some((d) => d.id === id);
      resolvedType = isFolder ? "directory" : "file";
    }
    setDeleteTarget({
      type: resolvedType,
      id,
      name,
      isPermanent: true,
      isBulk: false,
    });
  };

  const handleStartBulkDelete = useCallback(() => {
    const validItems = selectedList.filter((s) => allVisibleItems.some((v) => v.id === s.id));
    if (validItems.length === 0) {
      setSelectedItems(new Map());
      return;
    }
    setDeleteTarget({
      isBulk: true,
      items: validItems,
      itemCount: validItems.length,
      name: `${validItems.length} items`,
      isPermanent: isTrashView,
    });
  }, [selectedList, allVisibleItems, isTrashView]);

  const handleBulkRestore = useCallback(async () => {
    const validItems = selectedList.filter((s) => allVisibleItems.some((v) => v.id === s.id));
    if (validItems.length === 0) {
      setSelectedItems(new Map());
      return;
    }
    try {
      await Promise.all(
        validItems.map((it) => {
          const resType = it.isDirectory || it.type === "directory" ? "directory" : "file";
          return trashApi.restore(resType, it.id);
        })
      );
      showSuccess(`${validItems.length} items restored from trash`);
      fetchTrash();
      setSelectedItems(new Map());
    } catch (err) {
      showError(err.message || "Failed to restore items");
    }
  }, [selectedList, allVisibleItems, fetchTrash, showSuccess, showError]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.isBulk) {
        const itemsToProcess = deleteTarget.items || [];
        if (deleteTarget.isPermanent || isTrashView) {
          await Promise.all(
            itemsToProcess.map((it) => {
              const resType = it.isDirectory || it.type === "directory" ? "directory" : "file";
              return trashApi.permanentlyDelete(resType, it.id);
            })
          );
          showSuccess(`${itemsToProcess.length} items permanently deleted`);
          fetchTrash();
        } else {
          await Promise.all(
            itemsToProcess.map((it) => {
              const resType = it.isDirectory || it.type === "directory" ? "directory" : "file";
              return trashApi.moveToTrash(resType, it.id);
            })
          );
          showSuccess(`${itemsToProcess.length} items moved to Trash`);
          if (isSharedView) {
            fetchShared();
          } else if (isStarredView) {
            fetchStarred();
          } else if (isRecentView) {
            fetchRecent();
          } else {
            refetch();
          }
        }
        setSelectedItems(new Map());
        setDeleteTarget(null);
        return;
      }

      // Single item delete
      const isDirectory =
        deleteTarget.type === "directory" ||
        directories.some((d) => d.id === deleteTarget.id) ||
        trashData.directories.some((d) => d.id === deleteTarget.id);
      const resType = isDirectory ? "directory" : "file";

      if (deleteTarget.isPermanent || isTrashView) {
        // Permanent deletion from trash
        await trashApi.permanentlyDelete(resType, deleteTarget.id);
        showSuccess(`"${deleteTarget.name || "Item"}" permanently deleted`);
        fetchTrash();
      } else {
        // Soft delete: move to trash
        await trashApi.moveToTrash(resType, deleteTarget.id);
        showSuccess(`"${deleteTarget.name || "Item"}" moved to Trash`);
        if (isSharedView) {
          fetchShared();
        } else if (isStarredView) {
          fetchStarred();
        } else if (isRecentView) {
          fetchRecent();
        } else {
          refetch();
        }
      }

      // Immediately prune single item from selection if selected
      setSelectedItems((prev) => {
        if (!prev.has(deleteTarget.id)) return prev;
        const next = new Map(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
    } catch (err) {
      showError(err.message || "Failed to process delete operation");
      throw err;
    }
  };

  const handleRestore = async (type, id, name) => {
    try {
      const isDirectory =
        type === "directory" ||
        trashData.directories.some((d) => d.id === id);
      const resType = isDirectory ? "directory" : "file";
      const res = await trashApi.restore(resType, id);
      showSuccess(res.message || `"${name || "Item"}" restored from trash`);
      setSelectedItems((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      fetchTrash();
      if (isRecentView) {
        fetchRecent();
      }
    } catch (err) {
      showError(err.message || "Failed to restore item from trash");
    }
  };

  const handleEmptyTrash = async () => {
    try {
      const res = await trashApi.emptyTrash();
      showSuccess(res.message || "Trash emptied successfully");
      fetchTrash();
    } catch (err) {
      showError(err.message || "Failed to empty trash");
      throw err;
    }
  };

  const handleClearRecent = async () => {
    try {
      const res = await activityApi.clearAll();
      showSuccess(res.message || "Recent activity history cleared successfully");
      setRecentActivities([]);
    } catch (err) {
      showError(err.message || "Failed to clear recent activity history");
      throw err;
    }
  };

  return (
    <AppLayout
      activeDirId={dirId}
      canUpload={!isSpecialView}
      onUploadClick={isSpecialView ? null : handleUploadClick}
    >
      <div className="dashboard-content-wrapper">
        {/* Top Storage Used & Stats Card */}
        <StorageMetricsCard
          filesCount={isRecentView ? filteredActivitiesCount : activeFiles.length}
          foldersCount={isRecentView ? 0 : activeFolders.length}
        />

        {/* Import External Sources (Google Drive, Google Photos, GitHub) */}
        {!isSpecialView && (
          <ImportSourcesBar
            currentDirId={dirId || directoryData?._id}
            onImportSuccess={refetch}
          />
        )}

        {/* Search, View Toggles, Sort, & Location Breadcrumbs */}
        <DashboardToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          sortBy={sortBy}
          onSortChange={setSortBy}
          breadcrumbs={activeBreadcrumbs}
          onBreadcrumbClick={handleOpenDirectory}
          onNewFolderClick={isSpecialView ? null : () => setShowCreateFolder(true)}
          onUploadClick={isSpecialView ? null : handleUploadClick}
          onDownloadCurrentFolder={!isSpecialView && !isTrashView ? handleDownloadCurrentFolder : null}
          onShowDetails={handleShowDetails}
          currentFolder={directoryData}
          isSpecialView={isSpecialView}
          selectedCount={selectedCount}
          folderCount={selectedFolderCount}
          fileCount={selectedFileCount}
          isAllSelected={isAllSelected}
          totalItemsCount={allVisibleItems.length}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onBulkDownload={!isTrashView ? handleBulkDownload : null}
          onBulkMove={!isTrashView ? handleOpenBulkMove : null}
        />

        {/* Directory Content Area */}
        {activeLoading ? (
          <LoadingSpinner
            message={
              isRecentView
                ? "Retrieving recent activity..."
                : isTrashView
                ? "Retrieving items in Trash..."
                : isSharedView
                ? "Retrieving items shared with you..."
                : isStarredView
                ? "Retrieving your starred items..."
                : "Retrieving your files & folders..."
            }
          />
        ) : error ? (
          <div className="empty-state-card">
            <p style={{ color: "var(--danger)", marginBottom: "16px" }}>{error}</p>
            {error.toLowerCase().includes("password") && dirId ? (
              <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    setUnlockTarget({
                      item: { id: dirId, isDirectory: true, name: "Protected Folder" },
                      action: "openFolder",
                    })
                  }
                >
                  Enter Security Key
                </button>
                <button className="btn btn-secondary" onClick={() => navigate("/")}>
                  Return to My Drive
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/")}>
                Return to My Drive
              </button>
            )}
          </div>
        ) : (
          <section className={`your-files-container ${selectedCount > 0 ? "selection-mode-active" : ""}`}>
            <div className="your-files-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="your-files-title">
                {isRecentView
                  ? "Recent Activity"
                  : isTrashView
                  ? "Trash"
                  : isSharedView
                  ? "Shared With You"
                  : isStarredView
                  ? "Starred Items"
                  : "Your Files"}
              </h2>

              {isTrashView && (activeFiles.length > 0 || activeFolders.length > 0) && (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "7px 16px",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={() => setShowEmptyTrashModal(true)}
                >
                  <LuTrash2 size={16} />
                  <span>Empty Trash</span>
                </button>
              )}

              {isRecentView && recentActivities.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "7px 16px",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={() => setShowClearRecentModal(true)}
                >
                  <LuTrash2 size={16} />
                  <span>Clear All Activity</span>
                </button>
              )}
            </div>

            {/* Recent View: Chronological Grouped Timeline Feed */}
            {isRecentView ? (
              filteredActivitiesCount === 0 ? (
                <div className="special-empty-center-container">
                  <EmptyFolderState
                    hasFolders={false}
                    isRoot={true}
                    searchTerm={searchTerm}
                    onClearSearch={() => setSearchTerm("")}
                    onUploadClick={null}
                    onNewFolderClick={null}
                    customTitle="No recent activity"
                    customSubtitle="Files and folders you upload, view, download, or edit in the last 24 hours will appear here."
                  />
                </div>
              ) : (
                <div className="recent-timeline-container">
                  {Object.entries(groupedActivities).map(([bucketName, items]) => {
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={bucketName} className="activity-bucket-section">
                        <div className="activity-bucket-title">{bucketName}</div>
                        <div className={viewMode === "grid" ? "recent-cards-grid" : "activity-bucket-list"}>
                          {items.map((act) => (
                            <RecentActivityItem
                              key={act.activityId || act.id}
                              activity={act}
                              viewMode={viewMode}
                              isStarred={starredIds.has(act.resourceId)}
                              onToggleStar={toggleStar}
                              onPreview={handleFileClick}
                              onDownload={handleDownloadItem}
                              onOpenFolder={handleOpenDirectory}
                              onContextMenu={openContextMenu}
                              onShare={handleOpenShare}
                              onRename={handleStartRename}
                              onDelete={handleStartDelete}
                              onShowDetails={handleShowDetails}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <>
                {/* Special Views (Starred / Shared / Trash): Show empty state ONLY when both folders and files are empty */}
                {isSpecialView && filteredFolders.length === 0 && filteredFiles.length === 0 && (
                  <div className="special-empty-center-container">
                    <EmptyFolderState
                      hasFolders={false}
                      isRoot={true}
                      searchTerm={searchTerm}
                      onClearSearch={() => setSearchTerm("")}
                      onUploadClick={null}
                      onNewFolderClick={null}
                      customTitle={
                        isTrashView
                          ? "Trash is empty"
                          : isSharedView
                          ? "No items shared with you"
                          : "No starred files or folders"
                      }
                      customSubtitle={
                        isTrashView
                          ? "Items moved to trash will appear here."
                          : isSharedView
                          ? "When other users share files or folders with you, they will appear here."
                          : "Add stars to files and folders that you want to easily find later."
                      }
                    />
                  </div>
                )}

                {/* Special Views (Shared / Starred / Trash): Render folders & files according to viewMode */}
                {isSpecialView && (filteredFolders.length > 0 || filteredFiles.length > 0) && (
                  <div className="special-files-section">
                    {viewMode === "list" ? (
                      <>
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
                                  isSelected={selectedItems.has(folder.id)}
                                  onToggleSelect={handleToggleSelect}
                                  onToggleStar={isSharedView || isTrashView ? null : toggleStar}
                                  onClick={() => handleOpenDirectory(folder.id)}
                                  onContextMenu={openContextMenu}
                                  onShare={isSharedView || isTrashView ? null : handleOpenShare}
                                  onShowDetails={handleShowDetails}
                                  onDownload={isTrashView ? null : handleDownloadDirectory}
                                  isTrashView={isTrashView}
                                  onRestore={isTrashView ? handleRestore : null}
                                  onDeleteForever={isTrashView ? handleStartDeleteForever : null}
                                  onRename={isTrashView ? null : handleStartRename}
                                  onDelete={isTrashView ? handleStartDeleteForever : handleStartDelete}
                                  onMove={isTrashView ? null : handleStartMove}
                                  onDropItem={isTrashView ? null : handleQuickDropMove}
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
                                  isSelected={selectedItems.has(file.id)}
                                  onToggleSelect={handleToggleSelect}
                                  onToggleStar={isSharedView || isTrashView ? null : toggleStar}
                                  onPreview={handleFileClick}
                                  onDownload={isTrashView ? null : handleDownloadFile}
                                  onContextMenu={openContextMenu}
                                  onShare={isSharedView || isTrashView ? null : handleOpenShare}
                                  onShowDetails={handleShowDetails}
                                  isTrashView={isTrashView}
                                  onRestore={isTrashView ? handleRestore : null}
                                  onDeleteForever={isTrashView ? handleStartDeleteForever : null}
                                  onRename={isTrashView ? null : handleStartRename}
                                  onDelete={isTrashView ? handleStartDeleteForever : handleStartDelete}
                                  onMove={isTrashView ? null : handleStartMove}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
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
                                  isSelected={selectedItems.has(folder.id)}
                                  onToggleSelect={handleToggleSelect}
                                  onToggleStar={isSharedView || isTrashView ? null : toggleStar}
                                  onClick={() => handleOpenDirectory(folder.id)}
                                  onContextMenu={openContextMenu}
                                  onShowDetails={handleShowDetails}
                                  onDownload={isTrashView ? null : handleDownloadDirectory}
                                  isTrashView={isTrashView}
                                  onRestore={isTrashView ? handleRestore : null}
                                  onDeleteForever={isTrashView ? handleStartDeleteForever : null}
                                  onRename={isTrashView ? null : handleStartRename}
                                  onDelete={isTrashView ? handleStartDeleteForever : handleStartDelete}
                                  onMove={isTrashView ? null : handleStartMove}
                                  onDropItem={isTrashView ? null : handleQuickDropMove}
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
                                  isSelected={selectedItems.has(file.id)}
                                  onToggleSelect={handleToggleSelect}
                                  onToggleStar={isSharedView || isTrashView ? null : toggleStar}
                                  onClick={handleFileClick}
                                  onDownload={isTrashView ? null : handleDownloadFile}
                                  onContextMenu={openContextMenu}
                                  onShare={isSharedView || isTrashView ? null : handleOpenShare}
                                  onShowDetails={handleShowDetails}
                                  isTrashView={isTrashView}
                                  onRestore={isTrashView ? handleRestore : null}
                                  onDeleteForever={isTrashView ? handleStartDeleteForever : null}
                                  onRename={isTrashView ? null : handleStartRename}
                                  onDelete={isTrashView ? handleStartDeleteForever : handleStartDelete}
                                  onMove={isTrashView ? null : handleStartMove}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Standard Drive Mode: Consistent List / Grid Layout for Folders & Files */}
                {!isSpecialView && (
                  viewMode === "list" ? (
                    <div className="files-list-section">
                      {filteredFolders.length > 0 || filteredFiles.length > 0 ? (
                        <>
                          {/* Folders in List (Full Width) */}
                          {filteredFolders.length > 0 && (
                            <>
                              <div className="section-type-label" style={{ marginTop: 0 }}>Folders</div>
                              <div className="files-items-stack" style={{ marginBottom: "20px" }}>
                                {filteredFolders.map((folder, index) => (
                                  <FolderListItem
                                    key={folder.id}
                                    folder={folder}
                                    index={index}
                                    isStarred={starredIds.has(folder.id)}
                                    isSelected={selectedItems.has(folder.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onToggleStar={toggleStar}
                                    onClick={() => handleOpenDirectory(folder.id)}
                                    onContextMenu={openContextMenu}
                                    onShare={handleOpenShare}
                                    onShowDetails={handleShowDetails}
                                    onDownload={handleDownloadDirectory}
                                    onRename={handleStartRename}
                                    onDelete={handleStartDelete}
                                    onMove={handleStartMove}
                                    onDropItem={handleQuickDropMove}
                                  />
                                ))}
                              </div>
                            </>
                          )}

                          {/* Files in List (Full Width, with Dropzone Row integrated seamlessly at top) */}
                          {filteredFiles.length > 0 ? (
                            <>
                              <div className="section-type-label">Files</div>
                              <div className="files-items-stack">
                                <UploadDropzoneCard
                                  viewMode="list"
                                  onFilesSelected={(filesList) => enqueueFiles(filesList, dirId)}
                                />
                                {filteredFiles.map((file) => (
                                  <FileListItem
                                    key={file.id}
                                    file={file}
                                    isStarred={starredIds.has(file.id)}
                                    isSelected={selectedItems.has(file.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onToggleStar={toggleStar}
                                    onPreview={setPreviewFile}
                                    onDownload={handleDownloadFile}
                                    onContextMenu={openContextMenu}
                                    onShare={handleOpenShare}
                                    onShowDetails={handleShowDetails}
                                    onRename={handleStartRename}
                                    onDelete={handleStartDelete}
                                    onMove={handleStartMove}
                                  />
                                ))}
                              </div>
                            </>
                          ) : filteredFolders.length > 0 ? (
                            <>
                              <div className="section-type-label">Files</div>
                              <div className="files-items-stack">
                                <UploadDropzoneCard
                                  viewMode="list"
                                  onFilesSelected={(filesList) => enqueueFiles(filesList, dirId)}
                                />
                              </div>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <EmptyFolderState
                          hasFolders={false}
                          isRoot={!dirId}
                          searchTerm={searchTerm}
                          onClearSearch={() => setSearchTerm("")}
                          onUploadClick={handleUploadClick}
                          onNewFolderClick={() => setShowCreateFolder(true)}
                        />
                      )}
                    </div>
                  ) : (
                    /* Grid View: Folders in cards grid, followed by Files in cards grid */
                    <div className="files-grid-section">
                      {/* Folders in Grid */}
                      {filteredFolders.length > 0 && (
                        <>
                          {filteredFiles.length > 0 && (
                            <div className="section-type-label" style={{ marginTop: 0 }}>Folders</div>
                          )}
                          <div className="folders-cards-grid" style={{ marginBottom: "24px" }}>
                            {filteredFolders.map((folder, index) => (
                              <FolderCard
                                key={folder.id}
                                folder={folder}
                                index={index}
                                isStarred={starredIds.has(folder.id)}
                                isSelected={selectedItems.has(folder.id)}
                                onToggleSelect={handleToggleSelect}
                                onToggleStar={toggleStar}
                                onClick={() => handleOpenDirectory(folder.id)}
                                onContextMenu={openContextMenu}
                                onShowDetails={handleShowDetails}
                                onDownload={handleDownloadDirectory}
                                onRename={handleStartRename}
                                onDelete={handleStartDelete}
                                onMove={handleStartMove}
                                onDropItem={handleQuickDropMove}
                              />
                            ))}
                          </div>
                        </>
                      )}

                      {/* Files in Grid */}
                      {filteredFiles.length > 0 ? (
                        <>
                          {filteredFolders.length > 0 && (
                            <div className="section-type-label">Files</div>
                          )}
                          <div className="file-grid-cards">
                            <UploadDropzoneCard
                              onFilesSelected={(filesList) => enqueueFiles(filesList, dirId)}
                            />
                            {filteredFiles.map((file) => (
                              <FileCard
                                key={file.id}
                                item={{ ...file, isDirectory: false }}
                                isStarred={starredIds.has(file.id)}
                                isSelected={selectedItems.has(file.id)}
                                onToggleSelect={handleToggleSelect}
                                onToggleStar={toggleStar}
                                onClick={setPreviewFile}
                                onDownload={handleDownloadFile}
                                onContextMenu={openContextMenu}
                                onShare={handleOpenShare}
                                onShowDetails={handleShowDetails}
                                onRename={handleStartRename}
                                onDelete={handleStartDelete}
                                onMove={handleStartMove}
                              />
                            ))}
                          </div>
                        </>
                      ) : filteredFolders.length > 0 ? (
                        <>
                          <div className="section-type-label">Files</div>
                          <div className="file-grid-cards">
                            <UploadDropzoneCard
                              onFilesSelected={(filesList) => enqueueFiles(filesList, dirId)}
                            />
                          </div>
                        </>
                      ) : (
                        <EmptyFolderState
                          hasFolders={false}
                          isRoot={!dirId}
                          searchTerm={searchTerm}
                          onClearSearch={() => setSearchTerm("")}
                          onUploadClick={handleUploadClick}
                          onNewFolderClick={() => setShowCreateFolder(true)}
                        />
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Floating Context Menu */}
      <ContextMenu
        contextMenu={contextMenu}
        onClose={closeContextMenu}
        onOpenDirectory={handleOpenDirectory}
        onPreviewFile={setPreviewFile}
        onDownloadFile={handleDownloadItem}
        onRename={handleStartRename}
        onDelete={isTrashView ? handleStartDeleteForever : handleStartDelete}
        onShare={handleOpenShare}
        onShowDetails={handleShowDetails}
        starredIds={starredIds}
        onToggleStar={toggleStar}
        onImport={handleImportToRoot}
        isTrashView={isTrashView}
        onRestore={handleRestore}
        onMove={handleStartMove}
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onSubmit={handleCreateFolder}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={!!renameTarget}
        type={renameTarget?.type}
        currentName={renameTarget?.name}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleConfirmRename}
      />

      {/* Delete / Move to Trash Confirmation Modal */}
      <DeleteModal
        isOpen={!!deleteTarget}
        type={deleteTarget?.type}
        itemName={deleteTarget?.name}
        itemCount={deleteTarget?.itemCount}
        isBulk={Boolean(deleteTarget?.isBulk)}
        isPermanent={Boolean(deleteTarget?.isPermanent || isTrashView)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Empty Trash Confirmation Modal */}
      <DeleteModal
        isOpen={showEmptyTrashModal}
        isEmptyTrash={true}
        onClose={() => setShowEmptyTrashModal(false)}
        onConfirm={handleEmptyTrash}
      />

      {/* Clear Recent Activity Confirmation Modal */}
      <DeleteModal
        isOpen={showClearRecentModal}
        isClearRecent={true}
        onClose={() => setShowClearRecentModal(false)}
        onConfirm={handleClearRecent}
      />

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownloadFile}
      />

      {/* Secure Cloud Share Modal (ReBAC) */}
      <ShareModal
        isOpen={!!shareTarget}
        item={shareTarget}
        onClose={handleCloseShare}
      />

      {/* Security Key Unlock Modal */}
      <UnlockModal
        isOpen={Boolean(unlockTarget)}
        item={unlockTarget?.item}
        onClose={() => setUnlockTarget(null)}
        onSuccess={handleUnlockSuccess}
      />

      {/* File & Folder Comprehensive Details Drawer */}
      <ItemDetailsModal
        isOpen={Boolean(detailsTarget)}
        item={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onPreview={handleFileClick}
        onDownload={handleDownloadItem}
        onOpenFolder={handleOpenDirectory}
        onShare={handleOpenShare}
        isStarred={detailsTarget ? starredIds.has(detailsTarget.id) : false}
        onToggleStar={toggleStar}
        onMove={handleStartMove}
      />

      {/* Move File & Folder Modal (Single or Bulk) */}
      <MoveItemModal
        isOpen={Boolean(moveTarget || bulkMoveItemsTarget)}
        item={moveTarget}
        items={bulkMoveItemsTarget}
        onClose={() => {
          setMoveTarget(null);
          setBulkMoveItemsTarget(null);
        }}
        onSuccess={(res) => {
          handleMoveSuccess(res);
          setSelectedItems(new Map());
        }}
      />

      {/* Floating Multi-Select & Bulk Operations Action Bar */}
      <BulkActionBar
        selectedCount={selectedCount}
        folderCount={selectedFolderCount}
        fileCount={selectedFileCount}
        isAllSelected={isAllSelected}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onDownload={handleBulkDownload}
        onMove={handleOpenBulkMove}
        onTrash={handleStartBulkDelete}
        onRestore={isTrashView ? handleBulkRestore : null}
        isTrashView={isTrashView}
      />

      {/* Permanent Global File Input for Direct Uploads (Navbar, Empty States, Toolbar) */}
      <input
        ref={globalFileInputRef}
        id="dashboard-file-upload"
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueFiles(e.target.files, dirId);
            e.target.value = "";
          }
        }}
      />
    </AppLayout>
  );
}
