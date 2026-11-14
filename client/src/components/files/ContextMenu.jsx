import React, { useRef, useState, useLayoutEffect } from "react";
import {
  LuEye,
  LuDownload,
  LuFilePen,
  LuTrash2,
  LuFolderOpen,
  LuShare2,
  LuStar,
  LuFolderInput,
  LuRotateCcw,
  LuInfo,
} from "react-icons/lu";

export function ContextMenu({
  contextMenu,
  onClose,
  onOpenDirectory,
  onPreviewFile,
  onDownloadFile,
  onRename,
  onDelete,
  onShare,
  onShowDetails,
  starredIds,
  onToggleStar,
  onImport,
  isTrashView = false,
  onRestore,
  onMove,
}) {
  if (!contextMenu) return null;

  const { item, position } = contextMenu;
  const isDir = Boolean(
    item.isDirectory === true ||
    item.type === "directory"
  );

  const isInTrash = Boolean(isTrashView || item.isTrashed);

  const menuRef = useRef(null);
  const [coords, setCoords] = useState(position);

  // Exact DOM measurement to ensure menu and Move to Trash are always 100% visible
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 12;
    let nextX = position.x;
    let nextY = position.y;

    if (nextX + rect.width > window.innerWidth - padding) {
      nextX = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (nextY + rect.height > window.innerHeight - padding) {
      nextY = Math.max(padding, window.innerHeight - rect.height - padding);
    }

    setCoords({ x: nextX, y: nextY });
  }, [position]);

  const isItemStarred = Boolean(
    item.isStarred || (starredIds && starredIds.has(item.id))
  );

  const isViewer = item.role === "viewer";
  const isEditor = item.role === "collaborator";
  const isOwner = !item.role || item.role === "owner" || item.role === "admin";
  const isSharedItem = Boolean(item.role && item.role !== "owner" && item.role !== "admin");
  const canRename = isOwner || isEditor;
  const canDelete = isOwner;
  const canShare = isOwner;
  const isSharedFile = !isDir && isSharedItem;

  return (
    <div
      ref={menuRef}
      className="context-menu-popup"
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isInTrash ? (
        <>
          <button
            className="context-menu-option"
            onClick={() => {
              onClose();
              onRestore?.(isDir ? "directory" : "file", item.id, item.name);
            }}
          >
            <LuRotateCcw />
            <span>Restore</span>
          </button>

          {onShowDetails && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onShowDetails(item);
              }}
            >
              <LuInfo />
              <span>Details & info</span>
            </button>
          )}

          <div className="context-menu-divider" />

          <button
            className="context-menu-option danger"
            onClick={() => {
              onClose();
              onDelete(isDir ? "directory" : "file", item.id, item.name);
            }}
          >
            <LuTrash2 />
            <span>Delete forever</span>
          </button>
        </>
      ) : isDir ? (
        <>
          <button
            className="context-menu-option"
            onClick={() => {
              onClose();
              onOpenDirectory(item.id);
            }}
          >
            <LuFolderOpen />
            <span>Open folder</span>
          </button>

          {onDownloadFile && !isInTrash && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onDownloadFile(item.id, item.name, item);
              }}
            >
              <LuDownload />
              <span>Download (.zip)</span>
            </button>
          )}

          {canShare && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onShare?.(item);
              }}
            >
              <LuShare2 />
              <span>Share</span>
            </button>
          )}

          {onToggleStar && !isSharedItem && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onToggleStar(item.id, "directory");
              }}
            >
              <LuStar className={isItemStarred ? "fill-star" : ""} />
              <span>{isItemStarred ? "Remove from starred" : "Add to starred"}</span>
            </button>
          )}

          {canRename && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onRename("directory", item.id, item.name);
              }}
            >
              <LuFilePen />
              <span>Rename</span>
            </button>
          )}

          {onMove && !isInTrash && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onMove(item);
              }}
            >
              <LuFolderInput />
              <span>Move to...</span>
            </button>
          )}

          {onShowDetails && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onShowDetails(item);
              }}
            >
              <LuInfo />
              <span>Details & info</span>
            </button>
          )}

          {canDelete && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-option danger"
                onClick={() => {
                  onClose();
                  onDelete("directory", item.id, item.name);
                }}
              >
                <LuTrash2 />
                <span>Move to trash</span>
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button
            className="context-menu-option"
            onClick={() => {
              onClose();
              onPreviewFile(item);
            }}
          >
            <LuEye />
            <span>Preview</span>
          </button>

          {canShare && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onShare?.(item);
              }}
            >
              <LuShare2 />
              <span>Share</span>
            </button>
          )}

          <button
            className="context-menu-option"
            onClick={() => {
              onClose();
              onDownloadFile(item.id, item.name);
            }}
          >
            <LuDownload />
            <span>Download</span>
          </button>

          {onToggleStar && !isSharedItem && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onToggleStar(item.id, "file");
              }}
            >
              <LuStar className={isItemStarred ? "fill-star" : ""} />
              <span>{isItemStarred ? "Remove from starred" : "Add to starred"}</span>
            </button>
          )}

          {isSharedFile && onImport && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onImport(item);
              }}
            >
              <LuFolderInput />
              <span>Import to root directory</span>
            </button>
          )}

          {canRename && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onRename("file", item.id, item.name);
              }}
            >
              <LuFilePen />
              <span>Rename</span>
            </button>
          )}

          {onMove && !isInTrash && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onMove(item);
              }}
            >
              <LuFolderInput />
              <span>Move to...</span>
            </button>
          )}

          {onShowDetails && (
            <button
              className="context-menu-option"
              onClick={() => {
                onClose();
                onShowDetails(item);
              }}
            >
              <LuInfo />
              <span>Details & info</span>
            </button>
          )}

          {canDelete && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-option danger"
                onClick={() => {
                  onClose();
                  onDelete("file", item.id, item.name);
                }}
              >
                <LuTrash2 />
                <span>Move to trash</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
