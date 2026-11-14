import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_SECRET is not configured in environment variables.");
  }

  // If provided as a 64-char hex string (32 bytes), convert from hex directly
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  // Otherwise derive a 32-byte key using sha256
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypt sensitive plain text (e.g. OAuth refresh token) using AES-256-GCM
 * @param {string} text Plain text to encrypt
 * @returns {string|null} Formatted cipher text: "iv:authTag:encryptedContent"
 */
export function encryptToken(text) {
  if (!text) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt cipher text previously encrypted with encryptToken
 * @param {string} cipherText Formatted as "iv:authTag:encryptedContent"
 * @returns {string|null} Decrypted plain text
 */
export function decryptToken(cipherText) {
  if (!cipherText) return null;

  // Defensive fallback: if not encrypted in expected format, return as-is
  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    return cipherText;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedText = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Token decryption failed:", error.message);
    throw new Error("Failed to decrypt stored token.");
  }
}
