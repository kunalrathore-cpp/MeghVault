import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import directoryRoutes from "./routes/directory.route.js";
import fileRoutes from "./routes/file.route.js";
import userRoutes from "./routes/user.route.js";
import otpRoutes from "./routes/otp.route.js";
import authRoutes from "./routes/auth.route.js";
import googleDriveRoutes from "./routes/googleDrive.route.js";
import googlePhotosRoutes from "./routes/googlePhotos.route.js";
import githubIntegrationRoutes from "./routes/githubIntegration.route.js";
import adminRoutes from "./routes/admin.route.js";
import shareRoutes from "./routes/share.route.js";
import starredRoutes from "./routes/starred.route.js";
import trashRoutes from "./routes/trash.route.js";
import activityRoutes from "./routes/activity.route.js";
import detailsRoutes from "./routes/details.route.js";
import moveRoutes from "./routes/move.route.js";
import deleteAccountRoutes from "./routes/deleteAccount.route.js";
import checkAuth from "./middlewares/auth.middleware.js";
import adminVerify from "./middlewares/adminVerify.middleware.js";
import { sanitizeRequestMiddleware } from "./middlewares/sanitize.middleware.js";
import { securityHeadersMiddleware } from "./middlewares/securityHeaders.middleware.js";
import { globalRateLimiter } from "./middlewares/rateLimit.middleware.js";
import { connectDB } from "./config/db.js";

// connectDB
await connectDB();
// Express Setup
const app = express();
const port = process.env.PORT || 4000;

// Trust reverse proxy (enables accurate client IP extraction for rate limiting behind Cloudflare/Nginx/Render)
app.set("trust proxy", 1);

// Production-level Security Headers (A+ Rating on SecurityHeaders/Snyk)
app.use(securityHeadersMiddleware);

// Help to Parse the Cookie Values
const mySecretKey = process.env.MY_SECERT_KEY;
app.use(cookieParser(mySecretKey));

// parse the data which comes in chunk format and the attach it into req.body
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Global DOMPurify request sanitizer to scrub XSS, script payloads, and HTML injection
app.use(sanitizeRequestMiddleware);

// enabling cors for all route request
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Global DoS Shield: Protects backend from volumetric request floods and scraping
app.use(globalRateLimiter);

// Auth Routes
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);

// Google Drive Integration Routes
app.use("/api/google-drive", googleDriveRoutes);
app.use("/auth/google-drive", googleDriveRoutes);

// Google Photos Integration Routes
app.use("/api/google-photos", googlePhotosRoutes);
app.use("/auth/google-photos", googlePhotosRoutes);

// GitHub Repository Integration Routes
app.use("/api/github", githubIntegrationRoutes);

// Directory Routes
app.use("/api/directory", checkAuth, directoryRoutes);

// File Routes (direct view and streaming routes natively handled)
app.use("/api/file", checkAuth, fileRoutes);

// User Routes
app.use("/api/user", userRoutes);

// Dedicated Delete Account Routes
app.use("/api/delete-account", deleteAccountRoutes);

// Admin Routes (Strictly protected with checkAuth + adminVerify)
app.use("/api/admin", checkAuth, adminVerify, adminRoutes);

// Share & ReBAC Fine-Grained Authorization Routes
app.use("/api/share", shareRoutes);

// Starred Items Routes
app.use("/api/starred", checkAuth, starredRoutes);

// Trash (Recycle Bin / Soft Delete) Routes
app.use("/api/trash", checkAuth, trashRoutes);

// Recent Activities (Audit Feed & Timeline) Routes
app.use("/api/recent", checkAuth, activityRoutes);
app.use("/api/activity", checkAuth, activityRoutes);

// File & Folder Comprehensive Details / Inspector Routes
app.use("/api/details", checkAuth, detailsRoutes);

// File & Folder Move Routes
app.use("/api/items", checkAuth, moveRoutes);

// OTP Router
app.use("/api/otp", otpRoutes);

// Global Middleware Handler
app.use((err, req, res, next) => {
  // If response headers have already been sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }
  // Ignore standard client-side stream disconnects
  const clientAbortCodes = ["ECONNABORTED", "ECANCELED", "ECONNRESET", "EPIPE"];
  if (clientAbortCodes.includes(err.code)) {
    return;
  }
  console.error("Unhandled Application Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`App listening on port ${port} (0.0.0.0)`);
});
