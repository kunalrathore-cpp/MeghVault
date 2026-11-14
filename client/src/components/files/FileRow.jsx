import React from "react";
import { LuEllipsisVertical } from "react-icons/lu";
import { getFileInfo } from "../../utils/fileIcons";
import { formatDate } from "../../utils/formatters";

export function FileRow({
  item,
  onClick,
  onContextMenu,
}) {
  const isDir = Boolean(item.isDirectory || item.type === "directory");
  const rowItem = { ...item, isDirectory: isDir, type: isDir ? "directory" : "file" };
  const fileInfo = getFileInfo(item.name, isDir);
  const Icon = fileInfo.icon;

  return (
    <div
      className="file-list-row"
      onClick={() => onClick(rowItem)}
      onContextMenu={(e) => onContextMenu(e, rowItem)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(rowItem);
        }
      }}
    >
      <div className="row-name-col">
        <div
          className="row-icon-wrapper"
          style={{
            backgroundColor: fileInfo.bgColor,
            color: fileInfo.color,
          }}
        >
          <Icon />
        </div>
        <span className="row-name-text" title={item.name}>
          {item.name}
        </span>
      </div>

      <div className="row-meta-col">{fileInfo.label}</div>

      <div className="row-meta-col">
        {formatDate(item.updatedAt || item.createdAt)}
      </div>

      <div className="row-actions-col">
        <button
          className="card-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e, rowItem);
          }}
          aria-label={`Options for ${item.name}`}
        >
          <LuEllipsisVertical />
        </button>
      </div>
    </div>
  );
}
