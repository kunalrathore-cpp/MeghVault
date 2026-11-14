import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { authApi } from "../api/authApi";

const PreferencesContext = createContext();

const STORAGE_KEY = "meghvault_show_all_actions_directly";

export function PreferencesProvider({ children }) {
  const { user, refreshUser } = useAuth();

  const [showAllActionsDirectly, setShowAllActionsDirectlyState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  // Sync with user preferences from backend when available
  useEffect(() => {
    if (user?.preferences?.showAllActionsDirectly !== undefined) {
      const serverVal = Boolean(user.preferences.showAllActionsDirectly);
      setShowAllActionsDirectlyState(serverVal);
      try {
        localStorage.setItem(STORAGE_KEY, String(serverVal));
      } catch {
        // Safe fallback for private mode
      }
    }
  }, [user?.preferences?.showAllActionsDirectly]);

  const setShowAllActionsDirectly = useCallback(async (valueOrFn) => {
    setShowAllActionsDirectlyState((prev) => {
      const nextVal = typeof valueOrFn === "function" ? valueOrFn(prev) : Boolean(valueOrFn);
      try {
        localStorage.setItem(STORAGE_KEY, String(nextVal));
      } catch {
        // Safe fallback
      }

      // Persist to backend if logged in
      if (user) {
        authApi.updateProfile({
          preferences: { showAllActionsDirectly: nextVal },
        }).then(() => {
          refreshUser?.();
        }).catch((err) => {
          console.error("Failed to save action preference to server:", err);
        });
      }

      return nextVal;
    });
  }, [user, refreshUser]);

  const toggleShowAllActionsDirectly = useCallback(() => {
    setShowAllActionsDirectly((prev) => !prev);
  }, [setShowAllActionsDirectly]);

  return (
    <PreferencesContext.Provider
      value={{
        showAllActionsDirectly,
        setShowAllActionsDirectly,
        toggleShowAllActionsDirectly,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
}
