import "dotenv/config";
import { Resend } from "resend";
import OTP from "../models/otp.model.js";

const resend = new Resend(process.env.RESEND_KEY);

export async function sendOTPService(email, options = {}) {
  const isTransfer = options.type === "ownership-transfer";
  const isDeleteAccount =
    options.type === "delete-account" || options.type === "account-deletion";
  const isChangeEmailOld = options.type === "change-email-old";
  const isChangeEmailNew = options.type === "change-email-new";
  const targetEmail = options.targetEmail || "another user";

  // Generate a secure 4-digit code
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // Use findOneAndUpdate with $set so Mongoose treats $set as an operator, not a schema field
  await OTP.findOneAndUpdate(
    { email },
    {
      $set: {
        otp,
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: "after", // Modern replacement for `new: true`
      runValidators: true,
    },
  );

  let headline = "Verify your email address";
  let description =
    "Please use the verification code below to complete your login or setup request on MeghVault.";
  let warningNote = "";
  let otpColor = "#0f172a";

  if (isTransfer) {
    headline = "Authorize Account Ownership Transfer";
    description = `You have requested to permanently transfer all your MeghVault files, folders, and shared items to <strong style="color: #0f172a;">${targetEmail}</strong> and permanently delete your account.`;
    warningNote = `<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin: 20px 0 0; color: #991b1b; font-size: 13px; line-height: 1.5;">
         <strong>Warning:</strong> This action is completely permanent and irreversible. Once verified, your account will be deleted and all files will belong to ${targetEmail}.
       </div>`;
    otpColor = "#dc2626";
  } else if (isDeleteAccount) {
    headline = "Authorize Permanent Account Deletion";
    description =
      "You have requested to permanently delete your MeghVault account. This action will irreversibly erase your account, all uploaded files, folders, shared resources, and active sessions.";
    warningNote = `<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin: 20px 0 0; color: #991b1b; font-size: 13px; line-height: 1.5;">
         <strong>CRITICAL WARNING:</strong> This action cannot be undone. All your stored files, directories, and account credentials will be permanently erased immediately.
       </div>`;
    otpColor = "#dc2626";
  } else if (isChangeEmailOld) {
    headline = "Authorize Account Email Change";
    description = `You have submitted a request to change your MeghVault login email address to <strong style="color: #0f172a;">${targetEmail}</strong>. Please use the authorization code below to verify this request.`;
    warningNote = `<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin: 20px 0 0; color: #1e40af; font-size: 13px; line-height: 1.5;">
         <strong>Security Notice (Step 1 of 2):</strong> Entering this code authorizes updating your account email to ${targetEmail}. If you did not make this request, secure your credentials immediately.
       </div>`;
    otpColor = "#2563eb";
  } else if (isChangeEmailNew) {
    headline = "Verify Your New Email Address";
    description = `Please use the verification code below to confirm this address as your new primary MeghVault login email.`;
    warningNote = `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; margin: 20px 0 0; color: #166534; font-size: 13px; line-height: 1.5;">
         <strong>Final Step (Step 2 of 2):</strong> Entering this code completes the update and permanently links your MeghVault account to this email.
       </div>`;
    otpColor = "#16a34a";
  }

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headline}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9; padding: 40px 15px;">
      <tr>
        <td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05); border: 1px solid #eef0f3;">
            <!-- Brand Header -->
            <tr>
              <td style="padding: 32px 32px 24px; text-align: left; border-bottom: 1px solid #f1f3f5;">
                <span style="font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                  Megh<span style="color: #2563eb;">Vault</span>
                </span>
              </td>
            </tr>

            <!-- Main Content -->
            <tr>
              <td style="padding: 32px;">
                <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1e293b; line-height: 1.4;">
                  ${headline}
                </h1>
                <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                  ${description}
                </p>

                <!-- OTP Display Box -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 28px 0;">
                  <span style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px;">
                    Verification Code
                  </span>
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: ${otpColor}; padding-left: 8px;">
                    ${otp}
                  </span>
                </div>

                ${warningNote}

                <p style="margin: 20px 0 16px; font-size: 14px; line-height: 1.5; color: #64748b;">
                  This code is valid for <strong>3 minutes</strong>. For your account security, never share this OTP with anyone.
                </p>

                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                  If you didn't request this action, please change your credentials and secure your account immediately.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #fafbfc; padding: 20px 32px; text-align: center; border-top: 1px solid #f1f3f5;">
                <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                  &copy; ${new Date().getFullYear()} MeghVault Cloud Services. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  let subject = `${otp} is your MeghVault verification code`;
  if (isTransfer) {
    subject = `${otp} is your Ownership Transfer confirmation code`;
  } else if (isDeleteAccount) {
    subject = `${otp} is your Account Deletion confirmation code`;
  } else if (isChangeEmailOld) {
    subject = `${otp} is your Email Change authorization code`;
  } else if (isChangeEmailNew) {
    subject = `${otp} is your New Email verification code`;
  }

  await resend.emails.send({
    from: "MeghVault <otp@meghvault.cloud>",
    to: email,
    subject,
    html,
  });

  return { success: true, message: "OTP sent successfully" };
}

/**
 * Sends a courtesy security notification to the old email when email change completes
 */
export async function sendEmailChangeNotificationService(oldEmail, newEmail) {
  try {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Security Alert: Account Email Updated</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:40px 15px;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:500px;background:#fff;border-radius:12px;padding:32px;border:1px solid #eef0f3;">
              <tr>
                <td>
                  <h2 style="color:#0f172a;margin-top:0;">Security Alert: Account Email Changed</h2>
                  <p style="color:#475569;line-height:1.6;">
                    This is a confirmation that your MeghVault account login email has been updated to:
                  </p>
                  <p style="font-size:16px;font-weight:700;color:#2563eb;background:#eff6ff;padding:12px;border-radius:8px;">
                    ${newEmail}
                  </p>
                  <p style="color:#64748b;font-size:13px;line-height:1.5;">
                    If you authorized this change, you do not need to take any action. If you did NOT initiate this change, please contact support and secure your account immediately.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    await resend.emails.send({
      from: "MeghVault <security@meghvault.cloud>",
      to: oldEmail,
      subject: "Security Alert: Your MeghVault login email was updated",
      html,
    });
  } catch (err) {
    console.error("sendEmailChangeNotificationService error:", err);
  }
}
