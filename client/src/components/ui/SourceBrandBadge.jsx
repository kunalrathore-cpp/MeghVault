import React from "react";
import { Icon } from "@iconify/react";
import googleDriveIcon from "@iconify-icons/logos/google-drive-2020";
import googlePhotosIcon from "@iconify-icons/logos/google-photos-2020";
import githubIcon from "@iconify-icons/logos/github-icon";
import instagramIcon from "@iconify-icons/skill-icons/instagram";

/**
 * Renders an origin source brand badge (Google Drive, MeghVault, etc.)
 *
 * @param {Object} props
 * @param {string} props.source - "google-drive" | "google-photos" | "github" | "instagram" | "meghvault"
 * @param {number} [props.size=16]
 * @param {string} [props.className=""]
 */
export function SourceBrandBadge({
  source = "meghvault",
  size = 16,
  className = "",
}) {
  const normSource = (source || "meghvault").toLowerCase();

  switch (normSource) {
    case "google-drive":
      return (
        <span
          className={`source-brand-badge badge-google-drive ${className}`}
          title="Imported from Google Drive"
        >
          <Icon icon={googleDriveIcon} width={size} height={size} />
        </span>
      );

    case "google-photos":
      return (
        <span
          className={`source-brand-badge badge-google-photos ${className}`}
          title="Imported from Google Photos"
        >
          <Icon icon={googlePhotosIcon} width={size} height={size} />
        </span>
      );

    case "github":
      return (
        <span
          className={`source-brand-badge badge-github ${className}`}
          title="Imported from GitHub"
        >
          <Icon icon={githubIcon} width={size} height={size} />
        </span>
      );

    case "instagram":
      return (
        <span
          className={`source-brand-badge badge-instagram ${className}`}
          title="Imported from Instagram"
        >
          <Icon icon={instagramIcon} width={size} height={size} />
        </span>
      );

    case "meghvault":
    default:
      return (
        <span
          className={`source-brand-badge badge-meghvault ${className}`}
          title="MeghVault Native Upload"
        >
          <img
            src="/meghvault-logo.svg"
            alt="MeghVault"
            width={size}
            height={size}
            style={{ borderRadius: "2px" }}
          />
        </span>
      );
  }
}
