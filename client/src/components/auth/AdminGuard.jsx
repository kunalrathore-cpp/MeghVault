import React, { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { LoadingSpinner } from "../ui/LoadingSpinner";

export function AdminGuard({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { addToast } = useToast();
  const hasAlertedRef = useRef(false);

  const isAdmin =
    user?.role === "Admin" ||
    (typeof user?.role === "string" && user.role.toLowerCase() === "admin");

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAdmin && !hasAlertedRef.current) {
      hasAlertedRef.current = true;
      addToast({
        type: "error",
        title: "Access Denied",
        message: "You must be an administrator to access the admin portal.",
      });
    }
  }, [isLoading, isAuthenticated, isAdmin, addToast]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <LoadingSpinner size="2.5rem" message="Verifying administrator access..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
