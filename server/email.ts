/**
 * Postmark Email Helper
 * Handles all transactional emails for Lavie Labs:
 * - Payment confirmations
 * - Callback reminders (to agents)
 * - Status change notifications
 * - New contact assigned notifications
 */

import { ENV } from "./_core/env";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";
const FROM_EMAIL = "noreply@lavielabs.co.uk";
const FROM_NAME = "Lavie Labs";

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  tag?: string;
}

async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const apiKey = ENV.postmarkApiKey;
  if (!apiKey) {
    console.error("[Email] POSTMARK_API_KEY not set");
    return false;
  }

  try {
    const response = await fetch(POSTMARK_API_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: `${FROM_NAME} <${FROM_EMAIL}>`,
        To: options.to,
        Subject: options.subject,
        HtmlBody: options.htmlBody,
        TextBody: options.textBody ?? options.subject,
        ReplyTo: options.replyTo,
        Tag: options.tag ?? "transactional",
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { Message: string };
      console.error("[Email] Postmark error:", error.Message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Failed to send:", err);
    return false;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #0F1923; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; }
    .header p { color: #8899aa; margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .body p { color: #333; line-height: 1.6; margin: 0 0 16px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; }
    .info-value { color: #1e293b; font-weight: 500; }
    .cta-button { display: inline-block; background: #0F1923; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 8px 0; }
    .footer { background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; }
    .footer p { color: #94a3b8; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Lavie Labs</h1>
      <p>Internal CRM Notification</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from the Lavie Labs CRM system. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Specific Email Functions ─────────────────────────────────────────────────

/**
 * Notify agent that a callback is due
 */
export async function sendCallbackReminder(options: {
  agentEmail: string;
  agentName: string;
  customerName: string;
  customerPhone: string;
  callbackTime: string;
  notes?: string;
}): Promise<boolean> {
  const html = baseTemplate(`
    <p>Hi ${options.agentName},</p>
    <p>You have a <strong>callback scheduled</strong> for the following customer:</p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Customer</span>
        <span class="info-value">${options.customerName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone</span>
        <span class="info-value">${options.customerPhone}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Scheduled Time</span>
        <span class="info-value">${options.callbackTime}</span>
      </div>
      ${options.notes ? `
      <div class="info-row">
        <span class="info-label">Notes</span>
        <span class="info-value">${options.notes}</span>
      </div>` : ""}
    </div>
    <p>Please make sure to call at the scheduled time. Good luck!</p>
  `);

  return sendEmail({
    to: options.agentEmail,
    subject: `📞 Callback Reminder: ${options.customerName} at ${options.callbackTime}`,
    htmlBody: html,
    tag: "callback-reminder",
  });
}

/**
 * Notify agent (and optionally admin) when a contact status changes
 */
export async function sendStatusChangeNotification(options: {
  agentEmail: string;
  agentName: string;
  customerName: string;
  customerPhone: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
}): Promise<boolean> {
  const statusColors: Record<string, string> = {
    "Done Deal": "badge-green",
    "Retained Sub": "badge-green",
    "Working": "badge-blue",
    "Assigned": "badge-blue",
    "Open": "badge-amber",
    "New": "badge-amber",
    "Cancelled Sub": "badge-red",
    "Closed": "badge-red",
  };

  const badgeClass = statusColors[options.newStatus] ?? "badge-blue";

  const html = baseTemplate(`
    <p>Hi ${options.agentName},</p>
    <p>A contact status has been updated:</p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Customer</span>
        <span class="info-value">${options.customerName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone</span>
        <span class="info-value">${options.customerPhone}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Previous Status</span>
        <span class="info-value">${options.oldStatus}</span>
      </div>
      <div class="info-row">
        <span class="info-label">New Status</span>
        <span class="info-value"><span class="badge ${badgeClass}">${options.newStatus}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Changed By</span>
        <span class="info-value">${options.changedBy}</span>
      </div>
    </div>
  `);

  return sendEmail({
    to: options.agentEmail,
    subject: `Status Update: ${options.customerName} → ${options.newStatus}`,
    htmlBody: html,
    tag: "status-change",
  });
}

/**
 * Notify admin when a new contact is imported
 */
export async function sendImportSummary(options: {
  adminEmail: string;
  importedBy: string;
  totalImported: number;
  totalUpdated: number;
  totalSkipped: number;
}): Promise<boolean> {
  const html = baseTemplate(`
    <p>A CSV import has been completed by <strong>${options.importedBy}</strong>.</p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">New Contacts Imported</span>
        <span class="info-value"><span class="badge badge-green">${options.totalImported}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Existing Contacts Updated</span>
        <span class="info-value"><span class="badge badge-blue">${options.totalUpdated}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Skipped (no phone/email)</span>
        <span class="info-value"><span class="badge badge-amber">${options.totalSkipped}</span></span>
      </div>
    </div>
  `);

  return sendEmail({
    to: options.adminEmail,
    subject: `CSV Import Complete: ${options.totalImported} new contacts added`,
    htmlBody: html,
    tag: "import-summary",
  });
}

/**
 * Send an email from an agent to a customer contact.
 * The From address is trial+[agentSlug]@lavielabs.com so replies
 * route back through trial@lavielabs.com → Zoho Desk.
 */
export async function sendEmailToContact(options: {
  agentName: string;
  agentSlug: string; // e.g. "gabi", "matthew"
  contactEmail: string;
  contactName: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = ENV.postmarkApiKey;
  if (!apiKey) {
    console.error("[Email] POSTMARK_API_KEY not set");
    return false;
  }

  const fromAddress = `${options.agentName} at Lavie Labs <trial+${options.agentSlug}@lavielabs.com>`;
  const replyToAddress = options.replyTo ?? "trial@lavielabs.com";

  // Wrap the body in a clean HTML template
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #0F1923; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; }
    .header p { color: #8899aa; margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .body p { color: #333; line-height: 1.7; margin: 0 0 16px; white-space: pre-wrap; }
    .footer { background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; }
    .footer p { color: #94a3b8; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Lavie Labs</h1>
      <p>Message from ${options.agentName}</p>
    </div>
    <div class="body">
      <p>Hi ${options.contactName},</p>
      <p>${options.body.replace(/\n/g, "<br>")}</p>
    </div>
    <div class="footer">
      <p>You received this email from ${options.agentName} at Lavie Labs. To reply, simply respond to this email.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch(POSTMARK_API_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: fromAddress,
        To: options.contactEmail,
        Subject: options.subject,
        HtmlBody: htmlBody,
        TextBody: `Hi ${options.contactName},\n\n${options.body}\n\n-- ${options.agentName}, Lavie Labs`,
        ReplyTo: replyToAddress,
        Tag: "agent-to-contact",
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { Message: string };
      console.error("[Email] Postmark error (agent email):", error.Message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Failed to send agent email:", err);
    return false;
  }
}

/**
 * General notification to admin (e.g. deal closed, important event)
 */
export async function sendAdminAlert(options: {
  adminEmail: string;
  subject: string;
  message: string;
  details?: Record<string, string>;
}): Promise<boolean> {
  const detailsHtml = options.details
    ? `<div class="info-box">${Object.entries(options.details)
        .map(([k, v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-value">${v}</span></div>`)
        .join("")}</div>`
    : "";

  const html = baseTemplate(`
    <p>${options.message}</p>
    ${detailsHtml}
  `);

  return sendEmail({
    to: options.adminEmail,
    subject: options.subject,
    htmlBody: html,
    tag: "admin-alert",
  });
}
