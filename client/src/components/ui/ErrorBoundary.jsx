import React, { Component } from "react";
import { LuCircleAlert, LuHouse, LuRotateCw } from "react-icons/lu";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--bg-primary)",
            padding: "20px",
            boxSizing: "border-box",
            fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
          }}
        >
          <div
            style={{
              maxWidth: "460px",
              width: "100%",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-light)",
              borderRadius: "16px",
              padding: "36px 28px",
              textAlign: "center",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                color: "var(--danger, #ef4444)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <LuCircleAlert size={32} />
            </div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-muted)",
                marginBottom: "24px",
                lineHeight: 1.5,
              }}
            >
              An unexpected display issue occurred. You can reload this page or return to your Drive.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-strong, #cbd5e1)",
                  backgroundColor: "var(--bg-hover, #f1f5f9)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                }}
              >
                <LuRotateCw size={15} />
                <span>Reload</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--primary, #2563eb)",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                }}
              >
                <LuHouse size={15} />
                <span>Go to Drive</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
