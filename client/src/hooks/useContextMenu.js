import { useState, useEffect, useCallback } from "react";

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState(null);

  const openContextMenu = useCallback((event, item) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 220;
    const menuHeight = 440;

    let x = event.clientX;
    let y = event.clientY;

    // Viewport bounds detection (ensure room for all items including Move to Trash)
    if (x + menuWidth > window.innerWidth - 12) {
      x = window.innerWidth - menuWidth - 12;
    }
    if (y + menuHeight > window.innerHeight - 12) {
      y = Math.max(12, window.innerHeight - menuHeight - 12);
    }

    setContextMenu({
      item,
      position: { x: Math.max(10, x), y: Math.max(10, y) },
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handleDismiss = () => closeContextMenu();

    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);

    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [contextMenu, closeContextMenu]);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
  };
}
