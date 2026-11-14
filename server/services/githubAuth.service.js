import "dotenv/config";

const clientId = (process.env.GITHUB_CLIENT_ID || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const clientSecret = (process.env.GITHUB_CLIENT_SECRET || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const redirectUri = (
  process.env.GITHUB_REDIRECT_URI ||
  "http://localhost:4000/auth/github/callback"
)
  .trim()
  .replace(/^["']|["']$/g, "");

/**
 * Generate GitHub OAuth Authorization URL for user sign-in or repo integration
 * @param {string} state - CSRF state token
 * @param {string} [scope] - OAuth scopes (default: "read:user user:email")
 */
export function generateGithubAuthUrl(state, scope = "read:user user:email") {
  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) are not configured in server/.env."
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state: state || "",
    allow_signup: "true",
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange GitHub authorization code for an access token,
 * fetch user identity and verified primary email.
 */
export async function verifyGithubAuthCode(code) {
  if (!code) {
    throw new Error("Authorization code is required from GitHub callback.");
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) are missing."
    );
  }

  // 1. Exchange authorization code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`GitHub token exchange failed: ${errorBody}`);
  }

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new Error(
      tokenData.error_description ||
        `GitHub authorization failed: ${tokenData.error}`
    );
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("GitHub token exchange did not return an access token.");
  }

  // 2. Fetch User Profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "MeghVault-App",
    },
  });

  if (!userRes.ok) {
    const errText = await userRes.text();
    throw new Error(`Failed to fetch user profile from GitHub: ${errText}`);
  }

  const userData = await userRes.json();

  // 3. Fetch User Emails (to resolve primary verified email even if hidden/private)
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "MeghVault-App",
    },
  });

  let verifiedEmail = null;
  if (emailsRes.ok) {
    const emailsList = await emailsRes.json();
    if (Array.isArray(emailsList) && emailsList.length > 0) {
      // Prioritize primary verified real email
      const primaryVerified = emailsList.find(
        (e) => e.primary && e.verified && !e.email.includes("noreply")
      );
      const anyPrimaryVerified = emailsList.find((e) => e.primary && e.verified);
      const anyVerified = emailsList.find(
        (e) => e.verified && !e.email.includes("noreply")
      );
      const anyVerifiedFallback = emailsList.find((e) => e.verified);
      const anyPrimary = emailsList.find((e) => e.primary);
      const firstEmail = emailsList[0];

      verifiedEmail =
        primaryVerified?.email ||
        anyPrimaryVerified?.email ||
        anyVerified?.email ||
        anyVerifiedFallback?.email ||
        anyPrimary?.email ||
        firstEmail?.email;
    }
  }

  // Fallback to public profile email if verified list is empty
  if (!verifiedEmail && userData.email) {
    verifiedEmail = userData.email;
  }

  // Fallback to GitHub-generated noreply email (e.g. for users with "Keep my email private" enabled)
  if (!verifiedEmail && userData.login) {
    verifiedEmail = `${userData.id}+${userData.login}@users.noreply.github.com`;
  }

  if (!verifiedEmail) {
    throw new Error(
      "Your GitHub account does not have a verified email address. Please verify your email on GitHub and try again."
    );
  }

  return {
    accessToken,
    githubId: String(userData.id),
    username: userData.login,
    email: verifiedEmail.toLowerCase().trim(),
    name: userData.name || userData.login,
    profile: userData.avatar_url || null,
  };
}
