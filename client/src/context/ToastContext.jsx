import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { LuCircleCheck, LuCircleAlert, LuInfo, LuX } from "react-icons/lu";

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((msgOrOptions, maybeType = "info", maybeDuration = 3500) => {
    let message = "";
    let title = "";
    let type = maybeType;
    let duration = maybeDuration;

    if (typeof msgOrOptions === "object" && msgOrOptions !== null) {
      message = msgOrOptions.message || msgOrOptions.text || "";
      title = msgOrOptions.title || "";
      type = msgOrOptions.type || maybeType || "info";
      duration = msgOrOptions.duration !== undefined ? msgOrOptions.duration : maybeDuration;
    } else {
      message = String(msgOrOptions ?? "");
    }

    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast = { id, title, message, type, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const showSuccess = useCallback((msg) => addToast(msg, "success"), [addToast]);
  const showError = useCallback((msg) => addToast(msg, "error", 4500), [addToast]);
  const showInfo = useCallback((msg) => addToast(msg, "info"), [addToast]);

  const flashToast = useCallback((msgOrOptions, type = "success", duration = 6000) => {
    try {
      let payload = {};
      if (typeof msgOrOptions === "object" && msgOrOptions !== null) {
        payload = {
          ...msgOrOptions,
          type: msgOrOptions.type || type,
          duration: msgOrOptions.duration !== undefined ? msgOrOptions.duration : duration,
        };
      } else {
        payload = { message: String(msgOrOptions), type, duration };
      }
      sessionStorage.setItem("meghvault_flash_toast", JSON.stringify(payload));
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  // Check for persisted flash toast across page reloads/redirects on mount
  React.useEffect(() => {
    try {
      const flash = sessionStorage.getItem("meghvault_flash_toast");
      if (flash) {
        sessionStorage.removeItem("meghvault_flash_toast");
        sessionStorage.setItem("meghvault_flash_toast_shown", "1");
        setTimeout(() => sessionStorage.removeItem("meghvault_flash_toast_shown"), 3000);
        const parsed = JSON.parse(flash);
        if (parsed?.message) {
          setTimeout(() => {
            addToast(parsed, parsed.type || "success", parsed.duration || 6500);
          }, 200);
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }, [addToast]);

  const contextValue = useMemo(
    () => ({ addToast, removeToast, showSuccess, showError, showInfo, flashToast }),
    [addToast, removeToast, showSuccess, showError, showInfo, flashToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => {
          const Icon =
            toast.type === "success"
              ? LuCircleCheck
              : toast.type === "error"
              ? LuCircleAlert
              : LuInfo;

          return (
            <div key={toast.id} className={`toast-message ${toast.type}`}>
              <div className="toast-icon">
                <Icon />
              </div>
              <div className="toast-content" style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div
                    className="toast-title"
                    style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "2px" }}
                  >
                    {toast.title}
                  </div>
                )}
                <div className="toast-text" style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                  {toast.message}
                </div>
              </div>
              <button
                className="toast-dismiss"
                onClick={() => removeToast(toast.id)}
                aria-label="Close notification"
              >
                <LuX />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
