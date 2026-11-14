import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import googleDriveIcon from "@iconify-icons/logos/google-drive-2020";
import githubIcon from "@iconify-icons/logos/github-icon";
import googlePhotosIcon from "@iconify-icons/logos/google-photos-2020";
import instagramIcon from "@iconify-icons/skill-icons/instagram";
import { useToast } from "../../context/ToastContext";
import { useUpload } from "../../context/UploadContext";
import { googleDriveApi } from "../../api/googleDriveApi";
import { googlePhotosApi } from "../../api/googlePhotosApi";
import { githubApi } from "../../api/githubApi";
import { openNativeGooglePhotosPicker } from "../../utils/googlePhotosNativePicker";
import { GoogleDrivePickerModal } from "../modals/GoogleDrivePickerModal";
import { GithubRepoPickerModal } from "../modals/GithubRepoPickerModal";

export function ImportSourcesBar({ currentDirId = null, onImportSuccess }) {
  const { showSuccess, showError } = useToast();
  const { enqueueCloudImport } = useUpload();

  // Google Drive state
  const [driveLoadingState, setDriveLoadingState] = useState(null); // null | "connecting"
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);

  // Google Photos state
  const [photosLoadingState, setPhotosLoadingState] = useState(null); // null | "connecting" | "picking"

  // GitHub state
  const [githubLoadingState, setGithubLoadingState] = useState(null); // null | "connecting"
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [connectedGithubUser, setConnectedGithubUser] = useState(null);

  const handleLaunchGooglePhotosNativePicker = useCallback(async () => {
    if (photosLoadingState === "picking") return;

    try {
      setPhotosLoadingState("picking");
      showSuccess("Google Photos window opened. Select your photos and click Done.");

      await openNativeGooglePhotosPicker({
        onPicked: (pickedItems) => {
          setPhotosLoadingState(null);
          enqueueCloudImport({
            items: pickedItems,
            source: "google-photos",
            targetDirId: currentDirId,
          });
          showSuccess(
            `Importing ${pickedItems.length} photo${pickedItems.length === 1 ? "" : "s"} from Google Photos...`
          );
          if (onImportSuccess) onImportSuccess();
        },
        onCancel: () => {
          setPhotosLoadingState(null);
        },
        onError: (err) => {
          setPhotosLoadingState(null);
          showError(err.message || "Failed to import from Google Photos.");
        },
      });
    } catch (err) {
      setPhotosLoadingState(null);
      showError(err.message || "Failed to launch Google Photos Picker.");
    }
  }, [
    photosLoadingState,
    showSuccess,
    showError,
    enqueueCloudImport,
    currentDirId,
    onImportSuccess,
  ]);

  // Listen for popup OAuth callback messages (Google Drive & Google Photos)
  useEffect(() => {
    const processAuthData = async (data) => {
      if (!data?.type) return;

      // Handle Google Drive OAuth callbacks
      if (data.type === "GOOGLE_DRIVE_CONNECTED") {
        showSuccess("Google Drive connected successfully!");
        try {
          const status = await googleDriveApi.getStatus();
          if (status.connected) {
            setConnectedEmail(status.email || null);
            setIsDriveModalOpen(true);
          }
        } catch {
          showError("Could not verify Google Drive connection.");
        } finally {
          setDriveLoadingState(null);
        }
      } else if (data.type === "GOOGLE_DRIVE_ERROR") {
        setDriveLoadingState(null);
        showError(data.error || "Connection cancelled. If using Brave, try turning Shields DOWN for this site.");
      }

      // Handle Google Photos OAuth callbacks
      if (data.type === "GOOGLE_PHOTOS_CONNECTED") {
        showSuccess("Google Photos connected successfully!");
        setPhotosLoadingState(null);
        // Automatically launch native picker now that user is connected
        handleLaunchGooglePhotosNativePicker();
      } else if (data.type === "GOOGLE_PHOTOS_ERROR") {
        setPhotosLoadingState(null);
        showError(
          data.error ||
            "Connection cancelled. If using Brave, try turning Shields DOWN for this site."
        );
      }

      // Handle GitHub Repository OAuth callbacks
      if (data.type === "GITHUB_INTEGRATION_CONNECTED") {
        showSuccess("GitHub connected successfully!");
        try {
          const status = await githubApi.getStatus();
          if (status.connected) {
            setConnectedGithubUser(status);
            setIsGithubModalOpen(true);
          }
        } catch {
          showError("Could not verify GitHub connection.");
        } finally {
          setGithubLoadingState(null);
        }
      } else if (data.type === "GITHUB_INTEGRATION_ERROR") {
        setGithubLoadingState(null);
        showError(data.error || "GitHub connection was cancelled.");
      }
    };

    const handleAuthMessage = async (event) => {
      // Validate origin
      if (
        event.origin !== window.location.origin &&
        event.origin !== "http://localhost:4000" &&
        event.origin !== "http://localhost:5173"
      ) {
        return;
      }
      processAuthData(event.data);
    };

    window.addEventListener("message", handleAuthMessage);

    // BroadcastChannel listener
    let channel = null;
    try {
      channel = new BroadcastChannel("meghvault_oauth_channel");
      channel.onmessage = (event) => processAuthData(event.data);
    } catch {}

    // Storage fallback listener
    const storageHandler = (event) => {
      if (event.key === "meghvault_oauth_event" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          processAuthData(parsed);
        } catch {}
      }
    };
    window.addEventListener("storage", storageHandler);

    return () => {
      window.removeEventListener("message", handleAuthMessage);
      window.removeEventListener("storage", storageHandler);
      if (channel) {
        try { channel.close(); } catch {}
      }
    };
  }, [showError, showSuccess, handleLaunchGooglePhotosNativePicker]);

  const handleGoogleDriveClick = async () => {
    if (driveLoadingState) return;

    try {
      setDriveLoadingState("connecting");

      // 1. Check if user already has an active Google Drive connection
      const status = await googleDriveApi.getStatus();

      if (status.connected) {
        setConnectedEmail(status.email || null);
        setIsDriveModalOpen(true);
        setDriveLoadingState(null);
        return;
      }

      // 2. Not connected: request authorization URL and open popup
      const { url } = await googleDriveApi.getAuthUrl();

      const width = 540;
      const height = 660;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        url,
        "google_drive_oauth",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!popup) {
        setDriveLoadingState(null);
        showError("Popup blocked! If using Brave, click the Lion Shield icon and allow popups / turn Shields DOWN.");
        return;
      }

      // Timer in case popup is closed by user without completing
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          if (driveLoadingState === "connecting") {
            setDriveLoadingState(null);
          }
        }
      }, 1000);
    } catch (err) {
      setDriveLoadingState(null);
      showError(err.message || "Failed to initialize Google Drive connection.");
    }
  };

  const handleGooglePhotosClick = async () => {
    if (photosLoadingState) return;

    try {
      setPhotosLoadingState("connecting");

      // 1. Check if user already has an active Google Photos connection
      const status = await googlePhotosApi.getStatus();

      if (status.connected) {
        // Connected: directly launch Google Official Native Picker!
        await handleLaunchGooglePhotosNativePicker();
        return;
      }

      // 2. Not connected: request authorization URL and open popup
      const { url } = await googlePhotosApi.getAuthUrl();

      const width = 540;
      const height = 660;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        url,
        "google_photos_oauth",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!popup) {
        setPhotosLoadingState(null);
        showError("Popup blocked! If using Brave, click the Lion Shield icon and allow popups / turn Shields DOWN.");
        return;
      }

      // Timer in case popup is closed by user without completing
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          if (photosLoadingState === "connecting") {
            setPhotosLoadingState(null);
          }
        }
      }, 1000);
    } catch (err) {
      setPhotosLoadingState(null);
      showError(err.message || "Failed to initialize Google Photos connection.");
    }
  };

  const handleGithubClick = async () => {
    if (githubLoadingState) return;

    try {
      setGithubLoadingState("connecting");

      // 1. Check if user already has an active GitHub repository connection
      const status = await githubApi.getStatus();

      if (status.connected) {
        setConnectedGithubUser(status);
        setIsGithubModalOpen(true);
        setGithubLoadingState(null);
        return;
      }

      // 2. Not connected: open popup window synchronously to prevent popup blockers
      const width = 540;
      const height = 680;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        "about:blank",
        "github_integration_popup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      // 3. Request authorization URL
      const { url } = await githubApi.getAuthUrl();

      if (popup) {
        popup.location.href = url;
      } else {
        window.location.href = url;
        return;
      }

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          if (githubLoadingState === "connecting") {
            setGithubLoadingState(null);
          }
        }
      }, 1000);
    } catch (err) {
      setGithubLoadingState(null);
      showError(err.message || "Failed to initialize GitHub connection.");
    }
  };

  const handleDisconnectGithub = async () => {
    try {
      await githubApi.disconnect();
      setConnectedGithubUser(null);
      setIsGithubModalOpen(false);
      showSuccess("GitHub disconnected successfully.");
    } catch (err) {
      showError(err.message || "Failed to disconnect GitHub.");
    }
  };

  const handleComingSoon = (serviceName) => {
    showSuccess(`${serviceName} integration is coming next!`);
  };

  return (
    <>
      <div className="import-sources-bar">
        {/* Import from Google Drive */}
        <button
          type="button"
          className={`import-source-pill-btn ${driveLoadingState ? "loading" : ""}`}
          onClick={handleGoogleDriveClick}
          disabled={Boolean(driveLoadingState)}
          title="Import files and folders from Google Drive"
        >
          <span className="source-icon-wrap">
            <Icon icon={googleDriveIcon} width={20} height={20} />
          </span>
          <span className="source-btn-text">
            {driveLoadingState === "connecting"
              ? "Connecting..."
              : driveLoadingState === "picking"
              ? "Choosing in Drive..."
              : "Import from Drive"}
          </span>
        </button>

        {/* Import with Google Photos */}
        <button
          type="button"
          className={`import-source-pill-btn ${photosLoadingState ? "loading" : ""}`}
          onClick={handleGooglePhotosClick}
          disabled={Boolean(photosLoadingState)}
          title="Import photos and albums from Google Photos"
        >
          <span className="source-icon-wrap">
            <Icon icon={googlePhotosIcon} width={20} height={20} />
          </span>
          <span className="source-btn-text">
            {photosLoadingState === "connecting"
              ? "Connecting..."
              : photosLoadingState === "picking"
              ? "Choosing in Photos..."
              : "Import with Google Photos"}
          </span>
        </button>

        {/* Import Github Repo */}
        <button
          type="button"
          className={`import-source-pill-btn ${githubLoadingState ? "loading" : ""}`}
          onClick={handleGithubClick}
          disabled={Boolean(githubLoadingState)}
          title="Import repositories from GitHub"
        >
          <span className="source-icon-wrap github-icon-wrap">
            <Icon icon={githubIcon} width={20} height={20} />
          </span>
          <span className="source-btn-text">
            {githubLoadingState === "connecting"
              ? "Connecting..."
              : "Import Github Repo"}
          </span>
        </button>

        {/* Import with Instagram */}
        <button
          type="button"
          className="import-source-pill-btn"
          onClick={() => handleComingSoon("Instagram")}
          title="Import with Instagram"
        >
          <span className="source-icon-wrap">
            <Icon icon={instagramIcon} width={20} height={20} />
          </span>
          <span className="source-btn-text">Import with Instagram</span>
        </button>
      </div>

      {/* Privacy-First Google Drive Explorer Modal (100% Immune to Brave Shields & Cookie Blocks) */}
      <GoogleDrivePickerModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        targetDirId={currentDirId}
        userEmail={connectedEmail}
        onImportSuccess={onImportSuccess}
      />

      {/* GitHub Repository Picker Modal */}
      <GithubRepoPickerModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        targetDirId={currentDirId}
        connectedUser={connectedGithubUser}
        onDisconnect={handleDisconnectGithub}
        onImportSuccess={onImportSuccess}
      />
    </>
  );
}
