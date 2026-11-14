import { createAvatar } from "@dicebear/core";
import DOMPurify from "isomorphic-dompurify";
import {
  lorelei,
  avataaars,
  bottts,
  funEmoji,
  adventurer,
  thumbs,
} from "@dicebear/collection";

const avatarCollections = [
  lorelei,
  avataaars,
  bottts,
  funEmoji,
  adventurer,
  thumbs,
];

/**
 * Generate a random SVG avatar data URI using Dicebear
 * @param {string} [seed] - Optional seed for deterministic avatar generation
 * @returns {Promise<string>} SVG Data URI string
 */
export async function generateRandomAvatar(seed) {
  const chosenSeed =
    seed ||
    `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Pick a stylish collection randomly
  const style =
    avatarCollections[Math.floor(Math.random() * avatarCollections.length)];

  const avatar = createAvatar(style, {
    seed: chosenSeed,
  });

  return avatar.toDataUri();
}

/**
 * Synchronous avatar generator returning raw SVG or data URI
 * @param {string} [seed]
 * @returns {string} SVG Data URI string
 */
export function generateRandomAvatarSync(seed) {
  const chosenSeed =
    seed ||
    `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const style =
    avatarCollections[Math.floor(Math.random() * avatarCollections.length)];

  const avatar = createAvatar(style, {
    seed: chosenSeed,
  });

  const svg = avatar.toString();
  const cleanSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
}
