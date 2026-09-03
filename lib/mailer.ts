import "server-only";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<void> {
  const { to, subject, body, html } = params;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
      html: html || body,
    });
    console.log(`[MAILER] Email sent to ${to} | Subject: ${subject}`);
  } catch (error) {
    console.error(`[MAILER] Failed to send email to ${to}:`, error);
    throw new Error(
      `Failed to send email: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function sendMailBackground(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<void> {
  try {
    await sendMail(params);
  } catch (error) {
    console.error(
      `[MAILER] Background email failed to ${params.to}:`,
      error
    );
  }
}

/** Sends login credentials to a newly created account (fire-and-forget). */
export function sendCredentialsEmail(params: {
  to: string;
  fullName: string;
  password: string;
}): Promise<void> {
  const { to, fullName, password } = params;
  return sendMailBackground({
    to,
    subject: "Your Transportation Portal Account Has Been Created",
    body: `Hi ${fullName},\n\nYour account for the Transportation Portal has been created.\n\nLogin credentials:\nEmail: ${to}\nPassword: ${password}\n\nPlease sign in at the portal and change your password if needed.\n\nBest regards,\nTransportation Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="height: 4px; background: #70bccc; border-radius: 4px 4px 0 0;"></div>
        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 4px 4px; padding: 32px;">
          <h2 style="color: #1a1a2e; margin: 0 0 8px;">Your Account Has Been Created</h2>
          <p style="color: #6b7280; margin: 0 0 24px;">You can now sign in to the Transportation Portal.</p>
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>Your account is ready. Here are your login credentials:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; width: 120px;">Email</td>
              <td style="padding: 10px; border: 1px solid #dee2e6; font-family: monospace;">${to}</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Password</td>
              <td style="padding: 10px; border: 1px solid #dee2e6; font-family: monospace;">${password}</td>
            </tr>
          </table>
          <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Transportation Team</strong></p>
        </div>
      </div>
    `,
  });
}
