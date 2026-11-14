import React from "react";
import {
  BsFiletypePdf,
  BsFiletypePng,
  BsFiletypeJpg,
  BsFiletypeSvg,
  BsFiletypeGif,
  BsFiletypeMp3,
  BsFiletypeWav,
  BsFiletypeMp4,
  BsFiletypeMov,
  BsFiletypeDoc,
  BsFiletypeDocx,
  BsFiletypeXls,
  BsFiletypeXlsx,
  BsFiletypeCsv,
  BsFiletypePpt,
  BsFiletypePptx,
  BsFiletypeTxt,
  BsFiletypeJs,
  BsFiletypeJsx,
  BsFiletypeTsx,
  BsFiletypeHtml,
  BsFiletypeCss,
  BsFiletypePy,
  BsFiletypeJson,
  BsFiletypeSql,
  BsFiletypeXml,
  BsFiletypeYml,
  BsFiletypeSh,
  BsFileEarmarkZipFill,
  BsFillFileEarmarkFill,
} from "react-icons/bs";

/**
 * Modern Dual-Tone Colorful Folder SVG Icon
 * Matches the original inspired design folders (Projects/Blue, Documents/Purple, Videos/Pink, Images/Green)
 */
export function ColorfulFolderIcon({
  color = "#2563eb",
  backColor = "#1d4ed8",
  size = 42,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* Back Tab Flap */}
      <path
        d="M6 13C6 10.7909 7.79086 9 10 9H18.5858C19.6466 9 20.664 9.42143 21.4142 10.1716L24.8284 13.5858C25.5786 14.3359 26.596 14.7574 27.6569 14.7574H38C40.2091 14.7574 42 16.5482 42 18.7574V35C42 37.2091 40.2091 39 38 39H10C7.79086 39 6 37.2091 6 35V13Z"
        fill={backColor}
      />
      {/* Front Folder Body */}
      <path
        d="M6 18C6 15.7909 7.79086 14 10 14H38C40.2091 14 42 15.7909 42 18V35C42 37.2091 40.2091 39 38 39H10C7.79086 39 6 37.2091 6 35V18Z"
        fill={color}
      />
      {/* Interior Depth Highlight */}
      <path
        d="M7 19C7 16.7909 8.79086 15 11 15H37C39.2091 15 41 16.7909 41 19V20.5H7V19Z"
        fill="#ffffff"
        fillOpacity="0.22"
      />
    </svg>
  );
}

/**
 * Extension-aware file type detection with proper colorful icon library icons
 */
export function getFileInfo(filename = "", isDirectory = false) {
  if (isDirectory) {
    return {
      category: "folder",
      icon: ColorfulFolderIcon,
      color: "#2563eb",
      bgColor: "rgba(37, 99, 235, 0.12)",
      label: "Folder",
      ext: "",
    };
  }

  const ext = filename.split(".").pop().toLowerCase();

  switch (ext) {
    // PDF Documents
    case "pdf":
      return {
        category: "pdf",
        icon: BsFiletypePdf,
        color: "#dc2626", // Red Adobe PDF
        bgColor: "rgba(220, 38, 38, 0.12)",
        label: "PDF Document",
        ext,
      };

    // Images
    case "png":
      return {
        category: "image",
        icon: BsFiletypePng,
        color: "#0284c7", // Sky blue
        bgColor: "rgba(2, 132, 199, 0.12)",
        label: "PNG Image",
        ext,
      };
    case "jpg":
    case "jpeg":
      return {
        category: "image",
        icon: BsFiletypeJpg,
        color: "#ec4899", // Pink
        bgColor: "rgba(236, 72, 153, 0.12)",
        label: "JPEG Image",
        ext,
      };
    case "webp":
      return {
        category: "image",
        icon: BsFiletypePng,
        color: "#8b5cf6", // Purple
        bgColor: "rgba(139, 92, 246, 0.12)",
        label: "WEBP Image",
        ext,
      };
    case "svg":
      return {
        category: "image",
        icon: BsFiletypeSvg,
        color: "#f59e0b", // Amber
        bgColor: "rgba(245, 158, 11, 0.12)",
        label: "Vector SVG",
        ext,
      };
    case "gif":
      return {
        category: "image",
        icon: BsFiletypeGif,
        color: "#10b981", // Emerald
        bgColor: "rgba(16, 185, 129, 0.12)",
        label: "GIF Image",
        ext,
      };

    // Audio
    case "mp3":
    case "m4a":
    case "aac":
    case "flac":
    case "ogg":
      return {
        category: "audio",
        icon: BsFiletypeMp3,
        color: "#06b6d4", // Cyan
        bgColor: "rgba(6, 182, 212, 0.12)",
        label: "Audio Track",
        ext,
      };
    case "wav":
      return {
        category: "audio",
        icon: BsFiletypeWav,
        color: "#0891b2",
        bgColor: "rgba(8, 145, 178, 0.12)",
        label: "WAV Audio",
        ext,
      };

    // Video
    case "mp4":
    case "mkv":
    case "webm":
    case "avi":
    case "wmv":
      return {
        category: "video",
        icon: BsFiletypeMp4,
        color: "#8b5cf6", // Purple
        bgColor: "rgba(139, 92, 246, 0.12)",
        label: "MP4 Video",
        ext,
      };
    case "mov":
      return {
        category: "video",
        icon: BsFiletypeMov,
        color: "#7c3aed",
        bgColor: "rgba(124, 58, 237, 0.12)",
        label: "QuickTime Video",
        ext,
      };

    // Office Documents
    case "doc":
      return {
        category: "document",
        icon: BsFiletypeDoc,
        color: "#2563eb",
        bgColor: "rgba(37, 99, 235, 0.12)",
        label: "Word Document",
        ext,
      };
    case "docx":
      return {
        category: "document",
        icon: BsFiletypeDocx,
        color: "#2563eb", // Word Blue
        bgColor: "rgba(37, 99, 235, 0.12)",
        label: "Word Document",
        ext,
      };
    case "xls":
      return {
        category: "spreadsheet",
        icon: BsFiletypeXls,
        color: "#059669",
        bgColor: "rgba(5, 150, 105, 0.12)",
        label: "Excel Spreadsheet",
        ext,
      };
    case "xlsx":
      return {
        category: "spreadsheet",
        icon: BsFiletypeXlsx,
        color: "#10b981", // Excel Green
        bgColor: "rgba(16, 185, 129, 0.12)",
        label: "Excel Spreadsheet",
        ext,
      };
    case "csv":
      return {
        category: "spreadsheet",
        icon: BsFiletypeCsv,
        color: "#059669",
        bgColor: "rgba(5, 150, 105, 0.12)",
        label: "CSV Data",
        ext,
      };
    case "ppt":
      return {
        category: "presentation",
        icon: BsFiletypePpt,
        color: "#ea580c",
        bgColor: "rgba(234, 88, 12, 0.12)",
        label: "PowerPoint Presentation",
        ext,
      };
    case "pptx":
      return {
        category: "presentation",
        icon: BsFiletypePptx,
        color: "#f97316", // PowerPoint Orange
        bgColor: "rgba(249, 115, 22, 0.12)",
        label: "PowerPoint Presentation",
        ext,
      };

    // Archives
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return {
        category: "archive",
        icon: BsFileEarmarkZipFill,
        color: "#d97706", // Amber
        bgColor: "rgba(217, 119, 6, 0.12)",
        label: "ZIP Archive",
        ext,
      };

    // Code & Markup
    case "js":
      return {
        category: "code",
        icon: BsFiletypeJs,
        color: "#ca8a04",
        bgColor: "rgba(202, 138, 4, 0.12)",
        label: "JavaScript",
        ext,
      };
    case "jsx":
      return {
        category: "code",
        icon: BsFiletypeJsx,
        color: "#0284c7",
        bgColor: "rgba(2, 132, 199, 0.12)",
        label: "React JSX",
        ext,
      };
    case "ts":
    case "tsx":
      return {
        category: "code",
        icon: BsFiletypeTsx,
        color: "#2563eb",
        bgColor: "rgba(37, 99, 235, 0.12)",
        label: "TypeScript",
        ext,
      };
    case "html":
      return {
        category: "code",
        icon: BsFiletypeHtml,
        color: "#ea580c",
        bgColor: "rgba(234, 88, 12, 0.12)",
        label: "HTML File",
        ext,
      };
    case "css":
    case "scss":
      return {
        category: "code",
        icon: BsFiletypeCss,
        color: "#0284c7",
        bgColor: "rgba(2, 132, 199, 0.12)",
        label: "CSS Stylesheet",
        ext,
      };
    case "py":
      return {
        category: "code",
        icon: BsFiletypePy,
        color: "#3b82f6",
        bgColor: "rgba(59, 130, 246, 0.12)",
        label: "Python File",
        ext,
      };
    case "json":
      return {
        category: "code",
        icon: BsFiletypeJson,
        color: "#10b981",
        bgColor: "rgba(16, 185, 129, 0.12)",
        label: "JSON File",
        ext,
      };
    case "sql":
      return {
        category: "code",
        icon: BsFiletypeSql,
        color: "#e11d48",
        bgColor: "rgba(225, 29, 72, 0.12)",
        label: "SQL File",
        ext,
      };
    case "xml":
      return {
        category: "code",
        icon: BsFiletypeXml,
        color: "#ea580c",
        bgColor: "rgba(234, 88, 12, 0.12)",
        label: "XML Document",
        ext,
      };
    case "yml":
    case "yaml":
      return {
        category: "code",
        icon: BsFiletypeYml,
        color: "#e11d48",
        bgColor: "rgba(225, 29, 72, 0.12)",
        label: "YAML Config",
        ext,
      };
    case "sh":
    case "bash":
      return {
        category: "code",
        icon: BsFiletypeSh,
        color: "#16a34a",
        bgColor: "rgba(22, 163, 74, 0.12)",
        label: "Shell Script",
        ext,
      };

    // Text & Notes
    case "txt":
    case "md":
    case "rtf":
      return {
        category: "text",
        icon: BsFiletypeTxt,
        color: "#64748b",
        bgColor: "rgba(100, 116, 139, 0.12)",
        label: "Text File",
        ext,
      };

    // Generic / Default
    default:
      return {
        category: "file",
        icon: BsFillFileEarmarkFill,
        color: "#64748b",
        bgColor: "rgba(100, 116, 139, 0.12)",
        label: ext ? `${ext.toUpperCase()} File` : "File",
        ext,
      };
  }
}
