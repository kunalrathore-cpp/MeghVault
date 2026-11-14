/**
 * Format bytes into human-readable file size (KB, MB, GB)
 */
export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "--";
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date string to friendly readable format
 */
export function formatDate(dateString) {
  if (!dateString) return "Recently";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Recently";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "Recently";
  }
}

/**
 * Returns clock time string (e.g., "3:45 PM")
 */
export function formatExactTime(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/**
 * Groups a timestamp into a human-readable activity bucket
 */
export function getActivityTimeBucket(dateString) {
  if (!dateString) return "Older";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Older";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = startOfToday - 30 * 24 * 60 * 60 * 1000;

    const time = date.getTime();
    if (time >= startOfToday) return "Today";
    if (time >= startOfYesterday) return "Yesterday";
    if (time >= startOfWeek) return "Earlier this week";
    if (time >= startOfMonth) return "Earlier this month";
    return "Older";
  } catch {
    return "Older";
  }
}
