/**
 * Utility to render popup HTML response for OAuth flows.
 * Dispatches postMessage back to parent window (window.opener) and closes the popup.
 */
export function renderPopupResponse(
  res,
  {
    success,
    error,
    successType = "GOOGLE_OAUTH_SUCCESS",
    errorType = "GOOGLE_OAUTH_ERROR",
  }
) {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173";
  const safeError = error ? String(error).replace(/"/g, '\\"') : "";
  const eventPayload = success
    ? { type: successType }
    : { type: errorType, error: safeError };

  const script = `
    const payload = ${JSON.stringify(eventPayload)};
    const clientOrigin = "${clientOrigin}";

    // 1. Try posting to window.opener if attached
    let sentToOpener = false;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, clientOrigin);
        sentToOpener = true;
      }
    } catch (e) {
      console.warn("Could not postMessage to opener:", e);
    }

    // 2. If opener was present and notified, close popup immediately
    if (sentToOpener) {
      window.close();
    } else {
      // 3. Opener was severed by browser cross-origin policy!
      // Redirect to client receiver page which will broadcast locally on the client origin and close
      const redirectUrl = "${clientOrigin}/oauth-callback?type=" + encodeURIComponent(payload.type) + (payload.error ? "&error=" + encodeURIComponent(payload.error) : "");
      window.location.replace(redirectUrl);
    }
  `;

  return res.status(success ? 200 : 400).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${success ? "Signing in..." : "Authentication Error"}</title>
      <style>
        body {
          margin: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          padding: 20px;
        }
        .container {
          max-width: 400px;
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(255, 255, 255, 0.15);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="container">
        ${
          success
            ? '<div class="spinner"></div><p>Authentication complete. Redirecting...</p>'
            : `<p style="color: #ef4444; font-weight: 600;">${safeError || "Authentication failed"}</p>`
        }
      </div>
      <script>
        ${script}
      </script>
    </body>
    </html>
  `);
}
