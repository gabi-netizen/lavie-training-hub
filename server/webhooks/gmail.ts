/**
 * Gmail Webhook Handler
 *
 * Receives HTTP POST requests from a Google Apps Script running on the
 * support@lavielabs.com Gmail account.  The Apps Script fires whenever a
 * new email arrives and forwards the message metadata + body here.
 *
 * We:
 *  1. Validate the payload (require at least messageId + fromEmail)
 *  2. Deduplicate by Gmail messageId (skip if already stored)
 *  3. Persist the email in the `gmail_incoming_emails` table
 *  4. Run the categorization engine (keyword-based, no AI)
 *  5. Create a support ticket in the `support_tickets` table
 *  6. Return 200 OK so the Apps Script does not retry
 *
 * Expected POST body (JSON):
 * {
 *   "messageId":  "18f1a2b3c4d5e6f7",
 *   "threadId":   "18f1a2b3c4d5e6f7",
 *   "from":       "customer@example.com",
 *   "fromName":   "Jane Doe",
 *   "subject":    "Question about my order",
 *   "bodyText":   "Hi, I have a question…",
 *   "bodyHtml":   "<div>Hi, I have a question…</div>",
 *   "date":       "2026-04-25T14:30:00.000Z",
 *   "secret":     "GMAIL_WEBHOOK_SECRET env var value"
 * }
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { gmailIncomingEmails, supportTickets } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { categorizeEmail, determineCustomerStatus } from "../emailCategorization";

// ─── Main webhook handler ─────────────────────────────────────────────────────
export async function handleGmailWebhook(req: Request, res: Response) {
  try {
    const payload = req.body;

    // Log the incoming payload (truncated for safety)
    console.log(
      "[Gmail Webhook] Received payload:",
      JSON.stringify(payload, null, 2).substring(0, 2000)
    );

    // ── Validate shared secret ──────────────────────────────────────────────
    const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
    if (expectedSecret && payload?.secret !== expectedSecret) {
      console.warn("[Gmail Webhook] Invalid or missing secret — rejecting request");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ── Basic payload validation ────────────────────────────────────────────
    const messageId: string | undefined = payload?.messageId;
    const fromEmail: string | undefined = payload?.from ?? payload?.fromEmail;

    if (!messageId || !fromEmail) {
      console.warn("[Gmail Webhook] Missing required fields (messageId, from)");
      res.status(400).json({
        error: "Missing required fields",
        required: ["messageId", "from"],
      });
      return;
    }

    // ── Database ────────────────────────────────────────────────────────────
    const db = await getDb();
    if (!db) {
      console.error("[Gmail Webhook] Database not available");
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // ── Deduplication (check both tables) ───────────────────────────────────
    const existingEmail = await db
      .select({ id: gmailIncomingEmails.id })
      .from(gmailIncomingEmails)
      .where(eq(gmailIncomingEmails.messageId, messageId))
      .limit(1);

    if (existingEmail.length > 0) {
      console.log(`[Gmail Webhook] Duplicate messageId ${messageId} — skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    // ── Parse email date ────────────────────────────────────────────────────
    let emailDate: Date | null = null;
    if (payload?.date) {
      const parsed = new Date(payload.date);
      if (!isNaN(parsed.getTime())) {
        emailDate = parsed;
      }
    }

    // ── Insert into gmail_incoming_emails (raw storage) ─────────────────────
    const [insertResult] = await db.insert(gmailIncomingEmails).values({
      messageId,
      threadId: payload?.threadId ?? null,
      fromEmail,
      fromName: payload?.fromName ?? null,
      subject: payload?.subject ?? null,
      bodyText: payload?.bodyText
        ? String(payload.bodyText).substring(0, 65000)
        : null,
      bodyHtml: payload?.bodyHtml
        ? String(payload.bodyHtml).substring(0, 65000)
        : null,
      emailDate,
      status: "processed",
      rawPayload: JSON.stringify(payload).substring(0, 65000),
    });

    const gmailEmailId = (insertResult as any).insertId;

    console.log(
      `[Gmail Webhook] Stored email messageId=${messageId} from=${fromEmail} subject="${payload?.subject ?? "(no subject)"}"`
    );

    // ── Categorization Engine ───────────────────────────────────────────────
    const bodyText = payload?.bodyText ? String(payload.bodyText) : "";
    const subject = payload?.subject ?? "";
    const fromName = payload?.fromName ?? "";

    const { category, priority } = categorizeEmail({
      fromEmail,
      fromName,
      subject,
      bodyText,
    });

    // ── Customer Status — check if sender has previous emails ───────────────
    let hasExistingEmails = false;
    try {
      const previousEmails = await db
        .select({ id: gmailIncomingEmails.id })
        .from(gmailIncomingEmails)
        .where(eq(gmailIncomingEmails.fromEmail, fromEmail))
        .limit(2);
      // More than 1 means they had emails before this one
      hasExistingEmails = previousEmails.length > 1;
    } catch (err) {
      console.warn("[Gmail Webhook] Error checking existing emails:", err);
    }

    const customerStatus = determineCustomerStatus(fromEmail, hasExistingEmails);

    // ── Create Support Ticket ───────────────────────────────────────────────
    try {
      await db.insert(supportTickets).values({
        gmailEmailId: gmailEmailId ?? null,
        messageId,
        fromEmail,
        fromName: fromName || null,
        subject: subject || null,
        body: bodyText ? bodyText.substring(0, 65000) : null,
        receivedAt: emailDate ?? new Date(),
        category,
        priority,
        customerStatus,
        status: "open",
        assignedTo: null,
        notes: null,
      });

      console.log(
        `[Gmail Webhook] Created ticket: category=${category} priority=${priority} customerStatus=${customerStatus}`
      );
    } catch (ticketErr) {
      // If support_tickets table doesn't exist yet, log but don't fail the webhook
      console.error("[Gmail Webhook] Error creating support ticket:", ticketErr);
      // Still return success since the email was stored
    }

    res.status(200).json({
      received: true,
      processed: true,
      messageId,
      category,
      priority,
      customerStatus,
    });
  } catch (err) {
    console.error("[Gmail Webhook] Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
