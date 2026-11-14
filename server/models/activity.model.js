import { model, Schema } from "mongoose";

const activitySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resourceType: {
      type: String,
      enum: ["file", "directory"],
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      enum: [
        "upload",
        "view",
        "download",
        "rename",
        "share",
        "star",
        "restore",
        "trash",
        "import",
        "move",
      ],
      required: true,
    },
    details: {
      name: { type: String, default: "" },
      previousName: { type: String, default: null },
      sharedWithEmail: { type: String, default: null },
      extension: { type: String, default: "" },
      size: { type: Number, default: 0 },
      source: { type: String, default: "meghvault" },
      fromDirectoryName: { type: String, default: null },
      toDirectoryName: { type: String, default: null },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: "throw",
  }
);

// High performance compound indexes:
// 1. Instant Chronological lookup for the authenticated user's recent feed
activitySchema.index({ userId: 1, createdAt: -1 });

// 2. Fast Debouncing & De-duplication queries (e.g. recent views/downloads within 15 min)
activitySchema.index({ userId: 1, resourceId: 1, action: 1, createdAt: -1 });

// 3. TTL (Time-To-Live) Index: Automatically clears activities 24 hours (86,400 seconds) after creation
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

const Activity = model("Activity", activitySchema);
export default Activity;
