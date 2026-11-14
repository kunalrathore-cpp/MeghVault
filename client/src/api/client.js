/**
 * Central API Client configuration and request helper
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

/**
 * Enhanced fetch wrapper with automatic credentials and error handling
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultHeaders = {};

  if (options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // 204 No Content
    if (response.status === 204) {
      return null;
    }

    let responseData = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }
    }

    if (!response.ok) {
      const errorMsg =
        (responseData && (responseData.error || responseData.message)) ||
        `Request failed with status ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = responseData;
      throw err;
    }

    return responseData;
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    if (error.status) {
      throw error;
    }
    const networkError = new Error(error.message || "Network error. Please check your connection.");
    networkError.status = 0;
    networkError.name = error.name || "NetworkError";
    throw networkError;
  }
}

/**
 * Streaming request helper for NDJSON responses with real-time progress callbacks
 */
export async function apiStreamRequest(endpoint, options = {}, onProgress = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultHeaders = {};

  if (options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch {
      // Ignore parse failure on error body
    }
    const err = new Error(errorMsg);
    err.status = response.status;
    throw err;
  }

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Retain incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "progress") {
              onProgress?.(event);
            } else if (event.type === "complete") {
              finalResult = event;
            } else if (event.type === "cancelled") {
              const err = new Error("Import cancelled");
              err.name = "AbortError";
              throw err;
            } else if (event.type === "error") {
              const err = new Error(event.error || "Import error");
              err.isStreamError = true;
              throw err;
            }
          } catch (e) {
            if (e.name === "AbortError" || e.isStreamError || e.message === "Import error") throw e;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        if (event.type === "complete") finalResult = event;
      } catch {
        // Incomplete buffer at end of stream can be ignored
      }
    }

    return finalResult || { success: true };
  }

  return response.json();
}
