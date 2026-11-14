import express from "express";
import checkAuth from "../middlewares/auth.middleware.js";
import {
  getGithubIntegrationAuthUrlHandler,
  getGithubIntegrationStatusHandler,
  disconnectGithubHandler,
  listRepositoriesHandler,
  listBranchesHandler,
  importRepositoriesHandler,
} from "../controller/githubIntegration.controller.js";
import {
  validate,
  githubImportValidator,
  githubBranchParamValidator,
} from "../validators/index.js";
import { integrationRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { bulkImportThrottler } from "../middlewares/throttler.middleware.js";

const router = express.Router();

// All GitHub repository integration endpoints require an active MeghVault user session
router.use(checkAuth);

router.get("/auth-url", getGithubIntegrationAuthUrlHandler);
router.get("/status", getGithubIntegrationStatusHandler);
router.post("/disconnect", disconnectGithubHandler);
router.get("/repos", listRepositoriesHandler);
router.get(
  "/repos/:owner/:repo/branches",
  validate(githubBranchParamValidator),
  listBranchesHandler
);
router.post(
  "/import",
  bulkImportThrottler,
  integrationRateLimiter,
  validate(githubImportValidator),
  importRepositoriesHandler
);

export default router;
