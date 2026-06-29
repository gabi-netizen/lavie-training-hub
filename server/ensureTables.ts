/**
 * Ensure required database tables exist.
 * Runs CREATE TABLE IF NOT EXISTS on startup so we don't need
 * to manually run migrations on Railway.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * One-time data fix: correct team assignments for Rob and Guy.
 * Rob (rob.c@lavielabs.com) is Retention, not Opening.
 * Guy (guy@lavielabs.com) is Customer Care — no team assignment.
 * Safe to run repeatedly (idempotent).
 */
export async function fixAgentTeamAssignments() {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      UPDATE users
      SET team = 'retention'
      WHERE email = 'rob.c@lavielabs.com' AND (team = 'opening' OR team IS NULL)
    `);
    await db.execute(sql`
      UPDATE users
      SET team = NULL
      WHERE email = 'guy@lavielabs.com'
    `);
    console.log("[DB] Agent team assignments corrected (Rob=retention, Guy=null)");
  } catch (err) {
    console.error("[DB] Error fixing agent team assignments:", err);
  }
}

export async function ensureSupportTicketsTable() {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] Cannot ensure tables: database not available");
    return;
  }

  // ── gmail_incoming_emails (migration 0028) ─────────────────────────────────
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
    console.log("[DB] gmail_incoming_emails table ensured");
  } catch (err) {
    console.error("[DB] Error creating gmail_incoming_emails table:", err);
  }

  // ── support_tickets (migration 0029) ───────────────────────────────────────
  try {
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
    console.log("[DB] support_tickets table ensured");
  } catch (err) {
    console.error("[DB] Error creating support_tickets table:", err);
  }

  try {
    await db.execute(sql`
      ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS firstAgentReplyAt timestamp NULL;
    `);
    console.log("[DB] support_tickets.firstAgentReplyAt column ensured");
  } catch (err) {
    console.error("[DB] Error adding firstAgentReplyAt column:", err);
  }

  // ── lead_assignments.callbackNotifiedAt (callback reminder tracking) ────────
  try {
    await db.execute(sql`
      ALTER TABLE lead_assignments ADD COLUMN IF NOT EXISTS callbackNotifiedAt float NULL;
    `);
    console.log("[DB] lead_assignments.callbackNotifiedAt column ensured");
  } catch (err) {
    console.error("[DB] Error adding callbackNotifiedAt column:", err);
  }

  // ── lead_assignments.callbackNote (callback reason/notes) ────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE lead_assignments ADD COLUMN IF NOT EXISTS callbackNote text NULL;
    `);
    console.log("[DB] lead_assignments.callbackNote column ensured");
  } catch (err) {
    console.error("[DB] Error adding callbackNote column:", err);
  }

  // ── lead_assignments.followUpAt (follow-up scheduled timestamp ms) ──────────
  try {
    await db.execute(sql`
      ALTER TABLE lead_assignments ADD COLUMN IF NOT EXISTS followUpAt bigint NULL;
    `);
    console.log("[DB] lead_assignments.followUpAt column ensured");
  } catch (err) {
    console.error("[DB] Error adding followUpAt column:", err);
  }

  // ── lead_assignments.followUpNote (follow-up reason/notes) ────────────────
  try {
    await db.execute(sql`
      ALTER TABLE lead_assignments ADD COLUMN IF NOT EXISTS followUpNote text NULL;
    `);
    console.log("[DB] lead_assignments.followUpNote column ensured");
  } catch (err) {
    console.error("[DB] Error adding followUpNote column:", err);
  }
}
