import {
  getGithubCredentials,
  disconnectGithub,
  listUserRepositories,
  listRepoBranches,
  importGithubRepositories,
} from "../services/githubIntegration.service.js";
import { generateGithubAuthUrl } from "../services/githubAuth.service.js";
import { generateOAuthState } from "../utils/oauthState.util.js";
import User from "../models/user.model.js";

/**
 * Generate GitHub OAuth Authorization URL with `repo` scope for repository integration
 */
export async function getGithubIntegrationAuthUrlHandler(req, res) {
  try {
    const user = req.foundUser;
    if (!user) {
      return res.status(401).json({ error: "User session required" });
    }

    // Embed action: "repo-integration" and userId into signed state
    const state = generateOAuthState(res, {
      action: "repo-integration",
      userId: user._id.toString(),
    });

    // Request `repo read:user user:email` scopes
    const url = generateGithubAuthUrl(state, "repo read:user user:email");

    return res.status(200).json({ success: true, url, state });
  } catch (error) {
    console.error("Error generating GitHub integration auth URL:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate GitHub authorization URL",
    });
  }
}

/**
 * Check GitHub repository integration connection status
 */
export async function getGithubIntegrationStatusHandler(req, res) {
  try {
    const user = await User.findById(req.foundUser._id)
      .select("integrations.github")
      .lean();

    const gh = user?.integrations?.github;
    const isConnected = Boolean(gh?.connected && gh?.accessToken);

    return res.status(200).json({
      connected: isConnected,
      username: isConnected ? gh.username : null,
      email: isConnected ? gh.email : null,
      avatar: isConnected ? gh.avatar : null,
      connectedAt: isConnected ? gh.connectedAt : null,
    });
  } catch (error) {
    console.error("Error checking GitHub status:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch GitHub integration status",
    });
  }
}

/**
 * Disconnect GitHub integration
 */
export async function disconnectGithubHandler(req, res) {
  try {
    await disconnectGithub(req.foundUser._id);
    return res.status(200).json({
      success: true,
      message: "GitHub integration disconnected successfully",
    });
  } catch (error) {
    console.error("Error disconnecting GitHub:", error);
    return res.status(500).json({
      error: error.message || "Failed to disconnect GitHub",
    });
  }
}

/**
 * List repositories accessible to the user
 */
export async function listRepositoriesHandler(req, res) {
  try {
    const { accessToken } = await getGithubCredentials(req.foundUser._id);
    const { page, perPage, type, search } = req.query;

    const data = await listUserRepositories(accessToken, {
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 100,
      type: type || "all",
      search: search || "",
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error listing GitHub repositories:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Failed to list GitHub repositories",
    });
  }
}

/**
 * List branches for a specific repository
 */
export async function listBranchesHandler(req, res) {
  const { owner, repo } = req.params;
  if (!owner || !repo) {
    return res.status(400).json({ error: "Owner and repo name are required" });
  }

  try {
    const { accessToken } = await getGithubCredentials(req.foundUser._id);
    const branches = await listRepoBranches(accessToken, owner, repo);
    return res.status(200).json({ branches });
  } catch (error) {
    console.error(`Error listing branches for ${owner}/${repo}:`, error);
    return res.status(error.status || 500).json({
      error: error.message || "Failed to list repository branches",
    });
  }
}

/**
 * Stream NDJSON repository import with real-time progress and abort control
 */
export async function importRepositoriesHandler(req, res) {
  const { repos, targetDirId, format = "folder" } = req.body || {};

  if (!Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: "Please select at least one repository to import." });
  }

  // Set NDJSON streaming response headers
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let isAborted = false;
  const controller = new AbortController();

  // Listen to response stream close (fires ONLY if client disconnects/aborts before end)
  res.on("close", () => {
    if (!res.writableEnded) {
      isAborted = true;
      controller.abort();
    }
  });

  req.on("aborted", () => {
    isAborted = true;
    controller.abort();
  });

  const sendLine = (data) => {
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.write(JSON.stringify(data) + "\n");
      } catch (err) {
        console.warn("[GitHub Import] Failed writing NDJSON line:", err.message);
      }
    }
  };

  try {
    const result = await importGithubRepositories({
      userId: req.foundUser._id,
      targetDirId,
      repos,
      globalFormat: format,
      onProgress: (progressData) => sendLine(progressData),
      signal: controller.signal,
      checkAborted: () => isAborted || controller.signal.aborted,
    });

    if (result?.cancelled || isAborted || controller.signal.aborted) {
      sendLine({
        type: "cancelled",
        error: "Import cancelled by user",
      });
      res.end();
      return;
    }

    sendLine({
      type: "complete",
      success: result.success,
      importedCount: result.importedCount,
      importedResults: result.importedResults,
      failedItems: result.failedItems,
    });

    res.end();
  } catch (error) {
    if (isAborted || controller.signal.aborted || error.name === "AbortError") {
      sendLine({
        type: "cancelled",
        error: "Import cancelled by user",
      });
      res.end();
      return;
    }

    if (!res.writableEnded) {
      sendLine({
        type: "error",
        error: error.message || "Repository import failed",
      });
      res.end();
    }
  }
}
