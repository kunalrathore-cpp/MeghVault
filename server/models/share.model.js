import { Schema, model } from "mongoose";

const collaboratorSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["viewer", "collaborator"],
      default: "collaborator",
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const linkSettingsSchema = new Schema(
  {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    shareToken: {
      type: String,
      sparse: true,
      index: true,
      default: null,
    },
    visibility: {
      type: String,
      enum: ["public", "restricted"],
      default: "restricted",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    isPasswordProtected: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const shareSchema = new Schema(
  {
    resourceType: {
      type: String,
      enum: ["file", "directory"],
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    collaborators: {
      type: [collaboratorSchema],
      default: [],
    },
    linkSettings: {
      type: linkSettingsSchema,
      default: () => ({
        isEnabled: false,
        shareToken: null,
        visibility: "restricted",
        expiresAt: null,
        allowDownload: true,
        isPasswordProtected: false,
        passwordHash: null,
      }),
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one share document per resource
shareSchema.index({ resourceType: 1, resourceId: 1 }, { unique: true });

const Share = model("Share", shareSchema);
export default Share;
