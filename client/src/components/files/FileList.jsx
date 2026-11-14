import React from "react";
import { LuFolder, LuFile } from "react-icons/lu";
import { FileRow } from "./FileRow";

export function FileList({
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
          <div className="file-list-container">
            <div className="file-list-header">
              <div>Name</div>
              <div>Type</div>
              <div>Modified</div>
              <div style={{ textAlign: "right" }}>Actions</div>
            </div>
            {folders.map((folder) => (
              <FileRow
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
          <div className="file-list-container">
            <div className="file-list-header">
              <div>Name</div>
              <div>Type</div>
              <div>Modified</div>
              <div style={{ textAlign: "right" }}>Actions</div>
            </div>
            {files.map((file) => (
              <FileRow
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
