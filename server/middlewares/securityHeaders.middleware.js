import helmet from "helmet";

const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173";

/**
 * Production-Grade Security Headers Middleware.
 * Configured to achieve an A+ Rating on SecurityHeaders.com / Snyk:
 *
 * 1. Content-Security-Policy (CSP) - Robust directives restricting execution of unauthorized scripts, objects, and styles.
 * 2. Strict-Transport-Security (HSTS) - Enforces HTTPS with 1-year max-age, subdomains, and HSTS preload flag.
 * 3. X-Frame-Options - Clickjacking mitigation (SAMEORIGIN).
 * 4. X-Content-Type-Options - Blocks MIME sniffing (nosniff).
 * 5. Referrer-Policy - Privacy & leak protection (strict-origin-when-cross-origin).
 * 6. Permissions-Policy - Disables risky browser APIs (camera, microphone, geolocation, payment, usb).
 * 7. Cross-Origin-Opener-Policy (COOP) - Isolates browsing contexts while safely supporting OAuth popup flows (same-origin-allow-popups).
 * 8. Cross-Origin-Resource-Policy (CORP) - Allows frontend to fetch streaming media, images, and audio cross-origin.
 * 9. X-Permitted-Cross-Domain-Policies - Prevents Adobe Flash/PDF policy leaks (none).
 * 10. Removes X-Powered-By - Prevents server framework fingerprinting.
 */
export const securityHeadersMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'", clientOrigin],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
          clientOrigin,
          "https://*.googleusercontent.com",
          "https://avatars.githubusercontent.com",
          "https://api.dicebear.com",
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        connectSrc: ["'self'", "https:", clientOrigin],
        mediaSrc: ["'self'", "blob:", "data:"],
        frameSrc: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "sameorigin" },
    hsts: {
      maxAge: 31536000, // 1 year (required for A+)
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xContentTypeOptions: true,
    xPermittedCrossDomainPolicies: { permittedPolicy: "none" },
    hidePoweredBy: true,
  }),
  // Permissions-Policy & COOP exception for OAuth popups
  (req, res, next) => {
    // For OAuth callback endpoints, disable COOP so the popup preserves its opener reference to the frontend
    if (
      req.path.includes("callback") ||
      req.path.includes("/auth/google") ||
      req.path.includes("/auth/github")
    ) {
      res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    }
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(), accelerometer=(), gyroscope=()"
    );
    next();
  },
];

export default securityHeadersMiddleware;
