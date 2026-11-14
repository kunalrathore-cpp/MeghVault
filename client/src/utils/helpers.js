/**
 * Get base name of file excluding the extension
 */
export function getFilenameWithoutExtension(filename = "") {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot > 0) {
    return filename.substring(0, lastDot);
  }
  return filename;
}

/**
 * Determine preview capabilities based on file category and extension
 */
export function canPreviewInBrowser(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"];
  const videoExts = ["mp4", "webm", "ogg", "mov"];
  const audioExts = ["mp3", "wav", "ogg", "aac", "m4a"];
  const docExts = ["pdf", "txt", "md", "json", "js", "html", "css", "py", "csv"];

  if (imageExts.includes(ext)) return "image";
  if (videoExts.includes(ext)) return "video";
  if (audioExts.includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (docExts.includes(ext)) return "text";

  return null;
}
