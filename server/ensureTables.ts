/**
 * Ensure required database tables exist.
 * Runs CREATE TABLE IF NOT EXISTS on startup so we don't need
 * to manually run migrations on Railway.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Known Opening team agents — email is the reliable identifier.
 * CloudTalk uses nicknames; this is the source of truth for display names.
 * Add new agents here as the team grows.
 */
const OPENING_AGENTS: { email: string; name: string }[] = [
  { email: "debbie.f@lavielabs.com",  name: "Debbie Holmes" },
  { email: "matthew.h@lavielabs.com", name: "Matt Holeman" },
  { email: "ryan.s@lavielabs.com",    name: "Ryan Spence" },
  { email: "shola.m@lavielabs.com",   name: "Shola Marie" },
  { email: "alan.c@lavielabs.com",    name: "Alan Campbell" },
  { email: "angel.b@lavielabs.com",   name: "Angel Breheny" },
  { email: "nisha.g@lavielabs.com",   name: "Nisha Greenwood" },
  { email: "darrell@lavielabs.com",   name: "Darrel Loynes" },
  { email: "harrison.j@lavielabs.com",name: "Harrison Joslin" },
  { email: "paige.t@lavielabs.com",   name: "Paige Taylor" },
  { email: "ava.m@lavielabs.com",     name: "Ava Monroe" },
  { email: "yasmeen@lavielabs.com",   name: "Yasmeen El-Mansoob" },
  { email: "ashley.w@lavielabs.com",  name: "Ash Williams" },
];

/**
 * Set team assignments for all known agents.
 * - Opening agents: team = 'opening', name set if not already set
 * - Rob: team = 'retention'
 * - Guy: team = NULL (Customer Care)
 * Safe to run repeatedly (idempotent).
 */
export async function fixAgentTeamAssignments() {
  const db = await getDb();
  if (!db) return;
  try {
    // Set opening team + real name for all known opening agents
    for (const agent of OPENING_AGENTS) {
      await db.execute(sql`
        UPDATE users
        SET team = 'opening',
            name = CASE WHEN (name IS NULL OR name = '') THEN ${agent.name} ELSE name END
        WHERE email = ${agent.email}
      `);
    }
    // Fix Rob (Retention) and Guy (Customer Care / null)
    await db.execute(sql`
      UPDATE users
      SET team = 'retention'
      WHERE email = 'rob.c@lavielabs.com'
    `);
    await db.execute(sql`
      UPDATE users
      SET team = NULL
      WHERE email = 'guy@lavielabs.com'
    `);
    console.log("[DB] Agent team assignments corrected (Opening team set, Rob=retention, Guy=null)");
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
}
