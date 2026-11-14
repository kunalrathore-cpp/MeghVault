import React, { useState } from "react";
import {
  LuCloud,
  LuFileText,
  LuFolder,
  LuActivity,
  LuChevronUp,
  LuChevronDown,
} from "react-icons/lu";

export function StorageMetricsCard({ filesCount = 0, foldersCount = 0 }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("meghvault_storage_card_collapsed") === "true";
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("meghvault_storage_card_collapsed", String(next));
      return next;
    });
  };

  const todayStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className={`storage-metrics-card ${isCollapsed ? "is-collapsed" : ""}`}>
      {/* Top Header Row with Title, Inline Info (when collapsed), and Collapse Button */}
      <div className="metrics-card-header">
        <div className="metrics-header-left">
          <div className="metrics-title-group">
            <LuCloud className="metrics-cloud-icon" />
            <span className="metrics-card-title">MeghVault Overview</span>
          </div>

          {/* When collapsed: show title bit text info only */}
          {isCollapsed ? (
            <div className="metrics-collapsed-summary">
              <span className="summary-dot">•</span>
              <span className="summary-item">
                <strong>{filesCount}</strong> {filesCount === 1 ? "File" : "Files"}
              </span>
              <span className="summary-dot">•</span>
              <span className="summary-item">
                <strong>{foldersCount}</strong> {foldersCount === 1 ? "Folder" : "Folders"}
              </span>
              <span className="summary-dot">•</span>
              <span className="summary-item">
                <strong>{filesCount + foldersCount}</strong> Actions
              </span>
            </div>
          ) : (
            <span className="metrics-expanded-subtitle">
              Quick statistics and activity
            </span>
          )}
        </div>

        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          className="metrics-collapse-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? "Expand overview" : "Collapse overview"}
          aria-label={isCollapsed ? "Expand overview" : "Collapse overview"}
        >
          <span className="collapse-btn-text">{isCollapsed ? "Expand" : "Collapse"}</span>
          {isCollapsed ? <LuChevronDown size={15} /> : <LuChevronUp size={15} />}
        </button>
      </div>

      {/* Stats Grid (Hidden when collapsed) */}
      {!isCollapsed && (
        <div className="metrics-stats-grid">
          {/* Stat 1: Total Files */}
          <div className="metric-stat-item stat-files">
            <div className="metric-icon-badge file-badge">
              <LuFileText />
            </div>
            <div className="metric-info">
              <span className="metric-label">Total Files</span>
              <div className="metric-value-row">
                <span className="metric-value">{filesCount}</span>
                <span className="metric-subtext">{todayStr}</span>
              </div>
            </div>
          </div>

          {/* Stat 2: Folders */}
          <div className="metric-stat-item stat-folders">
            <div className="metric-icon-badge folder-badge">
              <LuFolder />
            </div>
            <div className="metric-info">
              <span className="metric-label">Total Folders</span>
              <div className="metric-value-row">
                <span className="metric-value">{foldersCount}</span>
                <span className="metric-subtext">{todayStr}</span>
              </div>
            </div>
          </div>

          {/* Stat 3: Recent Activity */}
          <div className="metric-stat-item stat-activity">
            <div className="metric-icon-badge activity-badge">
              <LuActivity />
            </div>
            <div className="metric-info">
              <span className="metric-label">Recent Activity</span>
              <div className="metric-value-row">
                <span className="metric-value">{filesCount + foldersCount}</span>
                <span className="metric-subtext">actions this week</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
