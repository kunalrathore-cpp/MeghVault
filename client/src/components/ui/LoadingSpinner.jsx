import React from "react";
import { LuLoader } from "react-icons/lu";

export function LoadingSpinner({ size = "2rem", message = "Loading files..." }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
        gap: "12px",
        color: "var(--text-muted)",
      }}
    >
      <LuLoader
        style={{
          fontSize: size,
          animation: "spin 1s linear infinite",
          color: "var(--primary)",
        }}
      />
      {message && <span style={{ fontSize: "0.9rem" }}>{message}</span>}
    </div>
  );
}
