import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { UploadTray } from "../files/UploadTray";
import { DropzoneOverlay } from "../files/DropzoneOverlay";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useUpload } from "../../context/UploadContext";

export function AppLayout({
  children,
  activeDirId = null,
  onUploadClick,
  showNavbar = true,
  canUpload = true,
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("meghvault_sidebar_collapsed") === "true";
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { enqueueFiles } = useUpload();

  const handleToggleCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("meghvault_sidebar_collapsed", String(next));
      return next;
    });
  };

  const handleMobileToggle = () => {
    setIsMobileOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle sidebar on Ctrl+B or Cmd+B when not inside an input/textarea
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDropFiles = (files) => {
    if (!canUpload) return;
    enqueueFiles(files, activeDirId);
  };

  const { isDraggingOver } = useFileDrop(canUpload ? handleDropFiles : () => {});

  const triggerUpload = canUpload
    ? (onUploadClick !== undefined
        ? onUploadClick
        : () => {
            document.getElementById("dashboard-file-upload")?.click();
          })
    : null;

  return (
    <div className="app-container">
      {/* Drag & Drop Visual Overlay - only when uploads are allowed */}
      {showNavbar && canUpload && <DropzoneOverlay isVisible={isDraggingOver} />}

      {/* Responsive Left Sidebar */}
      <Sidebar
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Main Viewport */}
      <div className={`main-wrapper ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {showNavbar && (
          <Navbar
            onMobileToggle={handleMobileToggle}
            onUploadClick={triggerUpload}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleToggleCollapse}
          />
        )}

        <main className={`content-viewport ${!showNavbar ? "no-navbar" : ""}`}>
          {typeof children === "function"
            ? children({
                isSidebarCollapsed,
                onToggleSidebar: handleToggleCollapse,
                onMobileToggle: handleMobileToggle,
              })
            : children}
        </main>
      </div>

      {/* Floating Upload Tray - only in standard file drive mode */}
      {showNavbar && <UploadTray />}
    </div>
  );
}
