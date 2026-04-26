/**
 * Gmail Webhook Handler
 *
 * Receives inbound email notifications from the Google Apps Script trigger
 * running on support@lavielabs.com. The Apps Script monitors the inbox and
 * sends a POST request here whenever a new email arrives.
 *
 * We:
 *  1. Validate the payload (require messageId + senderEmail at minimum)
 *  2. Deduplicate by Gmail message ID
 *  3. Store the email in the inbound_emails table
 *  4. Log the event for monitoring
 *
 * Processing logic (AI triage, auto-reply, ticket creation, etc.) will be
 * added in a future iteration. For now we just persist and acknowledge.
 *
 * Webhook payload (from Google Apps Script):
 *  {
 *    messageId: string;      // Gmail message ID (unique)
 *    senderEmail: string;    // From address
 *    senderName: string;     // From display name
 *    subject: string;        // Email subject
 *    body: string;           // Plain text body
 *    receivedAt: string;     // ISO 8601 date string
 *    secret?: string;        // Optional shared secret for auth
 *  }
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { inboundEmails } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// Optional shared secret — set GMAIL_WEBHOOK_SECRET env var to enable auth
const WEBHOOK_SECRET = process.env.GMAIL_WEBHOOK_SECRET ?? "";

// ─── Deduplication ───────────────────────────────────────────────────────────
async function isEmailAlreadyStored(messageId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const results = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(eq(inboundEmails.messageId, messageId))
    .limit(1);
  return results.length > 0;
}

// ─── Main webhook handler ────────────────────────────────────────────────────
export async function handleGmailWebhook(req: Request, res: Response) {
  try {
    const payload = req.body;

    // Log the raw payload for debugging (truncate body for log readability)
    const logPayload = { ...payload, body: payload?.body?.substring?.(0, 200) ?? "" };
    console.log("[Gmail Webhook] Received payload:", JSON.stringify(logPayload, null, 2));

    // ── Auth check (optional) ──────────────────────────────────────────────
    if (WEBHOOK_SECRET && payload?.secret !== WEBHOOK_SECRET) {
      console.warn("[Gmail Webhook] Invalid or missing secret");
      res.status(401).json({ received: true, processed: false, reason: "Unauthorized" });
      return;
    }

    // ── Validate required fields ───────────────────────────────────────────
    const messageId = payload?.messageId;
    const senderEmail = payload?.senderEmail;

    if (!messageId || !senderEmail) {
      console.warn("[Gmail Webhook] Missing required fields (messageId, senderEmail)");
      res.status(400).json({
        received: true,
        processed: false,
        reason: "Missing required fields: messageId, senderEmail",
      });
      return;
    }

    // ── Deduplicate ────────────────────────────────────────────────────────
    if (await isEmailAlreadyStored(String(messageId))) {
      console.log(`[Gmail Webhook] Email ${messageId} already stored — skipping`);
      res.status(200).json({ received: true, processed: false, reason: "Already stored" });
      return;
    }

    // ── Parse date ─────────────────────────────────────────────────────────
    let receivedAt: Date | null = null;
    if (payload?.receivedAt) {
      const parsed = new Date(payload.receivedAt);
      if (!isNaN(parsed.getTime())) {
        receivedAt = parsed;
      }
    }

    // ── Store in database ──────────────────────────────────────────────────
    const db = await getDb();
    if (db) {
      await db.insert(inboundEmails).values({
        messageId: String(messageId),
        senderEmail: String(senderEmail),
        senderName: payload?.senderName ? String(payload.senderName) : null,
        subject: payload?.subject ? String(payload.subject) : null,
        body: payload?.body ? String(payload.body) : null,
        receivedAt,
        status: "new",
        rawPayload: JSON.stringify(payload),
      });
      console.log(`[Gmail Webhook] Stored email ${messageId} from ${senderEmail} — "${payload?.subject ?? "(no subject)"}"`);
    } else {
      console.warn("[Gmail Webhook] Database not available — email logged but not persisted");
    }

    // ── Respond immediately ────────────────────────────────────────────────
    res.status(200).json({
      received: true,
      processed: true,
      messageId,
    });

  } catch (err) {
    console.error("[Gmail Webhook] Unhandled error:", err);
    // Always return 200 so the Apps Script doesn't retry endlessly
    res.status(200).json({ received: true, processed: false, error: "Internal error" });
  }
}
