import React from "react";
import { LuFolder, LuFile } from "react-icons/lu";
import { FileCard } from "./FileCard";

export function FileGrid({
  folders = [],
  files = [],
  onItemClick,
  onContextMenu,
}) {
  return (
    <div className="animate-fade-in">
      {/* Folders Section */}
      {folders.length > 0 && (
        <section className="content-section">
          <div className="section-title">
            <LuFolder />
            <span>Folders</span>
            <span className="section-count">{folders.length}</span>
          </div>
          <div className="file-grid">
            {folders.map((folder) => (
              <FileCard
                key={folder.id}
                item={{ ...folder, isDirectory: true }}
                onClick={onItemClick}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </section>
      )}

      {/* Files Section */}
      {files.length > 0 && (
        <section className="content-section">
          <div className="section-title">
            <LuFile />
            <span>Files</span>
            <span className="section-count">{files.length}</span>
          </div>
          <div className="file-grid">
            {files.map((file) => (
              <FileCard
                key={file.id}
                item={{ ...file, isDirectory: false }}
                onClick={onItemClick}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
