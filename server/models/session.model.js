import { model, Schema } from "mongoose";

const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "UserId is required"],
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24 * 7,
    },
  },
  {
    strict: "throw",
  },
);

const Session = model("Session", sessionSchema);
export default Session;
