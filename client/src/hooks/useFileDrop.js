import { useState, useEffect, useRef } from "react";

export function useFileDrop(onDropFiles) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  const isInternalDragRef = useRef(false);

  useEffect(() => {
    // Detect when a drag originates from inside this document (e.g., dragging cards, images, rows)
    const handleWindowDragStart = () => {
      isInternalDragRef.current = true;
    };

    const handleWindowDragEnd = () => {
      isInternalDragRef.current = false;
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    };

    const isInternalPayload = (e) => {
      if (isInternalDragRef.current) return true;
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      const types = Array.from(e.dataTransfer.types);
      return (
        types.includes("application/json") ||
        types.includes("application/x-meghvault-item")
      );
    };

    const handleDragEnter = (e) => {
      // Ignore drags originating within the webpage (like dragging existing files to move them)
      if (isInternalPayload(e)) return;

      // Only handle real external OS file drops
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e) => {
      if (isInternalPayload(e)) return;

      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };

    const handleDragOver = (e) => {
      if (isInternalPayload(e)) return;

      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (e) => {
      if (isInternalPayload(e)) return;

      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;
      setIsDraggingOver(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragstart", handleWindowDragStart);
    window.addEventListener("dragend", handleWindowDragEnd);
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragstart", handleWindowDragStart);
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onDropFiles]);

  return { isDraggingOver };
}
