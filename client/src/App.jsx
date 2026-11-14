import React from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { UploadProvider } from "./context/UploadContext";
import { AuthGuard } from "./components/auth/AuthGuard";
import { AdminGuard } from "./components/auth/AdminGuard";
import { GuestGuard } from "./components/auth/GuestGuard";
import { DrivePage } from "./pages/DrivePage";
import { AuthPage } from "./pages/AuthPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DeleteAccountPage } from "./pages/DeleteAccountPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminUserFilesPage } from "./pages/AdminUserFilesPage";
import { SharedResourcePage } from "./pages/SharedResourcePage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

import "./styles/global.css";
import "./styles/layout.css";
import "./styles/files.css";
import "./styles/dashboard.css";
import "./styles/modals.css";
import "./styles/auth.css";
import "./styles/admin.css";
import "./styles/notfound.css";
import "./styles/shareModal.css";
import "./styles/profile.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthGuard>
        <DrivePage />
      </AuthGuard>
    ),
  },
  {
    path: "/directory/:dirId",
    element: (
      <AuthGuard>
        <DrivePage />
      </AuthGuard>
    ),
  },
  {
    path: "/shared-with-me",
    element: (
      <AuthGuard>
        <DrivePage view="shared" />
      </AuthGuard>
    ),
  },
  {
    path: "/recent",
    element: (
      <AuthGuard>
        <DrivePage view="recent" />
      </AuthGuard>
    ),
  },
  {
    path: "/starred",
    element: (
      <AuthGuard>
        <DrivePage view="starred" />
      </AuthGuard>
    ),
  },
  {
    path: "/trash",
    element: (
      <AuthGuard>
        <DrivePage view="trash" />
      </AuthGuard>
    ),
  },
  {
    path: "/settings",
    element: (
      <AuthGuard>
        <SettingsPage />
      </AuthGuard>
    ),
  },
  {
    path: "/profile",
    element: <Navigate to="/settings" replace />,
  },
  {
    path: "/delete-account",
    element: (
      <AuthGuard>
        <DeleteAccountPage />
      </AuthGuard>
    ),
  },
  {
    path: "/deleteAccount",
    element: <Navigate to="/delete-account" replace />,
  },
  {
    path: "/admin",
    element: (
      <AdminGuard>
        <AdminPage />
      </AdminGuard>
    ),
  },
  {
    path: "/admin/users/:userId",
    element: (
      <AdminGuard>
        <AdminUserFilesPage />
      </AdminGuard>
    ),
  },
  {
    path: "/users/:userId",
    element: (
      <AdminGuard>
        <AdminUserFilesPage />
      </AdminGuard>
    ),
  },
  {
    path: "/auth",
    element: (
      <GuestGuard>
        <AuthPage />
      </GuestGuard>
    ),
  },
  {
    path: "/share/:token",
    element: <SharedResourcePage />,
  },
  {
    path: "/oauth-callback",
    element: <OAuthCallbackPage />,
  },
  // Redirect legacy routes to unified /auth
  {
    path: "/login",
    element: <Navigate to="/auth" replace />,
  },
  {
    path: "/register",
    element: <Navigate to="/auth" replace />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <PreferencesProvider>
              <UploadProvider>
                <RouterProvider router={router} />
              </UploadProvider>
            </PreferencesProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
