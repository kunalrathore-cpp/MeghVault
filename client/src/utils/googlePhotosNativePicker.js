import { googlePhotosApi } from "../api/googlePhotosApi";

/**
 * Launch Google Photos official Native Picker (photospicker.googleapis.com)
 *
 * @param {Object} options
 * @param {Function} options.onPicked - (items: Array) => void
 * @param {Function} [options.onCancel] - () => void
 * @param {Function} [options.onError] - (err: Error) => void
 * @param {Function} [options.onStatusChange] - (status: string) => void
 * @returns {Promise<{ cancel: () => void }>}
 */
export async function openNativeGooglePhotosPicker({
  onPicked,
  onCancel,
  onError,
  onStatusChange,
}) {
  let isCancelled = false;
  let pollInterval = null;
  let popupWindow = null;

  const cancel = () => {
    isCancelled = true;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    try {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
    } catch {
      // Ignore cross-origin close errors
    }
    onCancel?.();
  };

  try {
    if (onStatusChange) onStatusChange("initiating");

    // 1. Create short-lived picking session with photospicker.googleapis.com
    console.log("[GooglePhotosPicker] Creating picking session with Google Picker API...");
    const { sessionId, pickerUri } = await googlePhotosApi.createPickerSession();

    if (!pickerUri || !sessionId) {
      throw new Error("No picker URI returned from Google Photos Picker API");
    }

    console.log("[GooglePhotosPicker] Session created:", { sessionId, pickerUri });

    const width = 680;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupWindow = window.open(
      pickerUri,
      "google_photos_picker_window",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popupWindow) {
      throw new Error("Popup blocked! Please allow popups for localhost / turn Shields DOWN.");
    }

    if (onStatusChange) onStatusChange("picking");

    let isCompleted = false;
    let pollCount = 0;
    const MAX_POLLS = 150; // 150 polls * 2s = 5 minutes of picking window

    // 2. Poll session status every 2 seconds
    pollInterval = setInterval(async () => {
      if (isCompleted || isCancelled) {
        if (pollInterval) clearInterval(pollInterval);
        return;
      }

      pollCount++;
      if (pollCount > MAX_POLLS) {
        console.warn("[GooglePhotosPicker] Session polling timed out after 5 minutes.");
        if (pollInterval) clearInterval(pollInterval);
        cancel();
        return;
      }

      try {
        // Poll session status from backend
        const status = await googlePhotosApi.getPickerSessionStatus(sessionId);
        console.log(`[GooglePhotosPicker] Poll #${pollCount} status:`, status);

        if (status?.mediaItemsSet) {
          isCompleted = true;
          if (pollInterval) clearInterval(pollInterval);

          try {
            if (popupWindow && !popupWindow.closed) {
              popupWindow.close();
            }
          } catch {
            // Popup may already be closing via /autoclose
          }

          if (onStatusChange) onStatusChange("fetching");
          console.log("[GooglePhotosPicker] mediaItemsSet is TRUE! Fetching selected items...");

          // Retrieve picked media items
          const { items } = await googlePhotosApi.getPickerSessionItems(sessionId);
          console.log("[GooglePhotosPicker] Retrieved items:", items);

          if (items && items.length > 0) {
            onPicked?.(items);
          } else {
            console.warn("[GooglePhotosPicker] User completed picker but 0 items were returned.");
            onCancel?.();
          }
        }
      } catch (pollErr) {
        // Non-fatal poll error, keep trying until timeout
        console.warn(`[GooglePhotosPicker] Poll #${pollCount} error:`, pollErr.message);
      }
    }, 2000);

    return { cancel };
  } catch (err) {
    console.error("[GooglePhotosPicker] Error opening Google Photos Native Picker:", err);
    if (pollInterval) clearInterval(pollInterval);
    onError?.(err);
    return { cancel: () => {} };
  }
}
