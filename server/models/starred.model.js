import { Schema, model } from "mongoose";

const starredSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["file", "directory"],
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring a user can star a given resource only once
starredSchema.index({ userId: 1, resourceId: 1 }, { unique: true });
starredSchema.index({ userId: 1, resourceType: 1 });

const Starred = model("Starred", starredSchema);
export default Starred;
