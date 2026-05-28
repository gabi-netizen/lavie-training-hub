import { boolean, date, decimal, float, int, json, mediumtext, mysqlEnum, mysqlTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

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
  /** Team assignment: 'opening', 'retention', or 'academy'. Null = unassigned / admin */
  team: mysqlEnum("team", ["opening", "retention", "academy"]),
  /** Whether the user account is active. Disabled users cannot log in. */
  active: boolean("active").default(true).notNull(),
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
  /** Full transcript from Deepgram (mediumtext — supports up to 16 MB for long calls) */
  transcript: mediumtext("transcript"),
  /** Rep speech percentage (0-100) */
  repSpeechPct: float("repSpeechPct"),
  /** Overall score (0-100) */
  overallScore: float("overallScore"),
  /** JSON string of the full analysis report (mediumtext — supports up to 16 MB) */
  analysisJson: mediumtext("analysisJson"),
  /** Error message if status=error (mediumtext — supports up to 16 MB) */
  errorMessage: mediumtext("errorMessage"),
  /** Customer name extracted from the call transcript by AI, or manually set */
  customerName: varchar("customerName", { length: 256 }),
  /** Contact name sent by CloudTalk webhook (payload.contact_name) */
  contactName: varchar("contactName", { length: 256 }),
  /** External (customer) phone number sent by CloudTalk webhook (payload.external_number) */
  externalNumber: varchar("externalNumber", { length: 64 }),
  /** Call type — Opening team: cold_call, follow_up. Retention team: live_sub, pre_cycle_cancelled, pre_cycle_decline, end_of_instalment, from_cat, other. Legacy values kept for backward compatibility. */
  callType: mysqlEnum("callType", [
    "cold_call", "follow_up",
    "live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat",
    "other",
    "opening", "retention_win_back",
    "instalment_decline"
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
  /** JSON array of word-level timestamps from Deepgram: [{word, start, end, speaker}] (mediumtext — supports up to 16 MB for long calls) */
  wordTimestamps: mediumtext("wordTimestamps"),
  /** Unique share token for public sharing — generated on first share click */
  shareToken: varchar("shareToken", { length: 64 }).unique(),
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
    "done_deal", "retained_sub", "cancelled_sub", "closed", "skipped",
    "do_not_call", "no_answer", "done"
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
  /** Department: opening or retention. Default opening. */
  department: mysqlEnum("department", ["opening", "retention"]).default("opening").notNull(),
  /** JSON array of current brand names e.g. ["Clinique","Elemis"] */
  brands: varchar("brands", { length: 512 }),
  /** Stripe Customer ID — set after successful payment */
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }),
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
  /** Optional header image URL displayed at the top of the email template */
  headerImageUrl: varchar("headerImageUrl", { length: 500 }),
  /**
   * Visibility JSON — controls who can see this template.
   * Format: {"type":"everyone"} | {"type":"team","value":"opening"|"retention"} | {"type":"agents","ids":[1,2,3]}
   * Default: everyone
   */
  visibility: text("visibility"),
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
  /** HTML body of the sent email (for viewing in Emails tab) */
  htmlBody: text("htmlBody"),
  /** From address used when sending */
  fromEmail: varchar("fromEmail", { length: 320 }),
  /** When the email was first opened (tracking pixel hit) */
  openedAt: timestamp("openedAt"),
  /** Number of times the email was opened */
  openCount: int("openCount").default(0).notNull(),
  /** When a link in the email was first clicked */
  clickedAt: timestamp("clickedAt"),
  /** Number of link clicks across all links */
  clickCount: int("clickCount").default(0).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

/**
 * Email link clicks — records each click on a tracked link in a sent email.
 */
export const emailLinkClicks = mysqlTable("email_link_clicks", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the email_logs row */
  emailLogId: int("emailLogId").notNull(),
  /** Zero-based index of the link in the email HTML */
  linkIndex: int("linkIndex").notNull(),
  /** The original URL the link pointed to */
  originalUrl: text("originalUrl").notNull(),
  /** When the link was clicked */
  clickedAt: timestamp("clickedAt").defaultNow().notNull(),
});
export type EmailLinkClick = typeof emailLinkClicks.$inferSelect;
export type InsertEmailLinkClick = typeof emailLinkClicks.$inferInsert;

/**
 * Email notifications — real-time alerts for agents when emails are opened or links clicked.
 */
export const emailNotifications = mysqlTable("email_notifications", {
  id: int("id").autoincrement().primaryKey(),
  /** The agent who should see this notification (sentByUserId from email_logs) */
  userId: int("userId").notNull(),
  /** Reference to the email_logs row */
  emailLogId: int("emailLogId").notNull(),
  /** Notification type */
  type: mysqlEnum("type", ["opened", "clicked"]).notNull(),
  /** Contact ID for display purposes */
  contactId: int("contactId").notNull(),
  /** Contact name for display (denormalized) */
  contactName: varchar("contactName", { length: 256 }),
  /** When the notification was created */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** When the agent read/dismissed this notification */
  readAt: timestamp("readAt"),
});
export type EmailNotification = typeof emailNotifications.$inferSelect;
export type InsertEmailNotification = typeof emailNotifications.$inferInsert;

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
  /** Contact ID linked to this lead (from CRM contacts table) */
  contactId: int("contactId"),
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
  /** Which address the email was sent TO (e.g. "guy@lavielabs.com", "support@lavielabs.com") */
  recipient: varchar("recipient", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GmailIncomingEmail = typeof gmailIncomingEmails.$inferSelect;
export type InsertGmailIncomingEmail = typeof gmailIncomingEmails.$inferInsert;

/**
 * Support Tickets — categorized emails from the Gmail webhook.
 * Each ticket represents one incoming email that has been categorized
 * by the rule-based engine and is tracked through the Command Centre.
 */
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the gmail_incoming_emails row */
  gmailEmailId: int("gmailEmailId"),
  /** Gmail message ID for deduplication */
  messageId: varchar("messageId", { length: 256 }).unique(),
  /** Sender email address */
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  /** Sender display name */
  fromName: varchar("fromName", { length: 256 }),
  /** Email subject line */
  subject: varchar("subject", { length: 512 }),
  /** Plain-text email body */
  body: text("body"),
  /** When the email was originally received */
  receivedAt: timestamp("receivedAt"),
  /** Auto-detected category */
  category: mysqlEnum("category", [
    "cancellation_request",
    "shipping_delivery_issue",
    "payment_billing_dispute",
    "address_update",
    "product_feedback",
    "agent_forwarded",
    "system_automated",
    "follow_up_unanswered",
    "subscription_question",
    "general_inquiry",
  ]).default("general_inquiry").notNull(),
  /** Priority based on category */
  priority: mysqlEnum("priority", ["HIGH", "MEDIUM", "LOW"]).default("MEDIUM").notNull(),
  /** Customer status: existing, new, internal, system */
  customerStatus: mysqlEnum("customerStatus", ["existing", "new", "internal", "system"]).default("new").notNull(),
  /** Ticket workflow status */
  status: mysqlEnum("ticketStatus", ["open", "in_progress", "awaiting_response", "customer_replied", "resolved", "closed"]).default("open").notNull(),
  /** Agent assigned to handle this ticket */
  assignedTo: varchar("assignedTo", { length: 256 }),
  /** Internal notes about this ticket */
  notes: text("notes"),
  /** Which address the email was sent TO (e.g. "guy@lavielabs.com", "support@lavielabs.com") */
  recipient: varchar("recipient", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// ─── Opening Dashboard Tables ─────────────────────────────────────────────────

/**
 * Opening trials — individual trial records per agent per month.
 * Each row represents one trial subscription opened by an agent.
 */
export const openingTrials = mysqlTable("opening_trials", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: varchar("subscription_id", { length: 50 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  planName: varchar("plan_name", { length: 255 }),
  createdDate: date("created_date").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  classification: varchar("classification", { length: 50 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  termStart: date("term_start"),
  termEnd: date("term_end"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type OpeningTrial = typeof openingTrials.$inferSelect;
export type InsertOpeningTrial = typeof openingTrials.$inferInsert;

/**
 * Agent working days — Hubstaff hours tracking per agent per date.
 * Used to calculate working days for the Opening Dashboard.
 */
export const agentWorkingDays = mysqlTable("agent_working_days", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  workDate: date("work_date").notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull().default("0"),
  isManualOverride: boolean("is_manual_override").default(false),
  month: varchar("month", { length: 7 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AgentWorkingDay = typeof agentWorkingDays.$inferSelect;
export type InsertAgentWorkingDay = typeof agentWorkingDays.$inferInsert;

/**
 * Manual overrides log — audit trail for manual hour changes.
 * Used to trigger email alerts when hours are manually adjusted.
 */
export const manualOverridesLog = mysqlTable("manual_overrides_log", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  workDate: date("work_date").notNull(),
  oldHours: decimal("old_hours", { precision: 5, scale: 2 }),
  newHours: decimal("new_hours", { precision: 5, scale: 2 }).notNull(),
  changedBy: varchar("changed_by", { length: 100 }).notNull(),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});
export type ManualOverrideLog = typeof manualOverridesLog.$inferSelect;
export type InsertManualOverrideLog = typeof manualOverridesLog.$inferInsert;

/**
 * Agent daily hours — daily Hubstaff activity data per agent.
 * Stores hours tracked each day and a pre-calculated working_day_value:
 *   hours_tracked >= 7 → 1.00
 *   hours_tracked < 7 → hours_tracked / 8 (rounded to 2 decimals)
 * Used to calculate date-range-aware Working Days for the Opening Dashboard.
 */
export const agentDailyHours = mysqlTable("agent_daily_hours", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  date: date("date").notNull(),
  hoursTracked: decimal("hours_tracked", { precision: 5, scale: 2 }).notNull().default("0"),
  workingDayValue: decimal("working_day_value", { precision: 3, scale: 2 }).notNull().default("0"),
  hubstaffUserId: int("hubstaff_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_agent_date").on(table.agentName, table.date),
]);
export type AgentDailyHour = typeof agentDailyHours.$inferSelect;
export type InsertAgentDailyHour = typeof agentDailyHours.$inferInsert;

/**
 * Agent trials override — manual override for the Trials count per agent per month.
 * When an override exists for an agent+month, the dashboard uses this value
 * instead of the Zoho-derived trial count.
 */
export const agentTrialsOverride = mysqlTable("agent_trials_override", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  trialsCount: int("trials_count").notNull(),
  dbCountAtOverride: int("db_count_at_override").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => [
  unique("agent_trials_override_agent_month_unique").on(table.agentName, table.month),
]);
export type AgentTrialsOverride = typeof agentTrialsOverride.$inferSelect;
export type InsertAgentTrialsOverride = typeof agentTrialsOverride.$inferInsert;

/**
 * Support Ticket Replies — conversation thread for each support ticket.
 * Stores both outbound (agent replies) and inbound (customer follow-ups).
 */
export const supportTicketReplies = mysqlTable("support_ticket_replies", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the parent support ticket */
  ticketId: int("ticketId").notNull(),
  /** Direction: 'inbound' (customer) or 'outbound' (agent) */
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  /** Reply body text */
  body: text("body").notNull(),
  /** When the reply was sent/received */
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  /** Who sent it: agent name for outbound, customer name/email for inbound */
  sentBy: varchar("sentBy", { length: 256 }).notNull(),
});

export type SupportTicketReply = typeof supportTicketReplies.$inferSelect;
export type InsertSupportTicketReply = typeof supportTicketReplies.$inferInsert;

/**
 * Blocked Senders — emails that should be silently dropped by the inbound webhook.
 * When an email arrives from a blocked sender, no ticket is created.
 */
export const blockedSenders = mysqlTable("blocked_senders", {
  id: int("id").autoincrement().primaryKey(),
  /** The email address to block */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Timestamp when the sender was blocked */
  blockedAt: timestamp("blockedAt").defaultNow().notNull(),
  /** Name of the agent who blocked this sender */
  blockedBy: varchar("blockedBy", { length: 256 }).notNull(),
});

export type BlockedSender = typeof blockedSenders.$inferSelect;
export type InsertBlockedSender = typeof blockedSenders.$inferInsert;

// ─── Blocked Subjects ──────────────────────────────────────────────────────────
export const blockedSubjects = mysqlTable("blocked_subjects", {
  id: int("id").autoincrement().primaryKey(),
  /** Keyword/phrase to match in subject line (case-insensitive contains) */
  keyword: varchar("keyword", { length: 500 }).notNull().unique(),
  /** Timestamp when the rule was created */
  blockedAt: timestamp("blockedAt").defaultNow().notNull(),
  /** Name of the agent who created this rule */
  blockedBy: varchar("blockedBy", { length: 256 }).notNull(),
});

export type BlockedSubject = typeof blockedSubjects.$inferSelect;
export type InsertBlockedSubject = typeof blockedSubjects.$inferInsert;

// ─── WhatsApp Messages ──────────────────────────────────────────────────────────
/**
 * WhatsApp messages table — stores all inbound and outbound WhatsApp messages.
 * Used for the agent inbox/conversation view and message history tracking.
 */
export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  /** Contact this message belongs to (nullable — inbound may not match a contact yet) */
  contactId: int("contactId"),
  /** Message direction: inbound (customer → us) or outbound (us → customer) */
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  /** Message body text content */
  body: text("body"),
  /** Template name used (only for outbound template messages) */
  templateName: text("templateName"),
  /** Agent who sent/owns this conversation (nullable for unmatched inbound) */
  sentByUserId: int("sentByUserId"),
  /** Sender's phone number (E.164 format) */
  fromNumber: text("fromNumber").notNull(),
  /** Recipient's phone number (E.164 format) */
  toNumber: text("toNumber").notNull(),
  /** Twilio Message SID for tracking */
  twilioMessageSid: text("twilioMessageSid"),
  /** Message delivery status */
  status: mysqlEnum("messageStatus", ["sent", "delivered", "read", "failed", "received"]).default("sent").notNull(),
  /** Whether the agent has read this message (for inbox unread indicators) */
  isRead: boolean("isRead").default(false).notNull(),
  /** Media URL (image/video) attached to this message */
  mediaUrl: text("mediaUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = typeof whatsappMessages.$inferInsert;

// ─── WhatsApp Conversation Assignments ────────────────────────────────────────
/**
 * WhatsApp conversation assignments — tracks which agent is assigned to each conversation.
 * Each contact can only have ONE active assignment (latest record wins).
 * Managers can reassign conversations between agents.
 */
export const whatsappConversationAssignments = mysqlTable("whatsapp_conversation_assignments", {
  id: int("id").autoincrement().primaryKey(),
  /** Contact (conversation) being assigned */
  contactId: int("contactId").notNull(),
  /** The agent this conversation is assigned to */
  assignedUserId: int("assignedUserId").notNull(),
  /** The manager who made the assignment */
  assignedByUserId: int("assignedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WhatsappConversationAssignment = typeof whatsappConversationAssignments.$inferSelect;
export type InsertWhatsappConversationAssignment = typeof whatsappConversationAssignments.$inferInsert;

// ─── WhatsApp Conversations ───────────────────────────────────────────────────────────────
/**
 * WhatsApp conversations table — tracks conversation status (open/snoozed/resolved)
 * for each contact. One conversation per contact.
 */
export const whatsappConversations = mysqlTable("whatsapp_conversations", {
  id: int("id").autoincrement().primaryKey(),
  /** Contact this conversation belongs to (unique — one conversation per contact) */
  contactId: int("contactId").notNull().unique(),
  /** Conversation status */
  status: mysqlEnum("conversationStatus", ["open", "snoozed", "resolved"]).default("open").notNull(),
  /** When the conversation is snoozed until (null if not snoozed) */
  snoozedUntil: timestamp("snoozedUntil"),
  /** When the conversation was resolved (null if not resolved) */
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = typeof whatsappConversations.$inferInsert;

// ─── Campaigns ─────────────────────────────────────────────────────────────────
/**
 * Campaigns table — bulk WhatsApp/SMS outreach campaigns.
 * Each campaign targets a filtered set of contacts and sends a template or free-text message.
 */
export const campaigns = mysqlTable("campaigns", {
  id: serial("id").primaryKey(),
  /** Campaign name (human-readable label) */
  name: varchar("name", { length: 255 }).notNull(),
  /** Channel: whatsapp or sms */
  channel: mysqlEnum("channel", ["whatsapp", "sms"]).notNull(),
  /** WhatsApp Content SID / template name (used for WhatsApp campaigns) */
  templateName: varchar("templateName", { length: 255 }),
  /** SMS free-text message body (used for SMS campaigns) */
  messageBody: text("messageBody"),
  /** Campaign lifecycle status */
  status: mysqlEnum("campaignStatus", ["draft", "sending", "completed", "cancelled"]).default("draft").notNull(),
  /** JSON filter criteria used to select contacts (mirrors CRM filter shape) */
  audienceFilter: json("audienceFilter"),
  /** Total number of recipients when campaign was sent */
  totalRecipients: int("totalRecipients").default(0).notNull(),
  /** Number of messages successfully sent */
  sentCount: int("sentCount").default(0).notNull(),
  /** Number of messages delivered */
  deliveredCount: int("deliveredCount").default(0).notNull(),
  /** Number of messages read */
  readCount: int("readCount").default(0).notNull(),
  /** Number of recipients who replied */
  repliedCount: int("repliedCount").default(0).notNull(),
  /** User who created this campaign */
  createdByUserId: int("createdByUserId").notNull(),
  /** When the campaign is scheduled to send (null = manual trigger) */
  scheduledAt: timestamp("scheduledAt"),
  /** When the campaign actually started sending */
  sentAt: timestamp("sentAt"),
  /** When the campaign finished sending all messages */
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── Campaign Sends ────────────────────────────────────────────────────────────
/**
 * Campaign sends table — individual message records for each recipient in a campaign.
 * Tracks delivery lifecycle per recipient.
 */
export const campaignSends = mysqlTable("campaign_sends", {
  id: serial("id").primaryKey(),
  /** Parent campaign */
  campaignId: int("campaignId").notNull(),
  /** Contact this message was sent to (nullable if contact was deleted) */
  contactId: int("contactId"),
  /** Recipient phone number in E.164 format */
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  /** Channel used for this send */
  channel: mysqlEnum("sendChannel", ["whatsapp", "sms"]).notNull(),
  /** Delivery status lifecycle */
  status: mysqlEnum("sendStatus", ["pending", "sent", "delivered", "read", "replied", "failed"]).default("pending").notNull(),
  /** Twilio Message SID for tracking */
  twilioMessageSid: varchar("twilioMessageSid", { length: 50 }),
  /** Error message if send failed */
  errorMessage: text("errorMessage"),
  /** When the message was sent */
  sentAt: timestamp("sentAt"),
  /** When delivery was confirmed */
  deliveredAt: timestamp("deliveredAt"),
  /** When the message was read */
  readAt: timestamp("readAt"),
  /** When the recipient replied */
  repliedAt: timestamp("repliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignSend = typeof campaignSends.$inferSelect;
export type InsertCampaignSend = typeof campaignSends.$inferInsert;
