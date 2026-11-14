import crypto from "crypto";
import Directory from "../models/directory.model.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import {
  generateDriveAuthUrl,
  exchangeDriveCode,
  saveUserDriveCredentials,
  getAuthenticatedDriveClient,
} from "../services/googleDriveAuth.service.js";
import { importGoogleDriveBatch } from "../services/googleDriveImport.service.js";

/**
 * Generate Google Drive authorization URL for popup window
 */
export async function getAuthUrlHandler(req, res) {
  try {
    const user = req.foundUser;
    const statePayload = Buffer.from(
      JSON.stringify({
        userId: user._id.toString(),
        time: Date.now(),
        random: crypto.randomBytes(8).toString("hex"),
      })
    ).toString("base64url");

    const authUrl = generateDriveAuthUrl(statePayload);
    return res.status(200).json({ url: authUrl });
  } catch (error) {
    console.error("Error generating Google Drive auth URL:", error);
    return res.status(500).json({ error: error.message || "Failed to generate auth URL" });
  }
}

/**
 * OAuth2 redirect callback endpoint from Google Drive consent screen
 */
export async function callbackHandler(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error("Google Drive OAuth error:", oauthError);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: "GOOGLE_DRIVE_ERROR", error: ${JSON.stringify(oauthError)} }, "http://localhost:5173");
              window.close();
            } else {
              window.location.href = "http://localhost:5173";
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send("Authorization code missing.");
  }

  try {
    let userId = null;

    const { sid } = req.signedCookies || {};
    if (sid) {
      const finalSid = Buffer.from(sid, "base64url").toString();
      const session = await Session.findById(finalSid).lean();
      if (session) {
        userId = session.userId;
      }
    }

    if (!userId && state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        userId = decoded.userId;
      } catch (e) {
        console.warn("Could not decode state payload:", e.message);
      }
    }

    if (!userId) {
      return res.status(401).send("Could not authenticate session. Please log in again.");
    }

    const { tokens, email } = await exchangeDriveCode(code);
    await saveUserDriveCredentials(userId, { tokens, email });

    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Connected</title></head>
        <body style="font-family: system-ui, sans-serif; display: grid; place-content: center; height: 100vh; text-align: center; background: #0f172a; color: white;">
          <div>
            <h3>Google Drive Connected!</h3>
            <p style="color: #94a3b8;">Closing window...</p>
          </div>
          <script>
            let sent = false;
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: "GOOGLE_DRIVE_CONNECTED" }, "http://localhost:5173");
                sent = true;
                window.close();
              }
            } catch (err) {}
            if (!sent) {
              window.location.replace("http://localhost:5173/oauth-callback?type=GOOGLE_DRIVE_CONNECTED");
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Google Drive callback handling failed:", error);
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Error</title></head>
        <body style="font-family: system-ui, sans-serif; display: grid; place-content: center; height: 100vh; text-align: center; background: #0f172a; color: white;">
          <div>
            <h3>Connection Error</h3>
            <p style="color: #ef4444;">${error.message}</p>
          </div>
          <script>
            let sent = false;
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: "GOOGLE_DRIVE_ERROR", error: ${JSON.stringify(error.message)} }, "http://localhost:5173");
                sent = true;
                window.close();
              }
            } catch (err) {}
            if (!sent) {
              window.location.replace("http://localhost:5173/oauth-callback?type=GOOGLE_DRIVE_ERROR&error=" + encodeURIComponent(${JSON.stringify(error.message)}));
            }
          </script>
        </body>
      </html>
    `);
  }
}

/**
 * Return current Google Drive integration status and active access token for picker
 */
export async function getStatusHandler(req, res) {
  try {
    const user = req.foundUser;
    const integration = user.integrations?.googleDrive;

    if (!integration?.connected) {
      return res.status(200).json({ connected: false });
    }

    try {
      const { accessToken, email } = await getAuthenticatedDriveClient(user._id);
      return res.status(200).json({
        connected: true,
        email: email || integration.email,
        accessToken,
      });
    } catch (err) {
      console.warn("Google Drive token verification failed:", err.message);
      return res.status(200).json({
        connected: false,
        message: "Google Drive session expired, please reconnect.",
      });
    }
  } catch (error) {
    console.error("Error retrieving Google Drive status:", error);
    return res.status(500).json({ error: "Failed to retrieve status" });
  }
}

/**
 * List files and folders from user's Google Drive securely server-to-server
 */
export async function listFilesHandler(req, res) {
  try {
    const user = req.foundUser;
    const { folderId = "root", search = "", pageToken } = req.query;

    const { drive } = await getAuthenticatedDriveClient(user._id);

    let q = "trashed = false";
    if (search && search.trim()) {
      const safeSearch = search.trim().replace(/'/g, "\\'");
      q += ` and name contains '${safeSearch}'`;
    } else {
      q += ` and '${folderId || "root"}' in parents`;
    }

    const response = await drive.files.list({
      q,
      fields:
        "nextPageToken, files(id, name, mimeType, iconLink, thumbnailLink, size, modifiedTime)",
      orderBy: "folder,name",
      pageSize: 100,
      pageToken: pageToken || undefined,
    });

    return res.status(200).json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || null,
      folderId: folderId || "root",
    });
  } catch (error) {
    console.error("Error listing Google Drive files:", error);
    return res.status(500).json({
      error: error.message || "Failed to list files from Google Drive",
    });
  }
}

/**
 * Import chosen files/folders into a target directory in MeghVault.
 * Streams real-time progress events using NDJSON so the browser progress bar never freezes,
 * and handles client cancellation immediately.
 */
export async function importItemsHandler(req, res) {
  const abortController = new AbortController();
  let isAborted = false;

  res.on("close", () => {
    if (!res.writableEnded) {
      isAborted = true;
      abortController.abort();
    }
  });

  req.on("aborted", () => {
    isAborted = true;
    abortController.abort();
  });

  try {
    const user = req.foundUser;
    const { items, targetDirId } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided for import" });
    }

    const effectiveTargetDirId = targetDirId || user.rootDirId;

    const directory = await Directory.findOne({
      _id: effectiveTargetDirId,
      userId: user._id,
    }).lean();

    if (!directory) {
      return res.status(404).json({ error: "Target directory not found" });
    }

    const { drive } = await getAuthenticatedDriveClient(user._id);

    // Set NDJSON streaming headers to deliver real-time progress
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering if behind Nginx

    const sendEvent = (data) => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(JSON.stringify(data) + "\n");
        } catch {}
      }
    };

    const importResults = await importGoogleDriveBatch({
      drive,
      items,
      userId: user._id,
      targetDirId: effectiveTargetDirId,
      signal: abortController.signal,
      checkAborted: () => isAborted || abortController.signal.aborted,
      onProgress: (progressData) => {
        sendEvent(progressData);
      },
    });

    if (isAborted || abortController.signal.aborted || importResults?.cancelled) {
      sendEvent({ type: "cancelled", error: "Import cancelled" });
      if (!res.writableEnded) res.end();
      return;
    }

    sendEvent({
      type: "complete",
      message: "Import finished successfully",
      ...importResults,
    });
    if (!res.writableEnded) res.end();
  } catch (error) {
    if (isAborted || abortController.signal.aborted) {
      if (!res.headersSent) {
        return res.status(499).json({ error: "Import cancelled" });
      }
      if (!res.writableEnded) {
        res.write(JSON.stringify({ type: "cancelled", error: "Import cancelled" }) + "\n");
        res.end();
      }
      return;
    }

    console.error("Error during Google Drive batch import:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Import failed" });
    }
    if (!res.writableEnded) {
      res.write(JSON.stringify({ type: "error", error: error.message || "Import failed" }) + "\n");
      res.end();
    }
  }
}

/**
 * Disconnect Google Drive integration
 */
export async function disconnectHandler(req, res) {
  try {
    const user = req.foundUser;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "integrations.googleDrive.connected": false,
          "integrations.googleDrive.refreshToken": null,
          "integrations.googleDrive.accessToken": null,
          "integrations.googleDrive.expiryDate": null,
        },
      }
    );
    return res.status(200).json({ message: "Google Drive disconnected successfully" });
  } catch (error) {
    console.error("Error disconnecting Google Drive:", error);
    return res.status(500).json({ error: "Failed to disconnect Google Drive" });
  }
}
