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
