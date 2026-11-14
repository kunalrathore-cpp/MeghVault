import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import githubIcon from "@iconify-icons/logos/github-icon";
import {
  LuX,
  LuSearch,
  LuCheck,
  LuRefreshCw,
  LuSquareCheck,
  LuSquare,
  LuLock,
  LuGlobe,
  LuGitFork,
  LuStar,
  LuFolderCode,
  LuFileArchive,
  LuGitBranch,
  LuLogOut,
} from "react-icons/lu";
import { githubApi } from "../../api/githubApi";
import { useToast } from "../../context/ToastContext";
import { useUpload } from "../../context/UploadContext";

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  HTML: "#e34c26",
  CSS: "#563d7c",
  PHP: "#4F5D95",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

export function GithubRepoPickerModal({
  isOpen,
  onClose,
  targetDirId = null,
  connectedUser = null,
  onDisconnect = null,
  onImportSuccess = null,
}) {
  const { showSuccess, showError } = useToast();
  const { enqueueCloudImport } = useUpload();

  const [repos, setRepos] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState(new Map()); // repoId -> { repo, branch, format }
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "public" | "private" | "sources" | "forks"
  const [searchTerm, setSearchTerm] = useState("");
  const [globalFormat, setGlobalFormat] = useState("folder"); // "folder" | "zip"

  // Load repositories from user's GitHub
  const loadRepositories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await githubApi.listRepositories({ perPage: 100 });
      setRepos(res.repos || []);
    } catch (err) {
      showError(err.message || "Failed to load GitHub repositories.");
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (isOpen) {
      setSelectedRepos(new Map());
      setSearchTerm("");
      setActiveTab("all");
      setGlobalFormat("folder");
      loadRepositories();
    }
  }, [isOpen, loadRepositories]);

  // Filter repositories by activeTab and searchTerm
  const filteredRepos = useMemo(() => {
    let result = repos;

    if (activeTab === "public") {
      result = result.filter((r) => !r.isPrivate);
    } else if (activeTab === "private") {
      result = result.filter((r) => r.isPrivate);
    } else if (activeTab === "forks") {
      result = result.filter((r) => r.isFork);
    } else if (activeTab === "sources") {
      result = result.filter((r) => !r.isFork);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.fullName?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.language?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [repos, activeTab, searchTerm]);

  // Counts for tab badges
  const counts = useMemo(() => {
    return {
      all: repos.length,
      public: repos.filter((r) => !r.isPrivate).length,
      private: repos.filter((r) => r.isPrivate).length,
      forks: repos.filter((r) => r.isFork).length,
    };
  }, [repos]);

  // Toggle single repository selection
  const handleToggleRepo = (repo) => {
    setSelectedRepos((prev) => {
      const next = new Map(prev);
      if (next.has(repo.id)) {
        next.delete(repo.id);
      } else {
        next.set(repo.id, {
          repo,
          branch: repo.defaultBranch || "main",
          format: globalFormat,
        });
      }
      return next;
    });
  };

  // Toggle select all in current filtered view
  const handleToggleSelectAll = () => {
    if (filteredRepos.length === 0) return;

    const allSelected = filteredRepos.every((r) => selectedRepos.has(r.id));
    setSelectedRepos((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        filteredRepos.forEach((r) => next.delete(r.id));
      } else {
        filteredRepos.forEach((r) => {
          if (!next.has(r.id)) {
            next.set(r.id, {
              repo: r,
              branch: r.defaultBranch || "main",
              format: globalFormat,
            });
          }
        });
      }
      return next;
    });
  };

  // Switch format for all selected repos
  const handleGlobalFormatChange = (format) => {
    setGlobalFormat(format);
    setSelectedRepos((prev) => {
      const next = new Map();
      prev.forEach((val, key) => {
        next.set(key, { ...val, format });
      });
      return next;
    });
  };

  // Submit and start cloud import
  const handleImportSubmit = () => {
    if (selectedRepos.size === 0) return;

    const items = Array.from(selectedRepos.values()).map(({ repo, branch, format }) => ({
      ...repo,
      branch: branch || repo.defaultBranch || "main",
      format: format || globalFormat,
    }));

    enqueueCloudImport({
      items,
      source: "github",
      targetDirId,
      format: globalFormat,
    });

    showSuccess(
      `Importing ${items.length} ${globalFormat === "zip" ? "ZIP archive" : "repository"}${
        items.length === 1 ? "" : "s"
      } from GitHub...`
    );

    if (onImportSuccess) onImportSuccess();
    onClose();
  };

  if (!isOpen) return null;

  const isAllFilteredSelected =
    filteredRepos.length > 0 && filteredRepos.every((r) => selectedRepos.has(r.id));

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-large github-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header github-picker-header">
          <div className="modal-title">
            <span className="source-icon-wrap github-header-icon">
              <Icon icon={githubIcon} width={24} height={24} />
            </span>
            <div className="github-title-wrap">
              <span>Import from GitHub</span>
              {connectedUser?.username && (
                <div className="github-user-badge">
                  {connectedUser.avatar && (
                    <img
                      src={connectedUser.avatar}
                      alt={connectedUser.username}
                      className="github-user-avatar"
                    />
                  )}
                  <span className="github-username">@{connectedUser.username}</span>
                  {connectedUser.email && (
                    <span className="github-email-bullet">• {connectedUser.email}</span>
                  )}
                  {onDisconnect && (
                    <button
                      type="button"
                      className="github-disconnect-pill-btn"
                      onClick={onDisconnect}
                      title="Disconnect GitHub account"
                    >
                      <LuLogOut size={12} />
                      <span>Disconnect</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close GitHub Picker"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Toolbar: Search & Filter Tabs */}
        <div className="github-picker-toolbar">
          <div className="github-filter-tabs">
            <button
              type="button"
              className={`github-filter-tab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All <span className="tab-badge">{counts.all}</span>
            </button>
            <button
              type="button"
              className={`github-filter-tab ${activeTab === "public" ? "active" : ""}`}
              onClick={() => setActiveTab("public")}
            >
              Public <span className="tab-badge">{counts.public}</span>
            </button>
            <button
              type="button"
              className={`github-filter-tab ${activeTab === "private" ? "active" : ""}`}
              onClick={() => setActiveTab("private")}
            >
              Private <span className="tab-badge">{counts.private}</span>
            </button>
            <button
              type="button"
              className={`github-filter-tab ${activeTab === "forks" ? "active" : ""}`}
              onClick={() => setActiveTab("forks")}
            >
              Forks <span className="tab-badge">{counts.forks}</span>
            </button>
          </div>

          <div className="github-search-wrap">
            <LuSearch size={15} className="github-search-icon" />
            <input
              type="text"
              className="github-search-input"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="github-search-clear"
                onClick={() => setSearchTerm("")}
              >
                <LuX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Sub-toolbar: Select All & Import Format Switch */}
        <div className="github-sub-toolbar">
          <button
            type="button"
            className="gdrive-select-all-btn"
            onClick={handleToggleSelectAll}
            disabled={filteredRepos.length === 0}
          >
            {isAllFilteredSelected ? (
              <LuSquareCheck size={16} className="select-icon selected" />
            ) : (
              <LuSquare size={16} className="select-icon" />
            )}
            <span>Select All ({filteredRepos.length})</span>
          </button>

          {/* Import Format Choice Toggle */}
          <div className="github-format-toggle-group">
            <span className="format-toggle-label">Import as:</span>
            <div className="format-toggle-pills">
              <button
                type="button"
                className={`format-pill-btn ${globalFormat === "folder" ? "active" : ""}`}
                onClick={() => handleGlobalFormatChange("folder")}
                title="Extract all files and subdirectories directly into MeghVault"
              >
                <LuFolderCode size={14} />
                <span>Project Folder</span>
              </button>
              <button
                type="button"
                className={`format-pill-btn ${globalFormat === "zip" ? "active" : ""}`}
                onClick={() => handleGlobalFormatChange("zip")}
                title="Download repository as a single compressed .zip file"
              >
                <LuFileArchive size={14} />
                <span>ZIP Archive</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content List */}
        <div className="github-content-scroll">
          {isLoading ? (
            <div className="gdrive-loading-state">
              <LuRefreshCw size={28} className="gdrive-spin-icon" />
              <span>Fetching repositories from GitHub...</span>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="gdrive-empty-state">
              <Icon icon={githubIcon} width={40} height={40} style={{ opacity: 0.35, marginBottom: 12 }} />
              <p>No repositories found</p>
              {searchTerm && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt-2"
                  onClick={() => setSearchTerm("")}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="github-repo-grid">
              {filteredRepos.map((repo) => {
                const isSelected = selectedRepos.has(repo.id);
                const langColor = LANGUAGE_COLORS[repo.language] || "#8b949e";

                return (
                  <div
                    key={repo.id}
                    className={`github-repo-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleToggleRepo(repo)}
                  >
                    <div className="repo-card-header">
                      <div className="repo-select-box">
                        {isSelected ? (
                          <LuSquareCheck size={18} className="select-icon selected" />
                        ) : (
                          <LuSquare size={18} className="select-icon" />
                        )}
                      </div>

                      <div className="repo-title-row">
                        <span className="repo-name" title={repo.fullName}>
                          {repo.name}
                        </span>
                        <span className={`repo-privacy-tag ${repo.isPrivate ? "private" : "public"}`}>
                          {repo.isPrivate ? (
                            <>
                              <LuLock size={11} /> Private
                            </>
                          ) : (
                            <>
                              <LuGlobe size={11} /> Public
                            </>
                          )}
                        </span>
                        {repo.isFork && (
                          <span className="repo-fork-tag" title="Forked repository">
                            <LuGitFork size={11} /> Fork
                          </span>
                        )}
                      </div>
                    </div>

                    {repo.description && (
                      <p className="repo-description" title={repo.description}>
                        {repo.description}
                      </p>
                    )}

                    <div className="repo-meta-row">
                      {repo.language && (
                        <div className="repo-meta-item repo-lang">
                          <span
                            className="repo-lang-dot"
                            style={{ backgroundColor: langColor }}
                          />
                          <span>{repo.language}</span>
                        </div>
                      )}

                      {repo.stars > 0 && (
                        <div className="repo-meta-item">
                          <LuStar size={13} className="repo-star-icon" />
                          <span>{repo.stars}</span>
                        </div>
                      )}

                      <div className="repo-meta-item repo-branch">
                        <LuGitBranch size={13} />
                        <span>{repo.defaultBranch}</span>
                      </div>

                      {repo.sizeKb > 0 && (
                        <div className="repo-meta-item repo-size">
                          <span>
                            {repo.sizeKb > 1024
                              ? `${(repo.sizeKb / 1024).toFixed(1)} MB`
                              : `${repo.sizeKb} KB`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer github-picker-footer">
          <div className="github-footer-summary">
            {selectedRepos.size > 0 ? (
              <span className="github-selected-count">
                <strong>{selectedRepos.size}</strong> repositor
                {selectedRepos.size === 1 ? "y" : "ies"} selected ({globalFormat === "zip" ? "ZIP" : "Folder"})
              </span>
            ) : (
              <span className="text-muted">Select repositories to import</span>
            )}
          </div>

          <div className="modal-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImportSubmit}
              disabled={selectedRepos.size === 0}
            >
              <LuCheck size={16} />
              <span>
                Import Selected ({selectedRepos.size})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
