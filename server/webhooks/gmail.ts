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
 *  4. Return 200 OK so the Apps Script does not retry
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
import { gmailIncomingEmails } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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

    // ── Deduplication ───────────────────────────────────────────────────────
    const existing = await db
      .select({ id: gmailIncomingEmails.id })
      .from(gmailIncomingEmails)
      .where(eq(gmailIncomingEmails.messageId, messageId))
      .limit(1);

    if (existing.length > 0) {
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

    // ── Insert into database ────────────────────────────────────────────────
    await db.insert(gmailIncomingEmails).values({
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
      status: "received",
      rawPayload: JSON.stringify(payload).substring(0, 65000),
    });

    console.log(
      `[Gmail Webhook] Stored email messageId=${messageId} from=${fromEmail} subject="${payload?.subject ?? "(no subject)"}"`
    );

    res.status(200).json({ received: true, processed: true, messageId });
  } catch (err) {
    console.error("[Gmail Webhook] Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
