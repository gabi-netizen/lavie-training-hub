/**
 * Gmail SMTP Transport Helper
 * Replaces Postmark for all transactional email sending.
 * Uses nodemailer with Gmail SMTP (STARTTLS on port 587).
 *
 * Required environment variables:
 *   GMAIL_USER          – Gmail address (e.g. trial@lavielabs.com)
 *   GMAIL_APP_PASSWORD  – App-specific password (no spaces)
 */

import nodemailer from "nodemailer";

// Create a reusable transporter configured for Gmail SMTP
export const gmailTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // uses STARTTLS
  auth: {
    user: process.env.GMAIL_USER || "trial@lavielabs.com",
    pass: process.env.GMAIL_APP_PASSWORD || "",
  },
});

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendViaGmailOptions {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
  textBody?: string;
  attachments?: EmailAttachment[];
}

/**
 * Send an email via Gmail SMTP using nodemailer.
 * Returns an object with MessageID for compatibility with existing code.
 */
export async function sendViaGmail(opts: SendViaGmailOptions): Promise<{ MessageID: string }> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_APP_PASSWORD not configured");
  }

  const info = await gmailTransporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.htmlBody,
    ...(opts.textBody ? { text: opts.textBody } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts.attachments && opts.attachments.length > 0
      ? {
          attachments: opts.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        }
      : {}),
  });

  return { MessageID: info.messageId };
}
