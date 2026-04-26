import { boolean, float, int, json, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** CloudTalk Agent ID for click-to-call (e.g. 178617) */
  cloudtalkAgentId: varchar("cloudtalkAgentId", { length: 32 }),
  /** Team assignment: 'opening' or 'retention'. Null = unassigned / admin */
  team: mysqlEnum("team", ["opening", "retention"]),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Call analyses table — stores AI analysis results for each uploaded call recording.
 */
export const callAnalyses = mysqlTable("call_analyses", {
  id: int("id").autoincrement().primaryKey(),
  /** The user (rep) who uploaded this call */
  userId: int("userId").notNull(),
  repName: varchar("repName", { length: 256 }),
  /** S3 file key for the audio file */
  audioFileKey: varchar("audioFileKey", { length: 512 }).notNull(),
  audioFileUrl: text("audioFileUrl").notNull(),
  /** Original filename */
  fileName: varchar("fileName", { length: 256 }),
  /** Date of the actual call (not upload date) */
  callDate: timestamp("callDate"),
  /** Close status: closed, not_closed, follow_up */
  closeStatus: mysqlEnum("closeStatus", ["closed", "not_closed", "follow_up"]),
  /** Duration in seconds */
  durationSeconds: float("durationSeconds"),
  /** Status: pending → transcribing → analyzing → done → error */
  status: mysqlEnum("status", ["pending", "transcribing", "analyzing", "done", "error"]).default("pending").notNull(),
  /** Full transcript from Deepgram */
  transcript: text("transcript"),
  /** Rep speech percentage (0-100) */
  repSpeechPct: float("repSpeechPct"),
  /** Overall score (0-100) */
  overallScore: float("overallScore"),
  /** JSON string of the full analysis report */
  analysisJson: text("analysisJson"),
  /** Error message if status=error */
  errorMessage: text("errorMessage"),
  /** Customer name extracted from the call transcript by AI, or manually set */
  customerName: varchar("customerName", { length: 256 }),
  /** Call type — Opening team: cold_call, follow_up. Retention team: live_sub, pre_cycle_cancelled, pre_cycle_decline, end_of_instalment, from_cat, other. Legacy values kept for backward compatibility. */
  callType: mysqlEnum("callType", [
    "cold_call", "follow_up",
    "live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat",
    "other",
    "opening", "retention_win_back"
  ]).default("cold_call"),
  /** User ID of the person who last edited the call details (repName/callDate/closeStatus) */
  lastEditedByUserId: int("lastEditedByUserId"),
  /** Display name of the person who last edited the call details */
  lastEditedByName: varchar("lastEditedByName", { length: 256 }),
  /** Timestamp of the most recent manual edit to call details */
  lastEditedAt: timestamp("lastEditedAt"),
  /** Source of the analysis: 'manual' (uploaded by rep) or 'webhook' (auto from CloudTalk) */
  source: mysqlEnum("source", ["manual", "webhook"]).default("manual").notNull(),
  /** CloudTalk call UUID — used to deduplicate webhook events */
  cloudtalkCallId: varchar("cloudtalkCallId", { length: 128 }),
  /** Contact ID linked to this call (from CRM contacts table) */
  contactId: int("contactId"),
  /** Retention: did the rep save/retain the customer? (extracted from AI report) */
  saved: boolean("saved"),
  /** Retention: did the rep attempt an upsell? */
  upsellAttempted: boolean("upsellAttempted"),
  /** Retention: did the upsell succeed? */
  upsellSucceeded: boolean("upsellSucceeded"),
  /** Retention: reason the customer wanted to cancel */
  cancelReason: varchar("cancelReason", { length: 128 }),
  /** JSON array of word-level timestamps from Deepgram: [{word, start, end, speaker}] */
  wordTimestamps: text("wordTimestamps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallAnalysis = typeof callAnalyses.$inferSelect;
export type InsertCallAnalysis = typeof callAnalyses.$inferInsert;

/**
 * AI Feedback table — stores flags/corrections submitted by reps and managers
 * to help improve the AI prompt over time.
 */
export const aiFeedback = mysqlTable("ai_feedback", {
  id: int("id").autoincrement().primaryKey(),
  /** The analysis being flagged */
  analysisId: int("analysisId").notNull(),
  /** The user submitting the feedback */
  userId: int("userId").notNull(),
  /** Which section is incorrect: overall, script_compliance, tone, talk_ratio, recommendations, transcript, other */
  section: mysqlEnum("section", ["overall", "script_compliance", "tone", "talk_ratio", "recommendations", "transcript", "other"]).notNull(),
  /** What the issue is */
  issue: varchar("issue", { length: 512 }).notNull(),
  /** Optional free-text comment */
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiFeedback = typeof aiFeedback.$inferSelect;
export type InsertAiFeedback = typeof aiFeedback.$inferInsert;

/**
 * Contacts (CRM) table — customer/lead cards imported from CSV or created manually.
 */
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  /** Full name */
  name: varchar("name", { length: 256 }).notNull(),
  /** Email address */
  email: varchar("email", { length: 320 }),
  /** Phone number (UK format) */
  phone: varchar("phone", { length: 64 }),
  /**
   * Lead type — matches the Type of Lead column from the CSV:
   * Pre Cycle, Pre-Cycle-Cancelled, Pre-Cycle-Decline,
   * Cycle 1, Cycle 2, Cycle 3+, Cancel 2+ Cycle,
   * Live Sub 3 Days, Live Sub 7 Days, Live Sub 14days+,
   * Live Sub 2nd+, Live Sub Declined 2nd+,
   * Owned Sub, Same day as charge cancel, Warm lead, Other
   */
  leadType: varchar("leadType", { length: 128 }),
  /**
   * Current status of this contact:
   * new, open, working, assigned, done_deal, retained_sub, cancelled_sub, closed
   */
  status: mysqlEnum("status", [
    "new", "open", "working", "assigned",
    "done_deal", "retained_sub", "cancelled_sub", "closed", "skipped"
  ]).default("new").notNull(),
  /** Agent name assigned to this contact */
  agentName: varchar("agentName", { length: 256 }),
  /** Agent sub-address email e.g. trial+matthew@lavielabs.com — used as From address when emailing this contact */
  agentEmail: varchar("agentEmail", { length: 320 }),
  /** User ID of the assigned agent (if they have an account) */
  assignedUserId: int("assignedUserId"),
  /** Original notes from the CSV (reason for cancellation etc.) */
  importedNotes: text("importedNotes"),
  /** Source of the lead: e.g. UK Best Offers, Facebook, Website */
  source: varchar("source", { length: 128 }),
  /** Date the lead was created / imported */
  leadDate: timestamp("leadDate"),
  /** Next callback reminder datetime */
  callbackAt: timestamp("callbackAt"),
  /** CloudTalk contact ID — set after successful sync so we can upsert on next sync */
  cloudtalkId: varchar("cloudtalkId", { length: 64 }),
  /** Skin type captured during Workspace call — dry, combination, oily */
  skinType: varchar("skinType", { length: 64 }),
  /** Main skin concern captured during Workspace call */
  concern: varchar("concern", { length: 128 }),
  /** Skincare routine captured during Workspace call */
  routine: varchar("routine", { length: 64 }),
  /** Trial kit preference captured during Workspace call */
  trialKit: varchar("trialKit", { length: 64 }),
  /** Free-text notes entered by the rep during/after a Workspace call */
  callNotes: text("callNotes"),
  /** Full postal address (street, town, county, postcode) */
  address: text("address"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

/**
 * Call notes table — one row per note added by a rep after/during a call.
 */
export const contactCallNotes = mysqlTable("contact_call_notes", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  /** The rep who added this note */
  userId: int("userId"),
  agentName: varchar("agentName", { length: 256 }),
  note: text("note").notNull(),
  /** Status update made alongside this note */
  statusAtTime: varchar("statusAtTime", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactCallNote = typeof contactCallNotes.$inferSelect;
export type InsertContactCallNote = typeof contactCallNotes.$inferInsert;

/**
 * Phone Numbers pool — tracks all UK numbers used by the team.
 * Status lifecycle: pool → active → pool (released) or spam (auto-deleted from CloudTalk).
 * CRITICAL: marking a number as 'spam' MUST trigger DELETE /numbers/delete/{cloudtalkNumberId}.json
 * on CloudTalk immediately to stop billing.
 */
export const phoneNumbers = mysqlTable("phone_numbers", {
  id: int("id").autoincrement().primaryKey(),
  /** UK phone number in E.164 format e.g. +447893942312 */
  number: varchar("number", { length: 32 }).notNull().unique(),
  /** Status: pool = unassigned, active = assigned to an agent, spam = blocked/deleted from CloudTalk */
  status: mysqlEnum("status", ["pool", "active", "spam"]).default("pool").notNull(),
  /** User ID of the agent currently assigned to this number (null if pool/spam) */
  assignedUserId: int("assignedUserId"),
  /** Agent name for display (denormalised for speed) */
  assignedAgentName: varchar("assignedAgentName", { length: 256 }),
  /** CloudTalk internal number ID — required for DELETE /numbers/delete/{id}.json */
  cloudtalkNumberId: varchar("cloudtalkNumberId", { length: 64 }),
  /** Notes about this number (e.g. "Was Cat's primary number", "High spam rate") */
  notes: text("notes"),
  /** When the number was marked as spam */
  spamMarkedAt: timestamp("spamMarkedAt"),
  /** When the number was assigned to the current agent */
  assignedAt: timestamp("assignedAt"),
  /** JSON array of assignment history: [{agentName, assignedAt, releasedAt}] */
  historyJson: text("historyJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type InsertPhoneNumber = typeof phoneNumbers.$inferInsert;

/**
 * Email templates — HTML email templates with variable placeholders.
 * Supported placeholders (auto-filled at send time):
 *   ${Customers.First Name}   → contact first name
 *   ${Customers.Customers Owner} → agent name assigned to contact
 *   ${agentName}              → sending agent's full name
 *   ${agentEmail}             → sending agent's email address
 */
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable template name shown in the picker */
  name: varchar("name", { length: 256 }).notNull(),
  /** Email subject line (also supports placeholders) */
  subject: varchar("subject", { length: 512 }).notNull(),
  /** Full HTML body of the email */
  htmlBody: text("htmlBody").notNull(),
  /** Short description shown in the template picker */
  description: varchar("description", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

/**
 * Email send log — records every email sent to a contact.
 */
export const emailLogs = mysqlTable("email_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** Contact the email was sent to */
  contactId: int("contactId").notNull(),
  /** Template used */
  templateId: int("templateId").notNull(),
  templateName: varchar("templateName", { length: 256 }),
  /** Agent who sent the email */
  sentByUserId: int("sentByUserId").notNull(),
  sentByName: varchar("sentByName", { length: 256 }),
  /** Resolved subject (after placeholder substitution) */
  subject: varchar("subject", { length: 512 }),
  /** Recipient email address */
  toEmail: varchar("toEmail", { length: 320 }),
  /** Postmark message ID for tracking */
  postmarkMessageId: varchar("postmarkMessageId", { length: 128 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

// ── Pitch Customizations ──
export const pitchCustomizations = mysqlTable("pitch_customizations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  stageNum: int("stage_num").notNull(),
  customContent: json("custom_content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("pitch_customizations_user_stage_unique").on(table.userId, table.stageNum),
]);
export type PitchCustomization = typeof pitchCustomizations.$inferSelect;

/**
 * Payment form submissions — customer details collected via the public /pay page.
 * Card details are stored temporarily until processed by the billing team.
 */
export const formSubmissions = mysqlTable("form_submissions", {
  id: int("id").autoincrement().primaryKey(),
  /** Customer email */
  email: varchar("email", { length: 320 }).notNull(),
  /** Cardholder name (may be empty for Stripe payments until webhook fires) */
  cardholderName: varchar("cardholderName", { length: 256 }).notNull().default(""),
  /** Card number (last 4 digits only stored for security) */
  cardLast4: varchar("cardLast4", { length: 4 }),
  /** Card expiry MM/YY */
  cardExpiry: varchar("cardExpiry", { length: 8 }),
  /** Billing address line 1 */
  addressLine1: varchar("addressLine1", { length: 256 }),
  /** Billing address line 2 */
  addressLine2: varchar("addressLine2", { length: 256 }),
  /** City / Town */
  city: varchar("city", { length: 128 }),
  /** Postcode */
  postcode: varchar("postcode", { length: 16 }),
  /** Which agent sent the link (if tracked) */
  agentName: varchar("agentName", { length: 256 }),
  /** Stripe PaymentIntent ID — set when payment is initiated via Stripe */
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  /** Payment method: 'card', 'apple_pay', 'google_pay', or null for manual */
  paymentMethod: varchar("paymentMethod", { length: 32 }),
  /** Status: new, processed, failed */
  status: mysqlEnum("status", ["new", "processed", "failed"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertFormSubmission = typeof formSubmissions.$inferInsert;

// ── Manager Command Centre: Lead Assignments ──
/**
 * Lead assignments table — tracks retention leads imported from Zoho Billing / CSV.
 * Each row represents a customer subscription that needs retention work.
 * This is a NEW table that does NOT modify any existing tables.
 */
export const leadAssignments = mysqlTable("lead_assignments", {
  id: int("id").autoincrement().primaryKey(),
  /** Zoho Billing subscription ID — unique identifier for deduplication */
  subscriptionId: varchar("subscriptionId", { length: 128 }).notNull().unique(),
  /** Zoho customer ID */
  customerId: varchar("customerId", { length: 128 }),
  /** Customer full name */
  customerName: varchar("customerName", { length: 256 }),
  /** Customer email */
  email: varchar("email", { length: 320 }),
  /** Customer phone */
  phone: varchar("phone", { length: 64 }),
  /** Lead category: installment or subscription */
  leadCategory: varchar("leadCategory", { length: 32 }).default("subscription"),
  /** Classified lead type: pre_cycle_cancelled, live_sub_healthy, etc. */
  leadType: varchar("leadType", { length: 64 }),
  /** Subscription plan name from Zoho */
  planName: varchar("planName", { length: 256 }),
  /** Total billing cycles on the plan */
  billingCycles: int("billingCycles").default(0),
  /** Number of cycles the customer has completed */
  cyclesCompleted: int("cyclesCompleted").default(0),
  /** Total amount the customer has spent (in minor currency units or decimal) */
  totalSpend: float("totalSpend").default(0),
  /** Monthly subscription amount */
  monthlyAmount: float("monthlyAmount").default(0),
  /** Currency code e.g. GBP, USD */
  currencyCode: varchar("currencyCode", { length: 8 }).default("GBP"),
  /** Zoho billing status: cancelled, non_renewing, expired, unpaid, live */
  billingStatus: varchar("billingStatus", { length: 32 }),
  /** Retry attempts for failed payments */
  retryAttempts: int("retryAttempts").default(0),
  /** Urgency score 0-100 computed by lead engine */
  urgencyScore: int("urgencyScore").default(0),
  /** JSON string of urgency flags */
  urgencyFlags: text("urgencyFlags"),
  /** Event date — when the lead type changed (cancellation date, decline date, etc.) */
  eventDate: varchar("eventDate", { length: 32 }),
  /** Agent name assigned to this lead */
  assignedAgent: varchar("assignedAgent", { length: 128 }),
  /** Timestamp (ms) when the lead was assigned */
  assignedAt: float("assignedAt"),
  /** Work status: new, assigned, in_progress, retained, done_deal, etc. */
  workStatus: varchar("workStatus", { length: 32 }).default("new"),
  /** Timestamp (ms) when the work status was last changed */
  statusChangedAt: float("statusChangedAt"),
  /** Manager note */
  managerNote: text("managerNote"),
  /** Agent note */
  agentNote: text("agentNote"),
  /** Number of call attempts made */
  attemptCount: int("attemptCount").default(0),
  /** Number of consecutive no-answer attempts */
  noAnswerCount: int("noAnswerCount").default(0),
  /** Timestamp (ms) of the last call */
  lastCallAt: float("lastCallAt"),
  /** Result of the last call */
  lastCallResult: varchar("lastCallResult", { length: 32 }),
  /** Scheduled callback timestamp (ms) */
  callbackAt: float("callbackAt"),
  /** Follow-up timestamp (ms) */
  followUpAt: float("followUpAt"),
  /** Follow-up note */
  followUpNote: text("followUpNote"),
  /** Last transaction date from Zoho */
  lastTransactionDate: varchar("lastTransactionDate", { length: 32 }),
  /** Last shipment date from Zoho */
  lastShipmentDate: varchar("lastShipmentDate", { length: 32 }),
  /** Cancelled-at date from Zoho */
  cancelledAt: varchar("cancelledAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadAssignment = typeof leadAssignments.$inferSelect;
export type InsertLeadAssignment = typeof leadAssignments.$inferInsert;

// ── Manager Command Centre: Call Attempts ──
/**
 * Call attempts table — logs each call attempt made by an agent on a lead.
 */
export const callAttempts = mysqlTable("call_attempts", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to lead_assignments.subscriptionId */
  subscriptionId: varchar("subscriptionId", { length: 128 }).notNull(),
  /** Agent who made the call */
  agentName: varchar("agentName", { length: 128 }),
  /** Call result: retained, done_deal, no_answer, callback, etc. */
  result: varchar("result", { length: 32 }),
  /** Optional note about the call */
  note: text("note"),
  /** Scheduled callback timestamp (ms) */
  callbackAt: float("callbackAt"),
  /** Follow-up timestamp (ms) */
  followUpAt: float("followUpAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallAttempt = typeof callAttempts.$inferSelect;
export type InsertCallAttempt = typeof callAttempts.$inferInsert;

/**
 * Incoming Gmail emails — stores emails received via the Google Apps Script webhook.
 * Each row represents one email forwarded from the support@lavielabs.com inbox.
 */
export const gmailIncomingEmails = mysqlTable("gmail_incoming_emails", {
  id: int("id").autoincrement().primaryKey(),
  /** Gmail message ID for deduplication */
  messageId: varchar("messageId", { length: 256 }).notNull().unique(),
  /** Gmail thread ID */
  threadId: varchar("threadId", { length: 256 }),
  /** Sender email address */
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  /** Sender display name */
  fromName: varchar("fromName", { length: 256 }),
  /** Email subject line */
  subject: varchar("subject", { length: 512 }),
  /** Plain-text body (truncated to 64KB) */
  bodyText: text("bodyText"),
  /** HTML body (truncated to 64KB) */
  bodyHtml: text("bodyHtml"),
  /** Original email date from Gmail */
  emailDate: timestamp("emailDate"),
  /** Processing status: received, processed, error */
  status: mysqlEnum("status", ["received", "processed", "error"]).default("received").notNull(),
  /** Error message if processing failed */
  errorMessage: text("errorMessage"),
  /** Raw JSON payload from the webhook for debugging */
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GmailIncomingEmail = typeof gmailIncomingEmails.$inferSelect;
export type InsertGmailIncomingEmail = typeof gmailIncomingEmails.$inferInsert;
