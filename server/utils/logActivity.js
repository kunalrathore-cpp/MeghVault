import mongoose from "mongoose";
import Activity from "../models/activity.model.js";

const DEBOUNCE_ACTIONS = new Set(["view", "download"]);
const DEBOUNCE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Asynchronously logs a user activity event without blocking the primary request.
 * Debounces repetitive passive actions (view / download) within a 15-minute window.
 *
 * @param {Object} params
 * @param {import("mongoose").Types.ObjectId | string} params.userId
 * @param {"file"|"directory"} params.resourceType
 * @param {import("mongoose").Types.ObjectId | string} params.resourceId
 * @param {"upload"|"view"|"download"|"rename"|"share"|"star"|"restore"|"trash"|"import"|"move"} params.action
 * @param {Object} [params.details]
 */
export function logActivity({
  userId,
  resourceType,
  resourceId,
  action,
  details = {},
}) {
  // Fire-and-forget: execute asynchronously
  setImmediate(async () => {
    try {
      if (!userId || !resourceId || !resourceType || !action) return;

      const userObjectId =
        userId instanceof mongoose.Types.ObjectId
          ? userId
          : new mongoose.Types.ObjectId(userId.toString());
      const resourceObjectId =
        resourceId instanceof mongoose.Types.ObjectId
          ? resourceId
          : new mongoose.Types.ObjectId(resourceId.toString());

      // 1. Debounce & Upsert check for repetitive interactions (e.g. view, download)
      if (DEBOUNCE_ACTIONS.has(action)) {
        const existing = await Activity.findOne({
          userId: userObjectId,
          resourceId: resourceObjectId,
          action,
        }).sort({ createdAt: -1 });

        if (existing) {
          // Bump timestamp of existing activity to current time and update latest details
          await Activity.updateOne(
            { _id: existing._id },
            {
              $set: {
                createdAt: new Date(),
                details: {
                  ...existing.details,
                  ...details,
                },
              },
            }
          );

          // Clean up any older duplicate records for this resource + action
          await Activity.deleteMany({
            userId: userObjectId,
            resourceId: resourceObjectId,
            action,
            _id: { $ne: existing._id },
          });

          return;
        }
      }

      // 2. Insert new activity entry
      await Activity.create({
        userId: userObjectId,
        resourceType,
        resourceId: resourceObjectId,
        action,
        details: {
          name: details.name || "",
          previousName: details.previousName || null,
          sharedWithEmail: details.sharedWithEmail || null,
          extension: details.extension || "",
          size: details.size || 0,
          source: details.source || "meghvault",
          fromDirectoryName: details.fromDirectoryName || null,
          toDirectoryName: details.toDirectoryName || null,
        },
        createdAt: new Date(),
      });
    } catch (err) {
      console.warn("logActivity warning (non-fatal):", err.message);
    }
  });
}
