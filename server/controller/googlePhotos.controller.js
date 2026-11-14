import crypto from "crypto";
import Directory from "../models/directory.model.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import {
  generatePhotosAuthUrl,
  exchangePhotosCode,
  saveUserPhotosCredentials,
  getAuthenticatedPhotosClient,
} from "../services/googlePhotosAuth.service.js";
import {
  listPhotosAlbums,
  listPhotosMediaItems,
  importGooglePhotosBatch,
  createPickerSession,
  getPickerSession,
  listPickerSessionMediaItems,
} from "../services/googlePhotosImport.service.js";

/**
 * Generate Google Photos authorization URL for popup window
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

    const authUrl = generatePhotosAuthUrl(statePayload);
    return res.status(200).json({ url: authUrl });
  } catch (error) {
    console.error("Error generating Google Photos auth URL:", error);
    return res.status(500).json({ error: error.message || "Failed to generate auth URL" });
  }
}

/**
 * OAuth2 redirect callback endpoint from Google Photos consent screen
 */
export async function callbackHandler(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error("Google Photos OAuth error:", oauthError);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: "GOOGLE_PHOTOS_ERROR", error: ${JSON.stringify(oauthError)} }, "http://localhost:5173");
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

    const { tokens, email } = await exchangePhotosCode(code);
    await saveUserPhotosCredentials(userId, { tokens, email });

    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Photos Connected</title></head>
        <body style="font-family: system-ui, sans-serif; display: grid; place-content: center; height: 100vh; text-align: center; background: #0f172a; color: white;">
          <div>
            <h3>Google Photos Connected!</h3>
            <p style="color: #94a3b8;">Closing window...</p>
          </div>
          <script>
            let sent = false;
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: "GOOGLE_PHOTOS_CONNECTED" }, "http://localhost:5173");
                sent = true;
                window.close();
              }
            } catch (err) {}
            if (!sent) {
              window.location.replace("http://localhost:5173/oauth-callback?type=GOOGLE_PHOTOS_CONNECTED");
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Google Photos callback handling failed:", error);
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Photos Error</title></head>
        <body style="font-family: system-ui, sans-serif; display: grid; place-content: center; height: 100vh; text-align: center; background: #0f172a; color: white;">
          <div>
            <h3>Connection Error</h3>
            <p style="color: #ef4444;">${error.message}</p>
          </div>
          <script>
            let sent = false;
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: "GOOGLE_PHOTOS_ERROR", error: ${JSON.stringify(error.message)} }, "http://localhost:5173");
                sent = true;
                window.close();
              }
            } catch (err) {}
            if (!sent) {
              window.location.replace("http://localhost:5173/oauth-callback?type=GOOGLE_PHOTOS_ERROR&error=" + encodeURIComponent(${JSON.stringify(error.message)}));
            }
          </script>
        </body>
      </html>
    `);
  }
}

/**
 * Return current Google Photos integration status and active token
 */
export async function getStatusHandler(req, res) {
  try {
    const user = req.foundUser;
    const integration = user.integrations?.googlePhotos;

    if (!integration?.connected) {
      return res.status(200).json({ connected: false });
    }

    try {
      const { accessToken, email } = await getAuthenticatedPhotosClient(user._id);
      return res.status(200).json({
        connected: true,
        email: email || integration.email,
        accessToken,
      });
    } catch (err) {
      console.warn("Google Photos token verification failed:", err.message);
      return res.status(200).json({
        connected: false,
        message: "Google Photos session expired, please reconnect.",
      });
    }
  } catch (error) {
    console.error("Error retrieving Google Photos status:", error);
    return res.status(500).json({ error: "Failed to retrieve status" });
  }
}

/**
 * List albums from user's Google Photos Library
 */
export async function listAlbumsHandler(req, res) {
  try {
    const user = req.foundUser;
    const { pageToken } = req.query;

    const { accessToken } = await getAuthenticatedPhotosClient(user._id);
    const result = await listPhotosAlbums(accessToken, pageToken);

    return res.status(200).json(result);
  } catch (error) {
    const isLegacyRestricted =
      error.message?.includes("insufficient authentication scopes") ||
      error.message?.includes("PERMISSION_DENIED");

    if (isLegacyRestricted) {
      return res.status(200).json({ albums: [], legacyRestricted: true });
    }

    console.error("Error listing Google Photos albums:", error);
    return res.status(500).json({
      error: error.message || "Failed to list Google Photos albums",
    });
  }
}

/**
 * List media items (photos & videos) from user's Google Photos Library or an Album
 */
export async function listMediaItemsHandler(req, res) {
  try {
    const user = req.foundUser;
    const { albumId, pageToken, pageSize = 100 } = req.query;

    const { accessToken } = await getAuthenticatedPhotosClient(user._id);
    const result = await listPhotosMediaItems(accessToken, {
      albumId: albumId || null,
      pageToken: pageToken || null,
      pageSize: Number(pageSize) || 100,
    });

    return res.status(200).json(result);
  } catch (error) {
    const isLegacyRestricted =
      error.message?.includes("insufficient authentication scopes") ||
      error.message?.includes("PERMISSION_DENIED");

    if (isLegacyRestricted) {
      return res.status(200).json({ mediaItems: [], legacyRestricted: true });
    }

    console.error("Error listing Google Photos media items:", error);
    return res.status(500).json({
      error: error.message || "Failed to list Google Photos media items",
    });
  }
}

/**
 * Import chosen Google Photos and Albums into a target directory in MeghVault.
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

    const { accessToken } = await getAuthenticatedPhotosClient(user._id);

    // Set NDJSON streaming headers to deliver real-time progress
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sendEvent = (data) => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(JSON.stringify(data) + "\n");
        } catch {}
      }
    };

    const importResults = await importGooglePhotosBatch({
      accessToken,
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

    console.error("Error during Google Photos batch import:", error);
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
 * Disconnect Google Photos integration
 */
export async function disconnectHandler(req, res) {
  try {
    const user = req.foundUser;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "integrations.googlePhotos.connected": false,
          "integrations.googlePhotos.refreshToken": null,
          "integrations.googlePhotos.accessToken": null,
          "integrations.googlePhotos.expiryDate": null,
          "integrations.googlePhotos.email": null,
        },
      }
    );
    return res.status(200).json({ message: "Google Photos disconnected successfully" });
  } catch (error) {
    console.error("Error disconnecting Google Photos:", error);
    return res.status(500).json({ error: "Failed to disconnect Google Photos" });
  }
}

/**
 * Create Google Photos native picker session (Picker API)
 */
export async function createPickerSessionHandler(req, res) {
  try {
    const user = req.foundUser;
    const { accessToken } = await getAuthenticatedPhotosClient(user._id);
    const session = await createPickerSession(accessToken);
    return res.status(200).json(session);
  } catch (error) {
    console.error("Error creating Google Photos picker session:", error);
    return res.status(500).json({ error: error.message || "Failed to create picker session" });
  }
}

/**
 * Check Google Photos native picker session status (Picker API)
 */
export async function getPickerSessionStatusHandler(req, res) {
  try {
    const user = req.foundUser;
    const { sessionId } = req.params;
    const { accessToken } = await getAuthenticatedPhotosClient(user._id);
    const session = await getPickerSession(accessToken, sessionId);
    return res.status(200).json({
      sessionId: session.id,
      mediaItemsSet: Boolean(session.mediaItemsSet),
    });
  } catch (error) {
    console.error("Error checking Google Photos picker session status:", error);
    return res.status(500).json({ error: error.message || "Failed to check session status" });
  }
}

/**
 * Get items selected in Google Photos native picker session (Picker API)
 */
export async function getPickerSessionItemsHandler(req, res) {
  try {
    const user = req.foundUser;
    const { sessionId } = req.params;
    const { pageToken } = req.query;
    const { accessToken } = await getAuthenticatedPhotosClient(user._id);

    const { mediaItems, nextPageToken } = await listPickerSessionMediaItems(
      accessToken,
      sessionId,
      pageToken
    );

    console.log(
      `[GooglePhotosController] Retrieved ${mediaItems.length} picked items for session ${sessionId}`
    );

    // Transform into MeghVault standardized item structures
    const items = mediaItems.map((item) => {
      const mf = item.mediaFile || {};
      const isVideo = Boolean(
        item.type === "VIDEO" ||
        mf.mediaFileMetadata?.video ||
        (mf.mimeType || "").startsWith("video/")
      );

      const resolvedName = mf.filename || item.filename || (isVideo ? "Video.mp4" : "Photo.jpg");
      const resolvedBaseUrl = mf.baseUrl || item.baseUrl;

      return {
        id: item.id,
        name: resolvedName,
        filename: resolvedName,
        mimeType: mf.mimeType || item.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        baseUrl: resolvedBaseUrl,
        type: isVideo ? "video" : "file",
        mediaFile: mf,
        isPickerApi: true,
      };
    });

    return res.status(200).json({
      items,
      nextPageToken,
    });
  } catch (error) {
    console.error("Error fetching Google Photos picker session items:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch session items" });
  }
}
