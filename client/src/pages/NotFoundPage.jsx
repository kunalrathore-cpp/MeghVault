import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LuHouse,
  LuArrowLeft,
  LuCloudOff,
  LuSun,
  LuMoon,
} from "react-icons/lu";
import { useTheme } from "../context/ThemeContext";

export function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="not-found-page-wrapper">
      {/* Top Floating Header */}
      <header className="not-found-header">
        <Link to="/" className="not-found-brand" title="Return to MeghVault">
          <img
            src="/meghvault-logo.svg"
            alt="MeghVault"
            className="not-found-logo-img"
          />
          <span className="brand-name">
            Megh<span className="brand-vault-text">Vault</span>
          </span>
        </Link>

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="not-found-theme-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme mode"
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
        >
          {theme === "dark" ? <LuSun size={18} /> : <LuMoon size={18} />}
        </button>
      </header>

      {/* Main 404 Hero Card */}
      <main className="not-found-main-content">
        <div className="not-found-card">
          {/* Visual Icon Badge */}
          <div className="not-found-icon-glow">
            <div className="not-found-icon-inner">
              <LuCloudOff size={38} />
            </div>
          </div>

          {/* 404 Big Gradient Number */}
          <div className="not-found-code-text">404</div>

          {/* Headings */}
          <h1 className="not-found-title">Page Not Found</h1>
          <p className="not-found-desc">
            The page or folder you are looking for doesn't exist, has been
            moved, or the URL might be mistyped.
          </p>

          {/* Path Chip */}
          <div className="not-found-path-box">
            <span className="path-label">Requested:</span>
            <code className="path-code">{location.pathname}</code>
          </div>

          {/* Action Navigation Buttons */}
          <div className="not-found-actions-group">
            <Link to="/" className="not-found-btn-primary">
              <LuHouse size={16} />
              <span>Go to My Drive</span>
            </Link>

            <button
              type="button"
              className="not-found-btn-secondary"
              onClick={() => navigate(-1)}
            >
              <LuArrowLeft size={16} />
              <span>Go Back</span>
            </button>
          </div>
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="not-found-footer">
        <span>© {new Date().getFullYear()} MeghVault. Secure Cloud Storage.</span>
      </footer>
    </div>
  );
}
