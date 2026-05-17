/**
 * Postmark Inbound Webhook Handler
 *
 * Receives HTTP POST requests from Postmark when an email is forwarded
 * to the Postmark inbound address from trial@lavielabs.com.
 *
 * Postmark sends a JSON payload with the email content, which we normalize
 * and pass to the same processing pipeline as the Gmail webhook.
 *
 * Postmark Inbound JSON format:
 * {
 *   "FromFull": { "Email": "customer@example.com", "Name": "Jane Doe" },
 *   "Subject": "Question about my order",
 *   "TextBody": "Hi, I have a question…",
 *   "HtmlBody": "<div>Hi, I have a question…</div>",
 *   "MessageID": "73e6d360-66eb-11e1-8e72-a8904824019b",
 *   "Date": "Fri, 1 Aug 2014 16:45:32 -04:00",
 *   ...
 * }
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { gmailIncomingEmails, supportTickets } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { categorizeEmail, determineCustomerStatus } from "../emailCategorization";

// ─── Table creation flag (only run once per server lifetime) ─────────────────
let tablesEnsured = false;

async function ensureTablesExist(db: any) {
  if (tablesEnsured) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gmail_incoming_emails (
        id int AUTO_INCREMENT NOT NULL,
        messageId varchar(256) NOT NULL,
        threadId varchar(256),
        fromEmail varchar(320) NOT NULL,
        fromName varchar(256),
        subject varchar(512),
        bodyText text,
        bodyHtml text,
        emailDate timestamp,
        status enum('received','processed','error') NOT NULL DEFAULT 'received',
        errorMessage text,
        rawPayload text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT gmail_incoming_emails_id PRIMARY KEY(id),
        CONSTRAINT gmail_incoming_emails_messageId_unique UNIQUE(messageId)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id int AUTO_INCREMENT NOT NULL,
        gmailEmailId int,
        messageId varchar(256),
        fromEmail varchar(320) NOT NULL,
        fromName varchar(256),
        subject varchar(512),
        body text,
        receivedAt timestamp,
        category enum('cancellation_request','shipping_delivery_issue','payment_billing_dispute','address_update','product_feedback','agent_forwarded','system_automated','follow_up_unanswered','subscription_question','general_inquiry') NOT NULL DEFAULT 'general_inquiry',
        priority enum('HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
        customerStatus enum('existing','new','internal','system') NOT NULL DEFAULT 'new',
        ticketStatus enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
        assignedTo varchar(256),
        notes text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT support_tickets_id PRIMARY KEY(id),
        CONSTRAINT support_tickets_messageId_unique UNIQUE(messageId)
      )
    `);

    tablesEnsured = true;
    console.log("[Postmark Inbound] Tables ensured");
  } catch (err) {
    console.error("[Postmark Inbound] Error ensuring tables:", err);
  }
}

// ─── Main Postmark inbound webhook handler ───────────────────────────────────
export async function handlePostmarkInbound(req: Request, res: Response) {
  try {
    const payload = req.body;

    // Log the incoming payload (truncated for safety)
    console.log(
      "[Postmark Inbound] Received payload:",
      JSON.stringify(payload, null, 2).substring(0, 2000)
    );

    // ── Normalize Postmark format to our internal format ────────────────────
    const messageId: string | undefined = payload?.MessageID;
    const fromEmail: string | undefined = payload?.FromFull?.Email ?? payload?.From;
    const fromName: string | undefined = payload?.FromFull?.Name ?? "";
    const subject: string | undefined = payload?.Subject ?? "";
    const bodyText: string | undefined = payload?.TextBody ?? payload?.StrippedTextReply ?? "";
    const bodyHtml: string | undefined = payload?.HtmlBody ?? "";
    const dateStr: string | undefined = payload?.Date;

    if (!messageId || !fromEmail) {
      console.warn("[Postmark Inbound] Missing required fields (MessageID, FromFull.Email)");
      res.status(200).json({ error: "Missing required fields" });
      // Return 200 to prevent Postmark from retrying
      return;
    }

    // ── Skip system/automated emails (Postmark notifications, etc.) ────────
    const lowerFrom = fromEmail.toLowerCase();
    if (
      lowerFrom.includes("postmarkapp.com") ||
      lowerFrom.includes("mailer-daemon") ||
      lowerFrom.includes("noreply") ||
      lowerFrom.includes("no-reply")
    ) {
      console.log(`[Postmark Inbound] Skipping system email from ${fromEmail}`);
      res.status(200).json({ received: true, skipped: true, reason: "system_email" });
      return;
    }

    // ── Database ────────────────────────────────────────────────────────────
    const db = await getDb();
    if (!db) {
      console.error("[Postmark Inbound] Database not available");
      res.status(200).json({ error: "Database unavailable" });
      return;
    }

    // ── Ensure tables exist ────────────────────────────────────────────────
    await ensureTablesExist(db);

    // ── Deduplication ──────────────────────────────────────────────────────
    const existingEmail = await db
      .select({ id: gmailIncomingEmails.id })
      .from(gmailIncomingEmails)
      .where(eq(gmailIncomingEmails.messageId, messageId))
      .limit(1);

    if (existingEmail.length > 0) {
      console.log(`[Postmark Inbound] Duplicate messageId ${messageId} — skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    // ── Parse email date ────────────────────────────────────────────────────
    let emailDate: Date | null = null;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        emailDate = parsed;
      }
    }

    // ── Insert into gmail_incoming_emails (raw storage) ─────────────────────
    const [insertResult] = await db.insert(gmailIncomingEmails).values({
      messageId,
      threadId: null,
      fromEmail,
      fromName: fromName || null,
      subject: subject || null,
      bodyText: bodyText ? String(bodyText).substring(0, 65000) : null,
      bodyHtml: bodyHtml ? String(bodyHtml).substring(0, 65000) : null,
      emailDate,
      status: "processed",
      rawPayload: JSON.stringify(payload).substring(0, 65000),
    });

    const gmailEmailId = (insertResult as any).insertId;

    console.log(
      `[Postmark Inbound] Stored email messageId=${messageId} from=${fromEmail} subject="${subject}"`
    );

    // ── Categorization Engine ───────────────────────────────────────────────
    const { category, priority } = categorizeEmail({
      fromEmail,
      fromName: fromName || "",
      subject: subject || "",
      bodyText: bodyText || "",
    });

    // ── Customer Status ────────────────────────────────────────────────────
    let hasExistingEmails = false;
    try {
      const previousEmails = await db
        .select({ id: gmailIncomingEmails.id })
        .from(gmailIncomingEmails)
        .where(eq(gmailIncomingEmails.fromEmail, fromEmail))
        .limit(2);
      hasExistingEmails = previousEmails.length > 1;
    } catch (err) {
      console.warn("[Postmark Inbound] Error checking existing emails:", err);
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
        `[Postmark Inbound] Created ticket: category=${category} priority=${priority} customerStatus=${customerStatus}`
      );
    } catch (ticketErr) {
      console.error("[Postmark Inbound] Error creating support ticket:", ticketErr);
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
    console.error("[Postmark Inbound] Unhandled error:", err);
    // Always return 200 to prevent Postmark from retrying endlessly
    res.status(200).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
