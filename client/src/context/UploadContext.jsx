import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from "react";
import { fileApi } from "../api/fileApi";
import { googleDriveApi } from "../api/googleDriveApi";
import { googlePhotosApi } from "../api/googlePhotosApi";
import { githubApi } from "../api/githubApi";
import { useToast } from "./ToastContext";

const UploadContext = createContext();

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState([]);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const activeUploadsMap = useRef(new Map());
  const progressIntervalsMap = useRef(new Map());
  const queueRef = useRef([]);
  const activeWorkersRef = useRef(0);
  const MAX_CONCURRENT_TRANSFERS = 3;

  const { showSuccess, showError } = useToast();

  // Handles a single upload or import item with live tracking and error resilience
  const processItem = useCallback(
    async (item) => {
      // Mark as uploading in UI
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? { ...u, status: "uploading", progress: Math.max(u.progress || 0, 5) }
            : u
        )
      );

      // Case 1: MeghVault Native File Upload
      if (!item.isCloud) {
        try {
          const { promise, abort } = fileApi.uploadFile({
            parentDirId: item.parentDirId,
            file: item.file,
            onProgress: (percent) => {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === item.id
                    ? { ...u, progress: Math.min(Math.round(percent), 100) }
                    : u
                )
              );
            },
          });

          activeUploadsMap.current.set(item.id, abort);
          await promise;

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id ? { ...u, status: "completed", progress: 100 } : u
            )
          );
          showSuccess(`"${item.file.name}" uploaded successfully`);
          setRefreshTrigger((prev) => prev + 1);
        } catch (error) {
          if (error.message !== "Upload aborted by user") {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === item.id
                  ? { ...u, status: "error", error: error.message, progress: 100 }
                  : u
              )
            );
            setIsTrayOpen(true);
            showError(`Upload failed for "${item.file.name}": ${error.message}`);
          }
        } finally {
          activeUploadsMap.current.delete(item.id);
        }
        return;
      }

      // Case 2: Universal Cloud Import (Google Drive, Google Photos, GitHub, Instagram)
      const controller = new AbortController();
      activeUploadsMap.current.set(item.id, () => controller.abort());

      // Lightweight heartbeat to show immediate activity during initial folder discovery
      let discoveryProgress = 5;
      const heartbeat = setInterval(() => {
        setUploads((prev) =>
          prev.map((u) => {
            if (u.id === item.id && u.status === "uploading" && (!u.progress || u.progress < 12)) {
              discoveryProgress = Math.min(discoveryProgress + 2, 12);
              return { ...u, progress: discoveryProgress, statusText: "Scanning items..." };
            }
            return u;
          })
        );
      }, 400);
      progressIntervalsMap.current.set(item.id, heartbeat);

      // Real-time NDJSON progress callback directly from backend stream
      const onProgress = (event) => {
        clearInterval(heartbeat);
        if (typeof event.percent === "number") {
          setUploads((prev) =>
            prev.map((u) => {
              if (u.id === item.id && u.status === "uploading") {
                const statusText =
                  event.total > 1
                    ? `${event.completed}/${event.total} files (${event.percent}%)`
                    : `${event.percent}%`;
                return {
                  ...u,
                  progress: Math.min(Math.max(event.percent, 1), 99),
                  statusText,
                  liveDetails: {
                    rootFolder: event.rootFolder || item.name,
                    currentFolder: event.currentFolder,
                    folderPath: event.folderPath,
                    activeFile: event.activeFile,
                    activeFiles: event.activeFiles || [],
                    completed: event.completed,
                    total: event.total,
                    waiting: event.waiting,
                    recentCompleted: event.recentCompleted || [],
                  },
                };
              }
              return u;
            })
          );
        }
      };

      try {
        let result;
        if (item.importApiCall) {
          result = await item.importApiCall(controller.signal, onProgress);
        } else if (item.source === "github") {
          const raw = item.rawItem || {};
          const repoName = raw.repo || raw.name || item.name;
          const repoOwner =
            (typeof raw.owner === "object" ? raw.owner?.login : raw.owner) ||
            (raw.fullName ? raw.fullName.split("/")[0] : "");

          result = await githubApi.importRepositories(
            {
              repos: [
                {
                  ...raw,
                  repo: repoName,
                  name: repoName,
                  owner: repoOwner,
                  branch: raw.branch || raw.defaultBranch || "main",
                  format: item.format || raw.format || "folder",
                },
              ],
              targetDirId: item.parentDirId || null,
              format: item.format || raw.format || "folder",
            },
            { signal: controller.signal },
            onProgress
          );
        } else if (item.source === "google-photos") {
          result = await googlePhotosApi.importItems(
            { items: [item.rawItem], targetDirId: item.parentDirId },
            { signal: controller.signal },
            onProgress
          );
        } else {
          result = await googleDriveApi.importItems(
            { items: [item.rawItem], targetDirId: item.parentDirId },
            { signal: controller.signal },
            onProgress
          );
        }

        clearInterval(heartbeat);
        progressIntervalsMap.current.delete(item.id);

        if (!result) {
          throw new Error("Import stream disconnected unexpectedly before completion.");
        }

        if (result.cancelled) {
          const err = new Error("Import cancelled by user");
          err.name = "AbortError";
          throw err;
        }

        const hasFailed = (result?.failedItems || []).some(
          (f) => f.id === item.rawItem?.id
        );

        if (hasFailed || result.success === false) {
          const failObj = (result?.failedItems || []).find((f) => f.id === item.rawItem?.id);
          const errorMsg = failObj?.error || result.error || "Import failed";
          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? {
                    ...u,
                    status: "error",
                    error: errorMsg,
                    progress: 100,
                    statusText: null,
                  }
                : u
            )
          );
          showError(`Failed to import "${item.name}": ${errorMsg}`);
        } else {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? { ...u, status: "completed", progress: 100, statusText: "Complete" }
                : u
            )
          );
          showSuccess(`Imported "${item.name}"`);
          // Immediately refresh current directory so file/folder appears in real-time
          setRefreshTrigger((prev) => prev + 1);
        }
      } catch (error) {
        clearInterval(heartbeat);
        progressIntervalsMap.current.delete(item.id);

        if (
          error.name === "AbortError" ||
          controller.signal.aborted ||
          error.status === 499
        ) {
          // Remove cancelled item cleanly
          setUploads((prev) => prev.filter((u) => u.id !== item.id));
          setTimeout(() => setRefreshTrigger((prev) => prev + 1), 600);
          setTimeout(() => setRefreshTrigger((prev) => prev + 1), 1500);
        } else {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? {
                    ...u,
                    status: "error",
                    error: error.message || "Import failed",
                    progress: 100,
                    statusText: null,
                  }
                : u
            )
          );
          showError(`Import failed for "${item.name}": ${error.message || "Unknown error"}`);
        }
      } finally {
        clearInterval(heartbeat);
        progressIntervalsMap.current.delete(item.id);
        activeUploadsMap.current.delete(item.id);
      }
    },
    [showSuccess, showError]
  );

  // High-performance concurrent queue worker pool (processes up to 3 items concurrently)
  const processQueue = useCallback(() => {
    while (
      activeWorkersRef.current < MAX_CONCURRENT_TRANSFERS &&
      queueRef.current.length > 0
    ) {
      const item = queueRef.current.shift();
      if (!item) break;

      activeWorkersRef.current++;
      processItem(item).finally(() => {
        activeWorkersRef.current--;
        processQueue();
      });
    }
  }, [processItem]);

  // 1. Native File Uploader (MeghVault Direct Upload)
  const enqueueFiles = useCallback(
    (files, parentDirId = null) => {
      if (!files || files.length === 0) return;

      const fileList = Array.from(files);
      const newItems = fileList.map((file) => ({
        id: `up-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        file,
        name: file.name,
        size: file.size,
        source: "meghvault",
        type: "file",
        parentDirId,
        progress: 0,
        status: "pending",
        error: null,
        isCloud: false,
      }));

      setUploads((prev) => [...newItems, ...prev]);
      setIsTrayOpen(true);

      queueRef.current.push(...newItems);
      processQueue();
    },
    [processQueue]
  );

  // 2. Universal OAuth Connector / Cloud Import (Google Drive, Google Photos, GitHub, Instagram)
  const enqueueCloudImport = useCallback(
    ({
      items,
      source = "google-drive",
      targetDirId = null,
      importApiCall = null,
      format = "folder",
    }) => {
      if (!items || items.length === 0) return;

      const newItems = items.map((item, index) => {
        const isFolder =
          item.mimeType === "application/vnd.google-apps.folder" ||
          item.type === "directory" ||
          item.type === "folder" ||
          (source === "github" && (item.format === "folder" || format === "folder"));

        return {
          id: `cloud-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 8)}`,
          rawItem: item,
          name: item.name || "Untitled Item",
          size: item.sizeBytes || item.size || null,
          source: source || "google-drive",
          type: isFolder ? "folder" : "file",
          format: item.format || format || "folder",
          parentDirId: targetDirId,
          progress: 0,
          status: "pending",
          error: null,
          isCloud: true,
          importApiCall,
        };
      });

      // Add to tracker list and open tray
      setUploads((prev) => [...newItems, ...prev]);
      setIsTrayOpen(true);

      // Queue items individually for granular progress and real-time dashboard updates
      queueRef.current.push(...newItems);
      processQueue();
    },
    [processQueue]
  );

  // Cancel individual upload or import
  const cancelUpload = useCallback((id) => {
    // 1. If actively transferring, trigger abort function immediately
    const abortFn = activeUploadsMap.current.get(id);
    if (abortFn) {
      try {
        abortFn();
      } catch (err) {
        console.warn("Error aborting transfer:", err);
      }
      activeUploadsMap.current.delete(id);
    }

    // 2. Clear progress ticker interval if running
    const interval = progressIntervalsMap.current.get(id);
    if (interval) {
      clearInterval(interval);
      progressIntervalsMap.current.delete(id);
    }

    // 3. Remove from in-memory pending queue
    queueRef.current = queueRef.current.filter((item) => item.id !== id);

    // 4. Remove from UI list
    setUploads((prev) => prev.filter((item) => item.id !== id));

    // 5. Trigger multi-stage refresh so directory updates and removes any aborted partial folder after rollback
    setTimeout(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 600);
    setTimeout(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 1500);
  }, []);

  // Cancel / Abort all active and pending transfers
  const cancelAll = useCallback(() => {
    // Abort all active requests
    activeUploadsMap.current.forEach((abortFn) => {
      try {
        abortFn();
      } catch (e) {
        console.warn("Error aborting item in cancelAll:", e);
      }
    });
    activeUploadsMap.current.clear();

    // Clear all simulated intervals
    progressIntervalsMap.current.forEach((interval) => clearInterval(interval));
    progressIntervalsMap.current.clear();

    // Clear queue
    queueRef.current = [];
    activeWorkersRef.current = 0;

    // Filter out uploading/pending items, keep completed/error items
    setUploads((prev) =>
      prev.filter((item) => item.status === "completed" || item.status === "error")
    );

    // Refresh directory to remove any aborted structures
    setTimeout(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 300);

    showSuccess("All transfers cancelled.");
  }, [showSuccess]);

  const retryUpload = useCallback(
    (id) => {
      setUploads((prev) => {
        const target = prev.find((item) => item.id === id);
        if (!target) return prev;

        const updated = prev.map((item) =>
          item.id === id
            ? { ...item, status: "pending", progress: 0, error: null }
            : item
        );

        queueRef.current.push({
          ...target,
          status: "pending",
          progress: 0,
          error: null,
        });

        return updated;
      });

      setIsTrayOpen(true);
      processQueue();
    },
    [processQueue]
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter(
        (item) => item.status === "uploading" || item.status === "pending"
      )
    );
  }, []);

  const dismissTray = useCallback(() => {
    setUploads((prev) =>
      prev.filter(
        (item) => item.status === "uploading" || item.status === "pending"
      )
    );
    setIsTrayOpen(false);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        isTrayOpen,
        setIsTrayOpen,
        enqueueFiles,
        enqueueCloudImport,
        cancelUpload,
        cancelAll,
        retryUpload,
        clearCompleted,
        dismissTray,
        refreshTrigger,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}
