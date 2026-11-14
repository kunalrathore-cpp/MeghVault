import React, { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const type = searchParams.get("type") || "GOOGLE_OAUTH_SUCCESS";
    const error = searchParams.get("error") || null;
    const payload = { type, error, timestamp: Date.now() };

    // 1. Post to opener if still reachable
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch {}

    // 2. BroadcastChannel across all tabs/windows on localhost:5173
    try {
      const channel = new BroadcastChannel("meghvault_oauth_channel");
      channel.postMessage(payload);
      channel.close();
    } catch {}

    // 3. LocalStorage event as reliable cross-tab fallback
    try {
      localStorage.setItem("meghvault_oauth_event", JSON.stringify(payload));
    } catch {}

    // 4. Close this popup window immediately
    window.close();

    // Fallback: If window.close() is blocked (e.g. user opened link in a full browser tab), redirect to home
    const fallbackTimer = setTimeout(() => {
      navigate("/", { replace: true });
    }, 600);

    return () => clearTimeout(fallbackTimer);
  }, [searchParams, navigate]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f172a",
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "20px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            border: "3px solid rgba(255, 255, 255, 0.15)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>
          Authentication Complete
        </h3>
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
          Closing this window...
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default OAuthCallbackPage;
