import { model, Schema } from "mongoose";

const otpSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true
    },
    otp: {
      type: String,
      required: [true, "OTP is required"],
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 3, // 3 minutes TTL
    },
  },
  {
    strict: "throw",
  }
);

const OTP = model("OTP", otpSchema);
export default OTP;