import { model, Schema } from "mongoose";
import { generateRandomAvatarSync } from "../services/avatar.service.js";

const authProviderSchema = new Schema(
  {
    emailAuth: {
      type: Boolean,
      default: false,
    },
    googleAuth: {
      type: String,
      default: null,
    },
    githubAuth: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const googleDriveIntegrationSchema = new Schema(
  {
    connected: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    accessToken: {
      type: String,
      default: null,
    },
    expiryDate: {
      type: Number,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const googlePhotosIntegrationSchema = new Schema(
  {
    connected: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    accessToken: {
      type: String,
      default: null,
    },
    expiryDate: {
      type: Number,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const githubIntegrationSchema = new Schema(
  {
    connected: {
      type: Boolean,
      default: false,
    },
    accessToken: {
      type: String,
      default: null,
    },
    username: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    connectedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const integrationsSchema = new Schema(
  {
    googleDrive: {
      type: googleDriveIntegrationSchema,
      default: () => ({
        connected: false,
        refreshToken: null,
        accessToken: null,
        expiryDate: null,
        email: null,
      }),
    },
    googlePhotos: {
      type: googlePhotosIntegrationSchema,
      default: () => ({
        connected: false,
        refreshToken: null,
        accessToken: null,
        expiryDate: null,
        email: null,
      }),
    },
    github: {
      type: githubIntegrationSchema,
      default: () => ({
        connected: false,
        accessToken: null,
        username: null,
        email: null,
        avatar: null,
        connectedAt: null,
      }),
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Please enter a valid email address",
      ],
    },
    name: {
      type: String,
      trim: true,
      default: function () {
        return this.email ? this.email.split("@")[0] : "User";
      },
    },
    profile: {
      type: String,
      trim: true,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: ["User", "Admin"],
        message: "{VALUE} is not a valid role. Allowed roles are: User, Admin",
      },
      default: "User",
      trim: true,
    },
    authProvider: {
      type: authProviderSchema,
      default: () => ({
        emailAuth: false,
        googleAuth: null,
        githubAuth: null,
      }),
    },
    integrations: {
      type: integrationsSchema,
      default: () => ({
        googleDrive: {
          connected: false,
          refreshToken: null,
          accessToken: null,
          expiryDate: null,
          email: null,
        },
        googlePhotos: {
          connected: false,
          refreshToken: null,
          accessToken: null,
          expiryDate: null,
          email: null,
        },
      }),
    },
    rootDirId: {
      type: Schema.Types.ObjectId,
      required: [true, "Root directory ID is required"],
      ref: "Directory",
    },
    preferences: {
      type: new Schema(
        {
          showAllActionsDirectly: {
            type: Boolean,
            default: false,
          },
        },
        { _id: false }
      ),
      default: () => ({
        showAllActionsDirectly: false,
      }),
    },
  },
  {
    strict: "throw",
  }
);

// Virtual for backward-compatible avatar access (points to profile)
userSchema.virtual("avatar").get(function () {
  return this.profile;
});

// Virtual for backward-compatible googleId access (points to authProvider.googleAuth)
userSchema.virtual("googleId").get(function () {
  return this.authProvider?.googleAuth || null;
});

// Pre-save hook: If profile field is null/empty, set random avatar SVG from Dicebear
userSchema.pre("save", function () {
  if (!this.profile) {
    this.profile = generateRandomAvatarSync(this.email || this._id?.toString());
  }
});

const User = model("User", userSchema);
export default User;
