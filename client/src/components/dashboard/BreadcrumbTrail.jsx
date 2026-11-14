import React, { useState, useRef, useEffect } from "react";
import {
  LuChevronRight,
  LuChevronDown,
  LuFolder,
  LuHardDrive,
  LuClock,
  LuStar,
  LuUsers,
  LuTrash2,
  LuEllipsis,
  LuInfo,
  LuFolderPlus,
  LuUpload,
  LuCopy,
  LuCheck,
  LuDownload,
} from "react-icons/lu";
import { useToast } from "../../context/ToastContext";

/**
 * Returns the contextual icon for a breadcrumb node based on name or position
 */
function getCrumbIcon(crumb, index) {
  if (index === 0) {
    const name = (crumb.name || "").toLowerCase();
    if (name.includes("recent")) return <LuClock className="crumb-icon" size={15} />;
    if (name.includes("starred")) return <LuStar className="crumb-icon fill-star" size={15} />;
    if (name.includes("shared")) return <LuUsers className="crumb-icon" size={15} />;
    if (name.includes("trash")) return <LuTrash2 className="crumb-icon text-red" size={15} />;
    return <LuHardDrive className="crumb-icon" size={15} />;
  }
  return <LuFolder className="crumb-icon folder-icon" size={15} />;
}

export function BreadcrumbTrail({
  breadcrumbs = [],
  onBreadcrumbClick,
  onNewFolderClick,
  onUploadClick,
  onDownloadCurrentFolder,
  onShowDetails,
  currentFolder = null,
  isSpecialView = false,
}) {
  const { showSuccess } = useToast();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const overflowRef = useRef(null);
  const menuRef = useRef(null);

  // Close popovers on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setIsOverflowOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOverflowOpen(false);
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Compute full canonical path string for copying
  const fullPathString = breadcrumbs.map((c) => c.name).join(" / ");

  const handleCopyPath = (e) => {
    e?.stopPropagation();
    navigator.clipboard?.writeText(fullPathString).then(() => {
      setCopiedPath(true);
      showSuccess("Folder path copied to clipboard");
      setTimeout(() => setCopiedPath(false), 2000);
      setIsMenuOpen(false);
    });
  };

  const handleOpenFolderDetails = (e) => {
    e?.stopPropagation();
    setIsMenuOpen(false);
    if (currentFolder) {
      onShowDetails?.(currentFolder);
    } else {
      // If at root or special view, provide a virtual folder item
      const activeCrumb = breadcrumbs[breadcrumbs.length - 1];
      onShowDetails?.({
        id: activeCrumb?.id || null,
        name: activeCrumb?.name || "My Drive",
        isDirectory: true,
        type: "directory",
      });
    }
  };

  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  // Responsive / scalable overflow computation
  // If breadcrumbs length > 4: keep first, collapse middle into '...', show last 2
  const shouldCollapse = breadcrumbs.length > 4;
  const firstCrumb = breadcrumbs[0];
  const lastIndex = breadcrumbs.length - 1;
  const lastCrumb = breadcrumbs[lastIndex];

  let visibleCrumbs = [];
  let collapsedCrumbs = [];

  if (shouldCollapse) {
    collapsedCrumbs = breadcrumbs.slice(1, -2);
    visibleCrumbs = [
      { crumb: firstCrumb, originalIndex: 0, isFirst: true },
      { isOverflowTrigger: true, count: collapsedCrumbs.length },
      { crumb: breadcrumbs[breadcrumbs.length - 2], originalIndex: breadcrumbs.length - 2 },
      { crumb: lastCrumb, originalIndex: lastIndex, isLast: true },
    ];
  } else {
    visibleCrumbs = breadcrumbs.map((crumb, idx) => ({
      crumb,
      originalIndex: idx,
      isFirst: idx === 0,
      isLast: idx === lastIndex,
    }));
  }

  return (
    <nav className="breadcrumb-trail-nav" aria-label="Folder Path Breadcrumbs">
      <ol className="breadcrumb-path-list">
        {visibleCrumbs.map((item, renderIdx) => {
          // Render collapsed '...' dropdown trigger
          if (item.isOverflowTrigger) {
            return (
              <li key="overflow-trigger" className="breadcrumb-item" ref={overflowRef}>
                <span className="breadcrumb-sep-wrap" aria-hidden="true">
                  <LuChevronRight className="breadcrumb-sep-icon" size={13} />
                </span>

                <div className="breadcrumb-overflow-container">
                  <button
                    type="button"
                    className={`breadcrumb-node-btn overflow-btn ${isOverflowOpen ? "active" : ""}`}
                    onClick={() => setIsOverflowOpen((prev) => !prev)}
                    title={`View ${item.count} hidden ancestor folder${item.count > 1 ? "s" : ""}`}
                    aria-expanded={isOverflowOpen}
                    aria-label="View hidden folders"
                  >
                    <LuEllipsis size={15} />
                  </button>

                  {isOverflowOpen && (
                    <div className="breadcrumb-dropdown-popover" role="menu">
                      <div className="dropdown-popover-header">Ancestor Folders</div>
                      <div className="dropdown-popover-list custom-scrollbar">
                        {collapsedCrumbs.map((c) => (
                          <button
                            key={c.id || c.name}
                            type="button"
                            className="dropdown-popover-item"
                            onClick={() => {
                              setIsOverflowOpen(false);
                              onBreadcrumbClick(c.id);
                            }}
                          >
                            <LuFolder size={14} className="popover-item-icon" />
                            <span className="popover-item-text" title={c.name}>
                              {c.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          }

          const { crumb, originalIndex, isFirst, isLast } = item;
          const displayName = crumb.name;
          const isSingleRoot = breadcrumbs.length === 1;

          return (
            <li
              key={crumb.id || (isFirst ? "root" : originalIndex)}
              className={`breadcrumb-item ${isLast ? "current-crumb-item" : ""}`}
            >
              {renderIdx > 0 && (
                <span className="breadcrumb-sep-wrap" aria-hidden="true">
                  <LuChevronRight className="breadcrumb-sep-icon" size={13} />
                </span>
              )}

              {isLast ? (
                // Current active folder: interactive button with contextual actions menu
                <div className="current-crumb-wrapper" ref={menuRef}>
                  <button
                    type="button"
                    className={`breadcrumb-node-btn current ${isMenuOpen ? "menu-open" : ""}`}
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    title={`${displayName} (Current location • Click for options)`}
                    aria-haspopup="true"
                    aria-expanded={isMenuOpen}
                  >
                    {getCrumbIcon(crumb, originalIndex)}
                    <span className="crumb-label current-label">{displayName}</span>
                    <LuChevronDown
                      className={`crumb-chevron ${isMenuOpen ? "rotate-up" : ""}`}
                      size={13}
                    />
                  </button>

                  {/* Contextual Action Menu for Active Folder */}
                  {isMenuOpen && (
                    <div className="breadcrumb-actions-dropdown" role="menu">
                      <div className="actions-dropdown-header">
                        <span className="actions-folder-name" title={displayName}>
                          {displayName}
                        </span>
                        <span className="actions-folder-type">
                          {isSpecialView ? "View" : "Folder"}
                        </span>
                      </div>

                      <div className="actions-dropdown-items">
                        {onShowDetails && (
                          <button
                            type="button"
                            className="actions-dropdown-btn"
                            onClick={handleOpenFolderDetails}
                          >
                            <LuInfo size={14} className="action-item-icon" />
                            <span>Folder details & info</span>
                          </button>
                        )}

                        {!isSpecialView && onNewFolderClick && (
                          <button
                            type="button"
                            className="actions-dropdown-btn"
                            onClick={() => {
                              setIsMenuOpen(false);
                              onNewFolderClick();
                            }}
                          >
                            <LuFolderPlus size={14} className="action-item-icon" />
                            <span>New subfolder</span>
                          </button>
                        )}

                        {!isSpecialView && onUploadClick && (
                          <button
                            type="button"
                            className="actions-dropdown-btn"
                            onClick={() => {
                              setIsMenuOpen(false);
                              onUploadClick();
                            }}
                          >
                            <LuUpload size={14} className="action-item-icon" />
                            <span>Upload files here</span>
                          </button>
                        )}

                        {!isSpecialView && onDownloadCurrentFolder && (
                          <button
                            type="button"
                            className="actions-dropdown-btn"
                            onClick={() => {
                              setIsMenuOpen(false);
                              onDownloadCurrentFolder();
                            }}
                          >
                            <LuDownload size={14} className="action-item-icon" />
                            <span>Download this folder (.zip)</span>
                          </button>
                        )}

                        <div className="actions-dropdown-divider" />

                        <button
                          type="button"
                          className="actions-dropdown-btn"
                          onClick={handleCopyPath}
                        >
                          {copiedPath ? (
                            <LuCheck size={14} className="action-item-icon text-emerald" />
                          ) : (
                            <LuCopy size={14} className="action-item-icon" />
                          )}
                          <span>{copiedPath ? "Path copied!" : "Copy folder path"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Ancestor clickable link
                <button
                  type="button"
                  className="breadcrumb-node-btn ancestor"
                  onClick={() => onBreadcrumbClick(crumb.id)}
                  title={`Navigate to ${displayName}`}
                >
                  {getCrumbIcon(crumb, originalIndex)}
                  <span className="crumb-label">{displayName}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
