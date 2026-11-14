import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { DeleteAccountCard } from "../components/account/DeleteAccountCard";
import { LuArrowLeft, LuShieldAlert } from "react-icons/lu";

export function DeleteAccountPage() {
  const navigate = useNavigate();

  return (
    <AppLayout showNavbar={true} canUpload={false}>
      <div className="profile-container" style={{ paddingBottom: "60px" }}>
        {/* Back Link */}
        <div style={{ marginBottom: "16px" }}>
          <Link
            to="/settings?tab=account"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--text-muted)",
              fontSize: "0.88rem",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color var(--transition-fast)",
            }}
          >
            <LuArrowLeft size={16} />
            <span>Back to Settings</span>
          </Link>
        </div>

        {/* Hero Header */}
        <div className="settings-hero-header" style={{ marginBottom: "24px" }}>
          <div
            className="settings-hero-icon-box"
            style={{
              background: "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
            }}
          >
            <LuShieldAlert size={28} />
          </div>
          <div className="settings-hero-titles">
            <h1 className="settings-hero-title" style={{ color: "#ef4444" }}>
              Delete My Account
            </h1>
            <p className="settings-hero-desc">
              Irreversible account destruction, data wiping, and permanent access revocation
            </p>
          </div>
        </div>

        {/* Dedicated Delete Account Card Component */}
        <DeleteAccountCard
          onCancelled={() => navigate("/settings?tab=account")}
          onDeleted={() => {
            // Handled inside card
          }}
        />
      </div>
    </AppLayout>
  );
}

export default DeleteAccountPage;
