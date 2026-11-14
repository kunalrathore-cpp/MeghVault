import { model, Schema } from "mongoose";

const fileSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    extension: {
      type: String,
      default: "",
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    parentDirId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Directory",
    },
    source: {
      type: String,
      enum: [
        "meghvault",
        "google-drive",
        "google-photos",
        "github",
        "instagram",
      ],
      default: "meghvault",
    },
    isTrashed: {
      type: Boolean,
      default: false,
    },
    trashedAt: {
      type: Date,
      default: null,
    },
    trashedDirectly: {
      type: Boolean,
      default: false,
    },
    originalParentDirId: {
      type: Schema.Types.ObjectId,
      ref: "Directory",
      default: null,
    },
  },
  {
    strict: "throw",
  }
);

// High performance compound indexes for fast active drive queries and trash retrieval
fileSchema.index({ parentDirId: 1, isTrashed: 1 });
fileSchema.index({ userId: 1, isTrashed: 1, trashedDirectly: 1, trashedAt: -1 });

const File = model("File", fileSchema);
export default File;
