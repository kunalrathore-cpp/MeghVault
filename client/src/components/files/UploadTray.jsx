import React from "react";
import {
  LuCloudUpload,
  LuChevronDown,
  LuChevronUp,
  LuX,
  LuCircleCheck,
  LuCircleAlert,
  LuTrash,
  LuRotateCcw,
  LuFolder,
  LuLoader,
  LuCircleX,
  LuClock,
  LuCheck,
  LuFile,
  LuFolderTree,
} from "react-icons/lu";
import { useUpload } from "../../context/UploadContext";
import { formatFileSize } from "../../utils/formatters";
import { getFileInfo } from "../../utils/fileIcons";
import { SourceBrandBadge } from "../ui/SourceBrandBadge";

export function UploadTray() {
  const {
    uploads,
    isTrayOpen,
    setIsTrayOpen,
    cancelUpload,
    cancelAll,
    retryUpload,
    clearCompleted,
    dismissTray,
  } = useUpload();

  if (!uploads || uploads.length === 0) return null;

  const completedCount = uploads.filter((u) => u.status === "completed").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;
  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending"
  ).length;

  const totalCount = uploads.length;
  const overallProgress = Math.round(
    uploads.reduce((sum, u) => sum + (u.progress || 0), 0) / (totalCount || 1)
  );

  const sources = Array.from(new Set(uploads.map((u) => u.source || "meghvault")));
  const primarySource = sources.length === 1 ? sources[0] : null;

  // Active item details for top header summary
  const activeItem = uploads.find((u) => u.status === "uploading");
  const activeLive = activeItem?.liveDetails;

  let headerTitle;
  let HeaderIcon;
  let iconColor;

  if (activeCount > 0) {
    const actionWord = primarySource === "meghvault" ? "Uploading" : "Importing";
    if (activeLive && activeLive.total > 1) {
      headerTitle = `${actionWord} ${activeLive.rootFolder || activeItem.name} (${activeLive.completed}/${activeLive.total} files • ${activeItem.progress}%)`;
    } else {
      headerTitle = `${actionWord} ${activeCount} item${activeCount > 1 ? "s" : ""} (${overallProgress}%)`;
    }
    HeaderIcon = LuCloudUpload;
    iconColor = "var(--primary)";
  } else if (errorCount > 0 && completedCount > 0) {
    headerTitle = `${completedCount} completed, ${errorCount} failed`;
    HeaderIcon = LuCircleAlert;
    iconColor = "var(--danger)";
  } else if (errorCount > 0) {
    headerTitle = `${errorCount} transfer${errorCount > 1 ? "s" : ""} failed`;
    HeaderIcon = LuCircleAlert;
    iconColor = "var(--danger)";
  } else {
    headerTitle = `${completedCount} item${completedCount > 1 ? "s" : ""} transfer complete`;
    HeaderIcon = LuCircleCheck;
    iconColor = "var(--success)";
  }

  return (
    <div className="upload-tray universal-upload-tracker">
      {/* Overall Batch Progress Header */}
      <div
        className="upload-tray-header"
        onClick={() => setIsTrayOpen((prev) => !prev)}
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsTrayOpen((prev) => !prev);
          }
        }}
      >
        <div className="upload-tray-title">
          {activeCount > 0 ? (
            <LuLoader className="upload-spin-icon" style={{ color: iconColor }} />
          ) : (
            <HeaderIcon style={{ color: iconColor }} />
          )}
          <span className="tray-title-text" title={headerTitle}>
            {headerTitle}
          </span>
        </div>

        <div className="upload-tray-controls" onClick={(e) => e.stopPropagation()}>
          {activeCount > 0 && (
            <button
              className="upload-tray-btn upload-tray-btn-danger"
              onClick={cancelAll}
              title="Cancel all active and pending transfers"
              aria-label="Cancel all transfers"
            >
              <LuCircleX size={16} />
            </button>
          )}

          {completedCount > 0 && (
            <button
              className="upload-tray-btn"
              onClick={clearCompleted}
              title="Clear completed"
              aria-label="Clear completed uploads"
            >
              <LuTrash size={15} />
            </button>
          )}

          <button
            className="upload-tray-btn"
            onClick={() => setIsTrayOpen((prev) => !prev)}
            aria-label={isTrayOpen ? "Collapse drawer" : "Expand drawer"}
            title={isTrayOpen ? "Collapse drawer" : "Expand drawer"}
          >
            {isTrayOpen ? <LuChevronDown size={16} /> : <LuChevronUp size={16} />}
          </button>

          <button
            className="upload-tray-btn"
            onClick={dismissTray}
            aria-label="Dismiss upload manager"
            title="Close tracker"
          >
            <LuX size={16} />
          </button>
        </div>
      </div>

      {/* Top Universal Overall Progress Bar */}
      <div className="universal-overall-progress-track">
        <div
          className={`universal-overall-progress-fill ${
            activeCount === 0 && errorCount === 0 ? "is-complete" : ""
          }`}
          style={{
            width: `${overallProgress}%`,
            background:
              errorCount > 0 && activeCount === 0
                ? "var(--danger)"
                : undefined,
          }}
        />
      </div>

      {/* Expanded List Drawer with Detailed Real-Time View */}
      {isTrayOpen && (
        <div className="upload-tray-list">
          {uploads.map((item) => {
            const isFolder = item.type === "folder";
            const fileInfo = !isFolder ? getFileInfo(item.name, false) : null;
            const ItemIcon = isFolder ? LuFolder : fileInfo?.icon;
            const live = item.liveDetails;
            const isUploading = item.status === "uploading";
            const isPending = item.status === "pending";
            const isCompleted = item.status === "completed";
            const isError = item.status === "error";

            return (
              <div key={item.id} className="upload-tray-item">
                {/* 1. Item Header Row */}
                <div className="upload-item-header">
                  <SourceBrandBadge source={item.source} size={15} />

                  <div
                    className="upload-item-type-icon"
                    style={{
                      color: isFolder ? "#2563eb" : fileInfo?.color,
                    }}
                  >
                    {ItemIcon && <ItemIcon size={16} />}
                  </div>

                  <span className="upload-item-name" title={item.name}>
                    {item.name}
                  </span>

                  <div className="upload-item-actions">
                    {isCompleted && (
                      <LuCircleCheck
                        style={{ color: "var(--success)", flexShrink: 0 }}
                        size={17}
                      />
                    )}

                    {isError && (
                      <>
                        <button
                          className="upload-tray-btn"
                          onClick={() => retryUpload(item.id)}
                          title="Retry"
                          aria-label={`Retry ${item.name}`}
                          style={{ color: "var(--primary)" }}
                        >
                          <LuRotateCcw size={14} />
                        </button>
                        <button
                          className="upload-item-cancel"
                          onClick={() => cancelUpload(item.id)}
                          title="Dismiss"
                          aria-label={`Dismiss ${item.name}`}
                        >
                          <LuX size={14} />
                        </button>
                      </>
                    )}

                    {(isUploading || isPending) && (
                      <button
                        className="upload-item-cancel"
                        onClick={() => cancelUpload(item.id)}
                        title="Cancel this transfer"
                        aria-label={`Cancel ${item.name}`}
                      >
                        <LuX size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Parent Folder Path Breadcrumb (if importing a subfolder/folder) */}
                {live?.folderPath && isFolder && (
                  <div className="upload-item-folder-path" title={live.folderPath}>
                    <LuFolderTree size={12} />
                    <span>{live.folderPath}</span>
                  </div>
                )}

                {/* 3. Progress Bar */}
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${isError ? 100 : item.progress}%`,
                      background:
                        isCompleted
                          ? "var(--success)"
                          : isError
                          ? "var(--danger)"
                          : undefined,
                    }}
                  />
                </div>

                {/* 4. Progress Status & Meta Row */}
                <div className="progress-meta">
                  <span className="progress-source-meta">
                    {isFolder
                      ? live?.total
                        ? `${live.total} files in folder`
                        : "Folder"
                      : item.size
                      ? formatFileSize(item.size)
                      : "File"}
                  </span>

                  <span
                    className="progress-status-text"
                    style={{
                      color:
                        isError
                          ? "var(--danger)"
                          : isCompleted
                          ? "var(--success)"
                          : undefined,
                    }}
                  >
                    {isCompleted
                      ? "Complete"
                      : isError
                      ? item.error || "Failed"
                      : isPending
                      ? "Waiting in queue..."
                      : item.statusText || `${item.progress}%`}
                  </span>
                </div>

                {/* 5. Currently Uploading / Active File Live Card */}
                {isUploading && live?.activeFile && (
                  <div className="upload-active-file-box" title={`Currently transferring: ${live.activeFile.name}`}>
                    <div className="active-file-pulse-dot" />
                    <LuFile size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
                    <span className="active-file-name">{live.activeFile.name}</span>
                    {live.activeFile.size && (
                      <span className="active-file-size">
                        {formatFileSize(live.activeFile.size)}
                      </span>
                    )}
                  </div>
                )}

                {/* 6. Live Metrics Pills (Completed • Downloading • Waiting) */}
                {isUploading && live && typeof live.completed === "number" && (
                  <div className="upload-metrics-row">
                    <span className="metric-pill metric-pill-success">
                      <LuCheck size={11} />
                      <span>{live.completed} completed</span>
                    </span>

                    {live.activeFiles?.length > 0 && (
                      <span className="metric-pill metric-pill-active">
                        <LuLoader size={11} className="upload-spin-icon" />
                        <span>{live.activeFiles.length} transferring</span>
                      </span>
                    )}

                    {live.waiting > 0 && (
                      <span className="metric-pill metric-pill-waiting">
                        <LuClock size={11} />
                        <span>{live.waiting} waiting</span>
                      </span>
                    )}
                  </div>
                )}

                {/* 7. Pending / Waiting in queue indicator */}
                {isPending && (
                  <div className="queued-status-badge">
                    <LuClock size={12} />
                    <span>Queued — waiting for previous transfer to finish...</span>
                  </div>
                )}

                {/* 8. Recent Completed Files Mini-List */}
                {live?.recentCompleted && live.recentCompleted.length > 0 && (
                  <div className="upload-recent-list">
                    {live.recentCompleted.slice(0, 3).map((rf, idx) => (
                      <div key={idx} className="recent-file-item" title={rf.name}>
                        <LuCheck size={11} className="recent-file-check" />
                        <span className="recent-file-name">{rf.name}</span>
                        {rf.size && (
                          <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>
                            {formatFileSize(rf.size)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
