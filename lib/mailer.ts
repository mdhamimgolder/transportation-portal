import "server-only";
import nodemailer from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { textToHtml } from "@/lib/html";
import { accountCreatedEmail } from "@/lib/email-templates";

/**
 * SMTP transporter, created on first send (never at module import) so importing
 * this module never reads env. `nodemailer.createTransport` with no options
 * would silently fall back to sendmail — we always pass explicit SMTP options.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const options: SMTPPool.Options = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: true,
      // Pooled connections: bulk sends reuse a few TLS sessions instead of
      // opening one per recipient (providers throttle connection floods).
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    };
    transporter = nodemailer.createTransport(options);
  }
  return transporter;
}

/** Emails actually send only in production. Locally (`next dev`) the mail
 * module is a no-op — creating test accounts never triggers SMTP. Read lazily
 * (function, never a module-level constant) so importing the mailer never
 * validates env.
 */
export function isEmailEnabled(): boolean {
  return env.NODE_ENV === "production";
}

export async function sendMail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<void> {
  const { to, subject, body, html } = params;

  if (!isEmailEnabled()) {
    logger.debug("mailer", "email skipped (non-production)", { to, subject });
    return;
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to,
      subject,
      text: body,
      // Plain-text bodies may contain user-supplied names/addresses — never
      // send them as raw HTML.
      html: html || textToHtml(body),
    });
    logger.info("mailer", "email sent", { to, subject });
  } catch (error) {
    logger.error("mailer", "email failed", {
      to,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Failed to send email");
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
    logger.error("mailer", "background email failed", {
      to: params.to,
      subject: params.subject,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type EmailSendResult = {
  status: "SENT" | "SKIPPED_DEV" | "FAILED";
  error?: string;
};

/** Sends (or skips in dev) and returns the outcome instead of throwing, so
 * callers can record delivery status per recipient. */
export async function trySendMail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<EmailSendResult> {
  if (!isEmailEnabled()) {
    logger.debug("mailer", "email skipped (non-production)", {
      to: params.to,
      subject: params.subject,
    });
    return { status: "SKIPPED_DEV" };
  }
  try {
    await sendMail(params);
    return { status: "SENT" };
  } catch (error) {
    logger.error("mailer", "email failed", {
      to: params.to,
      subject: params.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "FAILED", error: "The email could not be sent." };
  }
}

/** Fire-and-forget version used right after account creation. */
export function sendCredentialsEmail(params: {
  to: string;
  fullName: string;
  password: string;
}): Promise<void> {
  const { subject, body, html } = accountCreatedEmail(params);
  return sendMailBackground({ to: params.to, subject, body, html });
}

/** Result-returning version for resend flows — surfaces SMTP errors instead
 * of swallowing them, so Facilities can see WHY an email failed. */
export async function sendCredentialsEmailNow(params: {
  to: string;
  fullName: string;
  password: string;
}): Promise<{ status: "sent" | "skipped-dev" | "failed"; error?: string }> {
  const { subject, body, html } = accountCreatedEmail(params);
  try {
    await sendMail({ to: params.to, subject, body, html });
    return isEmailEnabled() ? { status: "sent" } : { status: "skipped-dev" };
  } catch (error) {
    logger.error("mailer", "credentials email failed", {
      to: params.to,
      error: error instanceof Error ? error.message : String(error),
    });
    // Staff see a generic reason; the SMTP detail stays in the server log.
    return { status: "failed", error: "The email could not be sent. Check the SMTP configuration." };
  }
}
