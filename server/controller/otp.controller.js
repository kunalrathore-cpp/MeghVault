import { sendOTPService } from "../services/sendOTP.service.js";
import OTP from "../models/otp.model.js";

// Generate OTP for email authentication
export const generateOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const resData = await sendOTPService(cleanEmail);
    return res.status(201).json(resData);
  } catch (error) {
    console.error("Error generating OTP:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate verification code",
    });
  }
};

// Verify OTP (standalone endpoint if needed)
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();

    if (!cleanEmail || !cleanOtp) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }

    const foundOTPRecord = await OTP.findOne({ email: cleanEmail, otp: cleanOtp });
    if (!foundOTPRecord) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }
    return res.status(200).json({ message: "OTP Verified" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
};
