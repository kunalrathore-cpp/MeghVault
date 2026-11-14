/**
 * Google Drive Native Picker integration utility
 */

let pickerApiLoaded = false;
let pickerLoadingPromise = null;

/**
 * Dynamically loads Google API script (https://apis.google.com/js/api.js)
 * and initializes the 'picker' module.
 */
export function loadGooglePickerApi() {
  if (pickerApiLoaded && window.google?.picker) {
    return Promise.resolve();
  }

  if (pickerLoadingPromise) {
    return pickerLoadingPromise;
  }

  pickerLoadingPromise = new Promise((resolve, reject) => {
    // If gapi is already present on window
    const onGapiReady = () => {
      if (window.gapi) {
        window.gapi.load("picker", {
          callback: () => {
            pickerApiLoaded = true;
            resolve();
          },
          onerror: () => {
            pickerLoadingPromise = null;
            reject(new Error("Failed to load Google Picker module"));
          },
        });
      } else {
        pickerLoadingPromise = null;
        reject(new Error("Google API script failed to initialize"));
      }
    };

    if (window.gapi) {
      onGapiReady();
      return;
    }

    // Otherwise create script element
    const existingScript = document.getElementById("google-api-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-api-script";
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = onGapiReady;
      script.onerror = () => {
        pickerLoadingPromise = null;
        reject(new Error("Failed to load https://apis.google.com/js/api.js"));
      };
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener("load", onGapiReady);
    }
  });

  return pickerLoadingPromise;
}

/**
 * Opens Google's native file and folder picker
 * Supports single file, multiple files, and folder selection.
 *
 * @param {Object} options
 * @param {string} options.accessToken - Valid OAuth 2.0 access token with drive.readonly scope
 * @param {Function} options.onPicked - Callback with array of picked documents: [{ id, name, mimeType, sizeBytes }, ...]
 * @param {Function} [options.onCancel] - Callback when user cancels or closes the picker
 * @param {Function} [options.onError] - Error callback
 */
export async function openNativeGooglePicker({
  accessToken,
  onPicked,
  onCancel,
  onError,
}) {
  try {
    await loadGooglePickerApi();

    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    const appId = import.meta.env.VITE_GOOGLE_APP_ID;

    if (!apiKey) {
      throw new Error("VITE_GOOGLE_API_KEY is not defined in environment variables.");
    }
    if (!accessToken) {
      throw new Error("Google OAuth access token is required to open the Picker.");
    }

    // DocsView allows browsing both files and folders
    const docsView = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);

    const origin = window.location.protocol + "//" + window.location.host;

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .setTitle("Import from Google Drive")
      .addView(docsView)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setOrigin(origin);

    if (appId) {
      pickerBuilder.setAppId(appId);
    }

    pickerBuilder.setCallback((data) => {
      if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
        const documents = data[window.google.picker.Response.DOCUMENTS] || [];
        if (onPicked) {
          onPicked(documents);
        }
      } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
        if (onCancel) {
          onCancel();
        }
      }
    });

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  } catch (err) {
    console.error("Error opening Google Picker:", err);
    if (onError) {
      onError(err);
    } else {
      alert(`Could not open Google Drive Picker: ${err.message}`);
    }
  }
}
