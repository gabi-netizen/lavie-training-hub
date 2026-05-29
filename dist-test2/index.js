var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  agentDailyHours: () => agentDailyHours,
  agentTrialsOverride: () => agentTrialsOverride,
  agentWorkingDays: () => agentWorkingDays,
  aiFeedback: () => aiFeedback,
  blockedSenders: () => blockedSenders,
  blockedSubjects: () => blockedSubjects,
  callAnalyses: () => callAnalyses,
  callAttempts: () => callAttempts,
  contactCallNotes: () => contactCallNotes,
  contacts: () => contacts,
  emailLogs: () => emailLogs,
  emailTemplates: () => emailTemplates,
  formSubmissions: () => formSubmissions,
  gmailIncomingEmails: () => gmailIncomingEmails,
  leadAssignments: () => leadAssignments,
  manualOverridesLog: () => manualOverridesLog,
  openingTrials: () => openingTrials,
  phoneNumbers: () => phoneNumbers,
  pitchCustomizations: () => pitchCustomizations,
  supportTicketReplies: () => supportTicketReplies,
  supportTickets: () => supportTickets,
  users: () => users,
  whatsappConversationAssignments: () => whatsappConversationAssignments,
  whatsappMessages: () => whatsappMessages
});
import { boolean, date, decimal, float, int, json, mediumtext, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
var users, callAnalyses, aiFeedback, contacts, contactCallNotes, phoneNumbers, emailTemplates, emailLogs, pitchCustomizations, formSubmissions, leadAssignments, callAttempts, gmailIncomingEmails, supportTickets, openingTrials, agentWorkingDays, manualOverridesLog, agentDailyHours, agentTrialsOverride, supportTicketReplies, blockedSenders, blockedSubjects, whatsappMessages, whatsappConversationAssignments;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
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
      active: boolean("active").default(true).notNull()
    });
    callAnalyses = mysqlTable("call_analyses", {
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
        "cold_call",
        "follow_up",
        "live_sub",
        "pre_cycle_cancelled",
        "pre_cycle_decline",
        "end_of_instalment",
        "from_cat",
        "other",
        "opening",
        "retention_win_back",
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    aiFeedback = mysqlTable("ai_feedback", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    contacts = mysqlTable("contacts", {
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
        "new",
        "open",
        "working",
        "assigned",
        "done_deal",
        "retained_sub",
        "cancelled_sub",
        "closed",
        "skipped",
        "do_not_call",
        "no_answer",
        "done"
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    contactCallNotes = mysqlTable("contact_call_notes", {
      id: int("id").autoincrement().primaryKey(),
      contactId: int("contactId").notNull(),
      /** The rep who added this note */
      userId: int("userId"),
      agentName: varchar("agentName", { length: 256 }),
      note: text("note").notNull(),
      /** Status update made alongside this note */
      statusAtTime: varchar("statusAtTime", { length: 64 }),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    phoneNumbers = mysqlTable("phone_numbers", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    emailTemplates = mysqlTable("email_templates", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    emailLogs = mysqlTable("email_logs", {
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
      sentAt: timestamp("sentAt").defaultNow().notNull()
    });
    pitchCustomizations = mysqlTable("pitch_customizations", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("user_id").notNull(),
      stageNum: int("stage_num").notNull(),
      customContent: json("custom_content").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => [
      unique("pitch_customizations_user_stage_unique").on(table.userId, table.stageNum)
    ]);
    formSubmissions = mysqlTable("form_submissions", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    leadAssignments = mysqlTable("lead_assignments", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    callAttempts = mysqlTable("call_attempts", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    gmailIncomingEmails = mysqlTable("gmail_incoming_emails", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    supportTickets = mysqlTable("support_tickets", {
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
        "general_inquiry"
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    openingTrials = mysqlTable("opening_trials", {
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
      createdAt: timestamp("created_at").defaultNow()
    });
    agentWorkingDays = mysqlTable("agent_working_days", {
      id: int("id").autoincrement().primaryKey(),
      agentName: varchar("agent_name", { length: 100 }).notNull(),
      workDate: date("work_date").notNull(),
      hours: decimal("hours", { precision: 5, scale: 2 }).notNull().default("0"),
      isManualOverride: boolean("is_manual_override").default(false),
      month: varchar("month", { length: 7 }).notNull(),
      updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
      createdAt: timestamp("created_at").defaultNow()
    });
    manualOverridesLog = mysqlTable("manual_overrides_log", {
      id: int("id").autoincrement().primaryKey(),
      agentName: varchar("agent_name", { length: 100 }).notNull(),
      workDate: date("work_date").notNull(),
      oldHours: decimal("old_hours", { precision: 5, scale: 2 }),
      newHours: decimal("new_hours", { precision: 5, scale: 2 }).notNull(),
      changedBy: varchar("changed_by", { length: 100 }).notNull(),
      reason: varchar("reason", { length: 500 }),
      createdAt: timestamp("created_at").defaultNow()
    });
    agentDailyHours = mysqlTable("agent_daily_hours", {
      id: int("id").autoincrement().primaryKey(),
      agentName: varchar("agent_name", { length: 100 }).notNull(),
      date: date("date").notNull(),
      hoursTracked: decimal("hours_tracked", { precision: 5, scale: 2 }).notNull().default("0"),
      workingDayValue: decimal("working_day_value", { precision: 3, scale: 2 }).notNull().default("0"),
      hubstaffUserId: int("hubstaff_user_id"),
      createdAt: timestamp("created_at").defaultNow()
    }, (table) => [
      unique("unique_agent_date").on(table.agentName, table.date)
    ]);
    agentTrialsOverride = mysqlTable("agent_trials_override", {
      id: int("id").autoincrement().primaryKey(),
      agentName: varchar("agent_name", { length: 100 }).notNull(),
      month: varchar("month", { length: 7 }).notNull(),
      trialsCount: int("trials_count").notNull(),
      dbCountAtOverride: int("db_count_at_override").notNull().default(0),
      updatedAt: timestamp("updated_at").defaultNow().onUpdateNow()
    }, (table) => [
      unique("agent_trials_override_agent_month_unique").on(table.agentName, table.month)
    ]);
    supportTicketReplies = mysqlTable("support_ticket_replies", {
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
      sentBy: varchar("sentBy", { length: 256 }).notNull()
    });
    blockedSenders = mysqlTable("blocked_senders", {
      id: int("id").autoincrement().primaryKey(),
      /** The email address to block */
      email: varchar("email", { length: 320 }).notNull().unique(),
      /** Timestamp when the sender was blocked */
      blockedAt: timestamp("blockedAt").defaultNow().notNull(),
      /** Name of the agent who blocked this sender */
      blockedBy: varchar("blockedBy", { length: 256 }).notNull()
    });
    blockedSubjects = mysqlTable("blocked_subjects", {
      id: int("id").autoincrement().primaryKey(),
      /** Keyword/phrase to match in subject line (case-insensitive contains) */
      keyword: varchar("keyword", { length: 500 }).notNull().unique(),
      /** Timestamp when the rule was created */
      blockedAt: timestamp("blockedAt").defaultNow().notNull(),
      /** Name of the agent who created this rule */
      blockedBy: varchar("blockedBy", { length: 256 }).notNull()
    });
    whatsappMessages = mysqlTable("whatsapp_messages", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    whatsappConversationAssignments = mysqlTable("whatsapp_conversation_assignments", {
      id: int("id").autoincrement().primaryKey(),
      /** Contact (conversation) being assigned */
      contactId: int("contactId").notNull(),
      /** The agent this conversation is assigned to */
      assignedUserId: int("assignedUserId").notNull(),
      /** The manager who made the assignment */
      assignedByUserId: int("assignedByUserId").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
  }
});

// server/cloudtalk.ts
var cloudtalk_exports = {};
__export(cloudtalk_exports, {
  clickToCall: () => clickToCall,
  fetchRecording: () => fetchRecording,
  getCallHistory: () => getCallHistory,
  getCloudTalkAgents: () => getCloudTalkAgents,
  syncContactToCloudTalk: () => syncContactToCloudTalk
});
function getAuthHeader() {
  const keyId = process.env.CLOUDTALK_API_KEY_ID;
  const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("CloudTalk API credentials not configured");
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}
async function getCloudTalkAgents() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(`${BASE_URL}/agents/index.json`, {
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const json2 = await res.json();
    const data = json2?.responseData?.data ?? [];
    return data.map((item) => item.Agent);
  } catch (err) {
    console.error("CloudTalk getAgents error:", err?.message ?? err);
    return [];
  }
}
async function getCallHistory(params) {
  const query = new URLSearchParams();
  if (params?.phone) query.set("public_external", params.phone);
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.page) query.set("page", String(params.page));
  const url = `${BASE_URL}/calls/index.json?${query.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15e3);
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("CloudTalk call history fetch error (timeout or network):", err?.message ?? err);
    return { calls: [], totalCount: 0, pageCount: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    console.error("CloudTalk call history error:", res.status, await res.text());
    return { calls: [], totalCount: 0, pageCount: 0 };
  }
  const json2 = await res.json();
  const rd = json2?.responseData ?? {};
  const rawCalls = rd?.data ?? [];
  const calls = rawCalls.map((item) => {
    const c = item.Cdr ?? item.Call ?? item;
    const agent = item.Agent ?? null;
    const contact = item.Contact ?? null;
    const talkingTime = parseInt(c.talking_time ?? "0", 10);
    const waitingTime = parseInt(c.waiting_time ?? "0", 10);
    const wrapUpTime = parseInt(c.wrapup_time ?? c.wrap_up_time ?? "0", 10);
    const billsec = parseInt(c.billsec ?? "0", 10);
    const contactPhone = contact?.contact_numbers?.[0] ?? contact?.number ?? // keep fallback for any future API changes
    null;
    const isAnswered = !!(c.answered_at && c.answered_at !== "" && talkingTime > 0);
    const callStatus = isAnswered ? "answered" : "missed";
    return {
      cdr_id: parseInt(c.id ?? c.cdr_id ?? "0", 10),
      uuid: c.uuid ?? "",
      date: c.started_at ?? c.date ?? c.start_date ?? "",
      direction: c.type ?? c.direction ?? "incoming",
      status: callStatus,
      type: c.type ?? "regular",
      // FIX: recorded is a boolean on Cdr directly
      recorded: c.recorded === true || c.recorded === "1",
      // FIX: recording_link is available directly on Cdr — use it instead of
      // making a separate /api/calls/recording/{id}.json request
      recording_link: c.recording_link ?? null,
      contact: contact ? {
        id: parseInt(contact.id ?? "0", 10),
        name: contact.name ?? "",
        number: contactPhone ?? ""
      } : null,
      internal_number: c.internal_number ?? null,
      call_times: {
        talking_time: talkingTime,
        ringing_time: waitingTime,
        // waiting_time is the ring time before answer
        total_time: billsec > 0 ? billsec : talkingTime,
        waiting_time: waitingTime,
        holding_time: 0,
        wrap_up_time: wrapUpTime
      },
      notes: c.notes ?? [],
      call_rating: c.call_rating ?? null,
      agent: agent ? {
        id: String(agent.id),
        name: agent.fullname ?? `${agent.firstname ?? ""} ${agent.lastname ?? ""}`.trim(),
        email: agent.email ?? ""
      } : void 0
    };
  });
  const filteredCalls = params?.status ? calls.filter((c) => c.status === params.status) : calls;
  return {
    calls: filteredCalls,
    totalCount: rd.itemsCount ?? calls.length,
    pageCount: rd.pageCount ?? 1
  };
}
async function fetchRecording(callId) {
  try {
    const res = await fetch(`${BASE_URL}/calls/recording/${callId}.json`, {
      headers: { Authorization: getAuthHeader() }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("audio") && !contentType.includes("wav")) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
async function clickToCall(agentId, calleeNumber) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15e3);
  let res;
  try {
    res = await fetch(`${BASE_URL}/calls/create.json`, {
      method: "POST",
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: parseInt(agentId, 10), callee_number: calleeNumber }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(err?.name === "AbortError" ? "CloudTalk request timed out" : err?.message ?? "Network error");
  } finally {
    clearTimeout(timeoutId);
  }
  const json2 = await res.json();
  const status = json2?.responseData?.status ?? res.status;
  if (res.status === 200 || status === 200) {
    return { success: true };
  }
  const errorMap = {
    403: "Agent is not online \u2014 please log in to CloudTalk first",
    404: "Agent not found \u2014 check your CloudTalk Agent ID in profile settings",
    406: "Invalid phone number format",
    409: "Agent is already on a call",
    500: "CloudTalk server error \u2014 please try again"
  };
  const msg = errorMap[res.status] ?? json2?.responseData?.message ?? `CloudTalk error (${res.status})`;
  return { success: false, message: msg };
}
async function findCloudTalkContactByPhone(phone) {
  try {
    const encoded = encodeURIComponent(phone);
    const res = await fetch(`${BASE_URL}/contacts/index.json?keyword=${encoded}&limit=5`, {
      headers: { Authorization: getAuthHeader() }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.responseData?.data ?? [];
    const normalise = (n) => n.replace(/[\s\-().]/g, "");
    const normPhone = normalise(phone);
    for (const item of items) {
      const ctPhone = item?.ContactNumber?.public_number ?? "";
      if (normalise(ctPhone) === normPhone) {
        return item?.Contact?.id ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}
function toCloudTalkPhone(phone) {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
}
async function createCloudTalkContact(input) {
  const body = { name: input.name };
  if (input.address) body.address = input.address;
  if (input.phone) body.ContactNumber = [{ public_number: toCloudTalkPhone(input.phone) }];
  if (input.email) body.ContactEmail = [{ email: input.email }];
  const res = await fetch(`${BASE_URL}/contacts/add.json`, {
    method: "PUT",
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text2 = await res.text().catch(() => "");
    console.error("[CloudTalk] createContact failed:", res.status, text2.slice(0, 200));
    return null;
  }
  const data = await res.json();
  return data?.responseData?.data?.id ?? null;
}
async function updateCloudTalkContact(cloudtalkId, input) {
  const body = { name: input.name };
  if (input.address) body.address = input.address;
  if (input.phone) body.ContactNumber = [{ public_number: toCloudTalkPhone(input.phone) }];
  if (input.email) body.ContactEmail = [{ email: input.email }];
  const res = await fetch(`${BASE_URL}/contacts/edit/${cloudtalkId}.json`, {
    method: "POST",
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text2 = await res.text().catch(() => "");
    console.error("[CloudTalk] updateContact failed:", res.status, text2.slice(0, 200));
  }
}
async function syncContactToCloudTalk(input, knownCloudtalkId) {
  try {
    if (knownCloudtalkId) {
      await updateCloudTalkContact(knownCloudtalkId, input);
      return knownCloudtalkId;
    }
    if (!input.phone) {
      const newId = await createCloudTalkContact(input);
      return newId;
    }
    const existingId = await findCloudTalkContactByPhone(input.phone);
    if (existingId) {
      await updateCloudTalkContact(existingId, input);
      return existingId;
    } else {
      const newId = await createCloudTalkContact(input);
      return newId;
    }
  } catch (err) {
    console.error("[CloudTalk] syncContact error:", err);
    return null;
  }
}
var BASE_URL;
var init_cloudtalk = __esm({
  "server/cloudtalk.ts"() {
    "use strict";
    BASE_URL = "https://my.cloudtalk.io/api";
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import multer from "multer";

// server/_core/clerkRoutes.ts
function registerClerkRoutes(app) {
  app.get("/api/auth/status", (_req, res) => {
    res.json({ ok: true, auth: "clerk" });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.json({ ok: true });
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Manus built-in APIs (used on Manus hosting, empty on Railway)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Email
  postmarkApiKey: process.env.POSTMARK_API_KEY ?? "",
  // ActiveCampaign CRM
  activeCampaignApiUrl: process.env.ACTIVECAMPAIGN_API_URL ?? "",
  activeCampaignApiKey: process.env.ACTIVECAMPAIGN_API_KEY ?? "",
  // Clerk auth (Railway deployment)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  // OpenAI (direct API key for Railway)
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  // Deepgram transcription
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  // CloudTalk telephony
  cloudTalkApiKeyId: process.env.CLOUDTALK_API_KEY_ID ?? "",
  cloudTalkApiKeySecret: process.env.CLOUDTALK_API_KEY_SECRET ?? "",
  // AWS S3 / Cloudflare R2 (for Railway file storage)
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  awsRegion: process.env.AWS_REGION ?? "auto",
  awsS3Bucket: process.env.AWS_S3_BUCKET ?? "",
  // Cloudflare R2 custom endpoint (e.g. https://xxxx.r2.cloudflarestorage.com)
  awsEndpointUrl: process.env.AWS_ENDPOINT_URL ?? "",
  // Cloudflare R2 public dev URL (e.g. https://pub-xxx.r2.dev) — makes files publicly accessible without presigning
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",
  // Stripe payment processing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Stripe publishable key (exposed to frontend via VITE_ prefix)
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  // n8n Cloud webhook base URL (e.g. https://gabilavie.app.n8n.cloud/webhook)
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyViaPostmark(title, content) {
  if (!ENV.postmarkApiKey) {
    console.warn("[Notification] Postmark API key not configured \u2014 skipping notification.");
    return false;
  }
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": ENV.postmarkApiKey
      },
      body: JSON.stringify({
        From: "notifications@lavielabs.com",
        To: "notifications@lavielabs.com",
        Subject: `[Lavie Training Hub] ${title}`,
        TextBody: content,
        HtmlBody: `<h2>${title}</h2><pre style="font-family:sans-serif;white-space:pre-wrap">${content}</pre>`,
        MessageStream: "outbound"
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Notification] Postmark failed (${response.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Postmark error:", error);
    return false;
  }
}
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${ENV.forgeApiKey}`,
          "content-type": "application/json",
          "connect-protocol-version": "1"
        },
        body: JSON.stringify({ title, content })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(
          `[Notification] Manus service failed (${response.status})${detail ? `: ${detail}` : ""} \u2014 falling back to Postmark`
        );
        return notifyViaPostmark(title, content);
      }
      return true;
    } catch (error) {
      console.warn("[Notification] Manus service error \u2014 falling back to Postmark:", error);
      return notifyViaPostmark(title, content);
    }
  }
  return notifyViaPostmark(title, content);
}

// shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var MAX_AUDIO_FILE_SIZE = 200 * 1024 * 1024;
var WHISPER_CHUNK_SIZE = 24 * 1024 * 1024;

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (ctx.disabledMessage) {
    throw new TRPCError2({ code: "FORBIDDEN", message: ctx.disabledMessage });
  }
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (ctx.disabledMessage) {
      throw new TRPCError2({ code: "FORBIDDEN", message: ctx.disabledMessage });
    }
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { TRPCError as TRPCError8 } from "@trpc/server";

// server/routers/callCoach.ts
import { z as z2 } from "zod";

// server/db.ts
init_schema();
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserOpenId(userId, newOpenId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user openId: database not available");
    return;
  }
  await db.update(users).set({ openId: newOpenId, lastSignedIn: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
}
async function getUserPitchCustomizations(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pitchCustomizations).where(eq(pitchCustomizations.userId, userId));
}
async function upsertPitchCustomization(userId, stageNum, customContent) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(pitchCustomizations).where(and(eq(pitchCustomizations.userId, userId), eq(pitchCustomizations.stageNum, stageNum)));
  if (existing.length > 0) {
    await db.update(pitchCustomizations).set({ customContent, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(pitchCustomizations.userId, userId), eq(pitchCustomizations.stageNum, stageNum)));
  } else {
    await db.insert(pitchCustomizations).values({ userId, stageNum, customContent });
  }
}
async function deletePitchCustomization(userId, stageNum) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pitchCustomizations).where(and(eq(pitchCustomizations.userId, userId), eq(pitchCustomizations.stageNum, stageNum)));
}
async function getAllPitchCustomizationsOverview() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ userId: pitchCustomizations.userId, stageNum: pitchCustomizations.stageNum }).from(pitchCustomizations);
}

// server/routers/callCoach.ts
init_schema();

// server/callAnalysis.ts
import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
init_schema();
import { eq as eq2, sql } from "drizzle-orm";

// server/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
function getS3Client() {
  const endpoint = ENV.awsEndpointUrl;
  return new S3Client({
    region: ENV.awsRegion || "auto",
    endpoint: endpoint || void 0,
    credentials: {
      accessKeyId: ENV.awsAccessKeyId,
      secretAccessKey: ENV.awsSecretAccessKey
    },
    // R2 requires path-style URLs
    forcePathStyle: Boolean(endpoint)
  });
}
async function s3Put(relKey, data, contentType = "application/octet-stream") {
  const s3 = getS3Client();
  const bucket = ENV.awsS3Bucket;
  const key = relKey.replace(/^\/+/, "");
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  const r2PublicUrl = ENV.r2PublicUrl;
  const endpoint = ENV.awsEndpointUrl;
  const url = r2PublicUrl ? `${r2PublicUrl.replace(/\/+$/, "")}/${key}` : endpoint ? `${endpoint.replace(/\/+$/, "")}/${bucket}/${key}` : `https://${bucket}.s3.${ENV.awsRegion || "us-east-1"}.amazonaws.com/${key}`;
  return { key, url };
}
async function s3Get(relKey, expiresIn = 3600) {
  const s3 = getS3Client();
  const bucket = ENV.awsS3Bucket;
  const key = relKey.replace(/^\/+/, "");
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  return { key, url };
}
function getManusStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
async function buildDownloadUrl(baseUrl, relKey, apiKey) {
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, { method: "GET", headers: buildAuthHeaders(apiKey) });
  return (await response.json()).url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function manusPut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getManusStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, { method: "POST", headers: buildAuthHeaders(apiKey), body: formData });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}
async function manusGet(relKey) {
  const { baseUrl, apiKey } = getManusStorageConfig();
  const key = normalizeKey(relKey);
  return { key, url: await buildDownloadUrl(baseUrl, key, apiKey) };
}
function isAwsConfigured() {
  return Boolean(ENV.awsAccessKeyId && ENV.awsSecretAccessKey && ENV.awsS3Bucket);
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  if (isAwsConfigured()) return s3Put(relKey, data, contentType);
  return manusPut(relKey, data, contentType);
}
async function storageGet(relKey, expiresIn = 3600) {
  if (isAwsConfigured()) return s3Get(relKey, expiresIn);
  return manusGet(relKey);
}

// server/callAnalysis.ts
var deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY ?? "" });
var openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
var LAVIE_SCRIPT_CONTEXT = `
You are an expert sales coach for Lavie Labs, a UK skincare company.

The sales script has these key stages:
1. OPENING: Warm greeting, introduce yourself from Lavie Labs, ask how they are
2. MAGIC WAND QUESTION: "If you could wave a magic wand and change one thing about your skin, what would it be?"
3. QUALIFY: How long have they had this concern? What have they tried before?
4. PRODUCT PITCH: Matinika (32% Hyaluronic Acid, medical-grade), Oulala (retinol serum), Ashkara (eye serum)
5. SOCIAL PROOF: Reference Trustpilot reviews, website results
6. OFFER & CLOSE: \xA34.95 for 21-day free trial, subscription framing (cancel anytime), VIP discount
7. CONFIRMATION: Take details, confirm delivery address
Key objection handlers:
- Subscription objection: "You're in complete control, cancel anytime with one click"
- Trust/card objection: "Fully regulated UK company, encrypted payment, Trustpilot reviews"
- Too many products: "Replace 3 products with one medical-grade cream"
Golden rules:
- Never get defensive about the subscription
- After the close \u2014 stop talking (silence is part of the close)
- Always tie back to the customer's Magic Wand answer
PAYMENT METHOD \u2014 IMPORTANT:
Approximately 30% of sales are completed via a secure payment form/link sent to the customer.
A sale is CLOSED and "closingAttempted" = true AND the call counts as a successful close if ANY of the following occur:
1. The rep takes card details directly on the call (standard method)
2. The rep sends a payment form/link to the customer AND the customer confirms they have filled it in / will fill it in
3. The customer mentions they already filled in the form/link before or during the call
4. The customer pays via Google Pay or Apple Pay (treat as equivalent to card payment)
Do NOT penalise a rep for using the form/link method or Google Pay/Apple Pay \u2014 these are equally valid and approved payment routes.
If the transcript contains phrases like "I'll send you a link", "fill in the form", "I've filled it in", "sent you the form", "payment link", "paid with Apple Pay", "used Google Pay", "payment went through", "it's done", "I've paid", "done, paid through Google Pay", "I used my Apple Pay", "it went through", "paying with Apple Pay", "paying with Google Pay" \u2014 treat this as a closing attempt. If the customer confirms completion or payment, treat it as a successful close.
`;
function detectChannelCount(buffer) {
  if (buffer.length > 24 && buffer.slice(0, 4).toString() === "RIFF") {
    return buffer.readUInt16LE(22);
  }
  return 1;
}
function detectAgentSpeaker(items, firstSpeaker) {
  const AGENT_PATTERNS = [
    // Self-introduction / company name
    /\bla\s*vie\b/i,
    /\blavie\b/i,
    /\bla\s*vie\s*labs\b/i,
    /\blovely\s*labs\b/i,
    // Product names
    /\bmatinika\b/i,
    /\boulala\b/i,
    /\bashkara\b/i,
    /\bcollagen\b/i,
    // Pricing / offer language unique to agent
    /\b4\.95\b/,
    /\b£\s*4\.95\b/,
    /\b21[\s-]day\s*(free\s*)?trial\b/i,
    /\b44\.90\b/,
    /\b£\s*44\.90\b/,
    /\bhyaluronic\s*acid\b/i,
    /\bretinol\b/i,
    /\btrustpilot\b/i,
    // Classic agent opening phrases
    /\bthis\s+is\s+\w+\s+from\b/i,
    /\bmy\s+name\s+is\s+\w+\s+(?:from|calling\s+from)\b/i,
    /\bcalling\s+(?:from|on\s+behalf\s+of)\b/i,
    /\bfree\s+trial\b/i,
    /\bmagic\s+wand\b/i,
    /\bcancel\s+any\s*time\b/i,
    /\bpostage\b/i,
    /\bdelivery\s+address\b/i,
    /\blong\s+number\b/i,
    // asking for card number
    /\bsort\s+code\b/i,
    /\bexpiry\b/i
  ];
  const speakerTexts = {};
  const speakerTimes = {};
  const SCAN_LIMIT = 150;
  for (let i = 0; i < Math.min(items.length, SCAN_LIMIT); i++) {
    const item = items[i];
    const spk = item.speaker ?? firstSpeaker;
    const text2 = (item.transcript ?? item.punctuated_word ?? item.word ?? "").toLowerCase();
    speakerTexts[spk] = (speakerTexts[spk] ?? "") + " " + text2;
  }
  for (const item of items) {
    const spk = item.speaker ?? firstSpeaker;
    const dur = (item.end ?? 0) - (item.start ?? 0);
    speakerTimes[spk] = (speakerTimes[spk] ?? 0) + dur;
  }
  const speakerScores = {};
  for (const [spkStr, text2] of Object.entries(speakerTexts)) {
    const spk = Number(spkStr);
    let score = 0;
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.test(text2)) score++;
    }
    speakerScores[spk] = score;
  }
  const bestContentMatch = Object.entries(speakerScores).sort(([, a], [, b]) => b - a)[0];
  if (bestContentMatch && Number(bestContentMatch[1]) >= 1) {
    const detectedSpeaker = Number(bestContentMatch[0]);
    console.log(`[SpeakerDetection] Content-based: speaker_${detectedSpeaker} identified as Agent (score=${bestContentMatch[1]})`);
    return detectedSpeaker;
  }
  const speechEntries = Object.entries(speakerTimes);
  if (speechEntries.length >= 2) {
    const [longestSpkStr] = speechEntries.sort(([, a], [, b]) => b - a)[0];
    const longestSpk = Number(longestSpkStr);
    if (longestSpk !== firstSpeaker) {
      console.log(`[SpeakerDetection] Speech-time heuristic: speaker_${longestSpk} identified as Agent (most speech time)`);
    } else {
      console.log(`[SpeakerDetection] Speech-time heuristic confirms first speaker (speaker_${longestSpk}) as Agent`);
    }
    return longestSpk;
  }
  console.log(`[SpeakerDetection] Fallback: using first speaker (speaker_${firstSpeaker}) as Agent`);
  return firstSpeaker;
}
function applySingleSpeakerSplitFix(wordTimestamps) {
  if (wordTimestamps.length === 0) return null;
  const firstSpeaker = wordTimestamps[0].speaker;
  if (!wordTimestamps.every((w) => w.speaker === firstSpeaker)) return null;
  const fullText = wordTimestamps.map((w) => w.word).join(" ").toLowerCase();
  const AGENT_PATTERNS = [
    // Company / brand
    /\bla\s*vie\b/i,
    /\blavie\b/i,
    /\bla\s*vie\s*labs\b/i,
    /\blovely\s*labs\b/i,
    /\blavi\s*labs\b/i,
    // Products
    /\bmatinika\b/i,
    /\boulala\b/i,
    /\bashkara\b/i,
    /\bcollagen\b/i,
    // Pricing / offer
    /\b4\.95\b/,
    /\b£\s*4\.95\b/,
    /\b21[\s-]day\s*(free\s*)?trial\b/i,
    /\b44\.90\b/,
    /\b£\s*44\.90\b/,
    /\bhyaluronic\s*acid\b/i,
    /\bretinol\b/i,
    /\btrustpilot\b/i,
    // Agent speech acts
    /\bthis\s+is\s+\w+\s+from\b/i,
    /\bmy\s+name\s+is\b/i,
    /\bcalling\s+from\b/i,
    /\bcalling\s+on\s+behalf\s+of\b/i,
    /\bfree\s+trial\b/i,
    /\bmagic\s+wand\b/i,
    /\bcancel\s+any\s*time\b/i,
    /\bpostage\b/i,
    /\bdelivery\s+address\b/i,
    /\blong\s+number\b/i,
    /\bsort\s+code\b/i,
    /\bexpiry\b/i,
    /\bskin\s*care\b/i,
    /\bmedical\s*grade\b/i
  ];
  const CUSTOMER_PHRASE_PATTERNS = [
    // Real customer objections / responses
    /\bnot\s+at\s+the\s+moment\b/i,
    /\bi'?m\s+away\b/i,
    /\bi'?m\s+not\s+interested\b/i,
    /\bno\s+thank\s+you\b/i,
    /\bcall\s+(?:me\s+)?back\s+later\b/i,
    /\bwho\s+is\s+this\b/i,
    /\bthat'?s\s+fine\b/i,
    /\bi'?m\s+busy\b/i,
    /\bnot\s+interested\b/i,
    /\bdo\s+not\s+call\b/i,
    /\bremove\s+me\b/i,
    /\btake\s+me\s+off\b/i,
    // IVR / voicemail
    /\bleave\s+a\s+message\b/i,
    /\bnot\s+available\b/i,
    /\bafter\s+the\s+tone\b/i,
    /\brecord\s+your\s+name\b/i,
    /\bplease\s+stay\s+on\s+the\s+line\b/i,
    /\bthis\s+person\s+is\s+not\s+available\b/i,
    /\bvoicemail\b/i,
    /\bplease\s+leave\s+your\s+message\b/i,
    /\breply\s+after\s+the\s+tone\b/i,
    // Additional IVR / automated system phrases
    /\bif\s+you\s+would\s+like\s+to\s+leave\b/i,
    /\bleave\s+an\s+additional\s+message\b/i,
    /\bplease\s+leave\s+your\s+name\b/i,
    /\bi'?ll\s+see\s+if\s+this\s+person\s+is\s+available\b/i,
    /\bplease\s+hold\b/i,
    /\bplease\s+wait\b/i,
    /\byour\s+call\s+(?:is\s+)?(?:being\s+)?(?:recorded|monitored)\b/i,
    /\bpress\s+\d+\s+(?:to|for)\b/i,
    /\bfor\s+(?:more\s+)?(?:options|information)\b/i,
    /\bto\s+leave\s+a\s+(?:voice\s*)?message\b/i,
    /\bthe\s+(?:person|number)\s+you\s+(?:are|have)\s+(?:called|dialed|trying)\b/i,
    /\bsorry\s+(?:i|we)\s+(?:am|are|can't|cannot)\s+(?:take|answer)\b/i,
    /\bplease\s+try\s+(?:again|your\s+call)\s+later\b/i,
    /\bthank\s+you\s+for\s+(?:calling|your\s+(?:call|patience))\b/i,
    // Cold-call customer responses
    /\bhaving\s+this\s+call\b/i,
    /\bi'?m\s+having\s+this\s+call\b/i,
    /\bwho'?s\s+calling\b/i,
    /\bwho\s+is\s+calling\b/i,
    /\bwhy\s+are\s+you\s+calling\b/i,
    /\bhow\s+did\s+you\s+get\s+my\s+(?:number|details)\b/i,
    /\bi\s+didn'?t\s+order\b/i,
    /\bi\s+don'?t\s+remember\b/i,
    /\bdon'?t\s+call\s+(?:me\s+)?again\b/i,
    /\bstop\s+calling\b/i,
    /\btake\s+me\s+off\s+(?:your\s+)?(?:list|database)\b/i,
    /\bi'?m\s+at\s+work\b/i,
    /\bcan\s+you\s+call\s+(?:me\s+)?back\b/i,
    /\bcall\s+me\s+back\b/i,
    /\bwhat\s+is\s+this\s+about\b/i,
    /\bwhat'?s\s+this\s+about\b/i,
    /\bwhat\s+is\s+it\s+about\b/i,
    /\bi\s+don'?t\s+want\s+it\b/i,
    /\bi\s+don'?t\s+need\s+it\b/i,
    /\bno\s+thanks\b/i,
    /\bwrong\s+number\b/i,
    // "[name] speaking" or "yes speaking" or standalone "speaking" — but NOT "you are speaking with" or "speaking to"
    /\b\w+\s+speaking\s*$/i,
    /^speaking\s*$/i
  ];
  const CUSTOMER_SHORT_RESPONSES = /* @__PURE__ */ new Set([
    "yes",
    "yeah",
    "yep",
    "yup",
    "no",
    "nope",
    "okay",
    "ok",
    "bye",
    "goodbye",
    "hello",
    "hi",
    "hey",
    "sure",
    "fine",
    "alright",
    "right",
    "speaking"
  ]);
  const hasIvr = CUSTOMER_PHRASE_PATTERNS.some((p) => p.test(fullText));
  const hasAgentPatterns = AGENT_PATTERNS.some((p) => p.test(fullText));
  const hasShortResponses = wordTimestamps.some(
    (w) => CUSTOMER_SHORT_RESPONSES.has(w.word.toLowerCase().replace(/[^a-z]/g, ""))
  );
  if (!hasIvr && !hasAgentPatterns) {
    return null;
  }
  if (!hasIvr && !hasShortResponses) {
    return null;
  }
  console.log(
    `[Transcription] Single-speaker ${hasIvr ? "IVR/voicemail" : "conversation"} detected. Applying split fix.`
  );
  const GAP_THRESHOLD = 0.3;
  const chunks = [];
  let curChunk = { words: [wordTimestamps[0]], start: wordTimestamps[0].start, end: wordTimestamps[0].end };
  for (let i = 1; i < wordTimestamps.length; i++) {
    const gap = wordTimestamps[i].start - wordTimestamps[i - 1].end;
    if (gap >= GAP_THRESHOLD) {
      chunks.push(curChunk);
      curChunk = { words: [wordTimestamps[i]], start: wordTimestamps[i].start, end: wordTimestamps[i].end };
    } else {
      curChunk.words.push(wordTimestamps[i]);
      curChunk.end = wordTimestamps[i].end;
    }
  }
  chunks.push(curChunk);
  const resolvedLabels = chunks.map((chunk, chunkIndex) => {
    const chunkText = chunk.words.map((w) => w.word).join(" ");
    const chunkLower = chunkText.toLowerCase();
    const cleanWords = chunkLower.replace(/[^a-z\s]/g, "").trim().split(/\s+/);
    if (AGENT_PATTERNS.some((p) => p.test(chunkLower))) return "Agent";
    if (CUSTOMER_PHRASE_PATTERNS.some((p) => p.test(chunkLower))) return "Customer";
    if (cleanWords.length <= 2 && cleanWords.every((w) => CUSTOMER_SHORT_RESPONSES.has(w))) {
      return "Customer";
    }
    if (chunk.words.length <= 4 && chunkIndex > 0) return "Customer";
    return null;
  });
  let lastKnownLabel = "Customer";
  for (const lbl of resolvedLabels) {
    if (lbl !== null) {
      lastKnownLabel = lbl;
      break;
    }
  }
  const chunkLabels = resolvedLabels.map((lbl, chunkIndex) => {
    if (lbl !== null) {
      lastKnownLabel = lbl;
      return lbl;
    }
    const alternated = lastKnownLabel === "Agent" ? "Customer" : "Agent";
    if (chunkIndex === 0) {
      lastKnownLabel = "Customer";
      return "Customer";
    }
    lastKnownLabel = alternated;
    return alternated;
  });
  let agentTime = 0;
  let totalTime = 0;
  let wordIdx = 0;
  const newWordTimestamps = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const label = chunkLabels[ci];
    for (const w of chunks[ci].words) {
      const dur = w.end - w.start;
      totalTime += dur;
      if (label === "Agent") agentTime += dur;
      newWordTimestamps.push({ ...w, speaker: label });
      wordIdx++;
    }
  }
  const repSpeechPct = totalTime > 0 ? Math.round(agentTime / totalTime * 100) : 50;
  const segments = [];
  for (const w of newWordTimestamps) {
    const wordText = w.word.trim();
    if (!wordText) continue;
    if (segments.length === 0 || segments[segments.length - 1].label !== w.speaker) {
      segments.push({ label: w.speaker, words: [wordText], start: w.start, end: w.end });
    } else {
      segments[segments.length - 1].words.push(wordText);
      segments[segments.length - 1].end = w.end;
    }
  }
  const transcript = segments.map((s) => `${s.label}: ${s.words.join(" ")}`).join("\n");
  return { wordTimestamps: newWordTimestamps, repSpeechPct, transcript };
}
async function transcribeAudio(audioUrl) {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio for transcription: ${audioRes.status} ${audioRes.statusText}`);
  }
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  let contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
  const isWav = audioBuffer.length >= 4 && audioBuffer.toString("ascii", 0, 4) === "RIFF";
  if (isWav) {
    contentType = "audio/wav";
  }
  const CHUNK_SIZE = 24 * 1024 * 1024;
  let mergedTranscript = "";
  let mergedRepSpeechPct = 50;
  let mergedDuration = 0;
  const mergedWordTimestamps = [];
  if (audioBuffer.length > CHUNK_SIZE) {
    console.log(`[Transcription] File is ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB \u2014 splitting into chunks`);
    const chunks = [];
    if (isWav && audioBuffer.length >= 44) {
      const wavHeader = audioBuffer.slice(0, 44);
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        if (offset === 0) {
          chunks.push(audioBuffer.slice(0, CHUNK_SIZE));
        } else {
          const chunkData = audioBuffer.slice(offset, offset + CHUNK_SIZE);
          const newHeader = Buffer.from(wavHeader);
          newHeader.writeUInt32LE(chunkData.length, 40);
          newHeader.writeUInt32LE(chunkData.length + 36, 4);
          chunks.push(Buffer.concat([newHeader, chunkData]));
        }
      }
    } else {
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        chunks.push(audioBuffer.slice(offset, offset + CHUNK_SIZE));
      }
    }
    let totalAgentTime = 0;
    let totalSpeechTime = 0;
    let timeOffset = 0;
    let firstChunkRepSpeaker = 0;
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Transcription] Processing chunk ${i + 1}/${chunks.length}`);
      const chunkOptions = { model: "nova-2", smart_format: true, punctuate: true, utterances: true, language: "en", mimetype: contentType, diarize: true };
      const chunkTimeout = new Promise(
        (_, reject) => setTimeout(() => reject(new Error(`Deepgram chunk ${i + 1} timed out after 15 minutes`)), 9e5)
      );
      const chunkResponse = await Promise.race([
        deepgram.listen.v1.media.transcribeFile(chunks[i], chunkOptions),
        chunkTimeout
      ]);
      const chunkDuration = chunkResponse?.metadata?.duration ?? 0;
      const utterances = chunkResponse?.results?.utterances ?? [];
      if (i === 0 && utterances.length > 0) {
        const firstSpk = utterances[0].speaker ?? 0;
        firstChunkRepSpeaker = detectAgentSpeaker(utterances, firstSpk);
      }
      const repSpeaker = firstChunkRepSpeaker;
      for (const utt of utterances) {
        const label = utt.speaker === repSpeaker ? "Agent" : "Customer";
        const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
        totalSpeechTime += uttDuration;
        if (label === "Agent") totalAgentTime += uttDuration;
        if ((utt.transcript ?? "").trim()) {
          mergedTranscript += (mergedTranscript ? "\n" : "") + `${label}: ${utt.transcript.trim()}`;
        }
        for (const w of utt.words ?? []) {
          mergedWordTimestamps.push({
            word: w.punctuated_word ?? w.word ?? "",
            start: (w.start ?? 0) + timeOffset,
            end: (w.end ?? 0) + timeOffset,
            speaker: label
          });
        }
      }
      timeOffset += chunkDuration;
      mergedDuration += chunkDuration;
    }
    mergedRepSpeechPct = totalSpeechTime > 0 ? Math.round(totalAgentTime / totalSpeechTime * 100) : 50;
    return { transcript: mergedTranscript, repSpeechPct: mergedRepSpeechPct, durationSeconds: mergedDuration, wordTimestamps: mergedWordTimestamps };
  }
  const channelCount = detectChannelCount(audioBuffer);
  const useMultichannel = channelCount >= 2;
  const transcribeOptions = {
    model: "nova-2",
    smart_format: true,
    punctuate: true,
    utterances: true,
    language: "en",
    mimetype: contentType
  };
  if (useMultichannel) {
    transcribeOptions.multichannel = true;
  } else {
    transcribeOptions.diarize = true;
  }
  const deepgramTimeout = new Promise(
    (_, reject) => setTimeout(() => reject(new Error("Deepgram transcription timed out after 15 minutes")), 9e5)
  );
  const response = await Promise.race([
    deepgram.listen.v1.media.transcribeFile(audioBuffer, transcribeOptions),
    deepgramTimeout
  ]);
  const result = response;
  const duration = result?.metadata?.duration ?? 0;
  let transcript;
  let repSpeechPct;
  if (useMultichannel) {
    const channels = result?.results?.channels ?? [];
    const agentCh = channels[0];
    const customerCh = channels[1];
    const lines = [];
    const agentSentences = agentCh?.alternatives?.[0]?.paragraphs?.paragraphs?.flatMap((p) => p.sentences) ?? [];
    const customerSentences = customerCh?.alternatives?.[0]?.paragraphs?.paragraphs?.flatMap((p) => p.sentences) ?? [];
    for (const s of agentSentences) {
      if ((s.text ?? "").trim()) lines.push({ start: s.start ?? 0, label: "Agent", text: s.text.trim() });
    }
    for (const s of customerSentences) {
      if ((s.text ?? "").trim()) lines.push({ start: s.start ?? 0, label: "Customer", text: s.text.trim() });
    }
    if (lines.length === 0) {
      const agentUtts = agentCh?.alternatives?.[0]?.paragraphs?.transcript ?? agentCh?.alternatives?.[0]?.transcript ?? "";
      const customerUtts = customerCh?.alternatives?.[0]?.paragraphs?.transcript ?? customerCh?.alternatives?.[0]?.transcript ?? "";
      if (agentUtts) lines.push({ start: 0, label: "Agent", text: agentUtts });
      if (customerUtts) lines.push({ start: 0.5, label: "Customer", text: customerUtts });
    }
    lines.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const line of lines) {
      if (!line.text) continue;
      if (merged.length > 0 && merged[merged.length - 1].label === line.label) {
        merged[merged.length - 1].text += " " + line.text;
      } else {
        merged.push({ label: line.label, text: line.text });
      }
    }
    transcript = merged.map((l) => `${l.label}: ${l.text}`).join("\n");
    const agentWords = agentCh?.alternatives?.[0]?.words ?? [];
    const customerWords = customerCh?.alternatives?.[0]?.words ?? [];
    const agentTime = agentWords.reduce((sum, w) => sum + ((w.end ?? 0) - (w.start ?? 0)), 0);
    const customerTime = customerWords.reduce((sum, w) => sum + ((w.end ?? 0) - (w.start ?? 0)), 0);
    const totalTime = agentTime + customerTime;
    repSpeechPct = totalTime > 0 ? Math.round(agentTime / totalTime * 100) : 50;
    if (!transcript.trim()) {
      transcript = agentCh?.alternatives?.[0]?.transcript ?? "";
    }
    const wordTimestamps = [
      ...agentWords.map((w) => ({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: "Agent" })),
      ...customerWords.map((w) => ({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: "Customer" }))
    ].sort((a, b) => a.start - b.start);
    return {
      transcript,
      repSpeechPct,
      durationSeconds: duration,
      wordTimestamps
    };
  } else {
    const allWords = result?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
    const utterances = result?.results?.utterances ?? [];
    if (allWords.length > 0) {
      const firstSpeaker = allWords[0]?.speaker ?? 0;
      const repSpeaker = detectAgentSpeaker(allWords, firstSpeaker);
      const speakerTimes = {};
      for (const w of allWords) {
        const spk = w.speaker ?? 0;
        const dur = (w.end ?? 0) - (w.start ?? 0);
        speakerTimes[spk] = (speakerTimes[spk] ?? 0) + dur;
      }
      const repSpeechTime = speakerTimes[repSpeaker] ?? 0;
      const totalSpeechTime = Object.values(speakerTimes).reduce((a, b) => a + b, 0);
      repSpeechPct = totalSpeechTime > 0 ? Math.round(repSpeechTime / totalSpeechTime * 100) : 50;
      const segments = [];
      for (const w of allWords) {
        const label = w.speaker === repSpeaker ? "Agent" : "Customer";
        const wordText = (w.punctuated_word ?? w.word ?? "").trim();
        if (!wordText) continue;
        if (segments.length === 0 || segments[segments.length - 1].label !== label) {
          segments.push({ label, words: [wordText], start: w.start ?? 0, end: w.end ?? 0 });
        } else {
          segments[segments.length - 1].words.push(wordText);
          segments[segments.length - 1].end = w.end ?? 0;
        }
      }
      transcript = segments.map((s) => `${s.label}: ${s.words.join(" ")}`).join("\n");
      if (!transcript.trim()) {
        transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      }
      const monoWordTimestamps = allWords.map((w) => ({
        word: w.punctuated_word ?? w.word ?? "",
        start: w.start ?? 0,
        end: w.end ?? 0,
        speaker: w.speaker === repSpeaker ? "Agent" : "Customer"
      }));
      let finalTranscript = transcript;
      let finalRepSpeechPct = repSpeechPct;
      let finalWordTimestamps = monoWordTimestamps;
      const ivrFix = applySingleSpeakerSplitFix(monoWordTimestamps);
      if (ivrFix) {
        finalTranscript = ivrFix.transcript;
        finalRepSpeechPct = ivrFix.repSpeechPct;
        finalWordTimestamps = ivrFix.wordTimestamps;
      }
      return { transcript: finalTranscript, repSpeechPct: finalRepSpeechPct, durationSeconds: duration, wordTimestamps: finalWordTimestamps };
    } else {
      const firstUttSpeaker = utterances.length > 0 ? utterances[0].speaker ?? 0 : 0;
      const repSpeaker = utterances.length > 0 ? detectAgentSpeaker(utterances, firstUttSpeaker) : 0;
      const speakerTimes = {};
      let totalSpeechTime = 0;
      for (const utt of utterances) {
        const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
        totalSpeechTime += uttDuration;
        const spk = utt.speaker ?? 0;
        speakerTimes[spk] = (speakerTimes[spk] ?? 0) + uttDuration;
      }
      const repSpeechTime = speakerTimes[repSpeaker] ?? 0;
      transcript = utterances.length > 0 ? utterances.map((utt) => {
        const label = utt.speaker === repSpeaker ? "Agent" : "Customer";
        return `${label}: ${(utt.transcript ?? "").trim()}`;
      }).join("\n") : result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      repSpeechPct = totalSpeechTime > 0 ? Math.round(repSpeechTime / totalSpeechTime * 100) : 50;
      const monoWordTimestamps = [];
      for (const utt of utterances) {
        const label = utt.speaker === repSpeaker ? "Agent" : "Customer";
        for (const w of utt.words ?? []) {
          monoWordTimestamps.push({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: label });
        }
      }
      let finalTranscript = transcript;
      let finalRepSpeechPct = repSpeechPct;
      let finalWordTimestamps = monoWordTimestamps;
      const ivrFix = applySingleSpeakerSplitFix(monoWordTimestamps);
      if (ivrFix) {
        finalTranscript = ivrFix.transcript;
        finalRepSpeechPct = ivrFix.repSpeechPct;
        finalWordTimestamps = ivrFix.wordTimestamps;
      }
      return { transcript: finalTranscript, repSpeechPct: finalRepSpeechPct, durationSeconds: duration, wordTimestamps: finalWordTimestamps };
    }
  }
}
function getCallTypeContext(callType) {
  if (callType === "live_sub") {
    return {
      context: `
CALL TYPE: Live Sub (Premium Upsell Lead)
This customer is an ACTIVE subscriber who has NOT requested to cancel. This is a premium upsell opportunity.
The rep's PRIMARY goal is to introduce and close an additional product (Oulala retinol serum or Ashkara eye serum).
Score HIGH if the rep identified an upsell opportunity and closed it.
Score MEDIUM if the rep attempted upsell but did not close.
Score LOW if the rep missed the upsell opportunity entirely.
Score CRITICALLY LOW (1-2) if the customer CANCELLED their subscription as a result of this call \u2014 this is the WORST possible outcome. The rep turned an active subscriber into a lost customer.
Do NOT penalise for missing "Magic Wand Question" \u2014 this is not a cold call script.
`,
      stages: ["Warm Rapport Building", "Needs Discovery", "Upsell Product Pitch", "Upsell Close", "Confirmation"],
      extraFields: `
  "saved": null,
  "upsellAttempted": <bool \u2014 did the rep introduce an additional product?>,
  "upsellSucceeded": <bool \u2014 did the customer agree to the upsell?>,
  "customerCancelled": <bool \u2014 did the customer cancel their subscription during or as a result of this call? This is the WORST outcome>,
  "cancelReason": null,`
    };
  }
  if (callType === "cancel_live_sub") {
    return {
      context: `
CALL TYPE: Cancel Live Sub (Save + Upsell \u2014 First Cycle)
This customer is in their FIRST billing cycle and has requested to cancel their subscription.
The rep must first SAVE the subscription (prevent cancellation), then attempt an upsell.
Score HIGH for: understanding the cancellation reason, offering a tailored solution, saving the sub, AND attempting upsell.
Score MEDIUM for: saving without upsell attempt.
Score LOW for: failing to save the customer.
`,
      stages: ["Opening & Rapport", "Understand Cancel Reason", "Tailored Save Offer", "Save Close", "Upsell Attempt"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`
    };
  }
  if (callType === "cancel_live_sub_2plus") {
    return {
      context: `
CALL TYPE: Cancel Live Sub 2+ (Save + Upsell \u2014 Loyal Customer)
This customer has been subscribed for 2 or more billing cycles and has now requested to cancel.
This is a LOYAL customer \u2014 saving them is high priority. The rep must first SAVE the subscription, then attempt an upsell.
Score HIGH for: understanding the cancellation reason, leveraging their loyalty/history, saving the sub, AND attempting upsell.
Score MEDIUM for: saving without upsell attempt.
Score LOW for: failing to save a loyal customer.
`,
      stages: ["Opening & Rapport", "Acknowledge Loyalty", "Understand Cancel Reason", "Tailored Save Offer", "Save Close", "Upsell Attempt"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`
    };
  }
  if (callType === "pre_cycle_cancelled" || callType === "retention_cancel_trial") {
    return {
      context: `
CALL TYPE: Pre-Cycle Cancelled (Save + Upsell Lead)
This customer cancelled BEFORE their first payment. The rep must first save the subscription, then attempt an upsell.
Score HIGH for: understanding the cancellation reason, offering a tailored solution, saving the sub, AND attempting upsell.
Score MEDIUM for: saving without upsell attempt.
Score LOW for: failing to save.
`,
      stages: ["Opening & Rapport", "Understand Cancel Reason", "Tailored Save Offer", "Save Close", "Upsell Attempt"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`
    };
  }
  if (callType === "pre_cycle_decline") {
    return {
      context: `
CALL TYPE: Pre-Cycle Decline (Payment Recovery + Upsell Lead)
This customer's card was declined before their first payment. The rep must recover the payment details, then attempt an upsell.
Score HIGH for: recovering payment details AND attempting upsell.
Score MEDIUM for: recovering payment only.
Score LOW for: failing to recover payment.
`,
      stages: ["Opening & Rapport", "Explain Payment Issue", "Update Payment Details", "Confirm Subscription", "Upsell Attempt"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully update payment and retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": null,`
    };
  }
  if (callType === "end_of_instalment" || callType === "retention_win_back") {
    return {
      context: `
CALL TYPE: End of Instalment (Winback + Upsell Lead)
This customer previously had an instalment plan and was successfully brought back. The rep should reinforce their decision to return and attempt an upsell.
Score HIGH for: reinforcing the customer's past results, offering an upsell, and closing.
Score MEDIUM for: retaining without upsell.
Score LOW for: losing the customer again.
`,
      stages: ["Warm Reconnection", "Reference Past Results", "Reactivation Confirmation", "Upsell Pitch", "Upsell Close"],
      extraFields: `
  "saved": <bool \u2014 did the rep retain/reactivate the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": null,`
    };
  }
  if (callType === "from_cat") {
    return {
      context: `
CALL TYPE: Escalation from Opening (From Cat)
This customer was transferred from the Opening team with a complex issue. The rep must first resolve the issue, then attempt to save and upsell.
Score HIGH for: resolving the issue, retaining the customer, AND attempting upsell.
Score MEDIUM for: resolving without upsell.
Score LOW for: failing to resolve.
`,
      stages: ["Acknowledge Issue", "Understand Root Cause", "Resolve Problem", "Save/Retain", "Upsell Attempt"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully resolve and retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Trust issue | Other>",`
    };
  }
  if (callType === "instalment_decline") {
    return {
      context: `
CALL TYPE: Instalment Plan Decline (Card Recovery)
This customer is on an instalment plan and their card payment has been declined. The rep's ONLY goal is to recover the card details (get new/updated payment information).
This is a simple, focused call \u2014 no upsell is needed.
Score 100 if the rep successfully recovers the card details.
Score LOW only if the rep fails to recover the card or handles the call poorly.
Do NOT penalise for missing "Magic Wand Question" or upsell \u2014 this is a card recovery call.
`,
      stages: ["Opening & Rapport", "Explain Payment Issue", "Collect New Card Details", "Confirm & Close"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully recover the card details?>,
  "upsellAttempted": null,
  "upsellSucceeded": null,
  "cancelReason": null,`
    };
  }
  if (callType === "other") {
    return {
      context: `
CALL TYPE: Retention (Auto-Classify Required)
This is a retention team call. Your FIRST task is to classify the exact call type from the transcript.
Compliance checks do NOT apply to retention calls.

CALL TYPE DEFINITIONS:
- live_sub: Customer is an ACTIVE subscriber who has NOT requested to cancel. Rep is upselling.
- pre_cycle_cancelled: Customer wants to cancel before or during their first payment cycle (trial cancellation).
- pre_cycle_decline: Customer's payment was declined before their first charge. Rep is recovering payment details.
- end_of_instalment: Customer previously had an instalment plan and is being reactivated / winback.
- from_cat: Call was escalated/transferred from the Opening team ("from Cat" / "from the opening team").
- retention_win_back: Customer has already cancelled and rep is trying to win them back.
- other: None of the above categories fit.

Score on rapport, problem-solving, and customer satisfaction.
`,
      stages: ["Opening & Rapport", "Understand Customer Situation", "Resolve / Assist", "Close / Confirm"],
      extraFields: `
  "saved": <bool \u2014 did the rep successfully help/retain the customer?>,
  "upsellAttempted": <bool \u2014 did the rep attempt an upsell?>,
  "upsellSucceeded": <bool \u2014 did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other | null>",
  "retentionCallType": "<live_sub | cancel_live_sub | cancel_live_sub_2plus | pre_cycle_cancelled | pre_cycle_decline | end_of_instalment | from_cat | retention_win_back | other>",`
    };
  }
  return {
    context: callType === "follow_up" ? `
CALL TYPE: Follow-up (Opening Team)
This is a follow-up call to a previous conversation. The rep should reference the previous call, re-engage the customer's interest, and close the sale.
Score HIGH for: referencing previous conversation, re-engaging the customer's concern, and closing.
` : `
CALL TYPE: Cold Call (Opening Team)
This is a first-time outbound call to a new prospect. The full Lavie Labs script applies.
Score HIGH for: following all 7 stages of the script, using the Magic Wand Question, and closing.
`,
    stages: ["Opening", "Magic Wand Question", "Qualify", "Product Pitch", "Social Proof", "Offer & Close"],
    extraFields: `
  "saved": null,
  "upsellAttempted": null,
  "upsellSucceeded": null,
  "cancelReason": null,`
  };
}
async function analyseCallWithAI(transcript, repSpeechPct, durationMinutes, callType = "cold_call") {
  const RETENTION_CALL_TYPES2 = /* @__PURE__ */ new Set(["live_sub", "cancel_live_sub", "cancel_live_sub_2plus", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "other", "retention_cancel_trial", "retention_win_back", "instalment_decline"]);
  const isRetentionCall = RETENTION_CALL_TYPES2.has(callType);
  const isRetentionLongCall = isRetentionCall && durationMinutes > 5;
  const { context: callTypeContext, stages, extraFields } = getCallTypeContext(callType);
  const stagesJson = stages.map(
    (s) => `    { "stage": "${s}", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }`
  ).join(",\n");
  const complianceFields = isRetentionCall ? `
  "subscriptionDisclosed": true,
  "subscriptionMisrepresented": false,
  "tcRead": null,
  "complianceScore": null,
  "complianceIssues": [],` : `
  "subscriptionDisclosed": <bool \u2014 SUBSCRIPTION MENTION RULE: The agent does NOT need to use the word 'subscription' at all. Set this to FALSE only if the customer directly asked 'Is this a subscription?' or similar, AND the agent said No, denied it, or clearly dodged the question. If the customer never asked, set this to TRUE (no violation). If the customer asked and the agent confirmed it honestly in any way \u2014 including phrases like 'we'll top you up every 60 days', 'we'll send you a new Matinika every 60 days', 'we'll send it out every other month', 'we'll send it out every 2 months', or any similar explanation of the recurring delivery \u2014 set this to TRUE.>,
  "subscriptionMisrepresented": <bool \u2014 CRITICAL: Set TRUE only if the customer directly asked about the subscription AND the agent said No, denied it, or clearly evaded the question. Do NOT set TRUE just because the agent didn't use the word 'subscription' \u2014 explaining the recurring arrangement in plain language counts as a full and honest answer. If the customer never asked, this must be FALSE.>,
  "tcRead": <bool \u2014 FULL OFFER DETAILS CHECK: Set TRUE ONLY if the agent VERBALLY READ OUT ALL of the following during the call \u2014 they must be explicitly stated, not just referenced or implied: (1) the \xA34.95 postage charge, (2) the 21-day free trial period, (3) the \xA344.90 recurring charge every 60 days after the trial, (4) 48 Hour Premium Delivery with signature, (5) that the customer can stop, pause, cancel or amend at any time. Set FALSE if ANY of these were not explicitly read out. NOTE: For Instalment deals (e.g. \xA375 upfront + \xA337.73 x 11), Cancellation Clarity is N/A \u2014 do not penalise for missing cancellation mention.>,
  "complianceScore": <number 0-100. CRITICAL RULE: if subscriptionMisrepresented=true, this MUST be between 0-20 regardless of how good the rest of the call was. If tcRead=false (full offer details not read out), deduct 20-30 points. Perfect compliance = 90-100.>,
  "complianceIssues": [<list of specific compliance violations as strings. Examples: "Rep denied subscription when directly asked", "\xA34.95 postage not mentioned", "21-day trial period not mentioned", "\xA344.90 recurring price not mentioned", "Cancellation/pause rights not mentioned", "48 Hour Premium Delivery with signature not mentioned">],`;
  const dealTypeBlock = isRetentionCall ? `` : `
DEAL TYPE DETECTION:
Detect whether this call resulted in a Subscription deal or an Instalment deal:
- Subscription: recurring \xA34.95 trial \u2192 \xA344.90 every 60 days (all cancellation rules apply)
- Instalment: fixed payments (e.g. \xA375 upfront + \xA337.73 x 11 monthly instalments) \u2192 Cancellation Clarity = N/A for instalment deals
If you detect an instalment deal, do NOT penalise the rep for not mentioning cancellation rights.
`;
  const complianceRules = isRetentionCall ? `NOTE: This is a Retention call. Compliance checks do NOT apply. complianceScore=null, tcRead=null, subscriptionMisrepresented=false, complianceIssues=[].` : `COMPLIANCE SCORING RULES (apply strictly):
1. SUBSCRIPTION RULE: Only flag subscriptionMisrepresented=true if the customer directly asked 'Is this a subscription?' or similar AND the rep said No, denied it, or clearly dodged. Do NOT penalise the rep for not using the word 'subscription' \u2014 explaining the recurring arrangement in plain language is equally valid.
2. FULL OFFER DETAILS (tcRead): The rep must VERBALLY READ OUT ALL of: \xA34.95 postage, 21-day free trial, \xA344.90 every 60 days, 48 Hour Premium Delivery with signature, and the right to cancel/pause/stop/amend at any time. Missing any of these = tcRead=false \u2192 deduct 20-30 from complianceScore. For Instalment deals, Cancellation Clarity is N/A.
3. CANCELLATION CLARITY: The rep must give some clear indication that the customer can cancel, stop, pause, or amend at any time. Flag only if the rep gives NO indication at all. N/A for Instalment deals.
4. Perfect compliance (subscriptionMisrepresented=false, tcRead=true) = complianceScore 90-100.
5. If subscriptionMisrepresented=true \u2192 complianceScore MUST be 0-20. This overrides everything else.`;
  const prompt = `${LAVIE_SCRIPT_CONTEXT}
${callTypeContext}
---
CALL TRANSCRIPT:
${transcript}
---
CALL STATS:
- Rep speech: ${repSpeechPct}% of conversation
- Duration: ${durationMinutes.toFixed(1)} minutes
---
Analyse this sales call and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence summary of the call>",
  "stagesDetected": [
${stagesJson}
  ],
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "topRecommendations": ["<rec 1>", "<rec 2>", "<rec 3>"],
  "keyMoments": [
    { "moment": "<quote or description>", "type": "positive|negative|critical", "coaching": "<what to do differently or keep doing>" }
  ],
  "scriptComplianceScore": <number 0-100>,
  "toneScore": <number 0-100>,
  "closingAttempted": <bool>,
  "magicWandUsed": <bool>,
  "customerName": "<first name of the customer if mentioned in the call, otherwise null>",
  "rapportScore": <number 0-100 \u2014 how well did the rep build personal connection? Did they ask personal questions, respond warmly, use the customer's name?>,
  "rapportQuote": "<best or worst rapport moment \u2014 a direct quote from the call, or null>",
  "excitementScore": <number 0-100 \u2014 how enthusiastically did the rep describe the product? Did they use vivid language like 'feel', 'imagine', 'wake up with'? Or was it dry and technical?>,
  "excitementQuote": "<a direct quote showing the rep's product pitch tone, or null>",
  "silenceAfterClose": <bool \u2014 did the rep stay silent after asking for the close, or did they fill the silence by talking?>,
  "silenceQuote": "<quote showing what happened after the close attempt, or null>",
  "callControl": <number 0-100 \u2014 did the rep lead the conversation, or did the customer take over? Did the rep redirect off-topic conversations back to the sale?>,
  "callControlQuote": "<a moment where the rep lost or maintained control, or null>",
  "authenticityScore": <number 0-100 \u2014 did the rep sound like a real person or a scripted robot? Penalise heavy repetition of filler words like 'absolutely', 'definitely', 'of course'.>,
  "authenticityQuote": "<the most scripted-sounding or most authentic moment, or null>",
  "objectionHandlingScore": <number 0-100 \u2014 if there was an objection, how well did the rep handle it? Did they use the script? Did they give up too quickly? If no objection occurred, return 100.>,
  "objectionHandlingQuote": "<the objection and the rep's response, or null if no objection>",
${complianceFields}${extraFields}
${isRetentionLongCall ? `
  "customerDifficultyScore": <number 1-10. 1 = hardest customer (hostile, refusing, threatening, wants to cancel immediately). 10 = easiest customer (agrees immediately, friendly, no objections). Rate based on the customer's tone, resistance level, and objections throughout the call.>,
  "customerDifficultyDescription": "<brief 5-10 word description of the customer difficulty e.g. 'Cooperative \u2014 friendly tone, budget objections only'>",
  "callScore": <number 1.0-10.0 with one decimal. This is the MAIN performance score. Score based on how well the rep achieved the PRIMARY GOAL for this call type. Consider: Did they save/retain? Did they attempt upsell? Did they handle objections well? Did they use proper techniques?>,
  "callScoreDescription": "<brief 5-10 word summary e.g. 'Strong retention, great rapport, minor over-talking'>",
  "customerProfile": "<2-3 sentences describing who this customer is: their situation, relationship with the brand, financial constraints, emotional state, and what they wanted from this call>",
  "managerReview": [
    {
      "title": "<descriptive title \u2014 see EXAMPLES below>",
      "timestamp": "<MM:SS>",
      "quote": "<see EXAMPLES below for required length and detail>",
      "feedback": "<see EXAMPLES below for required depth>",
      "suggestion": "<see EXAMPLES below for required format>"
    }
  ],

  *** MANAGER REVIEW \u2014 QUALITY STANDARD ***
  You MUST match the EXACT level of detail shown in these two examples. If your output is shorter or more generic than these examples, it is WRONG.

  EXAMPLE 1 (PERFECT quality):
  {
    "title": "Missed Opportunity to Explore Needs Before Pitching",
    "timestamp": "2:56",
    "quote": "Do you know what? Look. And, again, if you don't if you don't want to do it or you can't do it, it's totally fine. But at least I've told you about it... By the way, I'll treat you to a serum. You can if you hear me out, if you like what you hear on the price, tell me what serum you want.",
    "feedback": "Beverly had just clarified that she liked the Matanika cream (the white jar). Instead of asking her WHY she liked it or what other skin concerns she had, you immediately jumped into a long pitch offering a free serum and a 12-month supply. She was engaged, but you didn't build the value of the new serum before offering it.",
    "suggestion": "You should have used the 'Magic Wand' question here to build value: 'I'm so glad you love the Matanika cream. If you had a magic wand, what other area of your skin would you want to improve?' Then, tailor the free serum offer to her specific answer."
  }

  EXAMPLE 2 (PERFECT quality):
  {
    "title": "Over-talking After the Close",
    "timestamp": "4:18",
    "quote": "Are you happy with that? Because I've given you about 50% off, but I want you to go away with a big smile. (Beverly replies: 'Brilliant because I'm kinda glad I'm at the end of that moisturizer now because it's really good. Oh, thank you.') Then at 4:31, you immediately launched into a 50-second monologue: 'And I'm not being look. I'm not being funny with your skin... Skincare is a tricky thing... you're getting medical grade.'",
    "feedback": "Beverly had just agreed to the deal and expressed gratitude. She was already sold. By continuing to talk and justify the medical-grade quality for almost a minute, you risked talking past the sale and potentially introducing new doubts or confusing her.",
    "suggestion": "Embrace the silence and move straight to confirmation. You should have simply said: 'I'm so glad to hear that, Beverly. Let's get that sorted for you right now. Can I confirm your shipping address?'"
  }

  EXAMPLE 3 (PERFECT quality \u2014 for a different scenario):
  {
    "title": "Anchoring with a Random Low Number",
    "timestamp": "3:41",
    "quote": "No. I know. Take if you have to take a second to just think about it. I mean, listen. I'm not talk. Is it I don't know. I'm just throwing a number out. 20 pounds?",
    "feedback": "The customer had just said she didn't know what her budget was because you put her on the spot. By immediately throwing out '20 pounds,' you anchored the negotiation extremely low. When you later pitched a package that was \xA325.35 a month, it felt more expensive than the \xA320 you had just suggested.",
    "suggestion": "Give her space to answer, or anchor high to make the discount look better. You should have said: 'That's completely fair. Most of our premium packages are around \xA380, but if I could build a custom routine for you closer to \xA330 or \xA340, would that be in the right ballpark?'"
  }

  RULES for managerReview (MUST follow):
  - Exactly 2-3 items per call
  - title: Clear coaching point name (5-10 words) \u2014 specific to what happened, not generic
  - quote: MUST be 2-4 FULL sentences copied VERBATIM from the transcript. Include customer responses in parentheses where relevant. If the rep continued talking after the customer responded, include that too. NEVER use short snippets of less than 2 sentences.
  - feedback: MUST be 3-4 sentences. Structure: (1) What the customer had just said/done and their emotional state, (2) What the rep did instead, (3) Why this was the wrong approach, (4) What opportunity was missed or what risk was created
  - suggestion: MUST start with 'You should have', name the specific technique if applicable (e.g. 'Magic Wand question', 'Silence after close', 'High anchor'), then give the EXACT alternative words in quotes that the rep should have said, then briefly explain why this works better
  - Write as a senior call center manager who has listened to this recording 3 times and is giving detailed, face-to-face coaching
  - Be 100% specific to THIS call \u2014 reference the customer by name, reference specific products/prices mentioned, reference the exact moment in the conversation. NEVER give generic advice that could apply to any call.
` : ""}}
${dealTypeBlock}${complianceRules}

IMPORTANT: For customerName, look for the customer's first name \u2014 the rep usually addresses them by name during the call (e.g. "Hi Sarah", "So [Name], what I'd love to do..."). Return just the first name as a string, or null if not found.
Be specific, actionable, and encouraging. Focus on the call type objectives above.`;
  const llmAbortController = new AbortController();
  const llmTimeoutId = setTimeout(() => llmAbortController.abort(), 9e5);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3
    }, { signal: llmAbortController.signal });
    const content = response.choices[0]?.message?.content ?? "{}";
    return JSON.parse(content);
  } finally {
    clearTimeout(llmTimeoutId);
  }
}
async function createCallAnalysisRecord(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(callAnalyses).values({
    userId: data.userId,
    repName: data.repName,
    audioFileKey: data.audioFileKey,
    audioFileUrl: data.audioFileUrl,
    fileName: data.fileName,
    callDate: data.callDate ?? null,
    closeStatus: data.closeStatus ?? null,
    callType: data.callType ?? "cold_call",
    status: "pending",
    source: data.source ?? "manual",
    cloudtalkCallId: data.cloudtalkCallId ?? null,
    contactId: data.contactId ?? null,
    customerName: data.customerName ?? null,
    contactName: data.contactName ?? null,
    externalNumber: data.externalNumber ?? null
  });
  return result.insertId;
}
async function updateCallAnalysisStatus(id, update) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(callAnalyses).set(update).where(eq2(callAnalyses.id, id));
}
async function getCallAnalysisById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(callAnalyses).where(eq2(callAnalyses.id, id)).limit(1);
  return results[0] ?? null;
}
async function getCallAnalysisByShareToken(token) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(callAnalyses).where(eq2(callAnalyses.shareToken, token)).limit(1);
  return results[0] ?? null;
}
async function generateShareToken(analysisId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ shareToken: callAnalyses.shareToken }).from(callAnalyses).where(eq2(callAnalyses.id, analysisId)).limit(1);
  if (existing[0]?.shareToken) return existing[0].shareToken;
  const { nanoid: nanoid2 } = await import("nanoid");
  const token = nanoid2(21);
  await db.update(callAnalyses).set({ shareToken: token }).where(eq2(callAnalyses.id, analysisId));
  return token;
}
async function listAllCallAnalyses() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callAnalyses).orderBy(callAnalyses.createdAt);
}
async function getLeaderboard() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const all = await db.select().from(callAnalyses).where(eq2(callAnalyses.status, "done")).orderBy(callAnalyses.createdAt);
  const byUser = /* @__PURE__ */ new Map();
  for (const row of all) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId).push(row);
  }
  const entries = [];
  for (const [userId, calls] of Array.from(byUser.entries())) {
    const repName = calls[calls.length - 1]?.repName ?? `Rep #${userId}`;
    const scoredCalls = calls.filter((c) => c.overallScore != null);
    const scores = scoredCalls.map((c) => c.overallScore);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const closedCalls = calls.filter((c) => c.closeStatus === "closed").length;
    const closeRate = calls.length > 0 ? Math.round(closedCalls / calls.length * 100) : 0;
    let trend = "stable";
    if (scores.length >= 6) {
      const recent = scores.slice(-3);
      const prev = scores.slice(-6, -3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 3;
      const prevAvg = prev.reduce((a, b) => a + b, 0) / 3;
      if (recentAvg - prevAvg > 3) trend = "up";
      else if (prevAvg - recentAvg > 3) trend = "down";
    }
    entries.push({
      repName,
      userId,
      totalCalls: calls.length,
      avgScore,
      closedCalls,
      closeRate,
      trend,
      recentScores: scores.slice(-5),
      isReliable: calls.length >= 5
    });
  }
  entries.sort((a, b) => {
    if (a.avgScore == null && b.avgScore == null) return 0;
    if (a.avgScore == null) return 1;
    if (b.avgScore == null) return -1;
    return b.avgScore - a.avgScore;
  });
  return entries;
}
async function processCallAnalysis(analysisId, audioUrl, audioFileKey) {
  try {
    await updateCallAnalysisStatus(analysisId, { status: "transcribing" });
    let fetchUrl = audioUrl;
    if (audioFileKey && ENV.r2PublicUrl) {
      const cleanKey = audioFileKey.replace(/^\/+/, "");
      fetchUrl = `${ENV.r2PublicUrl.replace(/\/+$/, "")}/${cleanKey}`;
      console.log(`[CallAnalysis] Using public R2 URL: ${fetchUrl}`);
    } else if (audioFileKey && ENV.forgeApiUrl) {
      try {
        const { url } = await storageGet(audioFileKey);
        fetchUrl = url;
        console.log(`[CallAnalysis] Using Manus signed URL for key: ${audioFileKey}`);
      } catch (err) {
        console.warn(`[CallAnalysis] storageGet failed, using stored URL as fallback:`, err);
      }
    } else {
      console.log(`[CallAnalysis] Using stored audioUrl directly: ${fetchUrl}`);
    }
    const { transcript, repSpeechPct, durationSeconds, wordTimestamps } = await transcribeAudio(fetchUrl);
    await updateCallAnalysisStatus(analysisId, {
      transcript,
      repSpeechPct,
      durationSeconds,
      wordTimestamps: wordTimestamps.length > 0 ? JSON.stringify(wordTimestamps) : void 0
    });
    if (durationSeconds < 120) {
      console.log(`[CallAnalysis] Skipping AI for short call #${analysisId} (${durationSeconds}s < 120s)`);
      await updateCallAnalysisStatus(analysisId, {
        status: "done",
        overallScore: 0
      });
      return;
    }
    await updateCallAnalysisStatus(analysisId, { status: "analyzing" });
    const record = await getCallAnalysisById(analysisId);
    const callType = record?.callType ?? "cold_call";
    const report = await analyseCallWithAI(transcript, repSpeechPct, durationSeconds / 60, callType);
    const savePayload = {
      status: "done",
      overallScore: report.overallScore,
      analysisJson: JSON.stringify(report)
    };
    if (report.customerName) savePayload.customerName = report.customerName;
    if (report.saved !== void 0 && report.saved !== null) savePayload.saved = report.saved;
    if (report.upsellAttempted !== void 0 && report.upsellAttempted !== null) savePayload.upsellAttempted = report.upsellAttempted;
    if (report.upsellSucceeded !== void 0 && report.upsellSucceeded !== null) savePayload.upsellSucceeded = report.upsellSucceeded;
    if (report.cancelReason) savePayload.cancelReason = report.cancelReason;
    if (report.closingAttempted) savePayload.closeStatus = "closed";
    if (callType === "other" && report.retentionCallType && report.retentionCallType !== "other") {
      savePayload.callType = report.retentionCallType;
      console.log(`[CallAnalysis] AI classified retention call #${analysisId} as: ${report.retentionCallType}`);
    }
    await updateCallAnalysisStatus(analysisId, savePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CallAnalysis] Failed for id=${analysisId}:`, message);
    await updateCallAnalysisStatus(analysisId, {
      status: "error",
      errorMessage: message
    });
  }
}
async function submitFeedback(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(aiFeedback).values({
    analysisId: input.analysisId,
    userId: input.userId,
    section: input.section,
    issue: input.issue,
    comment: input.comment
  });
}
async function getFeedbackSummary() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(aiFeedback).orderBy(aiFeedback.createdAt);
  return rows.map((r) => ({
    id: r.id,
    analysisId: r.analysisId,
    userId: r.userId,
    section: r.section,
    issue: r.issue,
    comment: r.comment ?? null,
    createdAt: r.createdAt
  }));
}
async function updateCallDetails(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates = {};
  if (input.repName !== void 0) updates.repName = input.repName;
  if (input.callDate !== void 0) updates.callDate = input.callDate;
  if (input.closeStatus !== void 0) updates.closeStatus = input.closeStatus;
  if (input.customerName !== void 0) updates.customerName = input.customerName;
  if (input.callType !== void 0) updates.callType = input.callType;
  if (input.lastEditedByUserId !== void 0) updates.lastEditedByUserId = input.lastEditedByUserId;
  if (input.lastEditedByName !== void 0) updates.lastEditedByName = input.lastEditedByName;
  updates.lastEditedAt = /* @__PURE__ */ new Date();
  if (Object.keys(updates).length === 1) return;
  await db.update(callAnalyses).set(updates).where(eq2(callAnalyses.id, input.id));
}
async function deleteFailedAnalysis(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.select({ id: callAnalyses.id, status: callAnalyses.status }).from(callAnalyses).where(eq2(callAnalyses.id, id)).limit(1);
  if (!row) return false;
  if (row.status !== "error") return false;
  await db.delete(callAnalyses).where(eq2(callAnalyses.id, id));
  return true;
}
async function getTeamDashboard() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const all = await db.select().from(callAnalyses).where(eq2(callAnalyses.status, "done")).orderBy(callAnalyses.createdAt);
  const byRepName = /* @__PURE__ */ new Map();
  for (const row of all) {
    const key = (row.repName?.trim() || "Unknown Rep").toLowerCase();
    if (!byRepName.has(key)) byRepName.set(key, []);
    byRepName.get(key).push(row);
  }
  const repEntries = [];
  for (const [repKey, calls] of Array.from(byRepName.entries())) {
    const scored = calls.filter((c) => c.overallScore != null);
    const scores = scored.map((c) => c.overallScore);
    const allTimeAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    repEntries.push({ repKey, allTimeAvg, calls });
  }
  repEntries.sort((a, b) => {
    if (a.allTimeAvg == null && b.allTimeAvg == null) return 0;
    if (a.allTimeAvg == null) return 1;
    if (b.allTimeAvg == null) return -1;
    return b.allTimeAvg - a.allTimeAvg;
  });
  const totalReps = repEntries.length;
  const profiles = [];
  for (let rankIdx = 0; rankIdx < repEntries.length; rankIdx++) {
    const { repKey, allTimeAvg, calls } = repEntries[rankIdx];
    const repName = calls.slice().reverse().find((c) => c.repName?.trim())?.repName ?? repKey.charAt(0).toUpperCase() + repKey.slice(1);
    const userId = calls[calls.length - 1]?.userId ?? 0;
    const scored = calls.filter((c) => c.overallScore != null);
    const scores = scored.map((c) => c.overallScore);
    const last10Scores = scores.slice(-10);
    const last10Avg = last10Scores.length > 0 ? Math.round(last10Scores.reduce((a, b) => a + b, 0) / last10Scores.length) : null;
    const trendDelta = last10Avg != null && allTimeAvg != null ? last10Avg - allTimeAvg : 0;
    let trendIndicator = "stable";
    if (trendDelta >= 5) trendIndicator = "improving";
    else if (trendDelta <= -5) trendIndicator = "declining";
    const closedCalls = calls.filter((c) => c.closeStatus === "closed").length;
    const closeRate = calls.length > 0 ? Math.round(closedCalls / calls.length * 100) : 0;
    const withTalkRatio = calls.filter((c) => c.repSpeechPct != null);
    const avgTalkRatio = withTalkRatio.length > 0 ? Math.round(withTalkRatio.reduce((a, c) => a + c.repSpeechPct, 0) / withTalkRatio.length) : null;
    let scriptComplianceTotal = 0, toneTotal = 0, catCount = 0;
    for (const call of scored) {
      try {
        const report = JSON.parse(call.analysisJson ?? "{}");
        if (report.scriptComplianceScore != null && report.toneScore != null) {
          scriptComplianceTotal += report.scriptComplianceScore;
          toneTotal += report.toneScore;
          catCount++;
        }
      } catch {
      }
    }
    const scriptComplianceAvg = catCount > 0 ? Math.round(scriptComplianceTotal / catCount) : null;
    const toneAvg = catCount > 0 ? Math.round(toneTotal / catCount) : null;
    const scoreHistory = scored.map((c) => ({
      date: (c.createdAt ?? /* @__PURE__ */ new Date()).toISOString().split("T")[0],
      score: Math.round(c.overallScore)
    }));
    let bestCall = null;
    let worstCall = null;
    if (scored.length > 0) {
      const best = scored.reduce((a, b) => a.overallScore > b.overallScore ? a : b);
      const worst = scored.reduce((a, b) => a.overallScore < b.overallScore ? a : b);
      bestCall = {
        id: best.id,
        score: Math.round(best.overallScore),
        fileName: best.fileName ?? null,
        date: (best.createdAt ?? /* @__PURE__ */ new Date()).toISOString().split("T")[0]
      };
      worstCall = {
        id: worst.id,
        score: Math.round(worst.overallScore),
        fileName: worst.fileName ?? null,
        date: (worst.createdAt ?? /* @__PURE__ */ new Date()).toISOString().split("T")[0]
      };
    }
    profiles.push({
      repName,
      userId,
      totalCalls: calls.length,
      allTimeAvg,
      last10Avg,
      trendIndicator,
      trendDelta,
      rank: rankIdx + 1,
      totalReps,
      closeRate,
      avgTalkRatio,
      scriptComplianceAvg,
      toneAvg,
      scoreHistory,
      bestCall,
      worstCall,
      isReliable: calls.length >= 5
    });
  }
  return profiles;
}
async function getAgentDashboard(timeRange = "month") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = /* @__PURE__ */ new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let rangeStart = null;
  if (timeRange === "today") rangeStart = todayStart;
  else if (timeRange === "week") rangeStart = weekStart;
  else if (timeRange === "month") rangeStart = monthStart;
  const allRaw = await db.select().from(callAnalyses).orderBy(callAnalyses.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const all = rangeStart ? allRaw.filter((c) => new Date(c.createdAt) >= rangeStart) : allRaw;
  const byUser = /* @__PURE__ */ new Map();
  for (const row of all) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId).push(row);
  }
  const summaries = [];
  for (const [userId, calls] of Array.from(byUser.entries())) {
    const user = userMap.get(userId);
    const repName = user?.name ?? calls[calls.length - 1]?.repName ?? `Rep #${userId}`;
    const doneCalls = calls.filter((c) => c.status === "done");
    const pendingCalls = calls.filter(
      (c) => c.status === "pending" || c.status === "transcribing" || c.status === "analyzing"
    ).length;
    const scored = doneCalls.filter((c) => c.overallScore != null);
    const scores = scored.map((c) => c.overallScore);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const last10Scores = scores.slice(-10);
    const last10Avg = last10Scores.length > 0 ? Math.round(last10Scores.reduce((a, b) => a + b, 0) / last10Scores.length) : null;
    const trendDelta = last10Avg != null && avgScore != null ? last10Avg - avgScore : 0;
    const trendIndicator = trendDelta >= 5 ? "improving" : trendDelta <= -5 ? "declining" : "stable";
    const callsToday = allRaw.filter((c) => c.userId === userId && new Date(c.createdAt) >= todayStart).length;
    const callsThisWeek = allRaw.filter((c) => c.userId === userId && new Date(c.createdAt) >= weekStart).length;
    const lastCall = calls[calls.length - 1] ?? null;
    const closedCount = doneCalls.filter((c) => c.closeStatus === "closed").length;
    const closeRate = doneCalls.length > 0 ? Math.round(closedCount / doneCalls.length * 100) : 0;
    const recentCalls = [...calls].reverse().slice(0, 20).map((c) => ({
      id: c.id,
      createdAt: new Date(c.createdAt).toISOString(),
      callDate: c.callDate ? new Date(c.callDate).toISOString() : null,
      customerName: c.customerName ?? null,
      overallScore: c.overallScore != null ? Math.round(c.overallScore) : null,
      closeStatus: c.closeStatus ?? null,
      status: c.status,
      source: c.source ?? null,
      callType: c.callType ?? null,
      repSpeechPct: c.repSpeechPct != null ? Math.round(c.repSpeechPct) : null
    }));
    summaries.push({
      userId,
      repName,
      totalCalls: calls.length,
      callsToday,
      callsThisWeek,
      avgScore,
      last10Avg,
      trendDelta,
      trendIndicator,
      lastCallAt: lastCall ? new Date(lastCall.createdAt).toISOString() : null,
      lastCallScore: lastCall?.overallScore != null ? Math.round(lastCall.overallScore) : null,
      lastCallCustomer: lastCall?.customerName ?? null,
      lastCallStatus: lastCall?.closeStatus ?? null,
      pendingCalls,
      closeRate,
      recentCalls
    });
  }
  summaries.sort((a, b) => b.totalCalls - a.totalCalls);
  return summaries;
}
var RETENTION_TYPES = /* @__PURE__ */ new Set(["live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat"]);
async function getCallTypePerformance(range = "all") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = /* @__PURE__ */ new Date();
  let since = null;
  if (range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
  } else if (range === "month") {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
  }
  const rows = await db.select({
    callType: callAnalyses.callType,
    userId: callAnalyses.userId,
    repName: callAnalyses.repName,
    overallScore: callAnalyses.overallScore,
    saved: callAnalyses.saved,
    upsellAttempted: callAnalyses.upsellAttempted,
    upsellSucceeded: callAnalyses.upsellSucceeded,
    cancelReason: callAnalyses.cancelReason,
    createdAt: callAnalyses.createdAt
  }).from(callAnalyses).where(
    since ? sql`${callAnalyses.status} = 'done' AND ${callAnalyses.createdAt} >= ${since}` : eq2(callAnalyses.status, "done")
  );
  const grouped = {};
  for (const row of rows) {
    const ct = row.callType ?? "other";
    if (!grouped[ct]) grouped[ct] = [];
    grouped[ct].push(row);
  }
  const result = [];
  for (const [callType, calls] of Object.entries(grouped)) {
    const team = RETENTION_TYPES.has(callType) ? "retention" : "opening";
    const scores = calls.filter((c) => c.overallScore != null).map((c) => c.overallScore);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const withSaved = calls.filter((c) => c.saved !== null && c.saved !== void 0);
    const savedCount = withSaved.filter((c) => c.saved === true).length;
    const saveRate = withSaved.length > 0 ? Math.round(savedCount / withSaved.length * 100) : null;
    const withUpsellAttempt = calls.filter((c) => c.upsellAttempted !== null && c.upsellAttempted !== void 0);
    const upsellAttemptedCount = withUpsellAttempt.filter((c) => c.upsellAttempted === true).length;
    const upsellAttemptRate = withUpsellAttempt.length > 0 ? Math.round(upsellAttemptedCount / withUpsellAttempt.length * 100) : null;
    const withUpsellSuccess = calls.filter((c) => c.upsellAttempted === true);
    const upsellSucceededCount = withUpsellSuccess.filter((c) => c.upsellSucceeded === true).length;
    const upsellSuccessRate = withUpsellSuccess.length > 0 ? Math.round(upsellSucceededCount / withUpsellSuccess.length * 100) : null;
    const cancelReasons = {};
    for (const c of calls) {
      if (c.cancelReason) {
        cancelReasons[c.cancelReason] = (cancelReasons[c.cancelReason] ?? 0) + 1;
      }
    }
    const agentMap = {};
    for (const c of calls) {
      if (!agentMap[c.userId]) agentMap[c.userId] = [];
      agentMap[c.userId].push(c);
    }
    const byAgent = Object.entries(agentMap).map(([uid, agentCalls]) => {
      const aScores = agentCalls.filter((c) => c.overallScore != null).map((c) => c.overallScore);
      const aAvgScore = aScores.length > 0 ? Math.round(aScores.reduce((a, b) => a + b, 0) / aScores.length) : null;
      const aWithSaved = agentCalls.filter((c) => c.saved !== null && c.saved !== void 0);
      const aSavedCount = aWithSaved.filter((c) => c.saved === true).length;
      const aSaveRate = aWithSaved.length > 0 ? Math.round(aSavedCount / aWithSaved.length * 100) : null;
      const aWithUpsell = agentCalls.filter((c) => c.upsellAttempted === true);
      const aUpsellSucceeded = aWithUpsell.filter((c) => c.upsellSucceeded === true).length;
      const aUpsellSuccessRate = aWithUpsell.length > 0 ? Math.round(aUpsellSucceeded / aWithUpsell.length * 100) : null;
      return {
        userId: Number(uid),
        repName: agentCalls[0]?.repName ?? "Unknown",
        totalCalls: agentCalls.length,
        avgScore: aAvgScore,
        saveRate: aSaveRate,
        upsellSuccessRate: aUpsellSuccessRate
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls);
    result.push({
      callType,
      team,
      totalCalls: calls.length,
      avgScore,
      saveRate,
      upsellAttemptRate,
      upsellSuccessRate,
      cancelReasons,
      byAgent
    });
  }
  result.sort((a, b) => {
    if (a.team !== b.team) return a.team === "retention" ? -1 : 1;
    return b.totalCalls - a.totalCalls;
  });
  return result;
}
async function getBestPractices(opts) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allCalls = await db.select().from(callAnalyses).where(sql`status = 'done' AND analysisJson IS NOT NULL`);
  const openingTypes = ["cold_call", "follow_up", "opening"];
  let openingCalls = allCalls.filter((c) => !c.callType || openingTypes.includes(c.callType));
  if (opts?.dateFrom || opts?.dateTo) {
    openingCalls = openingCalls.filter((c) => {
      const d = c.callDate ? new Date(c.callDate) : c.createdAt ? new Date(c.createdAt) : null;
      if (!d) return false;
      if (opts.dateFrom && d < opts.dateFrom) return false;
      if (opts.dateTo && d > opts.dateTo) return false;
      return true;
    });
  }
  if (openingCalls.length < 3) {
    throw new Error("Not enough calls to generate insights. Need at least 3 analysed calls.");
  }
  const scoredCalls = openingCalls.filter((c) => c.overallScore != null);
  const teamAvgScore = scoredCalls.length > 0 ? Math.round(scoredCalls.reduce((a, c) => a + (c.overallScore ?? 0), 0) / scoredCalls.length) : null;
  let topCalls = scoredCalls.filter((c) => (c.overallScore ?? 0) >= 75);
  if (topCalls.length < 3) {
    const sorted = [...scoredCalls].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
    topCalls = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3)));
  }
  const topCallsAvgScore = topCalls.length > 0 ? Math.round(topCalls.reduce((a, c) => a + (c.overallScore ?? 0), 0) / topCalls.length) : null;
  const callSummaries = topCalls.slice(0, 15).map((c, i) => {
    const report = c.analysisJson ? JSON.parse(c.analysisJson) : {};
    return `Call ${i + 1} (Score: ${c.overallScore}/100, Duration: ${c.durationSeconds ? Math.round(c.durationSeconds / 60) : "?"}min, Closed: ${c.closeStatus === "closed" ? "YES" : "NO"}):
- Summary: ${report.summary ?? "N/A"}
- Strengths: ${(report.strengths ?? []).slice(0, 3).join("; ")}
- Magic Wand Used: ${report.magicWandUsed ? "YES" : "NO"}
- Closing Attempted: ${report.closingAttempted ? "YES" : "NO"}
- Subscription Disclosed: ${report.subscriptionDisclosed ? "YES" : "NO"}
- Script Compliance: ${report.scriptComplianceScore ?? "N/A"}/100
- Tone Score: ${report.toneScore ?? "N/A"}/100
- Key Moments: ${(report.keyMoments ?? []).filter((m) => m.type === "positive").slice(0, 2).map((m) => m.moment).join("; ")}`;
  }).join("\n\n");
  const prompt = `You are a sales coaching expert analysing a team of skincare sales reps at Lavie Labs.

Below are summaries of the TOP ${topCalls.length} best-performing calls (score >= 75/100) from the Opening team (cold calls and follow-ups).

Your task: identify 5-7 specific, actionable patterns that distinguish these top calls from average calls. Focus on CONCRETE behaviours, not vague advice.

TOP CALLS:
${callSummaries}

TEAM CONTEXT:
- Team average score: ${teamAvgScore ?? "N/A"}/100
- Top calls average score: ${topCallsAvgScore ?? "N/A"}/100
- Product: Lavie Labs skincare (Matinika cream, 21-day free trial, 4.95 GBP postage)
- Key sales techniques: Magic Wand question, subscription framing, objection handling

Return a JSON array of insights. Each insight must have:
- pattern: specific behaviour observed
- impact: measurable or observable impact
- example: a short concrete example or quote from the calls
- category: one of "opening", "pitch", "objection", "close", "compliance", "tone"
- frequency: estimated % of top calls showing this pattern (0-100)

Return ONLY valid JSON array, no markdown, no explanation.`;
  const insightsAbortController = new AbortController();
  const insightsTimeoutId = setTimeout(() => insightsAbortController.abort(), 9e5);
  let raw;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2e3
    }, { signal: insightsAbortController.signal });
    raw = response.choices[0]?.message?.content ?? "[]";
  } finally {
    clearTimeout(insightsTimeoutId);
  }
  let insights = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    insights = JSON.parse(cleaned);
  } catch {
    insights = [];
  }
  return {
    insights,
    topCallsAnalysed: topCalls.length,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    teamAvgScore,
    topCallsAvgScore
  };
}
async function getMyCoachingDashboard(userId, timeRange = "month") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const all = await db.select().from(callAnalyses).where(eq2(callAnalyses.userId, userId)).orderBy(callAnalyses.createdAt);
  const now = /* @__PURE__ */ new Date();
  let windowStart;
  if (timeRange === "today") {
    windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (timeRange === "week") {
    windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
  } else if (timeRange === "month") {
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    windowStart = /* @__PURE__ */ new Date(0);
  }
  const windowMs = now.getTime() - windowStart.getTime();
  const prevWindowStart = new Date(windowStart.getTime() - windowMs);
  const weekStart = windowStart;
  const twoWeeksStart = prevWindowStart;
  const thisWeekCalls = all.filter((c) => new Date(c.createdAt) >= weekStart);
  const lastWeekCalls = all.filter((c) => {
    const d = new Date(c.createdAt);
    return d >= twoWeeksStart && d < weekStart;
  });
  ;
  const doneCalls = (calls) => calls.filter((c) => c.status === "done");
  const thisWeekDone = doneCalls(thisWeekCalls);
  const lastWeekDone = doneCalls(lastWeekCalls);
  const closesThisWeek = thisWeekDone.filter((c) => c.closeStatus === "closed").length;
  const closesLastWeek = lastWeekDone.filter((c) => c.closeStatus === "closed").length;
  const avgOf = (calls) => {
    const scored = calls.filter((c) => c.overallScore != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, c) => s + c.overallScore, 0) / scored.length);
  };
  const avgScoreThisWeek = avgOf(thisWeekDone);
  const avgScoreLastWeek = avgOf(lastWeekDone);
  const complianceAvg = (calls) => {
    let total = 0;
    let count3 = 0;
    for (const c of calls) {
      if (!c.analysisJson) continue;
      try {
        const r = JSON.parse(c.analysisJson);
        if (r.complianceScore != null) {
          total += r.complianceScore;
          count3++;
        }
      } catch {
      }
    }
    return count3 > 0 ? Math.round(total / count3) : null;
  };
  const complianceRate = complianceAvg(thisWeekDone);
  const complianceRateLastWeek = complianceAvg(lastWeekDone);
  const parsed = [];
  for (const c of thisWeekDone) {
    if (!c.analysisJson) continue;
    try {
      parsed.push({ id: c.id, report: JSON.parse(c.analysisJson) });
    } catch {
    }
  }
  const totalParsed = parsed.length;
  const strengthCounts = {};
  const improvementCounts = {};
  let tcReadCount = 0, tcReadTotal = 0;
  let subDisclosedCount = 0, subDisclosedTotal = 0;
  let subMisrepCount = 0, subMisrepTotal = 0;
  let closingAttemptedCount = 0;
  let magicWandCount = 0;
  let rapportTotal = 0, rapportCount = 0;
  let excitementTotal = 0, excitementCount = 0;
  let silenceOkCount = 0, silenceTotal = 0;
  let callControlTotal = 0, callControlCount = 0;
  let authenticityTotal = 0, authenticityCount = 0;
  let objectionTotal = 0, objectionCount = 0;
  let bestRapportQuote = null;
  let bestExcitementQuote = null;
  let worstSilenceQuote = null;
  let worstCallControlQuote = null;
  let worstAuthenticityQuote = null;
  let worstObjectionQuote = null;
  for (const { id, report } of parsed) {
    for (const s of report.strengths ?? []) {
      const key = s.slice(0, 80);
      if (!strengthCounts[key]) strengthCounts[key] = { count: 0, ids: [], quotes: [] };
      strengthCounts[key].count++;
      strengthCounts[key].ids.push(id);
    }
    for (const imp of report.improvements ?? []) {
      const key = imp.slice(0, 80);
      if (!improvementCounts[key]) improvementCounts[key] = { count: 0, ids: [], quotes: [] };
      improvementCounts[key].count++;
      improvementCounts[key].ids.push(id);
    }
    for (const km of report.keyMoments ?? []) {
      if (km.type === "negative" || km.type === "critical") {
        const key = km.coaching.slice(0, 80);
        if (!improvementCounts[key]) improvementCounts[key] = { count: 0, ids: [], quotes: [] };
        improvementCounts[key].count++;
        improvementCounts[key].ids.push(id);
        if (km.moment && improvementCounts[key].quotes.length < 1) improvementCounts[key].quotes.push(km.moment);
      } else if (km.type === "positive") {
        const key = km.coaching.slice(0, 80);
        if (!strengthCounts[key]) strengthCounts[key] = { count: 0, ids: [], quotes: [] };
        strengthCounts[key].count++;
        strengthCounts[key].ids.push(id);
        if (km.moment && strengthCounts[key].quotes.length < 1) strengthCounts[key].quotes.push(km.moment);
      }
    }
    if (report.tcRead != null) {
      tcReadTotal++;
      if (report.tcRead) tcReadCount++;
    }
    if (report.subscriptionDisclosed != null) {
      subDisclosedTotal++;
      if (report.subscriptionDisclosed) subDisclosedCount++;
    }
    if (report.subscriptionMisrepresented != null) {
      subMisrepTotal++;
      if (!report.subscriptionMisrepresented) subMisrepCount++;
    }
    if (report.closingAttempted) closingAttemptedCount++;
    if (report.magicWandUsed) magicWandCount++;
    if (report.rapportScore != null) {
      rapportTotal += report.rapportScore;
      rapportCount++;
      if (report.rapportQuote && !bestRapportQuote) bestRapportQuote = { quote: report.rapportQuote, callId: id };
    }
    if (report.excitementScore != null) {
      excitementTotal += report.excitementScore;
      excitementCount++;
      if (report.excitementQuote && !bestExcitementQuote) bestExcitementQuote = { quote: report.excitementQuote, callId: id };
    }
    if (report.silenceAfterClose != null) {
      silenceTotal++;
      if (report.silenceAfterClose) silenceOkCount++;
      else if (report.silenceQuote && !worstSilenceQuote) worstSilenceQuote = { quote: report.silenceQuote, callId: id };
    }
    if (report.callControl != null) {
      callControlTotal += report.callControl;
      callControlCount++;
      if (report.callControlQuote && report.callControl < 60 && !worstCallControlQuote) worstCallControlQuote = { quote: report.callControlQuote, callId: id };
    }
    if (report.authenticityScore != null) {
      authenticityTotal += report.authenticityScore;
      authenticityCount++;
      if (report.authenticityQuote && report.authenticityScore < 70 && !worstAuthenticityQuote) worstAuthenticityQuote = { quote: report.authenticityQuote, callId: id };
    }
    if (report.objectionHandlingScore != null) {
      objectionTotal += report.objectionHandlingScore;
      objectionCount++;
      if (report.objectionHandlingQuote && report.objectionHandlingScore < 70 && !worstObjectionQuote) worstObjectionQuote = { quote: report.objectionHandlingQuote, callId: id };
    }
  }
  const positives = Object.entries(strengthCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 3).map(([key, val]) => ({
    category: "Strength",
    status: "green",
    title: key,
    detail: `Keep doing this \u2014 it's working. This strength showed up in ${val.count} of your recent calls.`,
    quote: val.quotes[0] ?? null,
    callsAffected: val.count,
    relevantCallIds: Array.from(new Set(val.ids)).slice(0, 1)
  }));
  if (totalParsed > 0 && closingAttemptedCount / totalParsed >= 0.7) {
    positives.push({ category: "Closing \u2014 Confident & Direct", status: "green", title: "You ask for the close clearly and without hesitation", detail: `${closingAttemptedCount} closes this week. You're asking at the right moment and staying quiet after. That pause is where the sale is won \u2014 and you're nailing it.`, quote: null, callsAffected: closingAttemptedCount, relevantCallIds: thisWeekDone.slice(0, 1).map((c) => c.id) });
  }
  if (totalParsed > 0 && magicWandCount / totalParsed >= 0.6) {
    positives.push({ category: "Magic Wand Question", status: "green", title: "You're using the Magic Wand question every call", detail: `You asked the Magic Wand question in ${magicWandCount} of ${totalParsed} calls. Customers who answer this question are far more likely to close \u2014 keep it in every call.`, quote: null, callsAffected: magicWandCount, relevantCallIds: thisWeekDone.slice(0, 1).map((c) => c.id) });
  }
  const CATEGORY_RULES2 = [
    {
      test: (t2) => /magic\s*wand/i.test(t2) && /answer|loop|use|tie|follow/i.test(t2),
      category: "Magic Wand \u2014 Not Closing the Loop",
      coachingDetail: (_k, count3, total) => `You asked the question \u2014 great. But the customer told you exactly what she wanted and you moved on. Every answer she gives you is a door. When she says her concern \u2014 that's your cue to bring in the right product. Tie it back, every time. This happened in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /magic\s*wand/i.test(t2),
      category: "Magic Wand Question",
      coachingDetail: (_k, count3, total) => `The Magic Wand question is your most powerful tool. Customers who answer it are far more likely to close. You skipped it in ${count3} of ${total} calls \u2014 make it non-negotiable on every call.`
    },
    {
      test: (t2) => /clos(e|ing)|offer|ask(ed)?\s*(for|the)\s*(sale|close)|attempt/i.test(t2) && !/loop/i.test(t2),
      category: "Closing \u2014 Not Asking for the Sale",
      coachingDetail: (_k, count3, total) => `You can't win a sale you don't ask for. You missed the close attempt in ${count3} of ${total} calls. Every call needs a clear, confident close \u2014 even if you think they're not ready. Ask, then stay silent.`
    },
    {
      test: (t2) => /rapport|personal|connect|name|warm/i.test(t2),
      category: "Rapport \u2014 Build the Connection",
      coachingDetail: (_k, count3, total) => `Ask personal questions, use her name, and respond to what she shares. Don't rush to the pitch. A customer who feels heard is 2\xD7 more likely to close. This showed up in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /tone|energy|enthusiasm|excit|flat|monotone|boring|pitch/i.test(t2),
      category: "Tone & Energy \u2014 Bring the Excitement",
      coachingDetail: (_k, count3, total) => `Replace technical language with vivid, sensory words: "feel", "imagine", "wake up with glowing skin". Make her want it before you mention the price. Your pitch fell flat in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /objection|push\s*back|think\s*about|hesitat|overcome|rebut/i.test(t2),
      category: "Objection Handling \u2014 Don't Give Up",
      coachingDetail: (_k, count3, total) => `When a customer says "I need to think about it", don't accept it \u2014 ask which concern it is: the product, or giving card details. Then address that specific concern. You gave up too quickly in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /authenti|script|repeat|robot|natural|filler|absolutely/i.test(t2),
      category: "Authenticity \u2014 You Sound Scripted",
      coachingDetail: (_k, count3, total) => `When you repeat the same word over and over, customers stop trusting you \u2014 it sounds like a script, not a real person. Replace filler words with nothing. Just say "yes", "exactly", or move straight to your next point. You'll sound 10\xD7 more real. Noticed in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /silence|pause|quiet|stop\s*talk/i.test(t2),
      category: "Silence After Close \u2014 Hold the Pause",
      coachingDetail: (_k, count3, total) => `After you ask for the close \u2014 stop talking. The next person who speaks loses. You filled the silence instead of holding it in ${count3} of ${total} calls. Let the pause do the work.`
    },
    {
      test: (t2) => /control|redirect|off.?topic|lead|steer|rambl/i.test(t2),
      category: "Call Control \u2014 Lead the Conversation",
      coachingDetail: (_k, count3, total) => `When a customer goes off-topic, gently redirect: "That's interesting \u2014 let me just finish this one point and we'll come back to that." You're following them instead of leading. This happened in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /subscri|t\s*&\s*c|terms|compliance|misrepresent/i.test(t2),
      category: "Compliance \u2014 Subscription Handling",
      coachingDetail: (_k, count3, total) => `Never deny or downplay the subscription. The correct response is: "You're in complete control \u2014 cancel anytime with one click or one email." Be proud of the subscription, not defensive. Flagged in ${count3} of ${total} calls.`
    },
    {
      test: (t2) => /product|benefit|feature|ingredient|result|proof|trustpilot|review/i.test(t2),
      category: "Product Knowledge \u2014 Sell the Benefits",
      coachingDetail: (_k, count3, total) => `Customers don't buy ingredients \u2014 they buy results. Paint the picture: "wake up with glowing skin", "feel the difference in 3 days". Use Trustpilot reviews and real results to build trust. Needed in ${count3} of ${total} calls.`
    }
  ];
  function classifyImprovement(key, count3, total) {
    const upper = key.toUpperCase();
    const pct2 = total > 0 ? count3 / total : 0;
    for (const rule of CATEGORY_RULES2) {
      if (rule.test(key)) {
        let status = pct2 >= 0.5 ? "red" : "orange";
        if (upper.includes("AUTHENTI") || upper.includes("SCRIPTED")) status = "yellow";
        return { category: rule.category, detail: rule.coachingDetail(key, count3, total), status };
      }
    }
    const fallbackCategory = key.length > 40 ? key.slice(0, 40).replace(/\s+\S*$/, "...") : key;
    const fallbackDetail = `This came up in ${count3} of ${total} calls. Focus on this area in your next calls \u2014 small changes here will make a big difference to your results.`;
    return { category: fallbackCategory, detail: fallbackDetail, status: pct2 >= 0.5 ? "red" : "orange" };
  }
  const improvements = Object.entries(improvementCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 4).map(([key, val]) => {
    const { category, detail, status } = classifyImprovement(key, val.count, totalParsed);
    return { category, status, title: key, detail, quote: val.quotes[0] ?? null, callsAffected: val.count, relevantCallIds: Array.from(new Set(val.ids)).slice(0, 1) };
  });
  if (totalParsed > 0 && magicWandCount / totalParsed < 0.5) {
    const missedCalls = thisWeekDone.filter((c) => {
      try {
        return !JSON.parse(c.analysisJson).magicWandUsed;
      } catch {
        return false;
      }
    });
    const missedIds = missedCalls.map((c) => c.id).slice(0, 1);
    improvements.push({ category: "Magic Wand \u2014 Not Closing the Loop", status: "orange", title: "You asked the magic wand question \u2014 but didn't use the answer", detail: `You asked the question \u2014 great. But the customer told you exactly what she wanted and you moved on. Every answer she gives you is a door. When she says her concern \u2014 that's your cue to tie back every product. Do it every time.`, quote: null, callsAffected: totalParsed - magicWandCount, relevantCallIds: missedIds });
  }
  if (totalParsed > 0 && closingAttemptedCount / totalParsed < 0.7) {
    const missedCalls = thisWeekDone.filter((c) => {
      try {
        return !JSON.parse(c.analysisJson).closingAttempted;
      } catch {
        return false;
      }
    });
    const missedIds = missedCalls.map((c) => c.id).slice(0, 1);
    improvements.push({ category: "Closing Attempt", status: "red", title: "You're not attempting the close on every call", detail: `You only attempted to close in ${closingAttemptedCount} of ${totalParsed} calls. You can't win a sale you don't ask for. Every call needs a close attempt \u2014 even if you think they're not ready.`, quote: null, callsAffected: totalParsed - closingAttemptedCount, relevantCallIds: missedIds });
  }
  const avgRapport = rapportCount > 0 ? Math.round(rapportTotal / rapportCount) : null;
  const avgExcitement = excitementCount > 0 ? Math.round(excitementTotal / excitementCount) : null;
  const silencePct = silenceTotal > 0 ? Math.round(silenceOkCount / silenceTotal * 100) : null;
  const avgCallControl = callControlCount > 0 ? Math.round(callControlTotal / callControlCount) : null;
  const avgAuthenticity = authenticityCount > 0 ? Math.round(authenticityTotal / authenticityCount) : null;
  const avgObjection = objectionCount > 0 ? Math.round(objectionTotal / objectionCount) : null;
  if (avgRapport != null && avgRapport >= 75) {
    positives.push({ category: "Rapport \u2014 Best on the Team", status: "green", title: "You build real connections \u2014 customers open up to you", detail: `Calls where you build rapport close at 2.1\xD7 the team average. This is your biggest weapon. Keep doing it \u2014 and do it earlier in the call.`, quote: bestRapportQuote?.quote ?? null, callsAffected: rapportCount, relevantCallIds: bestRapportQuote ? [bestRapportQuote.callId] : [] });
  } else if (avgRapport != null && avgRapport < 60) {
    improvements.push({ category: "Rapport", status: avgRapport < 45 ? "red" : "orange", title: "You're not building enough personal connection", detail: `Ask personal questions, use her name, and respond to what she shares. Don't rush to the pitch. A customer who feels heard is 2\xD7 more likely to close.`, quote: bestRapportQuote?.quote ?? null, callsAffected: rapportCount, relevantCallIds: bestRapportQuote ? [bestRapportQuote.callId] : [] });
  }
  if (avgExcitement != null && avgExcitement >= 75) {
    positives.push({ category: "Product Excitement", status: "green", title: "Your product pitch is vivid and enthusiastic", detail: `You're using emotional language that makes customers want the product. Keep painting the picture \u2014 'wake up with glowing skin', 'feel the difference in 3 days'.`, quote: bestExcitementQuote?.quote ?? null, callsAffected: excitementCount, relevantCallIds: bestExcitementQuote ? [bestExcitementQuote.callId] : [] });
  } else if (avgExcitement != null && avgExcitement < 60) {
    improvements.push({ category: "Product Excitement", status: avgExcitement < 45 ? "red" : "orange", title: "Your product pitch sounds too technical", detail: `Replace technical language with vivid, sensory words: 'feel', 'imagine', 'wake up with glowing skin'. Make her want it before you mention the price. Listen to how you're pitching it now.`, quote: bestExcitementQuote?.quote ?? null, callsAffected: excitementCount, relevantCallIds: bestExcitementQuote ? [bestExcitementQuote.callId] : [] });
  }
  if (silencePct != null && silencePct >= 70) {
    positives.push({ category: "Silence After Close", status: "green", title: "You hold the silence after the close", detail: `You stayed silent after the close in ${silenceOkCount} of ${silenceTotal} calls. That pause is where the sale is won \u2014 and you're nailing it.`, quote: null, callsAffected: silenceOkCount, relevantCallIds: [] });
  } else if (silencePct != null && silencePct < 50) {
    improvements.push({ category: "Silence After Close", status: "red", title: "You're filling the silence after the close", detail: `After you ask for the close \u2014 stop talking. The next person who speaks loses. You filled the silence in ${silenceTotal - silenceOkCount} of ${silenceTotal} calls. Listen to this moment.`, quote: worstSilenceQuote?.quote ?? null, callsAffected: silenceTotal - silenceOkCount, relevantCallIds: worstSilenceQuote ? [worstSilenceQuote.callId] : [] });
  }
  if (avgCallControl != null && avgCallControl >= 75) {
    positives.push({ category: "Call Control", status: "green", title: "You lead the conversation confidently", detail: `You're steering the conversation back to the sale when customers go off-topic. That's a skill most reps never master.`, quote: null, callsAffected: callControlCount, relevantCallIds: [] });
  } else if (avgCallControl != null && avgCallControl < 60) {
    improvements.push({ category: "Call Control", status: avgCallControl < 45 ? "red" : "orange", title: "Customers are taking over the conversation", detail: `When a customer goes off-topic, gently redirect: "That's interesting \u2014 let me just finish this one point and we'll come back to that." You're following them instead of leading. Listen to this moment.`, quote: worstCallControlQuote?.quote ?? null, callsAffected: callControlCount, relevantCallIds: worstCallControlQuote ? [worstCallControlQuote.callId] : [] });
  }
  if (avgAuthenticity != null && avgAuthenticity >= 75) {
    positives.push({ category: "Authenticity", status: "green", title: "You sound natural and genuine", detail: `Customers trust you because you sound like a real person, not a script. That's rare \u2014 and it's why they stay on the call.`, quote: null, callsAffected: authenticityCount, relevantCallIds: [] });
  } else if (avgAuthenticity != null && avgAuthenticity < 60) {
    improvements.push({ category: "Authenticity \u2014 You Sound Scripted", status: avgAuthenticity < 45 ? "red" : "orange", title: "You sound too scripted on this call", detail: `When you repeat the same word over and over, customers stop trusting you \u2014 it sounds like a script, not a real person. Replace filler words like "absolutely" with nothing. Just say what you mean \u2014 "yes", "exactly", or move straight to your next point. You'll sound 10\xD7 more real.`, quote: worstAuthenticityQuote?.quote ?? null, callsAffected: authenticityCount, relevantCallIds: worstAuthenticityQuote ? [worstAuthenticityQuote.callId] : [] });
  }
  if (avgObjection != null && avgObjection >= 75) {
    positives.push({ category: "Objection Handling", status: "green", title: "You handle objections well", detail: `You're using the right responses and not giving up too quickly. When a customer pushes back, you push back with empathy \u2014 and it's working.`, quote: null, callsAffected: objectionCount, relevantCallIds: [] });
  } else if (avgObjection != null && avgObjection < 60) {
    improvements.push({ category: "Objection Handling", status: avgObjection < 45 ? "red" : "orange", title: "You're giving up on objections too quickly", detail: `When a customer says "I need to think about it", don't accept it \u2014 ask which of the two concerns it is: the product, or giving card details. Then address that specific concern. Listen to how you handled it here.`, quote: worstObjectionQuote?.quote ?? null, callsAffected: objectionCount, relevantCallIds: worstObjectionQuote ? [worstObjectionQuote.callId] : [] });
  }
  const pct = (count3, total) => total > 0 ? Math.round(count3 / total * 100) : 100;
  const trafficLight = (p) => p >= 85 ? "green" : p >= 60 ? "orange" : "red";
  const tcPct = pct(tcReadCount, tcReadTotal);
  const subMisrepPct = pct(subMisrepCount, subMisrepTotal);
  if (tcReadTotal > 0 && tcPct < 85) {
    const failCall = [...thisWeekDone].reverse().find((c) => {
      try {
        return JSON.parse(c.analysisJson).tcRead === false;
      } catch {
        return false;
      }
    });
    improvements.unshift({
      category: "Compliance \u2014 Fix First",
      status: "red",
      title: "You're referencing T&Cs instead of reading them aloud",
      detail: `The rule is clear: you must read them out verbally on every call. Saying "find them on the website" is not enough and puts you at compliance risk. Next call \u2014 read them out loud before taking card details.`,
      quote: failCall ? (() => {
        try {
          const r = JSON.parse(failCall.analysisJson);
          return r.silenceQuote ?? r.callControlQuote ?? null;
        } catch {
          return null;
        }
      })() : null,
      callsAffected: tcReadTotal - tcReadCount,
      relevantCallIds: failCall ? [failCall.id] : []
    });
  }
  if (subMisrepTotal > 0 && subMisrepPct < 85) {
    const failCall = [...thisWeekDone].reverse().find((c) => {
      try {
        return JSON.parse(c.analysisJson).subscriptionMisrepresented === true;
      } catch {
        return false;
      }
    });
    improvements.unshift({
      category: "Compliance \u2014 Fix First",
      status: "red",
      title: "You denied or downplayed the subscription",
      detail: `Never say "it's not a subscription" or "you won't be charged". The correct response is: "You're in complete control \u2014 cancel anytime with one click or one email." Be proud of the subscription, not defensive.`,
      quote: null,
      callsAffected: subMisrepTotal - subMisrepCount,
      relevantCallIds: failCall ? [failCall.id] : []
    });
  }
  const complianceChecklist = [
    { label: "Full offer details read aloud (T&Cs)", pct: pct(tcReadCount, tcReadTotal), status: trafficLight(pct(tcReadCount, tcReadTotal)) },
    { label: "Subscription clearly explained", pct: pct(subDisclosedCount, subDisclosedTotal), status: trafficLight(pct(subDisclosedCount, subDisclosedTotal)) },
    { label: "No subscription misrepresentation", pct: pct(subMisrepCount, subMisrepTotal), status: trafficLight(pct(subMisrepCount, subMisrepTotal)) },
    { label: "Close attempted every call", pct: pct(closingAttemptedCount, totalParsed), status: trafficLight(pct(closingAttemptedCount, totalParsed)) },
    { label: "Magic Wand question asked", pct: pct(magicWandCount, totalParsed), status: trafficLight(pct(magicWandCount, totalParsed)) }
  ];
  const recentCalls = [...all].reverse().slice(0, 10).map((c) => ({
    id: c.id,
    callDate: c.callDate ? new Date(c.callDate).toISOString() : null,
    customerName: c.customerName ?? null,
    overallScore: c.overallScore != null ? Math.round(c.overallScore) : null,
    closeStatus: c.closeStatus ?? null,
    status: c.status,
    durationSeconds: c.durationSeconds ?? null,
    audioFileUrl: c.audioFileUrl
  }));
  const withSpeechPct = thisWeekDone.filter((c) => c.repSpeechPct != null);
  const avgRepSpeechPct = withSpeechPct.length > 0 ? Math.round(withSpeechPct.reduce((s, c) => s + c.repSpeechPct, 0) / withSpeechPct.length) : null;
  return {
    closesThisWeek,
    closesLastWeek,
    avgScoreThisWeek,
    avgScoreLastWeek,
    complianceRate,
    complianceRateLastWeek,
    totalCallsThisWeek: thisWeekCalls.length,
    avgRepSpeechPct,
    positives: positives.slice(0, 3),
    improvements: improvements.slice(0, 4),
    complianceChecklist,
    recentCalls
  };
}

// server/routers/callCoach.ts
function maskCreditCards(text2) {
  return text2.replace(/\b(\d[ -]?){12,18}\d\b/g, (match) => {
    const digitsOnly = match.replace(/[ -]/g, "");
    if (digitsOnly.length < 13 || digitsOnly.length > 19) return match;
    const lastFour = digitsOnly.slice(-4);
    return `XXXX XXXX XXXX ${lastFour}`;
  });
}
var callCoachRouter = router({
  /** Agent personal coaching dashboard — stats, strengths, improvements, compliance for selected time range */
  getMyCoachingDashboard: protectedProcedure.input(z2.object({ timeRange: z2.enum(["today", "week", "month", "all"]).default("month") }).optional()).query(async ({ ctx, input }) => {
    return getMyCoachingDashboard(ctx.user.id, input?.timeRange ?? "month");
  }),
  /** Admin: view any agent's coaching dashboard by userId */
  getAgentCoachingDashboard: protectedProcedure.input(z2.object({
    agentId: z2.number(),
    timeRange: z2.enum(["today", "week", "month", "all"]).default("month")
  })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new Error("Forbidden");
    return getMyCoachingDashboard(input.agentId, input.timeRange);
  }),
  getMyAnalyses: protectedProcedure.query(async () => {
    return listAllCallAnalyses();
  }),
  getAnalysis: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ ctx, input }) => {
    const analysis = await getCallAnalysisById(input.id);
    if (!analysis) return null;
    if (ctx.user.role !== "admin" && analysis.transcript) {
      return { ...analysis, transcript: maskCreditCards(analysis.transcript) };
    }
    return analysis;
  }),
  getAllAnalyses: protectedProcedure.query(async () => {
    return listAllCallAnalyses();
  }),
  /** Admin agent dashboard — per-agent summary cards with recent calls */
  getAgentDashboard: protectedProcedure.input(z2.object({ timeRange: z2.enum(["today", "week", "month", "all"]).default("month") }).optional()).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new Error("Forbidden");
    return getAgentDashboard(input?.timeRange ?? "month");
  }),
  /** Public leaderboard — visible to all logged-in users */
  getLeaderboard: protectedProcedure.query(async () => {
    return getLeaderboard();
  }),
  /** Team dashboard — all reps with full stats, visible to all logged-in users */
  getTeamDashboard: protectedProcedure.query(async () => {
    return getTeamDashboard();
  }),
  /**
   * Called by the frontend after a successful file upload.
   * Accepts metadata: repName, callDate, closeStatus.
   */
  startAnalysis: protectedProcedure.input(
    z2.object({
      audioFileKey: z2.string(),
      audioFileUrl: z2.string(),
      fileName: z2.string(),
      repName: z2.string().optional(),
      callDate: z2.string().optional(),
      // ISO date string
      closeStatus: z2.enum(["closed", "not_closed", "follow_up"]).optional(),
      callType: z2.enum(["cold_call", "follow_up", "live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "other", "opening", "retention_cancel_trial", "retention_win_back", "instalment_decline"]).optional(),
      contactId: z2.number().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const analysisId = await createCallAnalysisRecord({
      userId: ctx.user.id,
      repName: input.repName ?? ctx.user.name ?? null,
      audioFileKey: input.audioFileKey,
      audioFileUrl: input.audioFileUrl,
      fileName: input.fileName,
      callDate: input.callDate ? new Date(input.callDate) : null,
      closeStatus: input.closeStatus ?? null,
      callType: input.callType ?? "cold_call",
      contactId: input.contactId ?? null
    });
    processCallAnalysis(analysisId, input.audioFileUrl, input.audioFileKey).catch(
      (err) => console.error("[callCoach] processCallAnalysis error:", err)
    );
    return { analysisId };
  }),
  /**
   * Update call metadata (repName, callDate, closeStatus) after upload.
   * Owner or admin can edit.
   */
  updateCallDetails: protectedProcedure.input(
    z2.object({
      id: z2.number(),
      repName: z2.string().optional(),
      callDate: z2.string().optional(),
      closeStatus: z2.enum(["closed", "not_closed", "follow_up"]).optional(),
      customerName: z2.string().optional(),
      callType: z2.enum(["cold_call", "follow_up", "live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "other", "opening", "retention_cancel_trial", "retention_win_back", "instalment_decline"]).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const analysis = await getCallAnalysisById(input.id);
    if (!analysis) throw new Error("Not found");
    if (ctx.user.role !== "admin" && analysis.userId !== ctx.user.id) {
      throw new Error("Forbidden");
    }
    await updateCallDetails({
      id: input.id,
      repName: input.repName,
      callDate: input.callDate ? new Date(input.callDate) : void 0,
      closeStatus: input.closeStatus,
      customerName: input.customerName,
      callType: input.callType,
      lastEditedByUserId: ctx.user.id,
      lastEditedByName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`
    });
    return { success: true };
  }),
  /**
   * Submit feedback flagging an inaccurate AI analysis section.
   * Any logged-in user (rep or manager) can submit.
   */
  submitFeedback: protectedProcedure.input(
    z2.object({
      analysisId: z2.number(),
      section: z2.enum(["overall", "script_compliance", "tone", "talk_ratio", "recommendations", "transcript", "other"]),
      issue: z2.string().min(1).max(512),
      comment: z2.string().max(2e3).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    await submitFeedback({
      analysisId: input.analysisId,
      userId: ctx.user.id,
      section: input.section,
      issue: input.issue,
      comment: input.comment ?? null
    });
    return { success: true };
  }),
  /**
   * Delete a failed (error-status) call analysis.
   * Owner or admin only. Succeeds only if status === 'error'.
   */
  deleteAnalysis: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
    const analysis = await getCallAnalysisById(input.id);
    if (!analysis) throw new Error("Not found");
    if (ctx.user.role !== "admin" && analysis.userId !== ctx.user.id) {
      throw new Error("Forbidden");
    }
    if (analysis.status !== "error") {
      throw new Error("Only failed calls can be deleted");
    }
    const deleted = await deleteFailedAnalysis(input.id);
    return { success: deleted };
  }),
  /**
   * Admin-only: call type performance dashboard — save rates, upsell rates, scores per call type.
   */
  getCallTypePerformance: adminProcedure.input(z2.object({ range: z2.enum(["today", "week", "month", "all"]).default("all") })).query(async ({ input }) => {
    return getCallTypePerformance(input.range);
  }),
  /**
   * Admin-only: get all feedback submissions grouped by section,
   * useful for identifying patterns and improving the AI prompt.
   */
  getFeedbackSummary: adminProcedure.query(async () => {
    return getFeedbackSummary();
  }),
  /**
   * Returns list of all app users (id + name) for the rep dropdown in manual upload.
   * Available to all logged-in users so agents can also see their own name.
   */
  getAgentList: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, team: users.team, active: users.active }).from(users).orderBy(users.name);
    const filtered = rows.filter((r) => r.name && r.email && r.active && r.team);
    const seen = /* @__PURE__ */ new Set();
    return filtered.filter((r) => {
      const key = r.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }),
  /** Admin-only: re-run the full analysis pipeline for a call */
  reAnalyze: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new Error("Admin only");
    const analysis = await getCallAnalysisById(input.id);
    if (!analysis) throw new Error("Not found");
    if (!analysis.audioFileUrl) throw new Error("No audio URL");
    processCallAnalysis(input.id, analysis.audioFileUrl, analysis.audioFileKey ?? void 0).catch(
      (err) => console.error("[callCoach] reAnalyze error:", err)
    );
    return { success: true };
  }),
  /** Generate a share token for a call analysis (authenticated) */
  generateShareToken: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const analysis = await getCallAnalysisById(input.id);
    if (!analysis) throw new Error("Not found");
    const token = await generateShareToken(input.id);
    return { shareToken: token };
  }),
  /** Public: get a call analysis by share token (NO auth required) */
  getSharedAnalysis: publicProcedure.input(z2.object({ shareToken: z2.string().min(1) })).query(async ({ input }) => {
    const analysis = await getCallAnalysisByShareToken(input.shareToken);
    if (!analysis) return null;
    if (analysis.status !== "done") return null;
    if (analysis.transcript) {
      return { ...analysis, transcript: maskCreditCards(analysis.transcript) };
    }
    return analysis;
  }),
  /**
   * AI Best Practice Extraction — analyses top-scoring Opening calls and
   * returns GPT-4 generated patterns that distinguish the best calls.
   */
  getBestPractices: protectedProcedure.input(z2.object({
    dateFrom: z2.string().optional(),
    dateTo: z2.string().optional()
  }).optional()).mutation(async ({ input }) => {
    return getBestPractices({
      dateFrom: input?.dateFrom ? new Date(input.dateFrom) : void 0,
      dateTo: input?.dateTo ? /* @__PURE__ */ new Date(input.dateTo + "T23:59:59.999Z") : void 0
    });
  })
});

// server/routers/contacts.ts
import { z as z3 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";
import Stripe from "stripe";

// server/contacts.ts
init_schema();
import { eq as eq3, like, or, desc, and as and2, gte, lte, isNull, isNotNull, inArray, count, sql as sql2 } from "drizzle-orm";
var LEAD_TYPES = [
  "Pre Cycle",
  "Pre-Cycle-Cancelled",
  "Pre-Cycle-Decline",
  "Cycle 1",
  "Cycle 2",
  "Cycle 3+",
  "Cancel 2+ Cycle",
  "Live Sub 3 Days",
  "Live Sub 7 Days",
  "Live Sub 14days+",
  "Live Sub 2nd+",
  "Live Sub Declined 2nd+",
  "Owned Sub",
  "Same day as charge cancel",
  "Warm lead",
  "Other"
];
var CONTACT_STATUSES = [
  "new",
  "open",
  "working",
  "assigned",
  "done_deal",
  "retained_sub",
  "cancelled_sub",
  "closed",
  "skipped",
  "do_not_call",
  "no_answer",
  "done"
];
function normalisePhone(raw) {
  if (!raw) return void 0;
  let p = raw.replace(/[\s\-().]/g, "").trim();
  if (!p) return void 0;
  if (/^07\d{9}$/.test(p)) return `+44${p.slice(1)}`;
  if (/^7\d{9}$/.test(p)) return `+44${p}`;
  if (/^447\d{9}$/.test(p)) return `+${p}`;
  if (/^05\d{8}$/.test(p)) return `+972${p.slice(1)}`;
  if (/^972\d{8,9}$/.test(p)) return `+${p}`;
  if (p.startsWith("+")) return p;
  return p;
}
async function listContacts({
  search,
  leadType,
  status,
  agentName,
  agentEmail,
  department,
  source,
  leadDateFrom,
  leadDateTo,
  statusDateFrom,
  statusDateTo,
  limit = 50,
  offset = 0
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(contacts.name, `%${search}%`),
        like(contacts.phone, `%${search}%`),
        like(contacts.email, `%${search}%`)
      )
    );
  }
  if (leadType) conditions.push(eq3(contacts.leadType, leadType));
  if (status) conditions.push(eq3(contacts.status, status));
  if (agentName) conditions.push(eq3(contacts.agentName, agentName));
  if (agentEmail === "unassigned") {
    conditions.push(or(isNull(contacts.agentEmail), eq3(contacts.agentEmail, ""), eq3(contacts.agentEmail, "trial@lavielabs.com")));
  } else if (agentEmail) {
    conditions.push(eq3(contacts.agentEmail, agentEmail));
  }
  if (department) conditions.push(eq3(contacts.department, department));
  if (source) conditions.push(eq3(contacts.source, source));
  if (leadDateFrom) conditions.push(gte(contacts.leadDate, new Date(leadDateFrom)));
  if (leadDateTo) {
    const toEnd = new Date(leadDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.leadDate, toEnd));
  }
  if (statusDateFrom) conditions.push(gte(contacts.updatedAt, new Date(statusDateFrom)));
  if (statusDateTo) {
    const toEnd = new Date(statusDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.updatedAt, toEnd));
  }
  const where = conditions.length > 0 ? and2(...conditions) : void 0;
  return db.select().from(contacts).where(where).orderBy(
    sql2`CASE WHEN (${contacts.email} IS NOT NULL AND ${contacts.email} != '' AND ${contacts.address} IS NOT NULL AND ${contacts.address} != '') THEN 0 WHEN (${contacts.email} IS NOT NULL AND ${contacts.email} != '') OR (${contacts.address} IS NOT NULL AND ${contacts.address} != '') THEN 1 ELSE 2 END`,
    sql2`CASE WHEN ${contacts.status} = 'new' THEN 0 ELSE 1 END`,
    desc(contacts.createdAt)
  ).limit(limit).offset(offset);
}
async function countContacts({
  search,
  leadType,
  status,
  agentName,
  agentEmail,
  department,
  source,
  leadDateFrom,
  leadDateTo,
  statusDateFrom,
  statusDateTo
} = {}) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(contacts.name, `%${search}%`),
        like(contacts.phone, `%${search}%`),
        like(contacts.email, `%${search}%`)
      )
    );
  }
  if (leadType) conditions.push(eq3(contacts.leadType, leadType));
  if (status) conditions.push(eq3(contacts.status, status));
  if (agentName) conditions.push(eq3(contacts.agentName, agentName));
  if (agentEmail === "unassigned") {
    conditions.push(or(isNull(contacts.agentEmail), eq3(contacts.agentEmail, ""), eq3(contacts.agentEmail, "trial@lavielabs.com")));
  } else if (agentEmail) {
    conditions.push(eq3(contacts.agentEmail, agentEmail));
  }
  if (department) conditions.push(eq3(contacts.department, department));
  if (source) conditions.push(eq3(contacts.source, source));
  if (leadDateFrom) conditions.push(gte(contacts.leadDate, new Date(leadDateFrom)));
  if (leadDateTo) {
    const toEnd = new Date(leadDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.leadDate, toEnd));
  }
  if (statusDateFrom) conditions.push(gte(contacts.updatedAt, new Date(statusDateFrom)));
  if (statusDateTo) {
    const toEnd = new Date(statusDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.updatedAt, toEnd));
  }
  const where = conditions.length > 0 ? and2(...conditions) : void 0;
  const [row] = await db.select({ total: count() }).from(contacts).where(where);
  return row?.total ?? 0;
}
async function getDistinctSources() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ source: contacts.source }).from(contacts).where(isNotNull(contacts.source));
  return rows.map((r) => r.source).filter((s) => !!s && s.trim().length > 0).sort();
}
async function getContact(id) {
  const db = await getDb();
  if (!db) return null;
  const [contact] = await db.select().from(contacts).where(eq3(contacts.id, id)).limit(1);
  if (!contact) return null;
  const notes = await db.select().from(contactCallNotes).where(eq3(contactCallNotes.contactId, id)).orderBy(desc(contactCallNotes.createdAt));
  return { ...contact, callNotes: notes };
}
async function updateContact(id, updates) {
  const db = await getDb();
  if (!db) return null;
  await db.update(contacts).set(updates).where(eq3(contacts.id, id));
  return getContact(id);
}
async function addCallNote({
  contactId,
  userId,
  agentName,
  note,
  statusAtTime
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(contactCallNotes).values({
    contactId,
    userId,
    agentName,
    note,
    statusAtTime
  });
}
async function importContacts(rows, department = "opening") {
  const db = await getDb();
  if (!db) return { imported: 0, skipped: rows.length };
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.name?.trim()) {
      skipped++;
      continue;
    }
    const rawStatus = (row.status ?? "new").toLowerCase().trim().replace(/\s+/g, "_");
    const statusMap = {
      new: "new",
      open: "open",
      working: "working",
      assigned: "assigned",
      done_deal: "done_deal",
      "done deal": "done_deal",
      retained_sub: "retained_sub",
      "retained sub": "retained_sub",
      cancelled_sub: "cancelled_sub",
      "cancelled sub": "cancelled_sub",
      closed: "closed"
    };
    const status = statusMap[rawStatus] ?? "new";
    let leadDate;
    if (row.leadDate) {
      const parsed = new Date(row.leadDate);
      if (!isNaN(parsed.getTime())) leadDate = parsed;
    }
    if (!leadDate) leadDate = /* @__PURE__ */ new Date();
    const insert = {
      name: row.name.trim(),
      email: row.email?.trim().toLowerCase() || void 0,
      phone: normalisePhone(row.phone) || void 0,
      leadType: row.leadType?.trim() || void 0,
      status,
      agentName: row.agentName?.trim() || void 0,
      agentEmail: row.agentEmail?.trim() || "trial@lavielabs.com",
      importedNotes: row.notes?.trim() || void 0,
      source: row.source?.trim() || void 0,
      leadDate,
      address: row.address?.trim().toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()) || void 0,
      department
    };
    await db.insert(contacts).values(insert);
    imported++;
  }
  return { imported, skipped };
}
async function getCallbacksDue(agentEmail) {
  const db = await getDb();
  if (!db) return [];
  const now = /* @__PURE__ */ new Date();
  const conditions = [lte(contacts.callbackAt, now)];
  if (agentEmail) {
    conditions.push(eq3(contacts.agentEmail, agentEmail));
  }
  return db.select().from(contacts).where(and2(...conditions)).orderBy(contacts.callbackAt);
}
async function getAllCallbacks(agentEmail) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    isNotNull(contacts.callbackAt),
    eq3(contacts.status, "working")
  ];
  if (agentEmail) {
    conditions.push(eq3(contacts.agentEmail, agentEmail));
  }
  return db.select().from(contacts).where(and2(...conditions)).orderBy(contacts.callbackAt);
}
function normalizePhone(raw) {
  const stripped = raw.replace(/[\s\-().+]/g, "");
  if (stripped.startsWith("44")) return stripped.slice(2);
  if (stripped.startsWith("0")) return stripped.slice(1);
  return stripped;
}
async function getContactByPhone(rawPhone) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return null;
  const all = await db.select().from(contacts);
  const match = all.find((c) => {
    if (!c.phone) return false;
    return normalizePhone(c.phone) === normalized;
  });
  if (!match) return null;
  return getContact(match.id);
}
async function deleteContact(id) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contactCallNotes).where(eq3(contactCallNotes.contactId, id));
  await db.delete(contacts).where(eq3(contacts.id, id));
}
async function bulkDeleteContacts(ids) {
  if (!ids.length) return { deleted: 0 };
  const db = await getDb();
  if (!db) return { deleted: 0 };
  await db.delete(contactCallNotes).where(inArray(contactCallNotes.contactId, ids));
  await db.delete(contacts).where(inArray(contacts.id, ids));
  return { deleted: ids.length };
}
async function bulkAssignContacts(ids, agentName, agentEmail) {
  if (!ids.length) return { assigned: 0 };
  const db = await getDb();
  if (!db) return { assigned: 0 };
  await db.update(contacts).set({ agentName, agentEmail, status: "assigned" }).where(inArray(contacts.id, ids));
  return { assigned: ids.length };
}
async function syncUnsyncedContactsToCloudTalk() {
  const { syncContactToCloudTalk: syncContactToCloudTalk2 } = await Promise.resolve().then(() => (init_cloudtalk(), cloudtalk_exports));
  const db = await getDb();
  if (!db) return;
  const unsynced = await db.select().from(contacts).where(isNull(contacts.cloudtalkId));
  if (unsynced.length === 0) return;
  console.log(`[CloudTalk] Syncing ${unsynced.length} unsynced contacts...`);
  for (const contact of unsynced) {
    const cloudtalkId = await syncContactToCloudTalk2(
      { name: contact.name, email: contact.email, phone: contact.phone },
      null
    );
    if (cloudtalkId) {
      await db.update(contacts).set({ cloudtalkId }).where(eq3(contacts.id, contact.id));
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`[CloudTalk] Startup sync complete.`);
}

// server/gmailTransport.ts
import nodemailer from "nodemailer";
var gmailTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  // uses STARTTLS
  auth: {
    user: process.env.GMAIL_USER || "trial@lavielabs.com",
    pass: process.env.GMAIL_APP_PASSWORD || ""
  }
});
async function sendViaGmail(opts) {
  if (!process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_APP_PASSWORD not configured");
  }
  const info = await gmailTransporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.htmlBody,
    ...opts.textBody ? { text: opts.textBody } : {},
    ...opts.replyTo ? { replyTo: opts.replyTo } : {},
    ...opts.attachments && opts.attachments.length > 0 ? {
      attachments: opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    } : {}
  });
  return { MessageID: info.messageId };
}

// server/email.ts
var FROM_EMAIL = "trial@lavielabs.com";
var FROM_NAME = "Lavie Labs";
async function sendEmail(options) {
  try {
    await sendViaGmail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      htmlBody: options.htmlBody,
      textBody: options.textBody,
      replyTo: options.replyTo
    });
    return true;
  } catch (err) {
    console.error("[Email] Failed to send:", err);
    return false;
  }
}
function baseTemplate(content) {
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
async function sendCallbackReminder(options) {
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
    subject: `\u{1F4DE} Callback Reminder: ${options.customerName} at ${options.callbackTime}`,
    htmlBody: html,
    tag: "callback-reminder"
  });
}
async function sendStatusChangeNotification(options) {
  const statusColors = {
    "Done Deal": "badge-green",
    "Retained Sub": "badge-green",
    "Working": "badge-blue",
    "Assigned": "badge-blue",
    "Open": "badge-amber",
    "New": "badge-amber",
    "Cancelled Sub": "badge-red",
    "Closed": "badge-red"
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
    subject: `Status Update: ${options.customerName} \u2192 ${options.newStatus}`,
    htmlBody: html,
    tag: "status-change"
  });
}
async function sendImportSummary(options) {
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
    tag: "import-summary"
  });
}
async function sendEmailToContact(options) {
  const fromAddress = `${options.agentName} at Lavie Labs <trial@lavielabs.com>`;
  const replyToAddress = options.replyTo ?? "trial@lavielabs.com";
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
    await sendViaGmail({
      from: fromAddress,
      to: options.contactEmail,
      subject: options.subject,
      htmlBody,
      textBody: `Hi ${options.contactName},

${options.body}

-- ${options.agentName}, Lavie Labs`,
      replyTo: replyToAddress
    });
    return true;
  } catch (err) {
    console.error("[Email] Failed to send agent email:", err);
    return false;
  }
}
async function sendAdminAlert(options) {
  const detailsHtml = options.details ? `<div class="info-box">${Object.entries(options.details).map(([k, v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-value">${v}</span></div>`).join("")}</div>` : "";
  const html = baseTemplate(`
    <p>${options.message}</p>
    ${detailsHtml}
  `);
  return sendEmail({
    to: options.adminEmail,
    subject: options.subject,
    htmlBody: html,
    tag: "admin-alert"
  });
}

// server/activecampaign.ts
var AC_API_VERSION = "/api/3";
function getHeaders() {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Api-Token": ENV.activeCampaignApiKey
  };
}
function apiUrl(path3) {
  return `${ENV.activeCampaignApiUrl}${AC_API_VERSION}${path3}`;
}
async function acFetch(path3, options = {}) {
  if (!ENV.activeCampaignApiKey || !ENV.activeCampaignApiUrl) {
    console.warn("[ActiveCampaign] API credentials not configured");
    return null;
  }
  try {
    const response = await fetch(apiUrl(path3), {
      ...options,
      headers: {
        ...getHeaders(),
        ...options.headers ?? {}
      }
    });
    if (!response.ok) {
      const error = await response.text();
      console.error(`[ActiveCampaign] ${options.method ?? "GET"} ${path3} failed:`, error);
      return null;
    }
    return response.json();
  } catch (err) {
    console.error("[ActiveCampaign] Request failed:", err);
    return null;
  }
}
async function upsertContact(options) {
  if (!options.email && !options.phone) return null;
  const payload = {
    contact: {
      email: options.email ?? `${options.phone}@noemail.lavielabs.com`,
      firstName: options.firstName ?? "",
      lastName: options.lastName ?? "",
      phone: options.phone ?? "",
      fieldValues: options.fieldValues ?? []
    }
  };
  const result = await acFetch("/contact/sync", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result?.contact ?? null;
}
async function getContactByEmail(email) {
  const result = await acFetch(
    `/contacts?email=${encodeURIComponent(email)}`
  );
  return result?.contacts?.[0] ?? null;
}
async function addTagToContact(contactId, tagName) {
  const tagsResult = await acFetch(
    `/tags?search=${encodeURIComponent(tagName)}`
  );
  let tagId = null;
  if (tagsResult?.tags?.length) {
    const existing = tagsResult.tags.find(
      (t2) => t2.tag.toLowerCase() === tagName.toLowerCase()
    );
    tagId = existing?.id ?? null;
  }
  if (!tagId) {
    const newTag = await acFetch("/tags", {
      method: "POST",
      body: JSON.stringify({ tag: { tag: tagName, tagType: "contact", description: "" } })
    });
    tagId = newTag?.tag?.id ?? null;
  }
  if (!tagId) return false;
  const result = await acFetch("/contactTags", {
    method: "POST",
    body: JSON.stringify({
      contactTag: { contact: contactId, tag: tagId }
    })
  });
  return result !== null;
}
async function getLists() {
  const result = await acFetch("/lists?limit=100");
  return result?.lists ?? [];
}
async function getAutomations() {
  const result = await acFetch("/automations?limit=100");
  return result?.automations ?? [];
}
async function syncContactToAC(options) {
  const nameParts = options.name.trim().split(" ");
  const firstName = nameParts[0] ?? options.name;
  const lastName = nameParts.slice(1).join(" ") || "";
  const contact = await upsertContact({
    email: options.email,
    firstName,
    lastName,
    phone: options.phone
  });
  if (!contact) return { contactId: null, success: false };
  const tagsToAdd = [];
  if (options.leadType) tagsToAdd.push(`Lead: ${options.leadType}`);
  if (options.status) tagsToAdd.push(`Status: ${options.status}`);
  if (options.agentName) tagsToAdd.push(`Agent: ${options.agentName}`);
  if (options.source) tagsToAdd.push(`Source: ${options.source}`);
  tagsToAdd.push("Lavie Labs CRM");
  await Promise.all(tagsToAdd.map((tag) => addTagToContact(contact.id, tag)));
  return { contactId: contact.id, success: true };
}
async function updateContactStatus(contactId, oldStatus, newStatus) {
  await addTagToContact(contactId, `Status: ${newStatus}`);
  if (newStatus === "Done Deal") {
    await addTagToContact(contactId, "Converted");
  } else if (newStatus === "Cancelled Sub") {
    await addTagToContact(contactId, "Cancelled");
  } else if (newStatus === "Retained Sub") {
    await addTagToContact(contactId, "Retained");
  }
  return true;
}

// server/routers/contacts.ts
init_cloudtalk();

// server/twilio.ts
function getConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298"
  };
}
function getTwilioAuthHeader() {
  const { accountSid, authToken } = getConfig();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${credentials}`;
}
async function listWhatsAppTemplates() {
  const { accountSid, authToken } = getConfig();
  if (!accountSid || !authToken) {
    console.error("[Twilio] Missing credentials. ACCOUNT_SID:", accountSid ? "set" : "EMPTY", "AUTH_TOKEN:", authToken ? "set" : "EMPTY");
    return [];
  }
  console.log("[Twilio] Fetching templates from Content API...");
  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "GET",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[Twilio] Content API error: ${res.status} ${errText}`);
    throw new Error(`Twilio Content API error: ${res.status}`);
  }
  const data = await res.json();
  console.log(`[Twilio] Found ${(data.contents || []).length} templates`);
  return (data.contents || []).map((item) => ({
    sid: item.sid,
    friendly_name: item.friendly_name,
    language: item.language,
    date_created: item.date_created,
    date_updated: item.date_updated,
    types: item.types
  }));
}
async function fetchTemplateBody(contentSid, variables) {
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}`, {
      method: "GET",
      headers: {
        Authorization: getTwilioAuthHeader(),
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      console.warn(`[Twilio] Could not fetch template body for ${contentSid}: ${res.status}`);
      return `[Template: ${contentSid}]`;
    }
    const data = await res.json();
    const types = data.types || {};
    const body = types["twilio/text"]?.body || types["twilio/quick-reply"]?.body || types["twilio/call-to-action"]?.body || types["twilio/card"]?.body || data.friendly_name || `[Template: ${contentSid}]`;
    if (variables) {
      return body.replace(/\{\{(\d+)\}\}/g, (_match, key) => variables[key] ?? _match);
    }
    return body;
  } catch (err) {
    console.warn(`[Twilio] Error fetching template body for ${contentSid}:`, err);
    return `[Template: ${contentSid}]`;
  }
}
async function sendWhatsAppMessage(opts) {
  const { accountSid, authToken, whatsappFrom } = getConfig();
  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID not configured");
  }
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN not configured");
  }
  const toWhatsApp = opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: whatsappFrom,
    To: toWhatsApp,
    ContentSid: opts.contentSid,
    StatusCallback: "https://lavie-training-hub-production.up.railway.app/api/whatsapp/status"
  });
  if (opts.contentVariables) {
    body.append("ContentVariables", JSON.stringify(opts.contentVariables));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[Twilio] Messages API error: ${res.status} ${errText}`);
    throw new Error(`Twilio Messages API error: ${res.status} \u2014 ${errText}`);
  }
  const data = await res.json();
  return {
    sid: data.sid,
    status: data.status,
    to: data.to,
    from: data.from,
    date_created: data.date_created
  };
}
async function sendWhatsAppFreeText(opts) {
  const { accountSid, authToken, whatsappFrom } = getConfig();
  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID not configured");
  }
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN not configured");
  }
  const toWhatsApp = opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: whatsappFrom,
    To: toWhatsApp,
    Body: opts.body,
    StatusCallback: "https://lavie-training-hub-production.up.railway.app/api/whatsapp/status"
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[Twilio] Free-text Messages API error: ${res.status} ${errText}`);
    throw new Error(`Twilio Messages API error: ${res.status} \u2014 ${errText}`);
  }
  const data = await res.json();
  return {
    sid: data.sid,
    status: data.status,
    to: data.to,
    from: data.from,
    date_created: data.date_created
  };
}

// server/routers/contacts.ts
init_schema();
import { eq as eq4 } from "drizzle-orm";

// server/n8n.ts
async function fireN8nWebhook(path3, body) {
  const baseUrl = ENV.n8nWebhookUrl;
  if (!baseUrl) {
    return;
  }
  const url = `${baseUrl.replace(/\/$/, "")}/${path3}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5e3)
      // 5 second timeout
    });
    if (!response.ok) {
      console.warn(`[n8n] Webhook ${path3} returned ${response.status}`);
    }
  } catch (err) {
    console.warn(`[n8n] Failed to fire webhook "${path3}":`, err.message);
  }
}
function notifyNewContact(payload) {
  fireN8nWebhook("new-contact", {
    event: "contact.created",
    ...payload
  }).catch(() => {
  });
}

// server/zohoBilling.ts
var ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
var ZOHO_CLIENT_ID = "1000.LT0I1HRJ1Z5J4A034U1XSLIBF61G1C";
var ZOHO_CLIENT_SECRET = "0964a666099d5c283d6d15ee7c92c0d3eb824f7072";
var ZOHO_REFRESH_TOKEN = "1000.df6ed9287f217afd6a105e3c369427f0.5658ec18f37b29b7395dd2ff47db81c7";
var ZOHO_API_BASE = "https://www.zohoapis.com/billing/v1";
var ZOHO_ORG_ID = "778500587";
var cachedToken = null;
var tokenExpiresAt = 0;
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN
  });
  const res = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Zoho token refresh failed (${res.status}): ${text2}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1e3;
  return cachedToken;
}
async function zohoGet(path3) {
  const token = await getAccessToken();
  const url = `${ZOHO_API_BASE}${path3}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "X-com-zoho-subscriptions-organizationid": ZOHO_ORG_ID,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Zoho API error (${res.status}) ${path3}: ${text2}`);
  }
  return res.json();
}
async function getZohoBillingDataByEmail(email) {
  const empty = {
    found: false,
    customerId: null,
    phone: null,
    trialStartDate: null,
    planName: null,
    subscriptionStatus: null,
    billingCycleCount: 0,
    monthlyAmount: 0,
    ltvPlan: 0,
    ltvPaid: 0,
    nextBillingDate: null,
    cancellationDate: null,
    shippingAddress: null
  };
  if (!email) return empty;
  try {
    const customerRes = await zohoGet(`/customers?email_contains=${encodeURIComponent(email)}`);
    const customers = customerRes.customers ?? [];
    if (customers.length === 0) return empty;
    const customer = customers[0];
    const customerId = customer.customer_id;
    const phone = customer.phone || customer.mobile || null;
    let shippingAddress = null;
    const addr = customer.shipping_address;
    if (addr) {
      const parts = [addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
      shippingAddress = parts.length > 0 ? parts.join(", ") : null;
    }
    const subsRes = await zohoGet(`/subscriptions?customer_id=${customerId}`);
    const subscriptions = subsRes.subscriptions ?? [];
    const sortedSubs = [...subscriptions].sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(b.created_time ?? 0).getTime() - new Date(a.created_time ?? 0).getTime();
    });
    const primarySub = sortedSubs[0] ?? null;
    const planName = primarySub?.plan?.name ?? primarySub?.product_name ?? null;
    const subscriptionStatus = primarySub?.status ?? null;
    const monthlyAmount = primarySub?.amount ?? 0;
    const nextBillingDate = primarySub?.next_billing_at ?? null;
    const cancellationDate = primarySub?.cancelled_at ?? null;
    let ltvPlan = 0;
    if (primarySub) {
      if (primarySub.sub_total) {
        ltvPlan = primarySub.sub_total;
      } else if (primarySub.amount && primarySub.billing_cycles) {
        ltvPlan = primarySub.amount * primarySub.billing_cycles;
      } else {
        ltvPlan = primarySub.amount ?? 0;
      }
    }
    const billingCycleCount = primarySub?.paid_invoices_count ?? primarySub?.billing_cycles_completed ?? primarySub?.current_term_number ?? 0;
    const invoicesRes = await zohoGet(`/invoices?customer_id=${customerId}`);
    const invoices = invoicesRes.invoices ?? [];
    let ltvPaid = 0;
    for (const inv of invoices) {
      if (inv.status === "paid") {
        ltvPaid += inv.total ?? inv.invoice_total ?? 0;
      }
    }
    let trialStartDate = null;
    const dates = [];
    if (subscriptions.length > 0) {
      for (const sub of subscriptions) {
        if (sub.created_date) dates.push(new Date(sub.created_date));
        if (sub.created_time) dates.push(new Date(sub.created_time));
      }
    }
    if (invoices.length > 0) {
      for (const inv of invoices) {
        if (inv.invoice_date) dates.push(new Date(inv.invoice_date));
        if (inv.date) dates.push(new Date(inv.date));
      }
    }
    const validDates = dates.filter((d) => !isNaN(d.getTime()));
    if (validDates.length > 0) {
      validDates.sort((a, b) => a.getTime() - b.getTime());
      trialStartDate = validDates[0].toISOString().split("T")[0];
    }
    return {
      found: true,
      customerId,
      phone,
      trialStartDate,
      planName,
      subscriptionStatus,
      billingCycleCount,
      monthlyAmount,
      ltvPlan,
      ltvPaid,
      nextBillingDate,
      cancellationDate,
      shippingAddress
    };
  } catch (err) {
    console.error(`[ZohoBilling] Error fetching data for ${email}:`, err);
    return empty;
  }
}

// server/routers/contacts.ts
var STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
var stripe = new Stripe(STRIPE_SECRET_KEY);
var ADMIN_EMAIL = "gabriel@lavielabs.com";
var contactsRouter = router({
  // ─── Create a single contact ──────────────────────────────────────────────
  create: protectedProcedure.input(
    z3.object({
      name: z3.string().min(1).max(256),
      phone: z3.string().max(32).optional(),
      email: z3.string().max(320).optional(),
      leadType: z3.string().max(64).optional(),
      status: z3.enum(CONTACT_STATUSES).default("new"),
      agentName: z3.string().max(256).optional(),
      agentEmail: z3.string().max(320).optional(),
      source: z3.string().max(128).optional(),
      leadDate: z3.string().optional(),
      notes: z3.string().max(2e3).optional(),
      address: z3.string().optional(),
      department: z3.enum(["opening", "retention"]).default("opening")
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { contacts: contactsTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const normalisedPhone = normalisePhone(input.phone) || void 0;
    if (input.email?.trim()) {
      const [existingByEmail] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq4(contactsTable.email, input.email.trim())).limit(1);
      if (existingByEmail) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "A contact with this email already exists"
        });
      }
    }
    if (normalisedPhone) {
      const [existingByPhone] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq4(contactsTable.phone, normalisedPhone)).limit(1);
      if (existingByPhone) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "A contact with this phone number already exists"
        });
      }
    }
    const leadDate = input.leadDate ? new Date(input.leadDate) : void 0;
    const [result] = await db.insert(contactsTable).values({
      name: input.name.trim(),
      phone: normalisedPhone,
      email: input.email?.trim() || void 0,
      leadType: input.leadType?.trim() || void 0,
      status: input.status,
      agentName: input.agentName?.trim() || void 0,
      agentEmail: input.agentEmail?.trim() || "trial@lavielabs.com",
      source: input.source?.trim() || void 0,
      leadDate,
      importedNotes: input.notes?.trim() || void 0,
      address: input.address?.trim() || void 0,
      department: input.department
    });
    const newId = result.insertId;
    notifyNewContact({
      id: newId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      leadType: input.leadType?.trim() || null,
      status: input.status,
      agentName: input.agentName?.trim() || null,
      agentEmail: input.agentEmail?.trim() || null,
      source: input.source?.trim() || null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    syncContactToCloudTalk({
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null
    }).then(async (cloudtalkId) => {
      if (cloudtalkId) {
        const db2 = await getDb();
        const { contacts: ct } = await Promise.resolve().then(() => (init_schema(), schema_exports));
        if (db2) await db2.update(ct).set({ cloudtalkId }).where(eq4(ct.id, newId));
      }
    }).catch(() => {
    });
    return { id: newId };
  }),
  // ─── Count contacts matching filters (for pagination) ─────────────────────────────────────────────────
  count: protectedProcedure.input(
    z3.object({
      search: z3.string().optional(),
      leadType: z3.string().optional(),
      status: z3.string().optional(),
      agentName: z3.string().optional(),
      agentEmail: z3.string().optional(),
      department: z3.enum(["opening", "retention"]).optional(),
      source: z3.string().optional(),
      leadDateFrom: z3.string().optional(),
      leadDateTo: z3.string().optional(),
      statusDateFrom: z3.string().optional(),
      statusDateTo: z3.string().optional()
    })
  ).query(async ({ ctx, input }) => {
    const agentEmail = ctx.user.role !== "admin" ? ctx.user.email ?? void 0 : input.agentEmail ?? void 0;
    return countContacts({
      ...input,
      agentEmail
    });
  }),
  // ─── List contacts with search/filter ─────────────────────────────────────────────────
  list: protectedProcedure.input(
    z3.object({
      search: z3.string().optional(),
      leadType: z3.string().optional(),
      status: z3.string().optional(),
      agentName: z3.string().optional(),
      agentEmail: z3.string().optional(),
      department: z3.enum(["opening", "retention"]).optional(),
      source: z3.string().optional(),
      leadDateFrom: z3.string().optional(),
      leadDateTo: z3.string().optional(),
      statusDateFrom: z3.string().optional(),
      statusDateTo: z3.string().optional(),
      limit: z3.number().min(1).max(5e3).default(5e3),
      offset: z3.number().min(0).default(0)
    })
  ).query(async ({ ctx, input }) => {
    const agentEmail = ctx.user.role !== "admin" ? ctx.user.email ?? void 0 : input.agentEmail ?? void 0;
    return listContacts({
      ...input,
      agentEmail
    });
  }),
  // ─── Get single contact with call notes ──────────────────────────────────────
  get: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ input }) => {
    return getContact(input.id);
  }),
  // ─── Update contact status / agent / lead type / callback ─────────────────────────────────────────────────
  update: protectedProcedure.input(
    z3.object({
      id: z3.number(),
      name: z3.string().optional(),
      phone: z3.string().optional(),
      email: z3.string().optional(),
      status: z3.enum(CONTACT_STATUSES).optional(),
      agentName: z3.string().optional(),
      leadType: z3.string().optional(),
      agentEmail: z3.string().optional(),
      callbackAt: z3.date().nullable().optional(),
      importedNotes: z3.string().optional(),
      skinType: z3.string().optional(),
      concern: z3.string().optional(),
      routine: z3.string().optional(),
      trialKit: z3.string().optional(),
      callNotes: z3.string().optional(),
      address: z3.string().optional(),
      brands: z3.string().optional(),
      // For email notifications
      notifyEmail: z3.string().optional(),
      previousStatus: z3.string().optional()
    })
  ).mutation(async ({ input, ctx }) => {
    const { id, notifyEmail, previousStatus, ...updates } = input;
    const result = await updateContact(id, updates);
    const contact = await getContact(id);
    if (contact && updates.status && previousStatus && updates.status !== previousStatus) {
      if (contact.email) {
        const acContact = await getContactByEmail(contact.email).catch(() => null);
        if (acContact) {
          await updateContactStatus(acContact.id, previousStatus, updates.status).catch(() => {
          });
        }
      }
    }
    if (updates.status && previousStatus && updates.status !== previousStatus && notifyEmail && contact) {
      await sendStatusChangeNotification({
        agentEmail: notifyEmail,
        agentName: ctx.user.name ?? "Agent",
        customerName: contact.name,
        customerPhone: contact.phone ?? "N/A",
        oldStatus: previousStatus,
        newStatus: updates.status,
        changedBy: ctx.user.name ?? "Admin"
      }).catch(() => {
      });
    }
    if (updates.status === "no_answer" && previousStatus && previousStatus !== "no_answer" && contact && contact.phone) {
      const NA_TEMPLATE_SID = "HXefee4cfd043a6713a2aafe658e657422";
      const customerFirstName = (contact.name || "there").split(" ")[0];
      const e164Phone = normalisePhone(contact.phone);
      if (e164Phone) {
        try {
          const waResult = await sendWhatsAppMessage({
            to: e164Phone,
            contentSid: NA_TEMPLATE_SID,
            contentVariables: { "1": customerFirstName }
          });
          console.log(`[WhatsApp-NA] Auto-sent to contact #${id} (${e164Phone}): ${waResult.sid}`);
          const db = await getDb();
          if (db) {
            const resolvedBody = await fetchTemplateBody(NA_TEMPLATE_SID, { "1": customerFirstName }).catch(() => "[Template: op_no_answer_cold_data]");
            const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");
            await db.insert(whatsappMessages).values({
              contactId: id,
              direction: "outbound",
              body: resolvedBody,
              templateName: "op_no_answer_cold_data",
              sentByUserId: ctx.user.id,
              fromNumber,
              toNumber: e164Phone,
              twilioMessageSid: waResult.sid,
              status: "sent",
              isRead: true
            });
          }
        } catch (waErr) {
          console.error(`[WhatsApp-NA] Failed to auto-send to contact #${id}:`, waErr);
        }
      }
    }
    if (updates.callbackAt && notifyEmail && contact) {
      const callbackTime = new Date(updates.callbackAt).toLocaleString("en-GB", {
        dateStyle: "full",
        timeStyle: "short"
      });
      await sendCallbackReminder({
        agentEmail: notifyEmail,
        agentName: ctx.user.name ?? "Agent",
        customerName: contact.name,
        customerPhone: contact.phone ?? "N/A",
        callbackTime
      }).catch(() => {
      });
    }
    return result;
  }),
  // ─── Add a call note ──────────────────────────────────────────────────────
  addNote: protectedProcedure.input(
    z3.object({
      contactId: z3.number(),
      agentName: z3.string().optional(),
      note: z3.string().min(1),
      statusAtTime: z3.string().optional()
    })
  ).mutation(async ({ input }) => {
    await addCallNote(input);
    return { success: true };
  }),
  // ─── Bulk CSV import ──────────────────────────────────────────────────────
  import: protectedProcedure.input(
    z3.object({
      rows: z3.array(
        z3.object({
          name: z3.string(),
          email: z3.string().optional(),
          phone: z3.string().optional(),
          leadType: z3.string().optional(),
          status: z3.string().optional(),
          agentName: z3.string().optional(),
          agentEmail: z3.string().optional(),
          notes: z3.string().optional(),
          source: z3.string().optional(),
          leadDate: z3.string().optional(),
          address: z3.string().optional()
        })
      ),
      department: z3.enum(["opening", "retention"]).default("opening"),
      source: z3.string().optional()
    })
  ).mutation(async ({ input, ctx }) => {
    const rows = input.source ? input.rows.map((r) => ({ ...r, source: input.source })) : input.rows;
    const result = await importContacts(rows, input.department);
    Promise.all(
      rows.map(
        (row) => syncContactToCloudTalk({
          name: row.name,
          email: row.email || null,
          phone: row.phone || null
        }).catch(() => {
        })
      )
    ).catch(() => {
    });
    Promise.all(
      rows.map(
        (row) => syncContactToAC({
          name: row.name,
          email: row.email,
          phone: row.phone,
          leadType: row.leadType,
          status: row.status,
          agentName: row.agentName,
          source: row.source
        }).catch(() => {
        })
      )
    ).catch(() => {
    });
    await sendImportSummary({
      adminEmail: ADMIN_EMAIL,
      importedBy: ctx.user.name ?? "Admin",
      totalImported: result.imported,
      totalUpdated: 0,
      totalSkipped: result.skipped
    }).catch(() => {
    });
    return result;
  }),
  // ─── Return metadata (lead types, statuses) ───────────────────────────────
  meta: protectedProcedure.query(async () => {
    const sources = await getDistinctSources();
    return {
      leadTypes: LEAD_TYPES,
      statuses: CONTACT_STATUSES,
      sources
    };
  }),
  // ─── ActiveCampaign: get lists ────────────────────────────────────────────
  acLists: protectedProcedure.query(async () => {
    return getLists();
  }),
  // ─── ActiveCampaign: get automations ─────────────────────────────────────
  acAutomations: protectedProcedure.query(async () => {
    return getAutomations();
  }),
  // ─── Send test email (admin only) ─────────────────────────────────────────
  sendTestEmail: adminProcedure.input(z3.object({ to: z3.string().email() })).mutation(async ({ input, ctx }) => {
    const ok = await sendAdminAlert({
      adminEmail: input.to,
      subject: "\u2705 Lavie Labs CRM \u2014 Email Integration Working",
      message: `Hello! This is a test email from the Lavie Labs CRM system, sent by ${ctx.user.name ?? "Admin"}.`,
      details: {
        "Sent By": ctx.user.name ?? "Admin",
        "System": "Lavie Labs Training Hub",
        "Email Provider": "Postmark",
        "Status": "Connected \u2705"
      }
    });
    return { success: ok };
  }),
  // ─── Send email from agent to contact ──────────────────────────────────────
  sendEmail: adminProcedure.input(
    z3.object({
      contactId: z3.number(),
      subject: z3.string().min(1, "Subject is required"),
      body: z3.string().min(1, "Message body is required")
    })
  ).mutation(async ({ input, ctx }) => {
    const contact = await getContact(input.contactId);
    if (!contact) return { success: false, error: "Contact not found" };
    if (!contact.email) return { success: false, error: "Contact has no email address" };
    const agentName = ctx.user.name ?? "Lavie Labs";
    const agentSlug = agentName.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "");
    const ok = await sendEmailToContact({
      agentName,
      agentSlug,
      contactEmail: contact.email,
      contactName: contact.name,
      subject: input.subject,
      body: input.body
    });
    if (ok) {
      await addCallNote({
        contactId: input.contactId,
        userId: ctx.user.id,
        agentName,
        note: `\u{1F4E7} Email sent \u2014 Subject: "${input.subject}"`,
        statusAtTime: contact.status ?? void 0
      });
    }
    return { success: ok };
  }),
  // ─── Sync a single contact to ActiveCampaign manually ────────────────────
  syncToAC: adminProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
    const contact = await getContact(input.id);
    if (!contact) return { success: false, error: "Contact not found" };
    const result = await syncContactToAC({
      name: contact.name,
      email: contact.email ?? void 0,
      phone: contact.phone ?? void 0,
      leadType: contact.leadType ?? void 0,
      status: contact.status ?? void 0,
      agentName: contact.agentName ?? void 0,
      source: contact.source ?? void 0
    });
    return { success: result.success, contactId: result.contactId };
  }),
  // ─── Click-to-Call via CloudTalk API ─────────────────────────────────────
  // Initiates an outbound call: CloudTalk calls the agent first, then the customer.
  clickToCall: protectedProcedure.input(z3.object({ contactId: z3.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [freshUser] = await db.select().from(users).where(eq4(users.id, ctx.user.id)).limit(1);
    const agentId = freshUser?.cloudtalkAgentId;
    if (!agentId) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: "NO_CLOUDTALK_AGENT_ID"
      });
    }
    const contact = await getContact(input.contactId);
    if (!contact?.phone) {
      return { success: false, message: "Contact has no phone number" };
    }
    const rawPhone = contact.phone.replace(/[\s\-().]/g, "");
    const phone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
    return clickToCall(agentId, phone);
  }),
  // ─── Get CloudTalk agents list (for profile setup) ───────────────────────
  cloudtalkAgents: protectedProcedure.query(async () => {
    return getCloudTalkAgents();
  }),
  // ─── Update current user's CloudTalk Agent ID ─────────────────────────────
  setCloudtalkAgentId: protectedProcedure.input(z3.object({ cloudtalkAgentId: z3.string().max(32) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(users).set({ cloudtalkAgentId: input.cloudtalkAgentId || null }).where(eq4(users.id, ctx.user.id));
    return { success: true };
  }),
  // ─── Get current user's profile (including cloudtalkAgentId) ─────────────
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return ctx.user;
    const [user] = await db.select().from(users).where(eq4(users.id, ctx.user.id)).limit(1);
    return user ?? ctx.user;
  }),
  // ─── CloudTalk: Get call history (optionally filtered by phone) ───────────
  callHistory: protectedProcedure.input(
    z3.object({
      phone: z3.string().optional(),
      dateFrom: z3.string().optional(),
      dateTo: z3.string().optional(),
      limit: z3.number().min(1).max(100).default(20),
      page: z3.number().min(1).default(1),
      status: z3.enum(["answered", "missed"]).optional()
    })
  ).query(async ({ input }) => {
    return getCallHistory({
      phone: input.phone,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit,
      page: input.page,
      status: input.status
    });
  }),
  // ─── CloudTalk: Stream a call recording (proxied to avoid CORS) ──────────
  streamRecording: adminProcedure.input(z3.object({ callId: z3.number() })).mutation(async ({ input }) => {
    const buffer = await fetchRecording(input.callId);
    if (!buffer) return { success: false, data: null, mimeType: null };
    return { success: true, data: buffer.toString("base64"), mimeType: "audio/wav" };
  }),
  // ─── CloudTalk: Global call log (all calls, not per contact) ─────────────
  callLog: protectedProcedure.input(
    z3.object({
      dateFrom: z3.string().optional(),
      dateTo: z3.string().optional(),
      limit: z3.number().min(1).max(100).default(50),
      page: z3.number().min(1).default(1),
      status: z3.enum(["answered", "missed"]).optional(),
      agentId: z3.number().optional()
    })
  ).query(async ({ input }) => {
    const result = await getCallHistory({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit,
      page: input.page,
      status: input.status
    });
    const db = await getDb();
    const { contacts: contacts2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const allContacts = db ? await db.select({ id: contacts2.id, phone: contacts2.phone, name: contacts2.name }).from(contacts2) : [];
    const phoneMap = new Map(
      allContacts.map((c) => [c.phone?.replace(/\s/g, ""), { id: c.id, name: c.name }])
    );
    const enrichedCalls = result.calls.map((call) => {
      const ctPhone = (call.contact?.number ?? "").replace(/\s/g, "");
      const internalPhone = (call.internal_number?.number ?? "").replace(/\s/g, "");
      const matched = phoneMap.get(ctPhone) ?? phoneMap.get(internalPhone) ?? null;
      return { ...call, matchedContact: matched };
    });
    return { ...result, calls: enrichedCalls };
  }),
  // ─── Lookup contact by phone number (for CloudTalk live call matching) ───────
  lookupByPhone: protectedProcedure.input(z3.object({ phone: z3.string() })).query(async ({ input }) => {
    return getContactByPhone(input.phone);
  }),
  // ─── Delete a contact ─────────────────────────────────────────────────────────────────────────────────────
  delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
    await deleteContact(input.id);
    return { success: true };
  }),
  // ─── Bulk delete contacts ─────────────────────────────────────────────────────────────────────────────────────
  bulkDelete: protectedProcedure.input(z3.object({ ids: z3.array(z3.number()).min(1) })).mutation(async ({ input }) => {
    return bulkDeleteContacts(input.ids);
  }),
  // ─── Bulk assign contacts to an agent ──────────────────────────────────────────────
  bulkAssign: protectedProcedure.input(
    z3.object({
      ids: z3.array(z3.number()).min(1),
      agentName: z3.string().min(1),
      agentEmail: z3.string().email()
    })
  ).mutation(async ({ input }) => {
    return bulkAssignContacts(input.ids, input.agentName, input.agentEmail);
  }),
  // ─── Get overdue callbacks (callbackAt <= now) ────────────────────────────
  callbacksDue: protectedProcedure.query(async ({ ctx }) => {
    const agentEmail = ctx.user.email ?? void 0;
    return getCallbacksDue(agentEmail);
  }),
  // ─── Get ALL scheduled callbacks (future + overdue) for the current agent ──
  allCallbacks: protectedProcedure.query(async ({ ctx }) => {
    const agentEmail = ctx.user.email ?? void 0;
    return getAllCallbacks(agentEmail);
  }),
  // ─── Stripe: Create PaymentIntent for £4.95 ──────────────────────────────
  createPaymentIntent: protectedProcedure.input(
    z3.object({
      contactId: z3.number(),
      name: z3.string().min(1),
      email: z3.string().email()
    })
  ).mutation(async ({ input }) => {
    const { contactId, name, email } = input;
    const customer = await stripe.customers.create({
      name,
      email,
      metadata: { contactId: String(contactId) }
    });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 495,
      currency: "gbp",
      customer: customer.id,
      metadata: { contactId: String(contactId) },
      payment_method_types: ["card"]
    });
    return {
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id
    };
  }),
  // ─── Stripe: Confirm payment success — save customer ID & mark sold ───────
  confirmPayment: protectedProcedure.input(
    z3.object({
      contactId: z3.number(),
      stripeCustomerId: z3.string().min(1)
    })
  ).mutation(async ({ input }) => {
    const { contactId, stripeCustomerId } = input;
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { contacts: contactsTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    await db.update(contactsTable).set({
      stripeCustomerId,
      status: "done_deal"
    }).where(eq4(contactsTable.id, contactId));
    return { success: true };
  }),
  // ─── Send Payment Email via Gmail SMTP (replaced Postmark 2024-05) ─────────
  sendPaymentEmail: protectedProcedure.input(
    z3.object({
      contactId: z3.number(),
      name: z3.string().min(1),
      email: z3.string().email()
    })
  ).mutation(async ({ input }) => {
    const { contactId, name, email } = input;
    const PAYMENT_LINK = "https://buy.stripe.com/cNi3cvgcR4879BDgSSb3q0r";
    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 16px;color:#333;">Your Secure Payment Link</h2>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">Hi ${name},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333;">Please use the secure link below to complete your payment:</p>
              <p style="text-align:center;margin:0 0 24px;">
                <a href="${PAYMENT_LINK}" style="display:inline-block;padding:14px 32px;font-size:15px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;background-color:#0F1923;">Complete Payment</a>
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;">If you have any questions, please don't hesitate to reply to this email or contact us at <a href="mailto:support@lavielabs.com" style="color:#2b5cab;">support@lavielabs.com</a>.</p>
              <p style="margin:0;font-size:15px;color:#333;">Warm regards,<br/><strong>Lavie Labs</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    try {
      await sendViaGmail({
        from: "Lavie Labs <trial@lavielabs.com>",
        to: email,
        subject: "Your Secure Payment Link from Lavi\xE9 Labs",
        htmlBody
      });
    } catch (err) {
      throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send email: " + err.message });
    }
    return { success: true };
  }),
  // ─── Check Payment Status via Stripe (by contactId metadata first, then email fallback) ─────────────────────────
  checkPaymentStatus: protectedProcedure.input(
    z3.object({
      email: z3.string().email(),
      contactId: z3.number().optional()
    })
  ).query(async ({ input }) => {
    const { email, contactId } = input;
    const sessions = await stripe.checkout.sessions.list({
      limit: 50
    });
    if (contactId) {
      const paidByContactId = sessions.data.find(
        (s) => s.payment_status === "paid" && s.metadata?.contactId === String(contactId)
      );
      if (paidByContactId) {
        return {
          paid: true,
          amount: paidByContactId.amount_total ? (paidByContactId.amount_total / 100).toFixed(2) : "4.95",
          currency: paidByContactId.currency || "gbp",
          paidAt: paidByContactId.created ? new Date(paidByContactId.created * 1e3).toISOString() : null
        };
      }
    }
    const paidByEmail = sessions.data.find(
      (s) => s.payment_status === "paid" && s.customer_details?.email === email
    );
    if (paidByEmail) {
      return {
        paid: true,
        amount: paidByEmail.amount_total ? (paidByEmail.amount_total / 100).toFixed(2) : "4.95",
        currency: paidByEmail.currency || "gbp",
        paidAt: paidByEmail.created ? new Date(paidByEmail.created * 1e3).toISOString() : null
      };
    }
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 30
    });
    if (contactId) {
      const paidIntentById = paymentIntents.data.find(
        (pi) => pi.status === "succeeded" && pi.metadata?.contactId === String(contactId)
      );
      if (paidIntentById) {
        return {
          paid: true,
          amount: (paidIntentById.amount / 100).toFixed(2),
          currency: paidIntentById.currency || "gbp",
          paidAt: paidIntentById.created ? new Date(paidIntentById.created * 1e3).toISOString() : null
        };
      }
    }
    const paidIntent = paymentIntents.data.find(
      (pi) => pi.status === "succeeded" && pi.receipt_email === email
    );
    if (paidIntent) {
      return {
        paid: true,
        amount: (paidIntent.amount / 100).toFixed(2),
        currency: paidIntent.currency || "gbp",
        paidAt: paidIntent.created ? new Date(paidIntent.created * 1e3).toISOString() : null
      };
    }
    return { paid: false, amount: null, currency: null, paidAt: null };
  }),
  // ─── Get retention data from lead_assignments linked to a contact ───────────
  getRetentionData: protectedProcedure.input(z3.object({ contactId: z3.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { leads: [] };
    const rows = await db.select().from(leadAssignments).where(eq4(leadAssignments.contactId, input.contactId));
    const leads = rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      customerName: row.customerName ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      totalSpend: row.totalSpend ?? 0,
      cyclesCompleted: row.cyclesCompleted ?? 0,
      planName: row.planName ?? null,
      leadType: row.leadType ?? null,
      leadCategory: row.leadCategory ?? null,
      managerNote: row.managerNote ?? null,
      agentNote: row.agentNote ?? null,
      billingStatus: row.billingStatus ?? null,
      assignedAgent: row.assignedAgent ?? null,
      workStatus: row.workStatus ?? null,
      eventDate: row.eventDate ?? null,
      cancelledAt: row.cancelledAt ?? null,
      monthlyAmount: row.monthlyAmount ?? 0,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
    }));
    return { leads };
  }),
  // ─── Get live Zoho Billing data for a contact by email ──────────────────
  getZohoBillingData: protectedProcedure.input(z3.object({ email: z3.string() })).query(async ({ input }) => {
    if (!input.email) return { found: false };
    return getZohoBillingDataByEmail(input.email);
  })
});

// server/routers/phoneNumbers.ts
import { z as z4 } from "zod";
init_schema();
import { eq as eq5, desc as desc2 } from "drizzle-orm";
var CLOUDTALK_API_BASE = "https://my.cloudtalk.io/api";
function getCloudTalkHeaders() {
  const keyId = process.env.CLOUDTALK_API_KEY_ID ?? "";
  const keySecret = process.env.CLOUDTALK_API_KEY_SECRET ?? "";
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json"
  };
}
async function deleteCloudTalkNumber(cloudtalkNumberId) {
  try {
    const res = await fetch(
      `${CLOUDTALK_API_BASE}/numbers/delete/${cloudtalkNumberId}.json`,
      {
        method: "DELETE",
        headers: getCloudTalkHeaders(),
        signal: AbortSignal.timeout(15e3)
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[PhonePool] Failed to delete CloudTalk number:", err);
    return false;
  }
}
var phoneNumbersRouter = router({
  /**
   * Per-agent summary: how many numbers each agent holds + days active per number.
   * Only returns "active" numbers (assigned to someone).
   */
  agentSummary: adminProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.select().from(phoneNumbers).where(eq5(phoneNumbers.status, "active")).orderBy(phoneNumbers.assignedAgentName);
    const now = Date.now();
    const byAgent = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const name = row.assignedAgentName ?? "Unknown";
      if (!byAgent.has(name)) byAgent.set(name, { agentName: name, numbers: [] });
      const daysActive = row.assignedAt ? Math.floor((now - new Date(row.assignedAt).getTime()) / 864e5) : null;
      byAgent.get(name).numbers.push({
        id: row.id,
        number: row.number,
        assignedAt: row.assignedAt,
        daysActive,
        cloudtalkNumberId: row.cloudtalkNumberId ?? null,
        notes: row.notes ?? null
      });
    }
    return Array.from(byAgent.values()).sort(
      (a, b) => a.agentName.localeCompare(b.agentName)
    );
  }),
  /** List all phone numbers — grouped by status */
  list: adminProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.select().from(phoneNumbers).orderBy(desc2(phoneNumbers.createdAt));
    return rows;
  }),
  /** Add a number to the pool (or update its details) */
  add: adminProcedure.input(
    z4.object({
      number: z4.string().min(7).max(32),
      cloudtalkNumberId: z4.string().optional(),
      notes: z4.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    await db.insert(phoneNumbers).values({
      number: input.number,
      status: "pool",
      cloudtalkNumberId: input.cloudtalkNumberId ?? null,
      notes: input.notes ?? null,
      historyJson: "[]"
    });
    return { success: true };
  }),
  /** Assign a pool number to an agent */
  assign: adminProcedure.input(
    z4.object({
      id: z4.number(),
      assignedUserId: z4.number(),
      assignedAgentName: z4.string()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    const [existing] = await db.select().from(phoneNumbers).where(eq5(phoneNumbers.id, input.id));
    if (!existing) throw new Error("Number not found");
    if (existing.status === "spam") throw new Error("Cannot assign a spam number");
    const history = JSON.parse(existing.historyJson ?? "[]");
    history.push({
      agentName: input.assignedAgentName,
      assignedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await db.update(phoneNumbers).set({
      status: "active",
      assignedUserId: input.assignedUserId,
      assignedAgentName: input.assignedAgentName,
      assignedAt: /* @__PURE__ */ new Date(),
      historyJson: JSON.stringify(history)
    }).where(eq5(phoneNumbers.id, input.id));
    return { success: true };
  }),
  /** Release a number back to the pool */
  release: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    const [existing] = await db.select().from(phoneNumbers).where(eq5(phoneNumbers.id, input.id));
    if (!existing) throw new Error("Number not found");
    const history = JSON.parse(existing.historyJson ?? "[]");
    if (history.length > 0 && !history[history.length - 1].releasedAt) {
      history[history.length - 1].releasedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    await db.update(phoneNumbers).set({
      status: "pool",
      assignedUserId: null,
      assignedAgentName: null,
      assignedAt: null,
      historyJson: JSON.stringify(history)
    }).where(eq5(phoneNumbers.id, input.id));
    return { success: true };
  }),
  /**
   * Mark a number as spam.
   * CRITICAL: This MUST also call DELETE /numbers/delete/{cloudtalkNumberId}.json
   * to stop CloudTalk billing immediately.
   */
  markAsSpam: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    const [existing] = await db.select().from(phoneNumbers).where(eq5(phoneNumbers.id, input.id));
    if (!existing) throw new Error("Number not found");
    let cloudtalkDeleted = false;
    if (existing.cloudtalkNumberId) {
      cloudtalkDeleted = await deleteCloudTalkNumber(existing.cloudtalkNumberId);
    }
    const history = JSON.parse(existing.historyJson ?? "[]");
    if (history.length > 0 && !history[history.length - 1].releasedAt) {
      history[history.length - 1].releasedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    await db.update(phoneNumbers).set({
      status: "spam",
      assignedUserId: null,
      assignedAgentName: null,
      assignedAt: null,
      spamMarkedAt: /* @__PURE__ */ new Date(),
      historyJson: JSON.stringify(history)
    }).where(eq5(phoneNumbers.id, input.id));
    return { success: true, cloudtalkDeleted };
  }),
  /** Move a spam number back to pool (e.g. if marked spam by mistake) */
  unspam: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    await db.update(phoneNumbers).set({
      status: "pool",
      spamMarkedAt: null
    }).where(eq5(phoneNumbers.id, input.id));
    return { success: true };
  }),
  /** Update notes or cloudtalkNumberId for a number */
  update: adminProcedure.input(
    z4.object({
      id: z4.number(),
      cloudtalkNumberId: z4.string().optional(),
      notes: z4.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    await db.update(phoneNumbers).set({
      cloudtalkNumberId: input.cloudtalkNumberId,
      notes: input.notes
    }).where(eq5(phoneNumbers.id, input.id));
    return { success: true };
  }),
  /** Delete a number from the pool entirely (only allowed for pool/spam numbers) */
  delete: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    const [existing] = await db.select().from(phoneNumbers).where(eq5(phoneNumbers.id, input.id));
    if (!existing) throw new Error("Number not found");
    if (existing.status === "active") {
      throw new Error("Cannot delete an active number \u2014 release it first");
    }
    await db.delete(phoneNumbers).where(eq5(phoneNumbers.id, input.id));
    return { success: true };
  })
});

// server/routers/emailTemplates.ts
import { z as z5 } from "zod";
init_schema();
import { eq as eq6 } from "drizzle-orm";
import { TRPCError as TRPCError4 } from "@trpc/server";
function wrapEmailHtml(opts) {
  const headerSection = opts.headerImageUrl ? `<img src="${opts.headerImageUrl}" alt="Lavie Labs" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto 24px;border-radius:8px;" />` : "";
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(opts.bodyHtml);
  const formattedBody = hasHtmlTags ? opts.bodyHtml : opts.bodyHtml.replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          ${opts.headerImageUrl ? `<tr><td style="padding:0;"><img src="${opts.headerImageUrl}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>` : ""}
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555555;">Should you need anything please don't hesitate to respond to this email. Alternatively email <a href="mailto:support@lavielabs.com" style="color:#2b5cab;text-decoration:underline;">support@lavielabs.com</a></p>
              <p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${opts.agentName}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e8e8e8;text-align:center;">
              <a href="mailto:support@lavielabs.com" style="display:inline-block;padding:10px 28px;font-size:13px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:20px;font-weight:bold;background-color:#6f9fea;">Contact Us</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function fillPlaceholders(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`\${${key}}`, value ?? "");
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}
var emailTemplatesRouter = router({
  /** List all templates (name, subject, description — no full HTML for perf) */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db.select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      subject: emailTemplates.subject,
      description: emailTemplates.description,
      headerImageUrl: emailTemplates.headerImageUrl,
      visibility: emailTemplates.visibility,
      createdAt: emailTemplates.createdAt,
      updatedAt: emailTemplates.updatedAt
    }).from(emailTemplates).orderBy(emailTemplates.name);
    if (ctx.user.role === "admin") return rows;
    return rows.filter((t2) => {
      if (!t2.visibility) return true;
      try {
        const vis = JSON.parse(t2.visibility);
        if (vis.type === "everyone") return true;
        if (vis.type === "team") return ctx.user.team === vis.value;
        if (vis.type === "agents") return vis.ids?.includes(ctx.user.id) ?? false;
        return true;
      } catch {
        return true;
      }
    });
  }),
  /** Get a single template including full HTML (for preview/edit) */
  getById: protectedProcedure.input(z5.object({ id: z5.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const [row] = await db.select().from(emailTemplates).where(eq6(emailTemplates.id, input.id));
    if (!row) throw new TRPCError4({ code: "NOT_FOUND", message: "Template not found" });
    return row;
  }),
  /** Create a new template (admin only) */
  create: adminProcedure.input(
    z5.object({
      name: z5.string().min(1),
      subject: z5.string().min(1),
      htmlBody: z5.string().min(1),
      description: z5.string().optional(),
      headerImageUrl: z5.string().url().optional().or(z5.literal("")),
      visibility: z5.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    await db.insert(emailTemplates).values({
      name: input.name,
      subject: input.subject,
      htmlBody: input.htmlBody,
      description: input.description ?? null,
      headerImageUrl: input.headerImageUrl || null,
      visibility: input.visibility || null
    });
    return { success: true };
  }),
  /** Update an existing template (admin only) */
  update: adminProcedure.input(
    z5.object({
      id: z5.number(),
      name: z5.string().min(1).optional(),
      subject: z5.string().min(1).optional(),
      htmlBody: z5.string().optional(),
      description: z5.string().optional(),
      headerImageUrl: z5.string().url().optional().or(z5.literal("")),
      visibility: z5.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const { id, headerImageUrl, visibility, htmlBody, ...rest } = input;
    const fields = { ...rest };
    if (htmlBody) {
      fields.htmlBody = htmlBody;
    }
    if (headerImageUrl !== void 0) {
      fields.headerImageUrl = headerImageUrl || null;
    }
    if (visibility !== void 0) {
      fields.visibility = visibility || null;
    }
    await db.update(emailTemplates).set(fields).where(eq6(emailTemplates.id, id));
    return { success: true };
  }),
  /** Delete a template (admin only) */
  delete: adminProcedure.input(z5.object({ id: z5.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    await db.delete(emailTemplates).where(eq6(emailTemplates.id, input.id));
    return { success: true };
  }),
  /**
   * Send an email to a contact using a template.
   * Placeholders are auto-filled from contact + agent data.
   */
  send: protectedProcedure.input(
    z5.object({
      templateId: z5.number(),
      contactId: z5.number()
    })
  ).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const [template] = await db.select().from(emailTemplates).where(eq6(emailTemplates.id, input.templateId));
    if (!template) throw new TRPCError4({ code: "NOT_FOUND", message: "Template not found" });
    const [contact] = await db.select().from(contacts).where(eq6(contacts.id, input.contactId));
    if (!contact) throw new TRPCError4({ code: "NOT_FOUND", message: "Contact not found" });
    if (!contact.email) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "Contact has no email address" });
    }
    const agentName = ctx.user.name ?? "Lavi\xE9 Labs";
    const agentEmail = ctx.user.email ?? "support@lavielabs.com";
    const firstName = (contact.name ?? "").split(" ")[0] || contact.name || "";
    const ownerName = contact.agentName ?? agentName;
    const vars = {
      "Customers.First Name": firstName,
      "Customers.Customers Owner": ownerName,
      agentName,
      agentEmail,
      // common aliases
      name: firstName,
      firstName,
      fullName: contact.name || "",
      agentOwner: ownerName
    };
    const resolvedSubject = fillPlaceholders(template.subject, vars);
    const resolvedBodyHtml = fillPlaceholders(template.htmlBody, vars);
    const isFullHtml = /<html[\s>]/i.test(resolvedBodyHtml);
    const resolvedHtml = isFullHtml ? resolvedBodyHtml : wrapEmailHtml({
      bodyHtml: resolvedBodyHtml,
      headerImageUrl: template.headerImageUrl,
      agentName,
      contactName: contact.name || firstName
    });
    const fromAddress = `${agentName} <trial@lavielabs.com>`;
    let postmarkMessageId = null;
    try {
      const result = await sendViaGmail({
        from: fromAddress,
        to: contact.email,
        subject: resolvedSubject,
        htmlBody: resolvedHtml,
        replyTo: agentEmail
      });
      postmarkMessageId = result.MessageID ?? null;
    } catch (err) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to send email: ${err.message}`
      });
    }
    await db.insert(emailLogs).values({
      contactId: input.contactId,
      templateId: input.templateId,
      templateName: template.name,
      sentByUserId: ctx.user.id,
      sentByName: agentName,
      subject: resolvedSubject,
      toEmail: contact.email,
      postmarkMessageId
    });
    return { success: true, messageId: postmarkMessageId };
  }),
  /** Get email send history for a contact */
  getContactLogs: protectedProcedure.input(z5.object({ contactId: z5.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db.select().from(emailLogs).where(eq6(emailLogs.contactId, input.contactId)).orderBy(emailLogs.sentAt);
    return rows;
  })
});

// server/routers/pitch.ts
import { z as z6 } from "zod";
init_schema();
import { eq as eq7 } from "drizzle-orm";
var pitchRouter = router({
  myCustomizations: protectedProcedure.query(async ({ ctx }) => {
    return getUserPitchCustomizations(ctx.user.id);
  }),
  upsert: protectedProcedure.input(
    z6.object({
      stageNum: z6.number(),
      customContent: z6.record(z6.string(), z6.unknown())
    })
  ).mutation(async ({ ctx, input }) => {
    await upsertPitchCustomization(ctx.user.id, input.stageNum, input.customContent);
    return { success: true };
  }),
  reset: protectedProcedure.input(z6.object({ stageNum: z6.number() })).mutation(async ({ ctx, input }) => {
    await deletePitchCustomization(ctx.user.id, input.stageNum);
    return { success: true };
  }),
  allUsers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, team: users.team }).from(users).where(eq7(users.active, true));
  }),
  agentsOverview: protectedProcedure.query(async () => {
    return getAllPitchCustomizationsOverview();
  }),
  agentCustomizations: protectedProcedure.input(z6.object({ agentUserId: z6.number() })).query(async ({ input }) => {
    return getUserPitchCustomizations(input.agentUserId);
  }),
  adminUpsert: adminProcedure.input(
    z6.object({
      agentUserId: z6.number(),
      stageNum: z6.number(),
      customContent: z6.record(z6.string(), z6.unknown())
    })
  ).mutation(async ({ input }) => {
    await upsertPitchCustomization(input.agentUserId, input.stageNum, input.customContent);
    return { success: true };
  }),
  adminReset: adminProcedure.input(z6.object({ agentUserId: z6.number(), stageNum: z6.number() })).mutation(async ({ input }) => {
    await deletePitchCustomization(input.agentUserId, input.stageNum);
    return { success: true };
  })
});

// server/routers/paymentForm.ts
import { z as z7 } from "zod";
init_schema();
var paymentFormRouter = router({
  submit: publicProcedure.input(
    z7.object({
      email: z7.string().email(),
      cardholderName: z7.string().min(1),
      cardLast4: z7.string().length(4).optional(),
      cardExpiry: z7.string().optional(),
      addressLine1: z7.string().optional(),
      addressLine2: z7.string().optional(),
      city: z7.string().optional(),
      postcode: z7.string().optional(),
      agentName: z7.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(formSubmissions).values({
      email: input.email,
      cardholderName: input.cardholderName,
      cardLast4: input.cardLast4,
      cardExpiry: input.cardExpiry,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      postcode: input.postcode,
      agentName: input.agentName,
      status: "new"
    });
    await notifyOwner({
      title: "New Payment Form Submission",
      content: `Customer: ${input.cardholderName} (${input.email})
Card ending: ${input.cardLast4 ?? "N/A"}
Expiry: ${input.cardExpiry ?? "N/A"}
Address: ${[input.addressLine1, input.addressLine2, input.city, input.postcode].filter(Boolean).join(", ")}`
    });
    return { success: true };
  })
});

// server/routers/dashboard.ts
import { z as z8 } from "zod";
init_schema();
init_cloudtalk();
import { eq as eq8, sql as sql3, and as and3, gte as gte2, lte as lte2, like as like2, or as or3, desc as desc3, inArray as inArray2 } from "drizzle-orm";
function getDateRange(range, customFrom, customTo) {
  const now = /* @__PURE__ */ new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1e3 - 1);
  switch (range) {
    case "today":
      return { from: startOfDay, to: endOfDay };
    case "yesterday": {
      const yStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1e3);
      const yEnd = new Date(startOfDay.getTime() - 1);
      return { from: yStart, to: yEnd };
    }
    case "this_week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const weekStart = new Date(startOfDay.getTime() - diff * 24 * 60 * 60 * 1e3);
      return { from: weekStart, to: endOfDay };
    }
    case "last_7_days": {
      const from = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1e3);
      return { from, to: endOfDay };
    }
    case "this_month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: monthStart, to: endOfDay };
    }
    case "last_3_months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return { from, to: endOfDay };
    }
    case "this_year": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { from: yearStart, to: endOfDay };
    }
    case "previous_month": {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: prevMonthStart, to: prevMonthEnd };
    }
    case "custom": {
      const from = customFrom ? /* @__PURE__ */ new Date(`${customFrom}T00:00:00`) : new Date(2020, 0, 1);
      const to = customTo ? /* @__PURE__ */ new Date(`${customTo}T23:59:59.999`) : endOfDay;
      return { from, to };
    }
    default:
      return { from: new Date(2020, 0, 1), to: endOfDay };
  }
}
var OPENING_CALL_TYPES = ["cold_call", "follow_up"];
var RETENTION_CALL_TYPES = ["live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "retention_win_back", "instalment_decline"];
function callTypeLabel(ct) {
  switch (ct) {
    case "cold_call":
      return "Cold Call";
    case "follow_up":
      return "Follow Up";
    case "live_sub":
      return "Retention";
    case "pre_cycle_cancelled":
      return "Retention";
    case "pre_cycle_decline":
      return "Retention";
    case "end_of_instalment":
      return "Retention";
    case "from_cat":
      return "Retention";
    case "retention_win_back":
      return "Retention";
    case "instalment_decline":
      return "Instalment Decline";
    case "other":
      return "Other";
    case "opening":
      return "Opening";
    default:
      return ct ?? "Unknown";
  }
}
function normalizePhone2(phone) {
  return String(phone).replace(/[\s\-().+]/g, "");
}
async function findUserByCloudtalkAgentId(agentId) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  const results = await db.select().from(users).where(eq8(users.cloudtalkAgentId, agentIdStr)).limit(1);
  return results[0] ?? null;
}
async function findUserByEmail(email) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(users).where(eq8(users.email, email)).limit(1);
  return results[0] ?? null;
}
async function findOrCreateAgentUser(agentId, agentName, agentEmail) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  let user = await findUserByCloudtalkAgentId(agentIdStr);
  if (user) return user;
  if (agentEmail) {
    user = await findUserByEmail(agentEmail);
    if (user) {
      await db.update(users).set({ cloudtalkAgentId: agentIdStr }).where(eq8(users.id, user.id));
      return { ...user, cloudtalkAgentId: agentIdStr };
    }
  }
  const name = agentName ?? `Agent ${agentIdStr}`;
  const openId = `cloudtalk-${agentIdStr}`;
  try {
    const [result] = await db.insert(users).values({
      openId,
      name,
      email: agentEmail ?? null,
      cloudtalkAgentId: agentIdStr,
      role: "user"
    });
    const newId = result.insertId;
    const newUsers = await db.select().from(users).where(eq8(users.id, newId)).limit(1);
    return newUsers[0] ?? null;
  } catch (err) {
    const existing = await db.select().from(users).where(eq8(users.openId, openId)).limit(1);
    return existing[0] ?? null;
  }
}
async function findContactByPhone(phone) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone2(phone);
  const results = await db.select().from(contacts).where(
    or3(
      like2(contacts.phone, `%${normalized}%`),
      like2(contacts.phone, `%${phone}%`)
    )
  ).limit(1);
  return results[0] ?? null;
}
async function isCallAlreadyProcessed(cloudtalkCallId) {
  const db = await getDb();
  if (!db) return false;
  const results = await db.select({ id: callAnalyses.id }).from(callAnalyses).where(eq8(callAnalyses.cloudtalkCallId, cloudtalkCallId)).limit(1);
  return results.length > 0;
}
async function lookupStripeCustomerName(phone) {
  const stripeKey = process.env.STRIPE_API_KEY;
  if (!stripeKey) return null;
  const raw = String(phone).trim();
  const candidates = [raw];
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) candidates.push(`+44${digits.slice(1)}`, `0${digits.slice(1)}`);
  if (digits.length === 11 && digits.startsWith("0")) candidates.push(`+44${digits.slice(1)}`);
  if (digits.length === 12 && digits.startsWith("44")) candidates.push(`+${digits}`, `0${digits.slice(2)}`);
  for (const candidate of candidates) {
    try {
      const query = encodeURIComponent(`phone:"${candidate}"`);
      const res = await fetch(`https://api.stripe.com/v1/customers/search?query=${query}&limit=1`, {
        headers: { Authorization: `Bearer ${stripeKey}` }
      });
      const json2 = await res.json();
      if (json2?.data?.length > 0) {
        const customer = json2.data[0];
        const name = customer.name ?? customer.description ?? null;
        if (name) return name;
      }
    } catch {
    }
  }
  return null;
}
var dashboardRouter = router({
  /**
   * getDashboardCalls — paginated, filtered query on call_analyses joined with users.
   */
  getDashboardCalls: protectedProcedure.input(
    z8.object({
      page: z8.number().min(1).default(1),
      limit: z8.number().min(1).max(100).default(16),
      tab: z8.enum(["opening", "retention", "all"]).default("all"),
      agentId: z8.number().optional(),
      team: z8.enum(["opening", "retention"]).optional(),
      scoreMin: z8.number().min(0).max(100).optional(),
      scoreMax: z8.number().min(0).max(100).optional(),
      dateRange: z8.string().optional(),
      customFrom: z8.string().optional(),
      customTo: z8.string().optional(),
      callType: z8.string().optional(),
      search: z8.string().optional(),
      durationMin: z8.number().min(0).optional(),
      durationMax: z8.number().min(0).optional()
    })
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const { page, limit, tab, agentId, team, scoreMin, scoreMax, dateRange, customFrom, customTo, callType, search, durationMin, durationMax } = input;
    const offset = (page - 1) * limit;
    const conditions = [];
    if (tab === "opening") {
      conditions.push(inArray2(callAnalyses.callType, OPENING_CALL_TYPES));
    } else if (tab === "retention") {
      conditions.push(inArray2(callAnalyses.callType, RETENTION_CALL_TYPES));
    }
    if (agentId) {
      conditions.push(eq8(callAnalyses.userId, agentId));
    }
    if (team) {
      const teamUsers = await db.select({ id: users.id }).from(users).where(eq8(users.team, team));
      const teamUserIds = teamUsers.map((u) => u.id);
      if (teamUserIds.length > 0) {
        conditions.push(inArray2(callAnalyses.userId, teamUserIds));
      } else {
        return { calls: [], totalCount: 0, page, limit };
      }
    }
    if (scoreMin !== void 0 && scoreMin > 0) {
      conditions.push(gte2(callAnalyses.overallScore, scoreMin));
    }
    if (scoreMax !== void 0 && scoreMax < 100) {
      conditions.push(lte2(callAnalyses.overallScore, scoreMax));
    }
    if (dateRange && dateRange !== "all") {
      const { from, to } = getDateRange(dateRange, customFrom, customTo);
      conditions.push(gte2(callAnalyses.createdAt, from));
      conditions.push(lte2(callAnalyses.createdAt, to));
    }
    if (callType && callType !== "all") {
      if (callType === "retention") {
        conditions.push(inArray2(callAnalyses.callType, RETENTION_CALL_TYPES));
      } else {
        conditions.push(eq8(callAnalyses.callType, callType));
      }
    }
    if (durationMin !== void 0 && durationMin > 0) {
      conditions.push(gte2(callAnalyses.durationSeconds, durationMin * 60));
    }
    if (durationMax !== void 0 && durationMax > 0) {
      conditions.push(lte2(callAnalyses.durationSeconds, durationMax * 60));
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        or3(
          like2(callAnalyses.customerName, searchTerm),
          like2(callAnalyses.repName, searchTerm)
        )
      );
    }
    const whereClause = conditions.length > 0 ? and3(...conditions) : void 0;
    const countResult = await db.select({ count: sql3`count(*)` }).from(callAnalyses).where(whereClause);
    const totalCount = Number(countResult[0]?.count ?? 0);
    const rows = await db.select({
      id: callAnalyses.id,
      userId: callAnalyses.userId,
      repName: callAnalyses.repName,
      audioFileUrl: callAnalyses.audioFileUrl,
      fileName: callAnalyses.fileName,
      durationSeconds: callAnalyses.durationSeconds,
      status: callAnalyses.status,
      overallScore: callAnalyses.overallScore,
      callType: callAnalyses.callType,
      customerName: callAnalyses.customerName,
      contactName: callAnalyses.contactName,
      contactId: callAnalyses.contactId,
      createdAt: callAnalyses.createdAt,
      source: callAnalyses.source,
      repSpeechPct: callAnalyses.repSpeechPct,
      externalNumber: callAnalyses.externalNumber,
      closeStatus: callAnalyses.closeStatus,
      saved: callAnalyses.saved,
      upsellSucceeded: callAnalyses.upsellSucceeded,
      // User fields — use repName from call_analyses (set by webhook) as the authoritative agent name
      agentName: callAnalyses.repName,
      agentEmail: users.email,
      agentTeam: users.team
    }).from(callAnalyses).leftJoin(users, eq8(callAnalyses.userId, users.id)).where(whereClause).orderBy(desc3(callAnalyses.createdAt)).limit(limit).offset(offset);
    let contactMap = /* @__PURE__ */ new Map();
    const contactIds = rows.filter((r) => r.contactId).map((r) => r.contactId);
    if (contactIds.length > 0) {
      const contactRows = await db.select({ id: contacts.id, phone: contacts.phone, name: contacts.name }).from(contacts).where(inArray2(contacts.id, contactIds));
      contactMap = new Map(contactRows.map((c) => [c.id, c]));
    }
    return {
      calls: rows.map((row) => {
        const contact = row.contactId ? contactMap.get(row.contactId) : null;
        return {
          id: row.id,
          userId: row.userId,
          repName: row.repName,
          audioFileUrl: row.audioFileUrl,
          fileName: row.fileName,
          durationSeconds: row.durationSeconds,
          status: row.status,
          overallScore: row.overallScore != null ? Math.round(row.overallScore) : null,
          callType: row.callType,
          callTypeLabel: callTypeLabel(row.callType),
          customerName: row.customerName || contact?.name || null,
          contactName: row.contactName ?? null,
          contactId: row.contactId,
          contactPhone: contact?.phone ?? row.externalNumber ?? null,
          externalNumber: row.externalNumber ?? null,
          createdAt: row.createdAt,
          source: row.source,
          agentName: row.agentName ?? null,
          agentEmail: row.agentEmail,
          agentTeam: row.agentTeam,
          repSpeechPct: row.repSpeechPct != null ? Math.round(row.repSpeechPct) : null,
          closeStatus: row.closeStatus ?? null,
          saved: row.saved ?? null,
          upsellSucceeded: row.upsellSucceeded ?? null
        };
      }),
      totalCount,
      page,
      limit
    };
  }),
  /**
   * getDashboardStats — returns the 4 summary card values.
   */
  getDashboardStats: protectedProcedure.input(
    z8.object({
      tab: z8.enum(["opening", "retention", "all"]).default("all")
    }).optional()
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const tab = input?.tab ?? "all";
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1e3 - 1);
    const tabConditions = [];
    if (tab === "opening") {
      tabConditions.push(inArray2(callAnalyses.callType, OPENING_CALL_TYPES));
    } else if (tab === "retention") {
      tabConditions.push(inArray2(callAnalyses.callType, RETENTION_CALL_TYPES));
    }
    const belowFortyResult = await db.select({ count: sql3`count(*)` }).from(callAnalyses).where(
      and3(
        ...tabConditions,
        gte2(callAnalyses.createdAt, todayStart),
        lte2(callAnalyses.createdAt, todayEnd),
        lte2(callAnalyses.overallScore, 40),
        eq8(callAnalyses.status, "done")
      )
    );
    const callsBelowForty = Number(belowFortyResult[0]?.count ?? 0);
    const agentStatsToday = await db.select({
      userId: callAnalyses.userId,
      avgScore: sql3`ROUND(AVG(${callAnalyses.overallScore}))`,
      callCount: sql3`count(*)`,
      displayName: sql3`COALESCE(MAX(${users.name}), MAX(${callAnalyses.repName}), 'Unknown')`
    }).from(callAnalyses).leftJoin(users, eq8(users.id, callAnalyses.userId)).where(
      and3(
        ...tabConditions,
        gte2(callAnalyses.createdAt, todayStart),
        lte2(callAnalyses.createdAt, todayEnd),
        eq8(callAnalyses.status, "done"),
        sql3`${callAnalyses.overallScore} IS NOT NULL`
      )
    ).groupBy(callAnalyses.userId);
    let weakestAgent = null;
    let strongestAgent = null;
    if (agentStatsToday.length > 0) {
      const sorted = agentStatsToday.filter((a) => a.userId !== null).map((a) => ({
        userId: a.userId ?? 0,
        name: a.displayName,
        avgScore: Number(a.avgScore)
      })).sort((a, b) => a.avgScore - b.avgScore);
      weakestAgent = sorted[0] ?? null;
      strongestAgent = sorted[sorted.length - 1] ?? null;
      if (sorted.length === 1) {
        strongestAgent = sorted[0];
      }
    }
    const pendingResult = await db.select({ count: sql3`count(*)` }).from(callAnalyses).where(
      and3(
        ...tabConditions,
        inArray2(callAnalyses.status, ["pending", "transcribing", "analyzing"])
      )
    );
    const pendingCount = Number(pendingResult[0]?.count ?? 0);
    return {
      callsBelowForty,
      weakestAgent,
      strongestAgent,
      pendingCount
    };
  }),
  /**
   * getTopPerformers — returns agents with calls scoring 75+ respecting current filters.
   */
  getTopPerformers: protectedProcedure.input(
    z8.object({
      tab: z8.enum(["opening", "retention", "all"]).default("all"),
      agentId: z8.number().optional(),
      team: z8.enum(["opening", "retention"]).optional(),
      dateRange: z8.string().optional(),
      customFrom: z8.string().optional(),
      customTo: z8.string().optional(),
      callType: z8.string().optional()
    }).optional()
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const tab = input?.tab ?? "all";
    const dateRange = input?.dateRange ?? "today";
    const customFrom = input?.customFrom;
    const customTo = input?.customTo;
    const conditions = [];
    if (tab === "opening") {
      conditions.push(inArray2(callAnalyses.callType, OPENING_CALL_TYPES));
    } else if (tab === "retention") {
      conditions.push(inArray2(callAnalyses.callType, RETENTION_CALL_TYPES));
    }
    if (input?.agentId) {
      conditions.push(eq8(callAnalyses.userId, input.agentId));
    }
    if (input?.team) {
      const teamUsers = await db.select({ id: users.id }).from(users).where(eq8(users.team, input.team));
      const teamUserIds = teamUsers.map((u) => u.id);
      if (teamUserIds.length > 0) {
        conditions.push(inArray2(callAnalyses.userId, teamUserIds));
      } else {
        return [];
      }
    }
    if (input?.callType && input.callType !== "all") {
      if (input.callType === "retention") {
        conditions.push(inArray2(callAnalyses.callType, RETENTION_CALL_TYPES));
      } else {
        conditions.push(eq8(callAnalyses.callType, input.callType));
      }
    }
    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    conditions.push(gte2(callAnalyses.createdAt, from));
    conditions.push(lte2(callAnalyses.createdAt, to));
    conditions.push(eq8(callAnalyses.status, "done"));
    conditions.push(gte2(callAnalyses.overallScore, 75));
    const whereClause = conditions.length > 0 ? and3(...conditions) : void 0;
    const agentStats = await db.select({
      userId: callAnalyses.userId,
      avgScore: sql3`ROUND(AVG(${callAnalyses.overallScore}))`,
      callCount: sql3`count(*)`,
      displayName: sql3`COALESCE(MAX(${users.name}), MAX(${callAnalyses.repName}), 'Unknown')`
    }).from(callAnalyses).leftJoin(users, eq8(users.id, callAnalyses.userId)).where(whereClause).groupBy(callAnalyses.userId);
    if (agentStats.length === 0) return [];
    return agentStats.filter((a) => a.userId !== null).map((a) => ({
      userId: a.userId,
      name: a.displayName,
      avgScore: Number(a.avgScore),
      callCount: Number(a.callCount)
    })).sort((a, b) => b.callCount - a.callCount || b.avgScore - a.avgScore);
  }),
  /**
   * getAgentsList — returns list of agents for the dropdown filter.
   */
  getAgentsList: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      team: users.team
    }).from(users).orderBy(users.name);
    return rows.filter((r) => r.name);
  }),
  /**
   * syncCalls — Fetch recent calls from CloudTalk (last 24 hours, with recordings,
   * duration > 2 minutes) and process them through the existing analysis pipeline.
   * Deduplicates by cloudtalkCallId.
   *
   * Returns detailed stats:
   *   totalFromApi   — total calls fetched from CloudTalk (all statuses)
   *   answeredCalls  — how many were answered (client-side filter)
   *   eligibleCalls  — how many had a recording AND duration > 120s
   *   alreadyInDb    — how many were skipped because they're already in the DB
   *   newSynced      — how many new calls were actually synced
   *   skipped        — how many were skipped due to download/processing failures
   *   errors         — error messages collected during the sync
   */
  syncCalls: protectedProcedure.mutation(async () => {
    const now = /* @__PURE__ */ new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
    const dateFrom = yesterday.toISOString().split("T")[0];
    const dateTo = now.toISOString().split("T")[0];
    console.log(`[Dashboard Sync] Starting sync for ${dateFrom} to ${dateTo}`);
    let allCallsRaw = [];
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount) {
      const result = await getCallHistory({
        dateFrom,
        dateTo,
        // No status filter here — we apply it client-side below so we can count both
        limit: 100,
        page
      });
      allCallsRaw = allCallsRaw.concat(result.calls);
      pageCount = result.pageCount;
      page++;
    }
    const totalFromApi = allCallsRaw.length;
    console.log(`[Dashboard Sync] Fetched ${totalFromApi} total calls from CloudTalk (all statuses)`);
    const answeredCallsList = allCallsRaw.filter((call) => call.status === "answered");
    const answeredCalls = answeredCallsList.length;
    console.log(`[Dashboard Sync] ${answeredCalls} answered calls`);
    const eligibleCallsList = answeredCallsList.filter((call) => {
      const duration = call.call_times?.talking_time ?? 0;
      const hasRecording = call.recorded === true || !!call.recording_link;
      return hasRecording && duration > 120;
    });
    const eligibleCalls = eligibleCallsList.length;
    console.log(`[Dashboard Sync] ${eligibleCalls} calls eligible (recorded + >2min)`);
    let newSynced = 0;
    let alreadyInDb = 0;
    let skipped = 0;
    const errorMessages = [];
    for (const call of eligibleCallsList) {
      const callId = String(call.cdr_id || call.uuid || "");
      if (!callId) {
        skipped++;
        continue;
      }
      if (await isCallAlreadyProcessed(callId)) {
        alreadyInDb++;
        continue;
      }
      try {
        const directRecordingLink = call.recording_link ?? null;
        const fallbackRecordingUrl = `https://my.cloudtalk.io/api/calls/recording/${call.cdr_id}.json`;
        const keyId = process.env.CLOUDTALK_API_KEY_ID;
        const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;
        if (!keyId || !keySecret) throw new Error("CloudTalk API credentials not configured");
        const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        let audioBuffer = null;
        let audioContentType = "audio/mpeg";
        const tryFetchAudio = async (url, options) => {
          try {
            console.log(`[Dashboard Sync] Trying to fetch recording from: ${url.substring(0, 80)}...`);
            const res = await fetch(url, { ...options, signal: AbortSignal.timeout(3e4) });
            console.log(`[Dashboard Sync] Response: status=${res.status}, content-type=${res.headers.get("content-type")}`);
            if (!res.ok) return null;
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("audio") || ct.includes("wav") || ct.includes("mpeg") || ct.includes("octet-stream")) {
              return { buffer: Buffer.from(await res.arrayBuffer()), contentType: ct };
            }
            const json2 = await res.json();
            const redirectUrl = json2?.responseData?.url ?? json2?.url ?? json2?.recording_url ?? null;
            if (redirectUrl) {
              console.log(`[Dashboard Sync] Got redirect URL, following...`);
              const audioRes = await fetch(redirectUrl, { signal: AbortSignal.timeout(3e4) });
              if (audioRes.ok) {
                return { buffer: Buffer.from(await audioRes.arrayBuffer()), contentType: audioRes.headers.get("content-type") ?? "audio/mpeg" };
              }
            }
            return null;
          } catch (e) {
            console.warn(`[Dashboard Sync] Fetch error: ${e.message}`);
            return null;
          }
        };
        if (directRecordingLink) {
          const result = await tryFetchAudio(directRecordingLink);
          if (result) {
            audioBuffer = result.buffer;
            audioContentType = result.contentType;
          }
        }
        if (!audioBuffer && directRecordingLink) {
          const result = await tryFetchAudio(directRecordingLink, { headers: { Authorization: authHeader } });
          if (result) {
            audioBuffer = result.buffer;
            audioContentType = result.contentType;
          }
        }
        if (!audioBuffer) {
          const result = await tryFetchAudio(fallbackRecordingUrl, { headers: { Authorization: authHeader } });
          if (result) {
            audioBuffer = result.buffer;
            audioContentType = result.contentType;
          }
        }
        if (!audioBuffer) {
          console.warn(`[Dashboard Sync] All recording download strategies failed for call ${callId}`);
          skipped++;
          continue;
        }
        const ext = audioContentType.includes("wav") ? "wav" : "mp3";
        const fileKey = `call-recordings/sync-${callId}-${Date.now()}.${ext}`;
        const { url: fileUrl } = await storagePut(fileKey, audioBuffer, audioContentType);
        const agentId = call.agent?.id;
        const agentName = call.agent?.name ?? null;
        const agentEmail = call.agent?.email ?? null;
        let agent = agentId ? await findOrCreateAgentUser(agentId, agentName, agentEmail) : null;
        if (!agent) {
          const db = await getDb();
          if (db) {
            const admins = await db.select().from(users).where(eq8(users.role, "admin")).limit(1);
            agent = admins[0] ?? null;
          }
        }
        if (!agent) {
          console.warn(`[Dashboard Sync] No agent found for call ${callId} \u2014 skipping`);
          skipped++;
          continue;
        }
        const callerPhone = call.contact?.number ?? null;
        const contact = callerPhone ? await findContactByPhone(callerPhone) : null;
        const cloudtalkContactName = call.contact?.name ?? null;
        let customerName;
        if (cloudtalkContactName) {
          customerName = cloudtalkContactName;
        } else if (callerPhone) {
          const stripeName = await lookupStripeCustomerName(callerPhone);
          if (stripeName) customerName = stripeName;
        }
        const isRetentionAgent = agent.team === "retention";
        const initialCallType = isRetentionAgent ? "other" : "cold_call";
        const repName = agentName || agent.name || null;
        const analysisId = await createCallAnalysisRecord({
          userId: agent.id,
          repName,
          audioFileKey: fileKey,
          audioFileUrl: fileUrl,
          fileName: `cloudtalk-sync-${callId}.mp3`,
          callDate: call.date ? new Date(call.date) : /* @__PURE__ */ new Date(),
          source: "webhook",
          cloudtalkCallId: callId,
          contactId: contact?.id ?? null,
          callType: initialCallType,
          customerName: customerName ?? null
        });
        if (callerPhone && !contact) {
          try {
            const db = await getDb();
            if (db) {
              const [newContact] = await db.insert(contacts).values({
                name: customerName || cloudtalkContactName || "Unknown",
                phone: callerPhone
              });
              const newContactId = newContact.insertId;
              if (newContactId) {
                await db.update(callAnalyses).set({ contactId: newContactId }).where(eq8(callAnalyses.id, analysisId));
              }
            }
          } catch (e) {
            console.warn(`[Dashboard Sync] Could not create contact for ${callerPhone}:`, e);
          }
        }
        console.log(`[Dashboard Sync] Created analysis #${analysisId} for call ${callId}`);
        processCallAnalysis(analysisId, fileUrl).catch((err) => {
          console.error(`[Dashboard Sync] Analysis #${analysisId} failed:`, err);
        });
        newSynced++;
      } catch (err) {
        const errMsg = err?.message ?? String(err);
        console.error(`[Dashboard Sync] Error processing call ${callId}:`, errMsg);
        errorMessages.push(`Call ${callId}: ${errMsg}`);
      }
    }
    console.log(
      `[Dashboard Sync] Done. Total: ${totalFromApi}, Answered: ${answeredCalls}, Eligible: ${eligibleCalls}, AlreadyInDb: ${alreadyInDb}, NewSynced: ${newSynced}, Skipped: ${skipped}, Errors: ${errorMessages.length}`
    );
    return {
      totalFromApi,
      answeredCalls,
      eligibleCalls,
      alreadyInDb,
      newSynced,
      skipped,
      errors: errorMessages
    };
  })
});

// server/routers/manager.ts
import { z as z9 } from "zod";
init_schema();
import { eq as eq9, like as like3, or as or4, desc as desc4, sql as sql4, isNull as isNull2 } from "drizzle-orm";

// server/utils/stripHtml.ts
function stripHtml(text2) {
  if (!text2) return "";
  let clean = text2;
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  clean = clean.replace(/<[^>]*>/g, " ");
  clean = clean.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

// server/routers/manager.ts
var AGENTS = ["Guy", "Rob", "James"];
var WORK_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "retained",
  "done_deal",
  "future_deal",
  "dont_assign",
  "not_interested",
  "no_answer",
  "callback",
  "follow_up",
  "whatsapp_queue",
  "cancelled_sub",
  "archived"
];
var CALL_RESULTS = [
  "retained",
  "done_deal",
  "future_deal",
  "no_answer",
  "callback",
  "follow_up",
  "not_interested",
  "voicemail",
  "wrong_number"
];
function buildEmptyStats() {
  return {
    totalAssigned: 0,
    totalUnassigned: 0,
    totalWhatsappQueue: 0,
    totalRetained: 0,
    byAgent: {},
    byWorkStatus: {},
    byLeadType: {},
    byCategory: { installment: 0, subscription: 0 },
    callbacksDueToday: 0,
    urgencyBreakdown: { critical: 0, high: 0, medium: 0, low: 0 }
  };
}
function buildStats(leads) {
  const byAgent = {};
  const byWorkStatus = {};
  const byLeadType = {};
  const byCategory = { installment: 0, subscription: 0 };
  const urgencyBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  const todayStart = /* @__PURE__ */ new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = /* @__PURE__ */ new Date();
  todayEnd.setHours(23, 59, 59, 999);
  let callbacksDueToday = 0;
  for (const l of leads) {
    if (l.assignedAgent) byAgent[l.assignedAgent] = (byAgent[l.assignedAgent] || 0) + 1;
    const ws = l.workStatus || "new";
    byWorkStatus[ws] = (byWorkStatus[ws] || 0) + 1;
    if (l.leadType) byLeadType[l.leadType] = (byLeadType[l.leadType] || 0) + 1;
    if (l.leadCategory === "installment") byCategory.installment++;
    else byCategory.subscription++;
    const score = l.urgencyScore ?? 0;
    if (score >= 80) urgencyBreakdown.critical++;
    else if (score >= 60) urgencyBreakdown.high++;
    else if (score >= 40) urgencyBreakdown.medium++;
    else urgencyBreakdown.low++;
    if (l.callbackAt && l.callbackAt >= todayStart.getTime() && l.callbackAt <= todayEnd.getTime()) {
      callbacksDueToday++;
    }
  }
  return {
    totalAssigned: leads.filter((l) => l.assignedAgent).length,
    totalUnassigned: leads.filter((l) => !l.assignedAgent).length,
    totalWhatsappQueue: leads.filter((l) => l.workStatus === "whatsapp_queue").length,
    totalRetained: leads.filter((l) => l.workStatus === "retained").length,
    byAgent,
    byWorkStatus,
    byLeadType,
    byCategory,
    callbacksDueToday,
    urgencyBreakdown
  };
}
async function autoLinkLeadsToContacts(db, rows) {
  if (!db) return;
  const unlinked = rows.filter((r) => !r.contactId && (r.email || r.phone));
  if (unlinked.length === 0) return;
  for (const lead of unlinked) {
    try {
      let existingContact;
      if (lead.email) {
        const byEmail = await db.select({ id: contacts.id }).from(contacts).where(eq9(contacts.email, lead.email)).limit(1);
        existingContact = byEmail[0];
      }
      if (!existingContact && lead.phone) {
        const normalizedPhone = lead.phone.replace(/[\s\-().+]/g, "");
        const byPhone = await db.select({ id: contacts.id }).from(contacts).where(
          or4(
            like3(contacts.phone, `%${normalizedPhone}%`),
            like3(contacts.phone, `%${lead.phone}%`)
          )
        ).limit(1);
        existingContact = byPhone[0];
      }
      if (existingContact) {
        await db.update(leadAssignments).set({ contactId: existingContact.id }).where(eq9(leadAssignments.id, lead.id));
      } else {
        const [result] = await db.insert(contacts).values({
          name: lead.customerName || "Unknown",
          email: lead.email || null,
          phone: lead.phone || null,
          department: "retention",
          leadType: lead.leadType || null,
          status: "new"
        });
        const newContactId = result.insertId;
        if (newContactId) {
          await db.update(leadAssignments).set({ contactId: newContactId }).where(eq9(leadAssignments.id, lead.id));
        }
      }
    } catch (e) {
      console.error(`[autoLink] Error linking lead ${lead.id}:`, e);
    }
  }
}
var managerRouter = router({
  /**
   * Fetch leads from local DB.
   * Returns leads sorted by date (newest first) with filters applied.
   */
  getLeads: protectedProcedure.input(
    z9.object({
      page: z9.number().default(1),
      perPage: z9.number().default(200),
      categoryFilter: z9.enum(["installment", "subscription", "all"]).default("all"),
      leadTypeFilter: z9.string().optional(),
      agentFilter: z9.string().optional(),
      workStatusFilter: z9.string().optional(),
      search: z9.string().optional(),
      sortBy: z9.enum(["urgency", "totalSpend", "daysSinceEvent", "customerName", "leadStatus"]).default("leadStatus"),
      dateRangeFilter: z9.enum(["today", "yesterday", "7days", "this_month", "custom", "all"]).default("this_month"),
      customDateFrom: z9.string().optional(),
      customDateTo: z9.string().optional()
    })
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { leads: [], total: 0, stats: buildEmptyStats() };
    const rows = await db.select().from(leadAssignments).orderBy(desc4(leadAssignments.id));
    if (rows.length === 0) {
      return { leads: [], total: 0, stats: buildEmptyStats() };
    }
    autoLinkLeadsToContacts(db, rows).catch(
      (err) => console.error("[getLeads] Auto-link error:", err)
    );
    let leads = rows.map((row) => {
      let daysSinceEvent = 0;
      if (row.cancelledAt) {
        const d = new Date(row.cancelledAt);
        if (!isNaN(d.getTime())) {
          daysSinceEvent = Math.floor((Date.now() - d.getTime()) / (1e3 * 60 * 60 * 24));
        }
      }
      return {
        subscriptionId: row.subscriptionId,
        customerId: row.customerId ?? null,
        customerName: row.customerName ?? "Unknown",
        email: row.email ?? "",
        phone: row.phone ?? null,
        planName: row.planName ?? null,
        billingStatus: row.billingStatus ?? null,
        cyclesCompleted: row.cyclesCompleted ?? 0,
        totalSpend: row.totalSpend ?? 0,
        monthlyAmount: row.monthlyAmount ?? 0,
        currencyCode: row.currencyCode ?? "GBP",
        retryAttempts: row.retryAttempts ?? 0,
        nextBillingAt: null,
        currentTermEndsAt: row.eventDate ?? row.cancelledAt ?? null,
        leadCategory: row.leadCategory ?? "subscription",
        leadType: row.leadType ?? "pre_cycle_cancelled",
        urgencyScore: row.urgencyScore ?? 0,
        urgencyFlags: row.urgencyFlags ? JSON.parse(row.urgencyFlags) : [],
        urgencyLabel: (row.urgencyScore ?? 0) >= 80 ? "Critical" : (row.urgencyScore ?? 0) >= 60 ? "High" : (row.urgencyScore ?? 0) >= 40 ? "Medium" : "Low",
        daysSinceEvent,
        valueScore: row.urgencyScore ?? 0,
        reachabilityScore: 50,
        queuePriority: row.urgencyScore ?? 0,
        callPurpose: null,
        callPurposeNote: null,
        actionRequired: null,
        maxCallAttempts: 3,
        assignmentId: row.id,
        assignedAgent: row.assignedAgent ?? null,
        workStatus: row.workStatus ?? "new",
        managerNote: row.managerNote ? stripHtml(row.managerNote) : null,
        agentNote: row.agentNote ?? null,
        attemptCount: row.attemptCount ?? 0,
        noAnswerCount: row.noAnswerCount ?? 0,
        lastCallAt: row.lastCallAt ?? null,
        lastCallResult: row.lastCallResult ?? null,
        callbackAt: row.callbackAt ?? null,
        followUpAt: row.followUpAt ?? null,
        followUpNote: row.followUpNote ?? null,
        assignedAt: row.assignedAt ?? null,
        statusChangedAt: row.statusChangedAt ?? null,
        lastTransactionDate: row.lastTransactionDate ?? null,
        lastShipmentDate: row.lastShipmentDate ?? null,
        contactId: row.contactId ?? null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null
      };
    });
    if (input.dateRangeFilter !== "all") {
      const now = /* @__PURE__ */ new Date();
      let startTs;
      let endTs = Date.now();
      if (input.dateRangeFilter === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startTs = start.getTime();
      } else if (input.dateRangeFilter === "yesterday") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startTs = start.getTime();
        endTs = end.getTime();
      } else if (input.dateRangeFilter === "7days") {
        startTs = Date.now() - 7 * 24 * 60 * 60 * 1e3;
      } else if (input.dateRangeFilter === "this_month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        startTs = start.getTime();
      } else if (input.dateRangeFilter === "custom") {
        startTs = input.customDateFrom ? new Date(input.customDateFrom).getTime() : 0;
        if (input.customDateTo) {
          const endDay = new Date(input.customDateTo);
          endDay.setHours(23, 59, 59, 999);
          endTs = endDay.getTime();
        }
      } else {
        startTs = 0;
      }
      leads = leads.filter((l) => {
        const ts = l.currentTermEndsAt ? new Date(l.currentTermEndsAt).getTime() : null;
        if (!ts) return false;
        return ts >= startTs && ts <= endTs;
      });
    }
    if (input.categoryFilter !== "all") {
      leads = leads.filter((l) => l.leadCategory === input.categoryFilter);
    }
    if (input.leadTypeFilter) {
      leads = leads.filter((l) => l.leadType === input.leadTypeFilter);
    }
    if (input.agentFilter) {
      leads = leads.filter((l) => l.assignedAgent === input.agentFilter);
    }
    if (input.workStatusFilter) {
      leads = leads.filter((l) => l.workStatus === input.workStatusFilter);
    }
    if (input.search) {
      const q = input.search.toLowerCase();
      leads = leads.filter(
        (l) => (l.customerName || "").toLowerCase().includes(q) || (l.email || "").toLowerCase().includes(q) || (l.phone || "").toLowerCase().includes(q) || (l.planName || "").toLowerCase().includes(q)
      );
    }
    leads.sort((a, b) => {
      switch (input.sortBy) {
        case "leadStatus": {
          const aDate = a.currentTermEndsAt ? new Date(a.currentTermEndsAt).getTime() : 0;
          const bDate = b.currentTermEndsAt ? new Date(b.currentTermEndsAt).getTime() : 0;
          return bDate - aDate;
        }
        case "urgency":
          return b.urgencyScore - a.urgencyScore;
        case "totalSpend":
          return b.totalSpend - a.totalSpend;
        case "daysSinceEvent":
          return a.daysSinceEvent - b.daysSinceEvent;
        case "customerName":
          return (a.customerName || "").localeCompare(b.customerName || "");
        default:
          return b.urgencyScore - a.urgencyScore;
      }
    });
    return {
      leads,
      total: leads.length,
      stats: buildStats(leads)
    };
  }),
  /**
   * Assign a lead to an agent (or update assignment data).
   */
  assignLead: protectedProcedure.input(
    z9.object({
      subscriptionId: z9.string(),
      customerId: z9.string().optional(),
      customerName: z9.string().optional(),
      assignedAgent: z9.string().nullable().optional(),
      managerNote: z9.string().nullable().optional(),
      agentNote: z9.string().nullable().optional(),
      workStatus: z9.string().optional(),
      callbackAt: z9.number().nullable().optional(),
      followUpAt: z9.number().nullable().optional(),
      followUpNote: z9.string().nullable().optional(),
      leadCategory: z9.string().optional(),
      leadType: z9.string().optional(),
      planName: z9.string().optional(),
      urgencyScore: z9.number().optional(),
      urgencyFlags: z9.string().optional(),
      totalSpend: z9.number().optional(),
      monthlyAmount: z9.number().optional(),
      cyclesCompleted: z9.number().optional(),
      billingCycles: z9.number().optional(),
      billingStatus: z9.string().optional(),
      retryAttempts: z9.number().optional(),
      email: z9.string().optional(),
      phone: z9.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const existing = await db.select().from(leadAssignments).where(eq9(leadAssignments.subscriptionId, input.subscriptionId)).limit(1);
    const updateData = {};
    if (input.assignedAgent !== void 0) {
      updateData.assignedAgent = input.assignedAgent;
      updateData.assignedAt = input.assignedAgent ? Date.now() : null;
      if (input.assignedAgent && (!existing[0]?.workStatus || existing[0]?.workStatus === "new")) {
        updateData.workStatus = "assigned";
      }
    }
    if (input.managerNote !== void 0) updateData.managerNote = input.managerNote;
    if (input.agentNote !== void 0) updateData.agentNote = input.agentNote;
    if (input.workStatus !== void 0) {
      updateData.workStatus = input.workStatus;
      updateData.statusChangedAt = Date.now();
    }
    if (input.callbackAt !== void 0) updateData.callbackAt = input.callbackAt;
    if (input.followUpAt !== void 0) updateData.followUpAt = input.followUpAt;
    if (input.followUpNote !== void 0) updateData.followUpNote = input.followUpNote;
    if (input.leadCategory !== void 0) updateData.leadCategory = input.leadCategory;
    if (input.leadType !== void 0) updateData.leadType = input.leadType;
    if (input.planName !== void 0) updateData.planName = input.planName;
    if (input.urgencyScore !== void 0) updateData.urgencyScore = input.urgencyScore;
    if (input.urgencyFlags !== void 0) updateData.urgencyFlags = input.urgencyFlags;
    if (input.totalSpend !== void 0) updateData.totalSpend = input.totalSpend;
    if (input.monthlyAmount !== void 0) updateData.monthlyAmount = input.monthlyAmount;
    if (input.cyclesCompleted !== void 0) updateData.cyclesCompleted = input.cyclesCompleted;
    if (input.billingCycles !== void 0) updateData.billingCycles = input.billingCycles;
    if (input.billingStatus !== void 0) updateData.billingStatus = input.billingStatus;
    if (input.retryAttempts !== void 0) updateData.retryAttempts = input.retryAttempts;
    if (input.email !== void 0) updateData.email = input.email;
    if (input.phone !== void 0) updateData.phone = input.phone;
    if (existing.length > 0) {
      await db.update(leadAssignments).set(updateData).where(eq9(leadAssignments.subscriptionId, input.subscriptionId));
    } else {
      await db.insert(leadAssignments).values({
        subscriptionId: input.subscriptionId,
        customerId: input.customerId || null,
        customerName: input.customerName || null,
        email: input.email || null,
        phone: input.phone || null,
        leadCategory: input.leadCategory || "subscription",
        leadType: input.leadType || null,
        planName: input.planName || null,
        urgencyScore: input.urgencyScore || 0,
        urgencyFlags: input.urgencyFlags || null,
        totalSpend: input.totalSpend || 0,
        monthlyAmount: input.monthlyAmount || 0,
        cyclesCompleted: input.cyclesCompleted || 0,
        billingCycles: input.billingCycles || 0,
        billingStatus: input.billingStatus || null,
        retryAttempts: input.retryAttempts || 0,
        assignedAgent: input.assignedAgent || null,
        assignedAt: input.assignedAgent ? Date.now() : null,
        workStatus: input.workStatus || (input.assignedAgent ? "assigned" : "new"),
        managerNote: input.managerNote || null,
        callbackAt: input.callbackAt || null
      });
    }
    const result = await db.select().from(leadAssignments).where(eq9(leadAssignments.subscriptionId, input.subscriptionId)).limit(1);
    return { success: true, assignment: result[0] };
  }),
  /**
   * Log a call attempt and update lead status.
   * After 3 no-answers -> auto-move to whatsapp_queue.
   */
  logCallAttempt: protectedProcedure.input(
    z9.object({
      subscriptionId: z9.string(),
      agentName: z9.string(),
      result: z9.enum(CALL_RESULTS),
      note: z9.string().optional(),
      callbackAt: z9.number().optional(),
      followUpAt: z9.number().optional(),
      followUpNote: z9.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(callAttempts).values({
      subscriptionId: input.subscriptionId,
      agentName: input.agentName,
      result: input.result,
      note: input.note || null,
      callbackAt: input.callbackAt || null,
      followUpAt: input.followUpAt || null
    });
    const existing = await db.select().from(leadAssignments).where(eq9(leadAssignments.subscriptionId, input.subscriptionId)).limit(1);
    const current = existing[0];
    const newAttemptCount = (current?.attemptCount ?? 0) + 1;
    const newNoAnswerCount = input.result === "no_answer" || input.result === "voicemail" ? (current?.noAnswerCount ?? 0) + 1 : 0;
    let newWorkStatus;
    if (input.result === "retained") {
      newWorkStatus = "retained";
    } else if (input.result === "done_deal") {
      newWorkStatus = "done_deal";
    } else if (input.result === "future_deal") {
      newWorkStatus = "future_deal";
    } else if (input.result === "not_interested") {
      newWorkStatus = "not_interested";
    } else if (input.result === "callback") {
      newWorkStatus = "callback";
    } else if (input.result === "follow_up") {
      newWorkStatus = "follow_up";
    } else if (newNoAnswerCount >= 3) {
      newWorkStatus = "whatsapp_queue";
    } else {
      newWorkStatus = "no_answer";
    }
    const updateData = {
      attemptCount: newAttemptCount,
      noAnswerCount: newNoAnswerCount,
      lastCallAt: Date.now(),
      lastCallResult: input.result,
      workStatus: newWorkStatus,
      statusChangedAt: Date.now()
    };
    if (input.result === "callback" && input.callbackAt) {
      updateData.callbackAt = input.callbackAt;
    }
    if (input.result === "follow_up") {
      updateData.followUpAt = input.followUpAt || null;
      updateData.followUpNote = input.followUpNote || null;
    }
    if (current) {
      await db.update(leadAssignments).set(updateData).where(eq9(leadAssignments.subscriptionId, input.subscriptionId));
    } else {
      await db.insert(leadAssignments).values({
        subscriptionId: input.subscriptionId,
        assignedAgent: input.agentName,
        ...updateData
      });
    }
    return {
      success: true,
      movedToWhatsApp: newWorkStatus === "whatsapp_queue",
      attemptCount: newAttemptCount,
      noAnswerCount: newNoAnswerCount,
      workStatus: newWorkStatus
    };
  }),
  /**
   * Get call history for a specific subscription.
   */
  getCallHistory: protectedProcedure.input(z9.object({ subscriptionId: z9.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { attempts: [] };
    const attempts = await db.select().from(callAttempts).where(eq9(callAttempts.subscriptionId, input.subscriptionId)).orderBy(desc4(callAttempts.id));
    return { attempts };
  }),
  /**
   * Bulk assign multiple leads to one agent.
   */
  bulkAssign: protectedProcedure.input(
    z9.object({
      subscriptionIds: z9.array(z9.string()),
      assignedAgent: z9.string().nullable()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let updated = 0;
    for (const subscriptionId of input.subscriptionIds) {
      const existing = await db.select().from(leadAssignments).where(eq9(leadAssignments.subscriptionId, subscriptionId)).limit(1);
      const updateData = {
        assignedAgent: input.assignedAgent,
        assignedAt: input.assignedAgent ? Date.now() : null
      };
      if (input.assignedAgent && (!existing[0]?.workStatus || existing[0]?.workStatus === "new")) {
        updateData.workStatus = "assigned";
      }
      if (existing.length > 0) {
        await db.update(leadAssignments).set(updateData).where(eq9(leadAssignments.subscriptionId, subscriptionId));
      }
      updated++;
    }
    return { success: true, updated };
  }),
  /**
   * Get agent workload summary.
   */
  getAgentWorkload: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { workload: [], unassigned: 0 };
    const allAssignments = await db.select().from(leadAssignments);
    const workload = AGENTS.map((agent) => {
      const agentLeads = allAssignments.filter((a) => a.assignedAgent === agent);
      const active = agentLeads.filter(
        (l) => ["assigned", "in_progress", "callback", "follow_up", "no_answer"].includes(l.workStatus || "")
      ).length;
      const retained = agentLeads.filter((l) => l.workStatus === "retained").length;
      const doneDeal = agentLeads.filter((l) => l.workStatus === "done_deal").length;
      const whatsapp = agentLeads.filter((l) => l.workStatus === "whatsapp_queue").length;
      const total = agentLeads.length;
      return { agent, total, active, retained, doneDeal, whatsapp };
    });
    const unassigned = allAssignments.filter((a) => !a.assignedAgent).length;
    return { workload, unassigned };
  }),
  /**
   * Create a new lead manually.
   */
  createLead: adminProcedure.input(
    z9.object({
      customerName: z9.string(),
      email: z9.string().optional(),
      phone: z9.string().optional(),
      leadType: z9.string().optional(),
      leadCategory: z9.string().default("subscription"),
      planName: z9.string().optional(),
      totalSpend: z9.number().default(0),
      monthlyAmount: z9.number().default(0),
      urgencyScore: z9.number().default(50),
      assignedAgent: z9.string().nullable().optional(),
      managerNote: z9.string().optional(),
      customerNote: z9.string().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const subscriptionId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rawNote = input.customerNote ?? input.managerNote;
    await db.insert(leadAssignments).values({
      subscriptionId,
      customerName: input.customerName,
      email: input.email || null,
      phone: input.phone || null,
      leadType: input.leadType || "pre_cycle_cancelled",
      leadCategory: input.leadCategory,
      planName: input.planName || null,
      totalSpend: input.totalSpend,
      monthlyAmount: input.monthlyAmount,
      urgencyScore: input.urgencyScore,
      assignedAgent: input.assignedAgent || null,
      assignedAt: input.assignedAgent ? Date.now() : null,
      workStatus: input.assignedAgent ? "assigned" : "new",
      managerNote: rawNote ? stripHtml(rawNote) : null,
      eventDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    });
    return { success: true, subscriptionId };
  }),
  /**
   * Delete a lead.
   */
  deleteLead: adminProcedure.input(z9.object({ subscriptionId: z9.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(callAttempts).where(eq9(callAttempts.subscriptionId, input.subscriptionId));
    await db.delete(leadAssignments).where(eq9(leadAssignments.subscriptionId, input.subscriptionId));
    return { success: true };
  }),
  /**
   * Bulk delete leads by list of DB IDs (primary key).
   * Admin only.
   */
  bulkDeleteLeads: adminProcedure.input(
    z9.object({
      ids: z9.array(z9.number()).min(1, "At least one ID required")
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let deleted = 0;
    for (const id of input.ids) {
      await db.execute(sql4`DELETE FROM call_attempts WHERE leadId = ${id}`);
      await db.delete(leadAssignments).where(eq9(leadAssignments.id, id));
      deleted++;
    }
    return { success: true, deleted };
  }),
  /**
   * Import leads from CSV data (array of lead objects).
   */
  importLeads: adminProcedure.input(
    z9.object({
      leads: z9.array(
        z9.object({
          customerName: z9.string(),
          email: z9.string().optional(),
          phone: z9.string().optional(),
          leadType: z9.string().optional(),
          leadCategory: z9.string().default("subscription"),
          planName: z9.string().optional(),
          totalSpend: z9.number().default(0),
          monthlyAmount: z9.number().default(0),
          urgencyScore: z9.number().default(50),
          eventDate: z9.string().optional(),
          billingStatus: z9.string().optional(),
          cyclesCompleted: z9.number().default(0),
          customerNote: z9.string().optional()
        })
      )
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let inserted = 0;
    let skipped = 0;
    for (const lead of input.leads) {
      const subscriptionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        if (lead.email) {
          const existing = await db.select({ id: leadAssignments.id }).from(leadAssignments).where(eq9(leadAssignments.email, lead.email)).limit(1);
          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }
        await db.insert(leadAssignments).values({
          subscriptionId,
          customerName: lead.customerName,
          email: lead.email || null,
          phone: lead.phone || null,
          leadType: lead.leadType || "pre_cycle_cancelled",
          leadCategory: lead.leadCategory,
          planName: lead.planName || null,
          totalSpend: lead.totalSpend,
          monthlyAmount: lead.monthlyAmount,
          urgencyScore: lead.urgencyScore,
          eventDate: lead.eventDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          billingStatus: lead.billingStatus || null,
          cyclesCompleted: lead.cyclesCompleted,
          workStatus: "new",
          managerNote: lead.customerNote ? stripHtml(lead.customerNote) : null
        });
        inserted++;
      } catch (e) {
        console.error(`[importLeads] Error importing ${lead.customerName}:`, e);
        skipped++;
      }
    }
    return { success: true, inserted, skipped };
  }),
  /**
   * Link all unlinked leads to contacts.
   * For each lead_assignment where contactId IS NULL:
   *   - Look up contacts by email (or phone)
   *   - If found → set contactId
   *   - If not found → create a new contact with department="retention" and link it
   */
  linkLeadsToContacts: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const unlinkedLeads = await db.select().from(leadAssignments).where(isNull2(leadAssignments.contactId));
    let linked = 0;
    let created = 0;
    let skipped = 0;
    for (const lead of unlinkedLeads) {
      if (!lead.email && !lead.phone) {
        skipped++;
        continue;
      }
      try {
        let existingContact;
        if (lead.email) {
          const byEmail = await db.select({ id: contacts.id }).from(contacts).where(eq9(contacts.email, lead.email)).limit(1);
          existingContact = byEmail[0];
        }
        if (!existingContact && lead.phone) {
          const normalizedPhone = lead.phone.replace(/[\s\-().+]/g, "");
          const byPhone = await db.select({ id: contacts.id }).from(contacts).where(
            or4(
              like3(contacts.phone, `%${normalizedPhone}%`),
              like3(contacts.phone, `%${lead.phone}%`)
            )
          ).limit(1);
          existingContact = byPhone[0];
        }
        if (existingContact) {
          await db.update(leadAssignments).set({ contactId: existingContact.id }).where(eq9(leadAssignments.id, lead.id));
          linked++;
        } else {
          const [result] = await db.insert(contacts).values({
            name: lead.customerName || "Unknown",
            email: lead.email || null,
            phone: lead.phone || null,
            department: "retention",
            leadType: lead.leadType || null,
            status: "new"
          });
          const newContactId = result.insertId;
          if (newContactId) {
            await db.update(leadAssignments).set({ contactId: newContactId }).where(eq9(leadAssignments.id, lead.id));
            created++;
          }
        }
      } catch (e) {
        console.error(`[linkLeadsToContacts] Error processing lead ${lead.id}:`, e);
        skipped++;
      }
    }
    return { success: true, linked, created, skipped, total: unlinkedLeads.length };
  }),
  /**
   * Get constants for UI dropdowns.
   */
  getConstants: protectedProcedure.query(() => {
    return {
      agents: AGENTS,
      workStatuses: WORK_STATUSES,
      callResults: CALL_RESULTS
    };
  })
});

// server/routers/tickets.ts
import { z as z10 } from "zod";
init_schema();
import { eq as eq10, desc as desc5, asc, inArray as inArray3 } from "drizzle-orm";
import { TRPCError as TRPCError5 } from "@trpc/server";

// server/emailCategorization.ts
var CATEGORY_RULES = [
  // System/Automated — check first to filter out noise
  {
    category: "system_automated",
    priority: "LOW",
    fromPatterns: ["noreply", "no-reply", "zoho", "billing@", "notification", "mailer-daemon", "postmaster"]
  },
  // Agent Forwarded — from internal team
  {
    category: "agent_forwarded",
    priority: "MEDIUM",
    fromPatterns: ["@lavielabs.com"],
    subjectPatterns: ["fwd:", "fw:"]
  },
  // Cancellation Request
  {
    category: "cancellation_request",
    priority: "HIGH",
    keywords: [
      "cancel",
      "cancellation",
      "stop subscription",
      "no further payments",
      "unsubscribe",
      "cancel my",
      "want to cancel",
      "please cancel",
      "stop my subscription",
      "end my subscription",
      "terminate"
    ]
  },
  // Follow-up/Unanswered — check before general to catch urgency
  {
    category: "follow_up_unanswered",
    priority: "HIGH",
    keywords: [
      "no response",
      "didn't hear back",
      "didn't hear back",
      "following up",
      "unanswered",
      "still waiting",
      "haven't heard",
      "havent heard",
      "no reply",
      "chasing up",
      "sent an email previously",
      "emailed before"
    ]
  },
  // Address Update — check BEFORE shipping so "delivery address" matches here
  {
    category: "address_update",
    priority: "MEDIUM",
    keywords: [
      "change my address",
      "update my address",
      "new address",
      "current address",
      "delivery address",
      "wrong address",
      "moved",
      "postcode"
    ]
  },
  // Shipping/Delivery Issue
  {
    category: "shipping_delivery_issue",
    priority: "HIGH",
    keywords: [
      "not received",
      "not arrived",
      "delivery",
      "dhl",
      "tracking",
      "missing package",
      "where is my order",
      "shipment",
      "parcel",
      "hasn't arrived",
      "hasnt arrived",
      "dispatch",
      "courier",
      "royal mail"
    ]
  },
  // Payment/Billing Dispute
  {
    category: "payment_billing_dispute",
    priority: "HIGH",
    keywords: [
      "charge",
      "payment",
      "refund",
      "invoice",
      "instalment",
      "installment",
      "bank",
      "unauthorized",
      "unauthorised",
      "direct debit",
      "money taken",
      "overcharged",
      "billing",
      "charged me",
      "took money",
      "unexpected charge"
    ]
  },
  // Subscription Question
  {
    category: "subscription_question",
    priority: "MEDIUM",
    keywords: [
      "subscription",
      "commit",
      "optional",
      "trial",
      "how does it work",
      "how long",
      "contract",
      "minimum term",
      "sign up",
      "what do i get",
      "what is included"
    ]
  },
  // Product Feedback
  {
    category: "product_feedback",
    priority: "LOW",
    keywords: [
      "love",
      "feedback",
      "amazing",
      "great product",
      "thank you",
      "wonderful",
      "brilliant",
      "fantastic",
      "happy with",
      "pleased with",
      "recommend",
      "my experience",
      "skin looks",
      "made a difference"
    ]
  }
];
var CATEGORY_META = {
  cancellation_request: {
    label: "Cancellation Request",
    color: "#ef4444",
    bgColor: "bg-red-100",
    textColor: "text-red-700"
  },
  shipping_delivery_issue: {
    label: "Shipping/Delivery Issue",
    color: "#f97316",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700"
  },
  payment_billing_dispute: {
    label: "Payment/Billing Dispute",
    color: "#3b82f6",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700"
  },
  address_update: {
    label: "Address Update",
    color: "#8b5cf6",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700"
  },
  product_feedback: {
    label: "Product Feedback",
    color: "#10b981",
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700"
  },
  agent_forwarded: {
    label: "Agent Forwarded",
    color: "#6366f1",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-700"
  },
  system_automated: {
    label: "System/Automated",
    color: "#6b7280",
    bgColor: "bg-slate-100",
    textColor: "text-slate-600"
  },
  follow_up_unanswered: {
    label: "Follow-up/Unanswered",
    color: "#f59e0b",
    bgColor: "bg-amber-100",
    textColor: "text-amber-700"
  },
  subscription_question: {
    label: "Subscription Question",
    color: "#0ea5e9",
    bgColor: "bg-sky-100",
    textColor: "text-sky-700"
  },
  general_inquiry: {
    label: "General Inquiry",
    color: "#64748b",
    bgColor: "bg-slate-100",
    textColor: "text-slate-700"
  }
};
function categorizeEmail(params) {
  const fromLower = (params.fromEmail || "").toLowerCase();
  const subjectLower = (params.subject || "").toLowerCase();
  const bodyLower = (params.bodyText || "").toLowerCase();
  const combinedText = `${subjectLower} ${bodyLower}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.fromPatterns) {
      const fromMatch = rule.fromPatterns.some((p) => fromLower.includes(p.toLowerCase()));
      if (fromMatch) {
        if (rule.category === "agent_forwarded") {
          if (fromLower.includes("@lavielabs.com")) {
            return { category: rule.category, priority: rule.priority };
          }
          if (rule.subjectPatterns?.some((p) => subjectLower.includes(p.toLowerCase()))) {
            return { category: rule.category, priority: rule.priority };
          }
          continue;
        }
        return { category: rule.category, priority: rule.priority };
      }
    }
    if (rule.subjectPatterns && !rule.fromPatterns) {
      const subjectMatch = rule.subjectPatterns.some(
        (p) => subjectLower.includes(p.toLowerCase())
      );
      if (subjectMatch) {
        return { category: rule.category, priority: rule.priority };
      }
    }
    if (rule.keywords) {
      const keywordMatch = rule.keywords.some(
        (kw) => combinedText.includes(kw.toLowerCase())
      );
      if (keywordMatch) {
        return { category: rule.category, priority: rule.priority };
      }
    }
  }
  return { category: "general_inquiry", priority: "MEDIUM" };
}
function determineCustomerStatus(fromEmail, hasExistingEmails) {
  const emailLower = fromEmail.toLowerCase();
  if (emailLower.includes("@lavielabs.com")) {
    return "internal";
  }
  const systemPatterns = [
    "noreply",
    "no-reply",
    "zoho",
    "billing@",
    "notification",
    "mailer-daemon",
    "postmaster",
    "support@zohobilling"
  ];
  if (systemPatterns.some((p) => emailLower.includes(p))) {
    return "system";
  }
  if (hasExistingEmails) {
    return "existing";
  }
  return "new";
}

// server/routers/tickets.ts
var RETENTION_EMAILS = [
  "guy@lavielabs.com",
  "james.h@lavielabs.com",
  "rob.c@lavielabs.com"
];
var SUPPORT_EMAILS = [
  "support@lavielabs.com",
  "trial@lavielabs.com"
];
var AGENT_EMAIL_MAP = {
  "Guy Eli": "guy@lavielabs.com",
  "James Huxley": "james.h@lavielabs.com",
  "Rob Chizdik": "rob.c@lavielabs.com"
};
var EMAIL_AGENT_MAP = {
  "guy@lavielabs.com": "Guy",
  "james.h@lavielabs.com": "James",
  "rob.c@lavielabs.com": "Rob"
};
function buildEmptyStats2() {
  return {
    totalOpen: 0,
    highPriority: 0,
    awaitingResponse: 0,
    resolvedToday: 0,
    byCategory: {},
    byPriority: {},
    byStatus: {},
    byCustomerStatus: {}
  };
}
function getUserRetentionEmail(userName) {
  if (!userName) return null;
  const lower = userName.toLowerCase();
  for (const [agentName, email] of Object.entries(AGENT_EMAIL_MAP)) {
    if (lower === agentName.toLowerCase() || lower.includes(agentName.split(" ")[0].toLowerCase())) {
      return email;
    }
  }
  return null;
}
var ticketsRouter = router({
  /**
   * Get ticket stats — counts by category, priority, status.
   */
  getStats: protectedProcedure.input(
    z10.object({
      recipientType: z10.enum(["support", "retention"]).optional()
    }).optional()
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return buildEmptyStats2();
    try {
      const rows = await db.select({
        category: supportTickets.category,
        priority: supportTickets.priority,
        status: supportTickets.status,
        customerStatus: supportTickets.customerStatus,
        updatedAt: supportTickets.updatedAt,
        recipient: supportTickets.recipient
      }).from(supportTickets);
      if (rows.length === 0) return buildEmptyStats2();
      let filteredRows = rows;
      const recipientType = input?.recipientType;
      if (recipientType === "retention") {
        filteredRows = rows.filter((r) => r.recipient && RETENTION_EMAILS.includes(r.recipient));
      } else if (recipientType === "support") {
        filteredRows = rows.filter((r) => !r.recipient || SUPPORT_EMAILS.includes(r.recipient) || !RETENTION_EMAILS.includes(r.recipient));
      }
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const byCategory = {};
      const byPriority = {};
      const byStatus = {};
      const byCustomerStatus = {};
      let totalOpen = 0;
      let highPriority = 0;
      let awaitingResponse = 0;
      let resolvedToday = 0;
      for (const row of filteredRows) {
        byCategory[row.category] = (byCategory[row.category] || 0) + 1;
        byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
        byStatus[row.status] = (byStatus[row.status] || 0) + 1;
        byCustomerStatus[row.customerStatus] = (byCustomerStatus[row.customerStatus] || 0) + 1;
        if (row.status === "open" || row.status === "in_progress") {
          totalOpen++;
        }
        if (row.priority === "HIGH" && (row.status === "open" || row.status === "in_progress")) {
          highPriority++;
        }
        if (row.status === "open") {
          awaitingResponse++;
        }
        if ((row.status === "resolved" || row.status === "closed") && row.updatedAt && new Date(row.updatedAt).getTime() >= todayStart.getTime()) {
          resolvedToday++;
        }
      }
      return {
        totalOpen,
        highPriority,
        awaitingResponse,
        resolvedToday,
        byCategory,
        byPriority,
        byStatus,
        byCustomerStatus
      };
    } catch (err) {
      console.error("[Tickets] Error fetching stats:", err);
      return buildEmptyStats2();
    }
  }),
  /**
   * List all tickets with filters.
   * Supports recipientType filter: "support" (default) or "retention"
   */
  getTickets: protectedProcedure.input(
    z10.object({
      page: z10.number().default(1),
      perPage: z10.number().default(50),
      category: z10.string().optional(),
      priority: z10.string().optional(),
      status: z10.string().optional(),
      customerStatus: z10.string().optional(),
      search: z10.string().optional(),
      dateRange: z10.enum(["today", "7days", "30days", "all"]).default("all"),
      sortBy: z10.enum(["newest", "oldest", "priority"]).default("newest"),
      recipientType: z10.enum(["support", "retention"]).default("support")
    })
  ).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return { tickets: [], total: 0 };
    try {
      let rows = await db.select().from(supportTickets).orderBy(desc5(supportTickets.updatedAt), desc5(supportTickets.id));
      if (rows.length === 0) return { tickets: [], total: 0 };
      if (input.recipientType === "retention") {
        rows = rows.filter((r) => r.recipient && RETENTION_EMAILS.includes(r.recipient));
        if (ctx.user.role !== "admin") {
          const userEmail = getUserRetentionEmail(ctx.user.name);
          if (userEmail) {
            rows = rows.filter((r) => r.recipient === userEmail);
          } else {
            return { tickets: [], total: 0 };
          }
        }
      } else {
        rows = rows.filter((r) => !r.recipient || !RETENTION_EMAILS.includes(r.recipient));
      }
      let tickets = rows.map((row) => ({
        id: row.id,
        gmailEmailId: row.gmailEmailId,
        messageId: row.messageId,
        fromEmail: row.fromEmail,
        fromName: row.fromName ?? "",
        subject: row.subject ?? "(no subject)",
        body: row.body ?? "",
        receivedAt: row.receivedAt ? row.receivedAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        category: row.category,
        categoryLabel: CATEGORY_META[row.category]?.label ?? row.category,
        categoryMeta: CATEGORY_META[row.category] ?? CATEGORY_META.general_inquiry,
        priority: row.priority,
        customerStatus: row.customerStatus,
        status: row.status,
        assignedTo: row.assignedTo,
        notes: row.notes,
        recipient: row.recipient ?? null,
        agentLabel: row.recipient ? EMAIL_AGENT_MAP[row.recipient] ?? null : null,
        createdAt: row.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: row.updatedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
      }));
      if (input.category && input.category !== "all") {
        tickets = tickets.filter((t2) => t2.category === input.category);
      }
      if (input.priority && input.priority !== "all") {
        tickets = tickets.filter((t2) => t2.priority === input.priority);
      }
      if (input.status && input.status !== "all") {
        if (input.status === "active") {
          tickets = tickets.filter((t2) => t2.status !== "closed" && t2.status !== "resolved");
        } else {
          tickets = tickets.filter((t2) => t2.status === input.status);
        }
      }
      if (input.customerStatus && input.customerStatus !== "all") {
        tickets = tickets.filter((t2) => t2.customerStatus === input.customerStatus);
      }
      if (input.dateRange !== "all") {
        const now = Date.now();
        let cutoff;
        if (input.dateRange === "today") {
          const todayStart = /* @__PURE__ */ new Date();
          todayStart.setHours(0, 0, 0, 0);
          cutoff = todayStart.getTime();
        } else if (input.dateRange === "7days") {
          cutoff = now - 7 * 24 * 60 * 60 * 1e3;
        } else {
          cutoff = now - 30 * 24 * 60 * 60 * 1e3;
        }
        tickets = tickets.filter((t2) => new Date(t2.receivedAt).getTime() >= cutoff);
      }
      if (input.search) {
        const q = input.search.toLowerCase();
        tickets = tickets.filter(
          (t2) => t2.fromEmail.toLowerCase().includes(q) || t2.fromName.toLowerCase().includes(q) || t2.subject.toLowerCase().includes(q) || t2.body.toLowerCase().includes(q)
        );
      }
      if (input.sortBy === "oldest") {
        tickets.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      } else if (input.sortBy === "priority") {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        tickets.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
      }
      const total = tickets.length;
      const start = (input.page - 1) * input.perPage;
      const paged = tickets.slice(start, start + input.perPage);
      return { tickets: paged, total };
    } catch (err) {
      console.error("[Tickets] Error fetching tickets:", err);
      return { tickets: [], total: 0 };
    }
  }),
  /**
   * Get a single ticket by ID.
   */
  getTicket: protectedProcedure.input(z10.object({ id: z10.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    try {
      const rows = await db.select().from(supportTickets).where(eq10(supportTickets.id, input.id)).limit(1);
      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        id: row.id,
        gmailEmailId: row.gmailEmailId,
        messageId: row.messageId,
        fromEmail: row.fromEmail,
        fromName: row.fromName ?? "",
        subject: row.subject ?? "(no subject)",
        body: row.body ?? "",
        receivedAt: row.receivedAt ? row.receivedAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        category: row.category,
        categoryLabel: CATEGORY_META[row.category]?.label ?? row.category,
        categoryMeta: CATEGORY_META[row.category] ?? CATEGORY_META.general_inquiry,
        priority: row.priority,
        customerStatus: row.customerStatus,
        status: row.status,
        assignedTo: row.assignedTo,
        notes: row.notes,
        recipient: row.recipient ?? null,
        agentLabel: row.recipient ? EMAIL_AGENT_MAP[row.recipient] ?? null : null,
        createdAt: row.createdAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: row.updatedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (err) {
      console.error("[Tickets] Error fetching ticket:", err);
      return null;
    }
  }),
  /**
   * Update a ticket (status, assignedTo, notes).
   */
  updateTicket: protectedProcedure.input(
    z10.object({
      id: z10.number(),
      status: z10.enum(["open", "in_progress", "awaiting_response", "customer_replied", "resolved", "closed"]).optional(),
      assignedTo: z10.string().nullable().optional(),
      notes: z10.string().nullable().optional(),
      category: z10.string().optional(),
      priority: z10.enum(["HIGH", "MEDIUM", "LOW"]).optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const updateData = {};
    if (input.status !== void 0) updateData.status = input.status;
    if (input.assignedTo !== void 0) updateData.assignedTo = input.assignedTo;
    if (input.notes !== void 0) updateData.notes = input.notes;
    if (input.category !== void 0) updateData.category = input.category;
    if (input.priority !== void 0) updateData.priority = input.priority;
    if (Object.keys(updateData).length === 0) {
      return { success: true };
    }
    await db.update(supportTickets).set(updateData).where(eq10(supportTickets.id, input.id));
    return { success: true };
  }),
  /**
   * Get category metadata for the frontend.
   */
  getCategoryMeta: protectedProcedure.query(() => {
    return CATEGORY_META;
  }),
  /**
   * Get all replies for a ticket (conversation history).
   */
  getReplies: protectedProcedure.input(z10.object({ ticketId: z10.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    try {
      const replies = await db.select().from(supportTicketReplies).where(eq10(supportTicketReplies.ticketId, input.ticketId)).orderBy(asc(supportTicketReplies.sentAt));
      return replies.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        direction: r.direction,
        body: r.body,
        sentAt: r.sentAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
        sentBy: r.sentBy
      }));
    } catch (err) {
      console.error("[Tickets] Error fetching replies:", err);
      return [];
    }
  }),
  /**
   * Reply to a ticket — sends email via Postmark and saves the reply.
   * For retention tickets, sends FROM the agent's email address.
   * For support tickets, sends FROM trial@lavielabs.com.
   */
  replyToTicket: protectedProcedure.input(
    z10.object({
      ticketId: z10.number(),
      replyText: z10.string().min(1),
      attachments: z10.array(z10.object({
        filename: z10.string(),
        contentType: z10.string(),
        buffer: z10.string()
        // base64 encoded
      })).optional()
    })
  ).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [ticket] = await db.select().from(supportTickets).where(eq10(supportTickets.id, input.ticketId)).limit(1);
    if (!ticket) {
      throw new TRPCError5({ code: "NOT_FOUND", message: "Ticket not found" });
    }
    const agentName = ctx.user.name ?? "Lavie Labs Support";
    const toEmail = ticket.fromEmail;
    const subject = `Re: ${ticket.subject || "(no subject)"}`;
    let fromAddress = `Lavie Labs Support <trial@lavielabs.com>`;
    let replyToAddress = "trial@lavielabs.com";
    if (ticket.recipient && RETENTION_EMAILS.includes(ticket.recipient)) {
      const agentDisplayName = EMAIL_AGENT_MAP[ticket.recipient] ?? agentName;
      fromAddress = `${agentName} <${ticket.recipient}>`;
      replyToAddress = ticket.recipient;
    }
    const htmlBody = buildReplyEmailHtml({
      bodyText: input.replyText,
      agentName,
      customerName: ticket.fromName || toEmail
    });
    const emailAttachments = (input.attachments || []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.buffer, "base64"),
      contentType: a.contentType
    }));
    try {
      await sendViaGmail({
        from: fromAddress,
        to: toEmail,
        subject,
        htmlBody,
        textBody: `Hi ${(ticket.fromName || "").split(" ")[0] || "there"},

${input.replyText}

Warm regards,
${agentName}
Lavie Labs`,
        replyTo: replyToAddress,
        attachments: emailAttachments.length > 0 ? emailAttachments : void 0
      });
    } catch (err) {
      if (err instanceof TRPCError5) throw err;
      console.error("[Tickets] Email send failed:", err);
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to send email: ${err.message}`
      });
    }
    await db.insert(supportTicketReplies).values({
      ticketId: input.ticketId,
      direction: "outbound",
      body: input.replyText,
      sentBy: agentName
    });
    await db.update(supportTickets).set({ status: "awaiting_response" }).where(eq10(supportTickets.id, input.ticketId));
    return { success: true };
  }),
  // ─── Bulk Operations ──────────────────────────────────────────────────────
  bulkUpdateStatus: adminProcedure.input(z10.object({
    ticketIds: z10.array(z10.number()).min(1),
    status: z10.enum(["open", "in_progress", "awaiting_response", "customer_replied", "resolved", "closed"])
  })).mutation(async ({ input }) => {
    const db = await getDb();
    await db.update(supportTickets).set({ status: input.status }).where(inArray3(supportTickets.id, input.ticketIds));
    return { success: true, count: input.ticketIds.length };
  }),
  bulkAssign: adminProcedure.input(z10.object({
    ticketIds: z10.array(z10.number()).min(1),
    assignedTo: z10.string().nullable()
  })).mutation(async ({ input }) => {
    const db = await getDb();
    await db.update(supportTickets).set({ assignedTo: input.assignedTo }).where(inArray3(supportTickets.id, input.ticketIds));
    return { success: true, count: input.ticketIds.length };
  }),
  bulkDelete: adminProcedure.input(z10.object({
    ticketIds: z10.array(z10.number()).min(1)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    await db.delete(supportTicketReplies).where(inArray3(supportTicketReplies.ticketId, input.ticketIds));
    await db.delete(supportTickets).where(inArray3(supportTickets.id, input.ticketIds));
    return { success: true, count: input.ticketIds.length };
  }),
  // ─── Blocked Senders ────────────────────────────────────────────────────────
  /**
   * List all blocked senders.
   */
  listBlockedSenders: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(blockedSenders).orderBy(desc5(blockedSenders.blockedAt));
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      blockedAt: r.blockedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
      blockedBy: r.blockedBy
    }));
  }),
  /**
   * Block a sender email address.
   */
  blockSender: adminProcedure.input(z10.object({
    email: z10.string().email(),
    blockedBy: z10.string().min(1)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const existing = await db.select({ id: blockedSenders.id }).from(blockedSenders).where(eq10(blockedSenders.email, input.email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      throw new TRPCError5({ code: "CONFLICT", message: "This sender is already blocked" });
    }
    await db.insert(blockedSenders).values({
      email: input.email.toLowerCase(),
      blockedBy: input.blockedBy
    });
    return { success: true };
  }),
  /**
   * Unblock a sender (remove from blocked list).
   */
  unblockSender: adminProcedure.input(z10.object({ id: z10.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db.delete(blockedSenders).where(eq10(blockedSenders.id, input.id));
    return { success: true };
  }),
  // ─── Blocked Subjects ──────────────────────────────────────────────────────
  /**
   * List all blocked subject keywords.
   */
  listBlockedSubjects: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(blockedSubjects).orderBy(desc5(blockedSubjects.blockedAt));
    return rows.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      blockedAt: r.blockedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
      blockedBy: r.blockedBy
    }));
  }),
  /**
   * Block a subject keyword.
   */
  blockSubject: adminProcedure.input(z10.object({
    keyword: z10.string().min(1),
    blockedBy: z10.string().min(1)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const existing = await db.select({ id: blockedSubjects.id }).from(blockedSubjects).where(eq10(blockedSubjects.keyword, input.keyword.toLowerCase())).limit(1);
    if (existing.length > 0) {
      throw new TRPCError5({ code: "CONFLICT", message: "This subject keyword is already blocked" });
    }
    await db.insert(blockedSubjects).values({
      keyword: input.keyword.toLowerCase(),
      blockedBy: input.blockedBy
    });
    return { success: true };
  }),
  /**
   * Unblock a subject keyword.
   */
  unblockSubject: adminProcedure.input(z10.object({ id: z10.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db.delete(blockedSubjects).where(eq10(blockedSubjects.id, input.id));
    return { success: true };
  })
});
function buildReplyEmailHtml(opts) {
  const HEADER_IMAGE_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663435925457/reKWqPefnHZHXJpv.png";
  const formattedBody = opts.bodyText.replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr><td style="padding:0;"><img src="${HEADER_IMAGE_URL}" alt="Lavie Labs" style="width:100%;height:auto;display:block;" /></td></tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">Hi ${opts.customerName.split(" ")[0] || "there"},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${formattedBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555555;">Should you need anything please don't hesitate to respond to this email.</p>
              <p style="margin:0;font-size:15px;color:#333333;">Warm regards,<br/><strong>${opts.agentName}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// server/routers/openingDashboard.ts
import { z as z11 } from "zod";
init_schema();
import { eq as eq11, and as and6, gte as gte4, lte as lte4, sql as sql6, inArray as inArray4 } from "drizzle-orm";
var DATE_RANGE_OPTIONS = [
  "all",
  "today",
  "yesterday",
  "this_week",
  "last_7_days",
  "this_month",
  "previous_month",
  "last_month",
  "last_3_months",
  "custom"
];
function getDateRange2(range, customDateFrom, customDateTo) {
  if (range === "all") return null;
  const now = /* @__PURE__ */ new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1e3 - 1);
  switch (range) {
    case "today":
      return { from: startOfToday, to: endOfToday };
    case "yesterday": {
      const yStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1e3);
      const yEnd = new Date(startOfToday.getTime() - 1);
      return { from: yStart, to: yEnd };
    }
    case "this_week": {
      const dayOfWeek = now.getDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mondayStart = new Date(startOfToday.getTime() - daysSinceMonday * 24 * 60 * 60 * 1e3);
      return { from: mondayStart, to: endOfToday };
    }
    case "last_7_days": {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1e3);
      return { from: sevenDaysAgo, to: endOfToday };
    }
    case "this_month": {
      return null;
    }
    case "previous_month":
    case "last_month": {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: lastMonthStart, to: lastMonthEnd };
    }
    case "last_3_months": {
      const threeMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: threeMonthsAgoStart, to: endOfToday };
    }
    case "custom": {
      if (!customDateFrom || !customDateTo) return null;
      const [fy, fm, fd] = customDateFrom.split("-").map(Number);
      const [ty, tm, td] = customDateTo.split("-").map(Number);
      const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
      const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
      return { from, to };
    }
    default:
      return null;
  }
}
function calculateWorkingDaysFromHours(totalHours) {
  return totalHours / 8;
}
var NON_OPENING_AGENTS = /* @__PURE__ */ new Set([
  "rob",
  // Rob Chidzik — Retention agent
  "guy",
  // Guy — Retention agent
  "james",
  // James Huxley — Retention agent
  "julie ann",
  // Julie Ann Relox — not an opening agent
  "muhammad",
  // Muhammad Usama Waheed — not an opening agent
  "wendy"
  // Wendy Calderon — not an opening agent
]);
var HUBSTAFF_TO_TRIALS_MAP = {
  "Alan Churchman": "Alan",
  "Ana Alipat": "Ana",
  "Angel Breheny": "Angel",
  "Ashleigh Walker": "Ashley",
  "Ava Monroe": "Ava",
  "Carl Bennett": "Carl",
  "Daniel Parker": "Daniel",
  "Darrell Loynes": "Darrel",
  "Debbie Forbes": "Debbie",
  "Dee Richards": "Dee",
  "Harrison Joslin": "Harrison",
  "Julie Ann Relox": "Julie Ann",
  "Matthew Holman": "Matt",
  "Muhammad Usama Waheed": "Muhammad",
  "Paige Taylor": "Paige",
  "Rob Chidzik": "Rob",
  "Shola Marie": "Shola",
  "Sophie Rose": "Sophie",
  "Wendy Calderon": "Wendy"
};
function buildTrialsToHubstaffMap() {
  const map = /* @__PURE__ */ new Map();
  for (const [hubstaffName, trialsName] of Object.entries(HUBSTAFF_TO_TRIALS_MAP)) {
    const key = trialsName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(hubstaffName);
  }
  return map;
}
var TRIALS_TO_HUBSTAFF_MAP = buildTrialsToHubstaffMap();
function getHubstaffNamesForTrialsAgent(trialsAgentName) {
  const mapped = TRIALS_TO_HUBSTAFF_MAP.get(trialsAgentName.toLowerCase());
  if (mapped && mapped.length > 0) {
    return mapped;
  }
  return [trialsAgentName];
}
var dateRangeInput = z11.enum(DATE_RANGE_OPTIONS).optional().default("all");
var openingDashboardRouter = router({
  /**
   * Get aggregated agent performance data for a given month.
   * Groups opening_trials by agent_name and counts each classification.
   * Joins with agent_daily_hours (preferred) or agent_working_days (fallback)
   * to get working days.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   * When a dateRange is active, working days are also filtered to that date range
   * using agent_daily_hours.
   *
   * Optional agentName filter narrows results to a single agent.
   */
  getAgentData: protectedProcedure.input(z11.object({
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    dateRange: dateRangeInput,
    customDateFrom: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    customDateTo: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    agentName: z11.string().optional(),
    agentNames: z11.array(z11.string()).optional()
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { agents: [], month: input.month };
    }
    const conditions = [eq11(openingTrials.month, input.month)];
    const dateWindow = getDateRange2(input.dateRange, input.customDateFrom, input.customDateTo);
    if (dateWindow) {
      conditions.push(gte4(openingTrials.createdDate, dateWindow.from));
      conditions.push(lte4(openingTrials.createdDate, dateWindow.to));
    }
    if (input.agentNames && input.agentNames.length > 0) {
      conditions.push(inArray4(openingTrials.agentName, input.agentNames));
    } else if (input.agentName && input.agentName !== "all") {
      conditions.push(eq11(openingTrials.agentName, input.agentName));
    }
    const trialRows = await db.select({
      agentName: openingTrials.agentName,
      classification: openingTrials.classification,
      count: sql6`COUNT(*)`.as("count")
    }).from(openingTrials).where(and6(...conditions)).groupBy(openingTrials.agentName, openingTrials.classification);
    const monthYear = input.month;
    const [year, monthNum] = monthYear.split("-").map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0);
    let dailyHoursFrom;
    let dailyHoursTo;
    if (dateWindow) {
      dailyHoursFrom = dateWindow.from;
      dailyHoursTo = dateWindow.to;
    } else {
      dailyHoursFrom = monthStart;
      dailyHoursTo = monthEnd;
    }
    let dailyHoursRows = [];
    try {
      dailyHoursRows = await db.select({
        agentName: agentDailyHours.agentName,
        totalWorkingDays: sql6`SUM(${agentDailyHours.workingDayValue})`.as("totalWorkingDays")
      }).from(agentDailyHours).where(and6(
        gte4(agentDailyHours.date, dailyHoursFrom),
        lte4(agentDailyHours.date, dailyHoursTo)
      )).groupBy(agentDailyHours.agentName);
    } catch (err) {
      console.warn("[openingDashboard] agent_daily_hours query failed, using legacy fallback:", err);
    }
    const dailyHoursMap = /* @__PURE__ */ new Map();
    for (const row of dailyHoursRows) {
      dailyHoursMap.set(row.agentName, parseFloat(row.totalWorkingDays || "0"));
    }
    const workRows = await db.select({
      agentName: agentWorkingDays.agentName,
      totalHours: sql6`SUM(${agentWorkingDays.hours})`.as("totalHours")
    }).from(agentWorkingDays).where(eq11(agentWorkingDays.month, input.month)).groupBy(agentWorkingDays.agentName);
    const legacyHoursMap = /* @__PURE__ */ new Map();
    for (const row of workRows) {
      legacyHoursMap.set(row.agentName, parseFloat(row.totalHours || "0"));
    }
    const todayStart = /* @__PURE__ */ new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = /* @__PURE__ */ new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayConditions = [
      gte4(openingTrials.createdDate, todayStart),
      lte4(openingTrials.createdDate, todayEnd)
    ];
    if (input.agentNames && input.agentNames.length > 0) {
      todayConditions.push(inArray4(openingTrials.agentName, input.agentNames));
    } else if (input.agentName && input.agentName !== "all") {
      todayConditions.push(eq11(openingTrials.agentName, input.agentName));
    }
    const todayRows = await db.select({
      agentName: openingTrials.agentName,
      count: sql6`COUNT(*)`.as("count")
    }).from(openingTrials).where(and6(...todayConditions)).groupBy(openingTrials.agentName);
    const todayCountMap = /* @__PURE__ */ new Map();
    for (const row of todayRows) {
      todayCountMap.set(row.agentName, Number(row.count));
    }
    const agentMap = /* @__PURE__ */ new Map();
    function toTitleCase(name) {
      return name.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }
    function ensureAgent(name) {
      const key = name.toLowerCase();
      if (!agentMap.has(key)) {
        agentMap.set(key, {
          agentName: toTitleCase(name),
          // normalised display name
          trials: 0,
          stillInTrial: 0,
          matured: 0,
          live: 0,
          saved: 0,
          cancelledAfterPayment: 0,
          cancelledBeforePayment: 0,
          dunning: 0,
          futureDeal: 0,
          workingDays: 0,
          dailyOpenings: 0
        });
      }
      return agentMap.get(key);
    }
    const TRIALS_NAME_FOR_HUBSTAFF = Object.fromEntries(
      Object.entries(HUBSTAFF_TO_TRIALS_MAP)
    );
    for (const row of dailyHoursRows) {
      const trialsName = TRIALS_NAME_FOR_HUBSTAFF[row.agentName] ?? row.agentName;
      if (NON_OPENING_AGENTS.has(trialsName.toLowerCase())) continue;
      if (input.agentNames && input.agentNames.length > 0) {
        if (!input.agentNames.some((n) => n.toLowerCase() === trialsName.toLowerCase())) continue;
      } else if (input.agentName && input.agentName !== "all" && trialsName.toLowerCase() !== input.agentName.toLowerCase()) continue;
      ensureAgent(trialsName);
    }
    for (const row of trialRows) {
      if (NON_OPENING_AGENTS.has(row.agentName.toLowerCase())) continue;
      ensureAgent(row.agentName);
      const agent = agentMap.get(row.agentName.toLowerCase());
      const count3 = Number(row.count);
      agent.trials += count3;
      switch (row.classification) {
        case "still_in_trial":
          agent.stillInTrial += count3;
          break;
        case "live":
          agent.live += count3;
          break;
        case "saved_by_retention":
          agent.saved += count3;
          break;
        case "cancelled_after_payment":
          agent.cancelledAfterPayment += count3;
          break;
        case "cancelled_before_payment":
          agent.cancelledBeforePayment += count3;
          break;
        case "dunning":
          agent.dunning += count3;
          break;
        case "future_deal":
          agent.futureDeal += count3;
          break;
      }
    }
    Array.from(agentMap.values()).forEach((agent) => {
      const displayName = agent.agentName;
      agent.matured = agent.trials - agent.stillInTrial;
      agent.dailyOpenings = todayCountMap.get(displayName) ?? todayCountMap.get(displayName.toLowerCase()) ?? 0;
      const hubstaffNames = getHubstaffNamesForTrialsAgent(displayName);
      ;
      let dailyWorkingDays = 0;
      let foundInDailyTable = false;
      for (const hubstaffName of hubstaffNames) {
        const days = dailyHoursMap.get(hubstaffName);
        if (days !== void 0) {
          dailyWorkingDays += days;
          foundInDailyTable = true;
        }
      }
      if (foundInDailyTable) {
        agent.workingDays = Math.round(dailyWorkingDays * 100) / 100;
      } else if (dateWindow) {
        agent.workingDays = 1;
      } else {
        const legacyHours = legacyHoursMap.get(displayName) || legacyHoursMap.get(displayName.toLowerCase()) || 0;
        agent.workingDays = calculateWorkingDaysFromHours(legacyHours);
      }
    });
    if (input.dateRange === "all" || input.dateRange === "this_month") {
      let overrideRows = [];
      try {
        overrideRows = await db.select({
          agentName: agentTrialsOverride.agentName,
          trialsCount: agentTrialsOverride.trialsCount,
          dbCountAtOverride: agentTrialsOverride.dbCountAtOverride
        }).from(agentTrialsOverride).where(eq11(agentTrialsOverride.month, input.month));
      } catch (err) {
        console.warn("[openingDashboard] agent_trials_override query failed:", err);
      }
      for (const ov of overrideRows) {
        const key = ov.agentName.toLowerCase();
        const agent = agentMap.get(key);
        if (agent) {
          const bonus = ov.trialsCount - ov.dbCountAtOverride;
          agent.trials = agent.trials + bonus;
          agent.matured = agent.trials - agent.stillInTrial;
        }
      }
    }
    const agents = Array.from(agentMap.values());
    return { agents, month: input.month };
  }),
  /**
   * Get all customers for a specific month and classification across all agents.
   * Used for the summary cards at the top of the dashboard.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   *
   * Optional agentName filter narrows results to a single agent.
   */
  getCustomersByClassification: protectedProcedure.input(z11.object({
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    classification: z11.string().min(1),
    dateRange: dateRangeInput,
    customDateFrom: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    customDateTo: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    agentName: z11.string().optional(),
    agentNames: z11.array(z11.string()).optional()
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { customers: [] };
    }
    const dateWindow = getDateRange2(input.dateRange, input.customDateFrom, input.customDateTo);
    const dateConditions = dateWindow ? [gte4(openingTrials.createdDate, dateWindow.from), lte4(openingTrials.createdDate, dateWindow.to)] : [];
    const agentConditions = input.agentNames && input.agentNames.length > 0 ? [inArray4(openingTrials.agentName, input.agentNames)] : input.agentName && input.agentName !== "all" ? [eq11(openingTrials.agentName, input.agentName)] : [];
    let condition;
    if (input.classification === "matured_all") {
      condition = and6(
        eq11(openingTrials.month, input.month),
        sql6`${openingTrials.classification} != 'still_in_trial'`,
        ...dateConditions,
        ...agentConditions
      );
    } else if (input.classification === "converted_all") {
      condition = and6(
        eq11(openingTrials.month, input.month),
        sql6`${openingTrials.classification} IN ('live', 'saved_by_retention', 'cancelled_after_payment')`,
        ...dateConditions,
        ...agentConditions
      );
    } else {
      condition = and6(
        eq11(openingTrials.month, input.month),
        eq11(openingTrials.classification, input.classification),
        ...dateConditions,
        ...agentConditions
      );
    }
    const rows = await db.select({
      subscriptionId: openingTrials.subscriptionId,
      customerName: openingTrials.customerName,
      email: openingTrials.email,
      planName: openingTrials.planName,
      createdDate: openingTrials.createdDate,
      status: openingTrials.status,
      classification: openingTrials.classification,
      agentName: openingTrials.agentName
    }).from(openingTrials).where(condition);
    const customers = rows.map((r) => ({
      subscriptionId: r.subscriptionId,
      customerName: r.customerName,
      email: r.email ?? null,
      planName: r.planName,
      createdDate: String(r.createdDate),
      status: r.status,
      classification: r.classification,
      agentName: r.agentName
    }));
    return { customers };
  }),
  /**
   * Get individual customer details for a specific agent, month, and classification.
   * Used when clicking on a category count (e.g., "Live Sub: 10") to see the customer list.
   *
   * Optional dateRange filter narrows results to trials created within the
   * specified date window (AND-ed with the month filter).
   */
  getCustomerDetails: protectedProcedure.input(z11.object({
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    agentName: z11.string().min(1),
    classification: z11.string().min(1),
    dateRange: dateRangeInput,
    customDateFrom: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    customDateTo: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { customers: [] };
    }
    const conditions = [
      eq11(openingTrials.month, input.month),
      eq11(openingTrials.agentName, input.agentName)
    ];
    if (input.classification !== "all_trials") {
      conditions.push(eq11(openingTrials.classification, input.classification));
    }
    const dateWindow = getDateRange2(input.dateRange, input.customDateFrom, input.customDateTo);
    if (dateWindow) {
      conditions.push(gte4(openingTrials.createdDate, dateWindow.from));
      conditions.push(lte4(openingTrials.createdDate, dateWindow.to));
    }
    const rows = await db.select({
      subscriptionId: openingTrials.subscriptionId,
      customerName: openingTrials.customerName,
      email: openingTrials.email,
      planName: openingTrials.planName,
      createdDate: openingTrials.createdDate,
      status: openingTrials.status,
      classification: openingTrials.classification
    }).from(openingTrials).where(and6(...conditions));
    const customers = rows.map((r) => ({
      subscriptionId: r.subscriptionId,
      customerName: r.customerName,
      email: r.email ?? null,
      planName: r.planName,
      createdDate: String(r.createdDate),
      status: r.status,
      classification: r.classification
    }));
    return { customers };
  }),
  /**
   * Get available months that have data in the opening_trials table.
   * Used to populate the timeline dropdown.
   */
  getAvailableMonths: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { months: [] };
    }
    const rows = await db.selectDistinct({ month: openingTrials.month }).from(openingTrials).orderBy(openingTrials.month);
    const months = rows.map((r) => r.month).filter((m) => m >= "2026-04");
    return { months };
  }),
  /**
   * Get distinct agent names from opening_trials for the agent filter dropdown.
   * Excludes non-opening agents (retention, support, etc.).
   */
  getAgentNames: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { agents: [] };
    }
    const rows = await db.selectDistinct({ agentName: openingTrials.agentName }).from(openingTrials).orderBy(openingTrials.agentName);
    const agents = rows.map((r) => r.agentName).filter((name) => name && name.trim() !== "" && !NON_OPENING_AGENTS.has(name.toLowerCase())).map(
      (name) => name.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    );
    return { agents: [...new Set(agents)] };
  }),
  // ─── Admin: Agent Daily Hours CRUD ──────────────────────────────────────────
  /**
   * Get all daily hours entries for an agent in a given month.
   * Admin-only. Uses the Hubstaff full name (from agent_daily_hours table).
   */
  getAgentDailyHours: adminProcedure.input(z11.object({
    agentName: z11.string().min(1),
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { days: [] };
    }
    const hubstaffNames = getHubstaffNamesForTrialsAgent(input.agentName);
    const [year, monthNum] = input.month.split("-").map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0);
    const rows = await db.select({
      id: agentDailyHours.id,
      agentName: agentDailyHours.agentName,
      date: agentDailyHours.date,
      hoursTracked: agentDailyHours.hoursTracked,
      workingDayValue: agentDailyHours.workingDayValue
    }).from(agentDailyHours).where(and6(
      sql6`${agentDailyHours.agentName} IN (${sql6.join(hubstaffNames.map((n) => sql6`${n}`), sql6`, `)})`,
      gte4(agentDailyHours.date, monthStart),
      lte4(agentDailyHours.date, monthEnd)
    )).orderBy(agentDailyHours.date);
    const days = rows.map((r) => ({
      id: r.id,
      agentName: r.agentName,
      date: String(r.date),
      hoursTracked: parseFloat(String(r.hoursTracked)),
      workingDayValue: parseFloat(String(r.workingDayValue))
    }));
    const hubstaffName = hubstaffNames[0] || input.agentName;
    return { days, hubstaffName };
  }),
  /**
   * Add or update a day's hours for an agent.
   * Admin-only. Auto-calculates working_day_value.
   * Uses Hubstaff full name (agent_daily_hours.agent_name).
   */
  upsertAgentDailyHours: adminProcedure.input(z11.object({
    agentName: z11.string().min(1),
    date: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    hoursTracked: z11.number().min(0).max(24)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const workingDayValue = input.hoursTracked >= 7 ? 1 : Math.round(input.hoursTracked / 8 * 100) / 100;
    await db.execute(sql6`
        INSERT INTO agent_daily_hours (agent_name, date, hours_tracked, working_day_value)
        VALUES (${input.agentName}, ${input.date}, ${input.hoursTracked.toFixed(2)}, ${workingDayValue.toFixed(2)})
        ON DUPLICATE KEY UPDATE
          hours_tracked = VALUES(hours_tracked),
          working_day_value = VALUES(working_day_value)
      `);
    return { success: true, workingDayValue };
  }),
  /**
   * Delete a specific day entry from agent_daily_hours.
   * Admin-only.
   */
  deleteAgentDailyHours: adminProcedure.input(z11.object({
    id: z11.number().int().positive()
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    await db.delete(agentDailyHours).where(eq11(agentDailyHours.id, input.id));
    return { success: true };
  }),
  // ─── Admin: Agent Trials Override CRUD ───────────────────────────────────────────
  /**
   * Get the trials override for a specific agent and month.
   * Admin-only. Returns the override row if it exists, or null.
   */
  getTrialsOverride: adminProcedure.input(z11.object({
    agentName: z11.string().min(1),
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { override: null };
    }
    const rows = await db.select({
      id: agentTrialsOverride.id,
      agentName: agentTrialsOverride.agentName,
      month: agentTrialsOverride.month,
      trialsCount: agentTrialsOverride.trialsCount,
      updatedAt: agentTrialsOverride.updatedAt
    }).from(agentTrialsOverride).where(and6(
      eq11(agentTrialsOverride.agentName, input.agentName),
      eq11(agentTrialsOverride.month, input.month)
    ));
    return { override: rows.length > 0 ? rows[0] : null };
  }),
  /**
   * Insert or update a trials override for an agent+month.
   * Admin-only. Uses ON DUPLICATE KEY UPDATE on the unique (agent_name, month) constraint.
   */
  upsertTrialsOverride: adminProcedure.input(z11.object({
    agentName: z11.string().min(1),
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    trialsCount: z11.number().int().min(0)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const [countRow] = await db.select({ count: sql6`COUNT(*)` }).from(openingTrials).where(and6(
      eq11(openingTrials.agentName, input.agentName),
      eq11(openingTrials.month, input.month)
    ));
    const dbCountNow = Number(countRow?.count ?? 0);
    await db.execute(sql6`
        INSERT INTO agent_trials_override (agent_name, month, trials_count, db_count_at_override)
        VALUES (${input.agentName}, ${input.month}, ${input.trialsCount}, ${dbCountNow})
        ON DUPLICATE KEY UPDATE
          trials_count = VALUES(trials_count),
          db_count_at_override = VALUES(db_count_at_override)
      `);
    return { success: true };
  }),
  /**
   * Delete a trials override for an agent+month, reverting to Zoho data.
   * Admin-only.
   */
  deleteTrialsOverride: adminProcedure.input(z11.object({
    agentName: z11.string().min(1),
    month: z11.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    await db.delete(agentTrialsOverride).where(and6(
      eq11(agentTrialsOverride.agentName, input.agentName),
      eq11(agentTrialsOverride.month, input.month)
    ));
    return { success: true };
  })
});

// server/routers/users.ts
import { z as z12 } from "zod";
init_schema();
import { eq as eq12 } from "drizzle-orm";
import { TRPCError as TRPCError6 } from "@trpc/server";
var usersRouter = router({
  /**
   * List all users — admin only.
   * Returns id, name, email, role, active, team, createdAt, lastSignedIn.
   */
  getUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      team: users.team,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn
    }).from(users).orderBy(users.id);
    return allUsers;
  }),
  /**
   * Toggle the active/enabled status of a user — admin only.
   * Prevents admins from disabling themselves.
   */
  toggleUserAccess: adminProcedure.input(z12.object({ userId: z12.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    if (input.userId === ctx.user.id) {
      throw new TRPCError6({ code: "BAD_REQUEST", message: "You cannot disable your own account" });
    }
    const [target] = await db.select({ id: users.id, active: users.active }).from(users).where(eq12(users.id, input.userId)).limit(1);
    if (!target) {
      throw new TRPCError6({ code: "NOT_FOUND", message: "User not found" });
    }
    const newActive = !target.active;
    await db.update(users).set({ active: newActive }).where(eq12(users.id, input.userId));
    return { success: true, active: newActive };
  }),
  /**
   * Add a new user — admin only.
   * Creates a user with a placeholder openId (pending_<email>).
   * If a user with that email already exists, returns an error.
   */
  addUser: adminProcedure.input(
    z12.object({
      name: z12.string().optional(),
      email: z12.string().email(),
      role: z12.enum(["user", "admin"]),
      team: z12.enum(["opening", "retention", "academy"]).optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const [existing] = await db.select({ id: users.id }).from(users).where(eq12(users.email, input.email)).limit(1);
    if (existing) {
      throw new TRPCError6({
        code: "CONFLICT",
        message: "A user with this email already exists"
      });
    }
    const placeholderOpenId = `pending_${input.email}`;
    await db.insert(users).values({
      openId: placeholderOpenId,
      name: input.name || null,
      email: input.email,
      role: input.role,
      team: input.team || null,
      active: true,
      loginMethod: "clerk"
    });
    return { success: true };
  }),
  /**
   * Update a user's name, role, and team — admin only.
   */
  updateUser: adminProcedure.input(
    z12.object({
      userId: z12.number(),
      name: z12.string().optional(),
      role: z12.enum(["user", "admin"]).optional(),
      team: z12.enum(["opening", "retention", "academy"]).nullable().optional()
    })
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const [target] = await db.select({ id: users.id }).from(users).where(eq12(users.id, input.userId)).limit(1);
    if (!target) {
      throw new TRPCError6({ code: "NOT_FOUND", message: "User not found" });
    }
    const updates = {};
    if (input.name !== void 0) updates.name = input.name || null;
    if (input.role !== void 0) updates.role = input.role;
    if (input.team !== void 0) updates.team = input.team;
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq12(users.id, input.userId));
    }
    return { success: true };
  }),
  /**
   * Delete a user permanently — admin only.
   * Prevents admins from deleting themselves.
   */
  deleteUser: adminProcedure.input(z12.object({ userId: z12.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    if (input.userId === ctx.user.id) {
      throw new TRPCError6({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
    }
    const [target] = await db.select({ id: users.id }).from(users).where(eq12(users.id, input.userId)).limit(1);
    if (!target) {
      throw new TRPCError6({ code: "NOT_FOUND", message: "User not found" });
    }
    await db.delete(users).where(eq12(users.id, input.userId));
    return { success: true };
  })
});

// server/routers/whatsapp.ts
import { z as z13 } from "zod";
import { TRPCError as TRPCError7 } from "@trpc/server";
init_schema();
import { eq as eq13, and as and8, desc as desc6, sql as sql7, count as count2 } from "drizzle-orm";
var whatsappRouter = router({
  // ─── List available WhatsApp templates from Twilio Content API ─────────────
  // Opening: only "op_" or "OP:" prefixed templates
  // Retention: "rt_" or "RT:" prefixed + any template without a known prefix (legacy)
  // No team: sees everything
  templates: protectedProcedure.query(async ({ ctx }) => {
    try {
      const templates = await listWhatsAppTemplates();
      const userTeam = ctx.user.team;
      if (!userTeam) {
        return templates;
      }
      const allKnownPrefixes = ["op_", "OP:", "rt_", "RT:"];
      const hasKnownPrefix = (name) => allKnownPrefixes.some((p) => name.startsWith(p));
      if (userTeam === "opening" || userTeam === "academy") {
        return templates.filter(
          (t2) => t2.friendly_name.startsWith("op_") || t2.friendly_name.startsWith("OP:")
        );
      }
      if (userTeam === "retention") {
        return templates.filter(
          (t2) => t2.friendly_name.startsWith("rt_") || t2.friendly_name.startsWith("RT:") || !hasKnownPrefix(t2.friendly_name)
        );
      }
      return templates;
    } catch (err) {
      console.error("[WhatsApp] Failed to fetch templates:", err);
      throw new TRPCError7({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch WhatsApp templates from Twilio"
      });
    }
  }),
  // ─── Send a WhatsApp message to a contact using a template ─────────────────
  send: protectedProcedure.input(
    z13.object({
      contactId: z13.number(),
      contentSid: z13.string().min(1),
      templateName: z13.string().optional()
    })
  ).mutation(async ({ input, ctx }) => {
    const { contactId, contentSid, templateName } = input;
    const contact = await getContact(contactId);
    if (!contact) {
      throw new TRPCError7({
        code: "NOT_FOUND",
        message: "Contact not found"
      });
    }
    if (!contact.phone) {
      throw new TRPCError7({
        code: "BAD_REQUEST",
        message: "Contact does not have a phone number"
      });
    }
    const normalisedPhone = normalisePhone(contact.phone);
    if (!normalisedPhone) {
      throw new TRPCError7({
        code: "BAD_REQUEST",
        message: "Could not normalise contact phone number"
      });
    }
    const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;
    const customerFirstName = (contact.name ?? "").split(" ")[0] || "there";
    const agentFirstName = (contact.agentName ?? ctx.user.name ?? "").split(" ")[0] || "Lavie Labs";
    try {
      const result = await sendWhatsAppMessage({
        to: e164Phone,
        contentSid,
        contentVariables: {
          "1": customerFirstName,
          "2": agentFirstName
        }
      });
      console.log(
        `[WhatsApp] Message sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${result.sid}`
      );
      const db = await getDb();
      if (db) {
        try {
          const resolvedBody = await fetchTemplateBody(contentSid, {
            "1": customerFirstName,
            "2": agentFirstName
          });
          const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");
          await db.insert(whatsappMessages).values({
            contactId,
            direction: "outbound",
            body: resolvedBody,
            templateName: templateName || contentSid,
            sentByUserId: ctx.user.id,
            fromNumber,
            toNumber: e164Phone,
            twilioMessageSid: result.sid,
            status: "sent",
            isRead: true
            // Outbound messages are always "read"
          });
          console.log(`[WhatsApp] Outbound message saved to DB \u2014 contact #${contactId}, SID: ${result.sid}, body: "${resolvedBody.substring(0, 60)}..."`);
        } catch (dbErr) {
          console.error("[WhatsApp] Failed to save outbound message to DB:", dbErr);
        }
      }
      return {
        success: true,
        messageSid: result.sid,
        status: result.status
      };
    } catch (err) {
      console.error("[WhatsApp] Send error:", err);
      throw new TRPCError7({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to send WhatsApp message: ${err.message}`
      });
    }
  }),
  // ─── Conversations: list contacts with WhatsApp messages ───────────────────
  // Returns contacts grouped with latest message and unread count.
  // Managers (no team) see ALL conversations.
  // Agents (with team) see conversations assigned to them, OR conversations where
  // they are the sentByUserId and no assignment exists.
  conversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const seesAll = !ctx.user.team;
    const userId = ctx.user.id;
    const allMessages = await db.select({
      contactId: whatsappMessages.contactId
    }).from(whatsappMessages);
    const allContactIds = Array.from(new Set(allMessages.map((m) => m.contactId)));
    if (allContactIds.length === 0) {
      return [];
    }
    let contactIds = allContactIds;
    if (!seesAll) {
      const assignments = await db.select({
        contactId: whatsappConversationAssignments.contactId,
        assignedUserId: whatsappConversationAssignments.assignedUserId,
        id: whatsappConversationAssignments.id
      }).from(whatsappConversationAssignments).orderBy(desc6(whatsappConversationAssignments.createdAt));
      const assignmentMap = /* @__PURE__ */ new Map();
      for (const a of assignments) {
        if (!assignmentMap.has(a.contactId)) {
          assignmentMap.set(a.contactId, a.assignedUserId);
        }
      }
      const agentMessages = await db.select({
        contactId: whatsappMessages.contactId
      }).from(whatsappMessages).where(eq13(whatsappMessages.sentByUserId, userId));
      const agentContactIds = new Set(agentMessages.map((m) => m.contactId));
      contactIds = allContactIds.filter((cId) => {
        if (cId === null) {
          return agentContactIds.has(null);
        }
        const assignedTo = assignmentMap.get(cId);
        if (assignedTo !== void 0) {
          return assignedTo === userId;
        }
        return agentContactIds.has(cId);
      });
    }
    if (contactIds.length === 0) {
      return [];
    }
    const conversations = [];
    for (const contactId of contactIds) {
      const whereClause = contactId !== null ? eq13(whatsappMessages.contactId, contactId) : sql7`${whatsappMessages.contactId} IS NULL`;
      const [latestMessage] = await db.select().from(whatsappMessages).where(whereClause).orderBy(desc6(whatsappMessages.createdAt)).limit(1);
      if (!latestMessage) continue;
      const unreadConditions = contactId !== null ? and8(
        eq13(whatsappMessages.contactId, contactId),
        eq13(whatsappMessages.direction, "inbound"),
        eq13(whatsappMessages.isRead, false)
      ) : and8(
        sql7`${whatsappMessages.contactId} IS NULL`,
        eq13(whatsappMessages.direction, "inbound"),
        eq13(whatsappMessages.isRead, false)
      );
      const [unreadResult] = await db.select({ count: count2() }).from(whatsappMessages).where(unreadConditions);
      const unreadCount = unreadResult?.count ?? 0;
      let contactInfo = null;
      if (contactId) {
        const [contact] = await db.select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          email: contacts.email,
          status: contacts.status,
          agentName: contacts.agentName
        }).from(contacts).where(eq13(contacts.id, contactId)).limit(1);
        contactInfo = contact || null;
      }
      conversations.push({
        contactId,
        contact: contactInfo,
        lastMessage: {
          id: latestMessage.id,
          direction: latestMessage.direction,
          body: latestMessage.body,
          status: latestMessage.status,
          createdAt: latestMessage.createdAt
        },
        unreadCount,
        // For unmatched messages, use the fromNumber as identifier
        fromNumber: latestMessage.direction === "inbound" ? latestMessage.fromNumber : latestMessage.toNumber
      });
    }
    conversations.sort((a, b) => {
      const dateA = new Date(a.lastMessage.createdAt).getTime();
      const dateB = new Date(b.lastMessage.createdAt).getTime();
      return dateB - dateA;
    });
    return conversations;
  }),
  // ─── Messages: get all messages for a specific contact ─────────────────────
  messages: protectedProcedure.input(
    z13.object({
      contactId: z13.number().nullable()
    })
  ).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const { contactId } = input;
    let whereClause;
    if (contactId !== null) {
      whereClause = eq13(whatsappMessages.contactId, contactId);
    } else {
      whereClause = sql7`${whatsappMessages.contactId} IS NULL`;
    }
    const messages = await db.select().from(whatsappMessages).where(whereClause).orderBy(whatsappMessages.createdAt);
    return messages;
  }),
  // ─── Mark as Read: mark all inbound messages for a contact as read ─────────
  markAsRead: protectedProcedure.input(
    z13.object({
      contactId: z13.number().nullable()
    })
  ).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const { contactId } = input;
    let whereClause;
    if (contactId !== null) {
      whereClause = and8(
        eq13(whatsappMessages.contactId, contactId),
        eq13(whatsappMessages.direction, "inbound"),
        eq13(whatsappMessages.isRead, false)
      );
    } else {
      whereClause = and8(
        sql7`${whatsappMessages.contactId} IS NULL`,
        eq13(whatsappMessages.direction, "inbound"),
        eq13(whatsappMessages.isRead, false)
      );
    }
    await db.update(whatsappMessages).set({ isRead: true }).where(whereClause);
    return { success: true };
  }),
  // ─── Send free-text WhatsApp reply (within 24h conversation window) ─────────
  sendFreeText: protectedProcedure.input(
    z13.object({
      contactId: z13.number(),
      body: z13.string().min(1).max(4096)
    })
  ).mutation(async ({ input, ctx }) => {
    const { contactId, body } = input;
    const contact = await getContact(contactId);
    if (!contact) {
      throw new TRPCError7({
        code: "NOT_FOUND",
        message: "Contact not found"
      });
    }
    if (!contact.phone) {
      throw new TRPCError7({
        code: "BAD_REQUEST",
        message: "Contact does not have a phone number"
      });
    }
    const normalisedPhone = normalisePhone(contact.phone);
    if (!normalisedPhone) {
      throw new TRPCError7({
        code: "BAD_REQUEST",
        message: "Could not normalise contact phone number"
      });
    }
    const e164Phone = normalisedPhone.startsWith("+") ? normalisedPhone : `+${normalisedPhone}`;
    try {
      const result = await sendWhatsAppFreeText({
        to: e164Phone,
        body
      });
      console.log(
        `[WhatsApp] Free-text sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${result.sid}`
      );
      const db = await getDb();
      if (db) {
        try {
          const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");
          await db.insert(whatsappMessages).values({
            contactId,
            direction: "outbound",
            body,
            templateName: null,
            sentByUserId: ctx.user.id,
            fromNumber,
            toNumber: e164Phone,
            twilioMessageSid: result.sid,
            status: "sent",
            isRead: true
          });
        } catch (dbErr) {
          console.error("[WhatsApp] Failed to save free-text message to DB:", dbErr);
        }
      }
      return {
        success: true,
        messageSid: result.sid,
        status: result.status
      };
    } catch (err) {
      console.error("[WhatsApp] Free-text send error:", err);
      throw new TRPCError7({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to send WhatsApp message: ${err.message}`
      });
    }
  }),
  // ─── Assign Conversation: assign a WhatsApp conversation to an agent ───────
  assignConversation: protectedProcedure.input(
    z13.object({
      contactId: z13.number(),
      assignedUserId: z13.number()
    })
  ).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    if (ctx.user.team !== null) {
      throw new TRPCError7({
        code: "FORBIDDEN",
        message: "Only managers can assign conversations"
      });
    }
    const { contactId, assignedUserId } = input;
    const [targetUser] = await db.select({ id: users.id }).from(users).where(eq13(users.id, assignedUserId)).limit(1);
    if (!targetUser) {
      throw new TRPCError7({
        code: "NOT_FOUND",
        message: "Target user not found"
      });
    }
    await db.insert(whatsappConversationAssignments).values({
      contactId,
      assignedUserId,
      assignedByUserId: ctx.user.id
    });
    console.log(
      `[WhatsApp] Conversation for contact #${contactId} assigned to user #${assignedUserId} by ${ctx.user.name ?? ctx.user.email}`
    );
    return { success: true };
  }),
  // ─── Get Agents: list all users for the assign dropdown ────────────────────
  getAgents: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      team: users.team,
      active: users.active
    }).from(users).where(eq13(users.active, true));
    return allUsers.filter((u) => u.name).map((u) => ({
      id: u.id,
      name: u.name,
      team: u.team
    }));
  }),
  // ─── Get Assignment: get current assignment for a contact ──────────────────
  getAssignment: protectedProcedure.input(z13.object({ contactId: z13.number() })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const [assignment] = await db.select({
      id: whatsappConversationAssignments.id,
      contactId: whatsappConversationAssignments.contactId,
      assignedUserId: whatsappConversationAssignments.assignedUserId,
      assignedByUserId: whatsappConversationAssignments.assignedByUserId,
      createdAt: whatsappConversationAssignments.createdAt
    }).from(whatsappConversationAssignments).where(eq13(whatsappConversationAssignments.contactId, input.contactId)).orderBy(desc6(whatsappConversationAssignments.createdAt)).limit(1);
    if (!assignment) return null;
    const [assignedUser] = await db.select({ name: users.name }).from(users).where(eq13(users.id, assignment.assignedUserId)).limit(1);
    return {
      ...assignment,
      assignedUserName: assignedUser?.name ?? "Unknown"
    };
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => {
      if (opts.ctx.disabledMessage) {
        throw new TRPCError8({ code: "FORBIDDEN", message: opts.ctx.disabledMessage });
      }
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(() => {
      return {
        success: true
      };
    })
  }),
  callCoach: callCoachRouter,
  contacts: contactsRouter,
  phoneNumbers: phoneNumbersRouter,
  emailTemplates: emailTemplatesRouter,
  pitch: pitchRouter,
  paymentForm: paymentFormRouter,
  dashboard: dashboardRouter,
  manager: managerRouter,
  tickets: ticketsRouter,
  openingDashboard: openingDashboardRouter,
  users: usersRouter,
  whatsapp: whatsappRouter
});

// server/_core/clerkAuth.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
function getClerkJwksUrl() {
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
  if (publishableKey) {
    try {
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, "").replace(/\$$/, "");
      const frontendApiHost = Buffer.from(base64Part, "base64").toString("utf-8").replace(/\$$/, "");
      if (frontendApiHost && frontendApiHost.includes(".")) {
        console.log("[clerkAuth] Derived frontend API host:", frontendApiHost);
        return `https://${frontendApiHost}/.well-known/jwks.json`;
      }
    } catch {
    }
  }
  return `https://caring-duck-98.clerk.accounts.dev/.well-known/jwks.json`;
}
var _JWKS = null;
function getJWKS() {
  if (!_JWKS) {
    const url = getClerkJwksUrl();
    console.log("[clerkAuth] Using JWKS URL:", url);
    _JWKS = createRemoteJWKSet(new URL(url));
  }
  return _JWKS;
}
async function verifyClerkToken(token) {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      algorithms: ["RS256"]
    });
    if (!payload.sub) {
      throw new Error("JWT missing sub claim");
    }
    return payload;
  } catch (err) {
    throw new Error(`Clerk JWT verification failed: ${err}`);
  }
}
async function getClerkUserDetails(clerkUserId) {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    if (!res.ok) {
      console.warn("[clerkAuth] Failed to fetch user details:", res.status);
      return { email: null, name: null };
    }
    const data = await res.json();
    const primaryEmail = data.email_addresses?.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address ?? data.email_addresses?.[0]?.email_address ?? null;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    return { email: primaryEmail, name };
  } catch {
    return { email: null, name: null };
  }
}
async function authenticateClerkRequest(req) {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token) {
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );
    token = cookies["__session"] ?? cookies["__clerk_db_jwt"];
  }
  if (!token) {
    throw new Error("No Clerk session token found");
  }
  const payload = await verifyClerkToken(token);
  const clerkUserId = payload.sub;
  if (!clerkUserId) {
    throw new Error("Invalid Clerk token: missing sub");
  }
  let user = await getUserByOpenId(clerkUserId);
  if (user) {
    await upsertUser({
      openId: clerkUserId,
      lastSignedIn: /* @__PURE__ */ new Date()
    });
    user = await getUserByOpenId(clerkUserId);
  } else {
    const { email, name } = await getClerkUserDetails(clerkUserId);
    if (!email) {
      throw new Error("Access denied. Please contact an administrator to get access.");
    }
    const existingByEmail = await getUserByEmail(email);
    if (existingByEmail) {
      await updateUserOpenId(existingByEmail.id, clerkUserId);
      if (!existingByEmail.name && name) {
        await upsertUser({
          openId: clerkUserId,
          name,
          lastSignedIn: /* @__PURE__ */ new Date()
        });
      }
      user = await getUserByOpenId(clerkUserId);
    } else {
      throw new Error("Access denied. Please contact an administrator to get access.");
    }
  }
  if (!user) {
    throw new Error("Failed to get or create user");
  }
  if (!user.active) {
    throw new Error("Your account has been disabled. Please contact an administrator.");
  }
  return user;
}

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  let disabledMessage;
  try {
    user = await authenticateClerkRequest(opts.req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("has been disabled")) {
      disabledMessage = msg;
    }
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    disabledMessage
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/webhooks/cloudtalk.ts
init_schema();
import { eq as eq14, or as or5, like as like5, and as and9, gte as gte5 } from "drizzle-orm";
function normalizePhone3(phone) {
  return String(phone).replace(/[\s\-().+]/g, "");
}
async function lookupStripeCustomerName2(phone) {
  const stripeKey = process.env.STRIPE_API_KEY;
  if (!stripeKey) return null;
  const raw = String(phone).trim();
  const candidates = [raw];
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) candidates.push(`+44${digits.slice(1)}`, `0${digits.slice(1)}`);
  if (digits.length === 11 && digits.startsWith("0")) candidates.push(`+44${digits.slice(1)}`);
  if (digits.length === 12 && digits.startsWith("44")) candidates.push(`+${digits}`, `0${digits.slice(2)}`);
  for (const candidate of candidates) {
    try {
      const query = encodeURIComponent(`phone:"${candidate}"`);
      const res = await fetch(`https://api.stripe.com/v1/customers/search?query=${query}&limit=1`, {
        headers: { Authorization: `Bearer ${stripeKey}` }
      });
      const json2 = await res.json();
      if (json2?.data?.length > 0) {
        const customer = json2.data[0];
        const name = customer.name ?? customer.description ?? null;
        if (name) {
          console.log(`[Stripe] Found customer "${name}" for phone ${candidate}`);
          return name;
        }
      }
    } catch (err) {
      console.warn(`[Stripe] Lookup failed for ${candidate}:`, err);
    }
  }
  return null;
}
async function findUserByCloudtalkAgentId2(agentId) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  const results = await db.select().from(users).where(eq14(users.cloudtalkAgentId, agentIdStr)).limit(1);
  return results[0] ?? null;
}
async function findUserByEmail2(email) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(users).where(eq14(users.email, email)).limit(1);
  return results[0] ?? null;
}
async function findOrCreateAgentUser2(agentId, agentName, agentEmail) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  let user = await findUserByCloudtalkAgentId2(agentIdStr);
  if (user) return user;
  if (agentEmail) {
    user = await findUserByEmail2(agentEmail);
    if (user) {
      await db.update(users).set({ cloudtalkAgentId: agentIdStr }).where(eq14(users.id, user.id));
      console.log(`[CloudTalk Webhook] Linked cloudtalkAgentId ${agentIdStr} to existing user #${user.id} (${user.name})`);
      return { ...user, cloudtalkAgentId: agentIdStr };
    }
  }
  const name = agentName ?? `Agent ${agentIdStr}`;
  const openId = `cloudtalk-${agentIdStr}`;
  try {
    const [result] = await db.insert(users).values({
      openId,
      name,
      email: agentEmail ?? null,
      cloudtalkAgentId: agentIdStr,
      role: "user"
    });
    const newId = result.insertId;
    const newUsers = await db.select().from(users).where(eq14(users.id, newId)).limit(1);
    console.log(`[CloudTalk Webhook] Auto-created user #${newId} for CloudTalk agent ${agentIdStr} (${name})`);
    return newUsers[0] ?? null;
  } catch (err) {
    console.warn(`[CloudTalk Webhook] Auto-create failed (probably duplicate): ${err?.message}`);
    const existing = await db.select().from(users).where(eq14(users.openId, openId)).limit(1);
    return existing[0] ?? null;
  }
}
async function findContactByPhone2(phone) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone3(phone);
  const results = await db.select().from(contacts).where(
    or5(
      like5(contacts.phone, `%${normalized}%`),
      like5(contacts.phone, `%${phone}%`)
    )
  ).limit(1);
  return results[0] ?? null;
}
async function isCallAlreadyProcessed2(cloudtalkCallId) {
  const db = await getDb();
  if (!db) return false;
  const results = await db.select({ id: callAnalyses.id }).from(callAnalyses).where(eq14(callAnalyses.cloudtalkCallId, cloudtalkCallId)).limit(1);
  return results.length > 0;
}
async function downloadAndStoreRecording(recordingUrl, callId) {
  const response = await fetch(recordingUrl);
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const fileKey = `call-recordings/webhook-${callId}-${Date.now()}.${ext}`;
  const { url } = await storagePut(fileKey, buffer, contentType);
  return { fileKey, fileUrl: url };
}
async function addAutoCallNote(contactId, userId, agentName, analysisId, summary, score) {
  const db = await getDb();
  if (!db) return;
  const note = `\u{1F916} AI Coach Analysis (auto)
Score: ${score}/100

${summary}

[View full analysis: /call-coach/${analysisId}]`;
  await db.insert(contactCallNotes).values({
    contactId,
    userId,
    agentName,
    note,
    statusAtTime: "working"
  });
}
async function handleCloudTalkWebhook(req, res) {
  try {
    const payload = req.body;
    console.log("[CloudTalk Webhook] Received payload:", JSON.stringify(payload, null, 2).substring(0, 1e3));
    const eventType = payload?.event || payload?.type || payload?.event_type || payload?.Event?.type || "unknown";
    const isCallEnded = eventType === "call_ended" || eventType === "call_finished" || eventType === "CALL_ENDED" || eventType === "CALL_FINISHED" || eventType === "recording_uploaded" || eventType === "RECORDING_UPLOADED" || // Some versions send the event in a nested structure
    payload?.Call?.status === "ANSWERED" || payload?.call?.status === "ANSWERED";
    if (!isCallEnded) {
      console.log(`[CloudTalk Webhook] Ignoring event type: ${eventType}`);
      res.status(200).json({ received: true, processed: false, reason: "Not a call_ended event" });
      return;
    }
    const call = payload?.Call ?? payload?.call ?? payload;
    const callId = payload?.call_uuid || // CloudTalk v2 top-level field
    call?.call_uuid || // CloudTalk v2 nested
    call?.uuid || call?.id || call?.call_id || payload?.uuid || payload?.id;
    const recordingUrl = payload?.recording_url || // CloudTalk v2 top-level
    call?.recording_url || call?.recordingUrl || call?.recording;
    const agentId = payload?.agent_id || // NEW format: flat field
    payload?.agent?.id || // OLD format: nested agent object (fallback)
    payload?.agent?.user_id || call?.agent_id || call?.agentId || call?.Agent?.id;
    const rawAgent = payload?.agent;
    const cloudtalkAgentName = (typeof rawAgent === "string" && rawAgent.trim() ? rawAgent.trim() : null) || // plain string (current format)
    payload?.agent_name || // flat field
    (typeof rawAgent === "object" && rawAgent !== null ? rawAgent.first_name || rawAgent.lastname ? `${rawAgent.first_name ?? rawAgent.firstname ?? ""} ${rawAgent.last_name ?? rawAgent.lastname ?? ""}`.trim() : rawAgent.name || rawAgent.full_name || null : null) || call?.Agent?.name || call?.Agent?.full_name || call?.agentName || call?.agent_name || null;
    console.log(`[CloudTalk Webhook] Agent info received \u2014 agent_id: ${payload?.agent_id ?? "(none)"}, agent_name: ${payload?.agent_name ?? "(none)"}, resolved agentId: ${agentId}, resolved agentName: ${cloudtalkAgentName}`);
    const cloudtalkAgentEmail = payload?.agent?.email || call?.Agent?.email || call?.agentEmail || null;
    const contactName = payload?.contact || null;
    const callerPhone = payload?.external_number || // CloudTalk v2 top-level
    call?.caller_number || call?.callerNumber || call?.from || call?.customer_number || call?.customerNumber || payload?.caller_number;
    const callDuration = call?.duration || call?.call_duration || payload?.duration;
    const callStarted = payload?.started_at || // CloudTalk v2 top-level
    call?.started_at || call?.startedAt || call?.created_at;
    console.log(`[CloudTalk Webhook] Call ID: ${callId}, Agent: ${agentId}, Phone: ${callerPhone}, Recording: ${recordingUrl ? "YES" : "NO"}, Duration: ${callDuration}`);
    const durationSeconds = parseInt(String(callDuration || "0"), 10);
    if (durationSeconds < 30 && callerPhone) {
      (async () => {
        try {
          const waAgent = agentId ? await findUserByCloudtalkAgentId2(String(agentId)) : null;
          if (waAgent && waAgent.team === "retention") {
            console.log(`[WhatsApp-NA] Skipping \u2014 agent #${waAgent.id} is Retention`);
            return;
          }
          const e164Phone = normalisePhone(String(callerPhone));
          if (!e164Phone) {
            console.log(`[WhatsApp-NA] Skipping \u2014 could not normalise phone: ${callerPhone}`);
            return;
          }
          const db = await getDb();
          if (!db) return;
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
          const recentMessages = await db.select({ id: whatsappMessages.id }).from(whatsappMessages).where(
            and9(
              eq14(whatsappMessages.toNumber, e164Phone),
              eq14(whatsappMessages.templateName, "op_no_answer_cold_data"),
              gte5(whatsappMessages.createdAt, twentyFourHoursAgo)
            )
          ).limit(1);
          if (recentMessages.length > 0) {
            console.log(`[WhatsApp-NA] Skipping \u2014 already sent to ${e164Phone} in last 24h`);
            return;
          }
          const waContact = await findContactByPhone2(String(callerPhone));
          const customerFirstName = waContact?.name ? waContact.name.split(" ")[0] : "there";
          const NA_TEMPLATE_SID = "HXefee4cfd043a6713a2aafe658e657422";
          const waResult = await sendWhatsAppMessage({
            to: e164Phone,
            contentSid: NA_TEMPLATE_SID,
            contentVariables: { "1": customerFirstName }
          });
          console.log(`[WhatsApp-NA] Auto-sent to ${e164Phone} (${customerFirstName}): ${waResult.sid}`);
          const fromNumber = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298").replace(/^whatsapp:/, "");
          await db.insert(whatsappMessages).values({
            contactId: waContact?.id ?? null,
            direction: "outbound",
            body: `Hi ${customerFirstName}, One of our skin specialists from Lavie Labs recently tried reaching you...`,
            templateName: "op_no_answer_cold_data",
            sentByUserId: waAgent?.id ?? null,
            fromNumber,
            toNumber: e164Phone,
            twilioMessageSid: waResult.sid,
            status: "sent",
            isRead: true
          });
        } catch (waErr) {
          console.error(`[WhatsApp-NA] Failed for phone ${callerPhone}:`, waErr);
        }
      })();
    }
    if (!recordingUrl) {
      console.log("[CloudTalk Webhook] No recording URL \u2014 skipping analysis");
      res.status(200).json({ received: true, processed: false, reason: "No recording URL" });
      return;
    }
    if (!callId) {
      console.log("[CloudTalk Webhook] No call ID \u2014 skipping");
      res.status(200).json({ received: true, processed: false, reason: "No call ID" });
      return;
    }
    if (await isCallAlreadyProcessed2(String(callId))) {
      console.log(`[CloudTalk Webhook] Call ${callId} already processed \u2014 skipping`);
      res.status(200).json({ received: true, processed: false, reason: "Already processed" });
      return;
    }
    let agent = agentId ? await findOrCreateAgentUser2(agentId, cloudtalkAgentName, cloudtalkAgentEmail) : null;
    if (!agent && cloudtalkAgentName) {
      const db = await getDb();
      if (db) {
        const nameMatches = await db.select().from(users).where(like5(users.name, cloudtalkAgentName.trim())).limit(1);
        if (nameMatches.length > 0) {
          agent = nameMatches[0];
          console.log(`[CloudTalk Webhook] Matched agent by name "${cloudtalkAgentName}" to user #${agent.id}`);
        } else {
          const openId = `cloudtalk-name-${cloudtalkAgentName.toLowerCase().replace(/\s+/g, "-")}`;
          const [inserted] = await db.insert(users).values({
            name: cloudtalkAgentName.trim(),
            email: cloudtalkAgentEmail ?? null,
            openId,
            role: "user"
          });
          const newId = inserted.insertId ?? inserted.lastInsertRowid;
          const created = await db.select().from(users).where(eq14(users.id, Number(newId))).limit(1);
          agent = created[0] ?? null;
          console.log(`[CloudTalk Webhook] Auto-created user #${newId} for agent name "${cloudtalkAgentName}"`);
        }
      }
    }
    if (!agent) {
      const db = await getDb();
      if (db) {
        const admins = await db.select().from(users).where(eq14(users.role, "admin")).limit(1);
        agent = admins[0] ?? null;
        console.warn(`[CloudTalk Webhook] No agent found by ID or name \u2014 falling back to admin user`);
      }
    }
    if (!agent) {
      console.error("[CloudTalk Webhook] No agent found and no admin fallback \u2014 cannot process");
      res.status(200).json({ received: true, processed: false, reason: "No agent found" });
      return;
    }
    const contact = callerPhone ? await findContactByPhone2(String(callerPhone)) : null;
    let stripeCustomerName = null;
    if (callerPhone) {
      stripeCustomerName = await lookupStripeCustomerName2(String(callerPhone));
      if (stripeCustomerName) {
        console.log(`[CloudTalk Webhook] Stripe customer name: "${stripeCustomerName}"`);
      }
    }
    console.log(`[CloudTalk Webhook] Downloading recording from ${recordingUrl}`);
    const { fileKey, fileUrl } = await downloadAndStoreRecording(recordingUrl, String(callId));
    const repName = cloudtalkAgentName || agent.name || null;
    console.log(`[CloudTalk Webhook] Agent name resolved: "${repName}" (from payload: "${cloudtalkAgentName}", from user: "${agent.name}")`);
    const isRetentionAgent = agent.team === "retention";
    const initialCallType = isRetentionAgent ? "other" : "cold_call";
    const analysisId = await createCallAnalysisRecord({
      userId: agent.id,
      repName,
      audioFileKey: fileKey,
      audioFileUrl: fileUrl,
      fileName: `cloudtalk-${callId}.mp3`,
      callDate: callStarted ? new Date(callStarted) : /* @__PURE__ */ new Date(),
      source: "webhook",
      cloudtalkCallId: String(callId),
      contactId: contact?.id ?? null,
      callType: initialCallType,
      customerName: stripeCustomerName ?? void 0,
      contactName: contactName ?? void 0,
      externalNumber: callerPhone ? String(callerPhone) : void 0
    });
    console.log(`[CloudTalk Webhook] Created analysis record #${analysisId} for call ${callId}`);
    res.status(200).json({ received: true, processed: true, analysisId });
    processCallAnalysis(analysisId, fileUrl).then(async () => {
      console.log(`[CloudTalk Webhook] Analysis #${analysisId} complete`);
      if (contact) {
        try {
          const db = await getDb();
          if (!db) return;
          const rows = await db.select().from(callAnalyses).where(eq14(callAnalyses.id, analysisId)).limit(1);
          const analysis = rows[0];
          if (analysis?.status === "done" && analysis.analysisJson) {
            const report = JSON.parse(analysis.analysisJson);
            await addAutoCallNote(
              contact.id,
              agent.id,
              agent.name ?? "AI Coach",
              analysisId,
              report.summary ?? "Call analyzed",
              analysis.overallScore ?? 0
            );
            console.log(`[CloudTalk Webhook] Added auto note to contact #${contact.id}`);
          }
        } catch (noteErr) {
          console.error("[CloudTalk Webhook] Failed to add auto note:", noteErr);
        }
      }
    }).catch((err) => {
      console.error(`[CloudTalk Webhook] Analysis #${analysisId} failed:`, err);
    });
  } catch (err) {
    console.error("[CloudTalk Webhook] Unhandled error:", err);
    res.status(200).json({ received: true, processed: false, error: "Internal error" });
  }
}

// server/webhooks/gmail.ts
init_schema();
import { eq as eq15, sql as sql8 } from "drizzle-orm";
var tablesEnsured = false;
async function ensureTablesExist(db) {
  if (tablesEnsured) return;
  try {
    await db.execute(sql8`
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
    await db.execute(sql8`
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
    console.log("[Gmail Webhook] Tables ensured (gmail_incoming_emails + support_tickets)");
  } catch (err) {
    console.error("[Gmail Webhook] Error ensuring tables:", err);
  }
}
async function handleGmailWebhook(req, res) {
  try {
    const payload = req.body;
    console.log(
      "[Gmail Webhook] Received payload:",
      JSON.stringify(payload, null, 2).substring(0, 2e3)
    );
    const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
    if (expectedSecret && payload?.secret !== expectedSecret) {
      console.warn("[Gmail Webhook] Invalid or missing secret \u2014 rejecting request");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const messageId = payload?.messageId;
    const fromEmail = payload?.from ?? payload?.fromEmail;
    if (!messageId || !fromEmail) {
      console.warn("[Gmail Webhook] Missing required fields (messageId, from)");
      res.status(400).json({
        error: "Missing required fields",
        required: ["messageId", "from"]
      });
      return;
    }
    const db = await getDb();
    if (!db) {
      console.error("[Gmail Webhook] Database not available");
      res.status(503).json({ error: "Database unavailable" });
      return;
    }
    await ensureTablesExist(db);
    const existingEmail = await db.select({ id: gmailIncomingEmails.id }).from(gmailIncomingEmails).where(eq15(gmailIncomingEmails.messageId, messageId)).limit(1);
    if (existingEmail.length > 0) {
      console.log(`[Gmail Webhook] Duplicate messageId ${messageId} \u2014 skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    let emailDate = null;
    if (payload?.date) {
      const parsed = new Date(payload.date);
      if (!isNaN(parsed.getTime())) {
        emailDate = parsed;
      }
    }
    const [insertResult] = await db.insert(gmailIncomingEmails).values({
      messageId,
      threadId: payload?.threadId ?? null,
      fromEmail,
      fromName: payload?.fromName ?? null,
      subject: payload?.subject ?? null,
      bodyText: payload?.bodyText ? String(payload.bodyText).substring(0, 65e3) : null,
      bodyHtml: payload?.bodyHtml ? String(payload.bodyHtml).substring(0, 65e3) : null,
      emailDate,
      status: "processed",
      rawPayload: JSON.stringify(payload).substring(0, 65e3)
    });
    const gmailEmailId = insertResult.insertId;
    console.log(
      `[Gmail Webhook] Stored email messageId=${messageId} from=${fromEmail} subject="${payload?.subject ?? "(no subject)"}"`
    );
    const bodyText = payload?.bodyText ? String(payload.bodyText) : "";
    const subject = payload?.subject ?? "";
    const fromName = payload?.fromName ?? "";
    const { category, priority } = categorizeEmail({
      fromEmail,
      fromName,
      subject,
      bodyText
    });
    let hasExistingEmails = false;
    try {
      const previousEmails = await db.select({ id: gmailIncomingEmails.id }).from(gmailIncomingEmails).where(eq15(gmailIncomingEmails.fromEmail, fromEmail)).limit(2);
      hasExistingEmails = previousEmails.length > 1;
    } catch (err) {
      console.warn("[Gmail Webhook] Error checking existing emails:", err);
    }
    const customerStatus = determineCustomerStatus(fromEmail, hasExistingEmails);
    try {
      await db.insert(supportTickets).values({
        gmailEmailId: gmailEmailId ?? null,
        messageId,
        fromEmail,
        fromName: fromName || null,
        subject: subject || null,
        body: bodyText ? bodyText.substring(0, 65e3) : null,
        receivedAt: emailDate ?? /* @__PURE__ */ new Date(),
        category,
        priority,
        customerStatus,
        status: "open",
        assignedTo: null,
        notes: null
      });
      console.log(
        `[Gmail Webhook] Created ticket: category=${category} priority=${priority} customerStatus=${customerStatus}`
      );
    } catch (ticketErr) {
      console.error("[Gmail Webhook] Error creating support ticket:", ticketErr);
    }
    res.status(200).json({
      received: true,
      processed: true,
      messageId,
      category,
      priority,
      customerStatus
    });
  } catch (err) {
    console.error("[Gmail Webhook] Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : "Unknown error"
    });
  }
}

// server/webhooks/postmarkInbound.ts
init_schema();
import { eq as eq16, sql as sql9, and as and10, inArray as inArray5, desc as desc7 } from "drizzle-orm";
var tablesEnsured2 = false;
async function ensureTablesExist2(db) {
  if (tablesEnsured2) return;
  try {
    await db.execute(sql9`
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
        recipient varchar(320),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT gmail_incoming_emails_id PRIMARY KEY(id),
        CONSTRAINT gmail_incoming_emails_messageId_unique UNIQUE(messageId)
      )
    `);
    await db.execute(sql9`
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
        ticketStatus enum('open','in_progress','awaiting_response','customer_replied','resolved','closed') NOT NULL DEFAULT 'open',
        assignedTo varchar(256),
        notes text,
        recipient varchar(320),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT support_tickets_id PRIMARY KEY(id),
        CONSTRAINT support_tickets_messageId_unique UNIQUE(messageId)
      )
    `);
    await db.execute(sql9`
      CREATE TABLE IF NOT EXISTS support_ticket_replies (
        id int AUTO_INCREMENT NOT NULL,
        ticketId int NOT NULL,
        direction enum('inbound','outbound') NOT NULL,
        body text NOT NULL,
        sentAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sentBy varchar(256) NOT NULL,
        CONSTRAINT support_ticket_replies_id PRIMARY KEY(id),
        INDEX idx_ticket_id (ticketId)
      )
    `);
    tablesEnsured2 = true;
    console.log("[Postmark Inbound] Tables ensured");
  } catch (err) {
    console.error("[Postmark Inbound] Error ensuring tables:", err);
  }
}
async function handlePostmarkInbound(req, res) {
  try {
    const payload = req.body;
    console.log(
      "[Postmark Inbound] Received payload:",
      JSON.stringify(payload, null, 2).substring(0, 2e3)
    );
    const messageId = payload?.MessageID;
    const fromEmail = payload?.FromFull?.Email ?? payload?.From;
    const fromName = payload?.FromFull?.Name ?? "";
    const subject = payload?.Subject ?? "";
    const bodyText = payload?.TextBody ?? payload?.StrippedTextReply ?? "";
    const bodyHtml = payload?.HtmlBody ?? "";
    const dateStr = payload?.Date;
    let recipient = null;
    const extractEmails = (arr) => arr.map((e) => String(e?.Email ?? "").toLowerCase().trim()).filter(Boolean);
    const toEmails = payload?.ToFull && Array.isArray(payload.ToFull) ? extractEmails(payload.ToFull) : [];
    const ccEmails = payload?.CcFull && Array.isArray(payload.CcFull) ? extractEmails(payload.CcFull) : [];
    const lavieToEmail = toEmails.find((e) => e.endsWith("@lavielabs.com"));
    const lavieCcEmail = ccEmails.find((e) => e.endsWith("@lavielabs.com"));
    const firstNonPostmarkTo = toEmails.find((e) => !e.includes("postmarkapp.com"));
    if (lavieToEmail) {
      recipient = lavieToEmail;
    } else if (lavieCcEmail) {
      recipient = lavieCcEmail;
    } else if (firstNonPostmarkTo) {
      recipient = firstNonPostmarkTo;
    } else if (payload?.To) {
      const toMatch = String(payload.To).match(/<([^>]+)>/);
      recipient = toMatch ? toMatch[1].toLowerCase().trim() : String(payload.To).toLowerCase().trim();
    }
    console.log(
      `[Postmark Inbound] Resolved recipient=${recipient} (OriginalRecipient was: ${payload?.OriginalRecipient ?? "(none)"})`
    );
    if (!messageId || !fromEmail) {
      console.warn("[Postmark Inbound] Missing required fields (MessageID, FromFull.Email)");
      res.status(200).json({ error: "Missing required fields" });
      return;
    }
    const lowerFrom = fromEmail.toLowerCase();
    if (lowerFrom.includes("postmarkapp.com")) {
      console.log(`[Postmark Inbound] Skipping Postmark system email from ${fromEmail}`);
      res.status(200).json({ received: true, skipped: true, reason: "system_email" });
      return;
    }
    const db = await getDb();
    if (!db) {
      console.error("[Postmark Inbound] Database not available");
      res.status(200).json({ error: "Database unavailable" });
      return;
    }
    await ensureTablesExist2(db);
    try {
      const blockedRow = await db.select({ id: blockedSenders.id }).from(blockedSenders).where(eq16(blockedSenders.email, fromEmail.toLowerCase())).limit(1);
      if (blockedRow.length > 0) {
        console.log(`[Postmark Inbound] Sender ${fromEmail} is blocked \u2014 skipping`);
        res.status(200).json({ received: true, skipped: true, reason: "blocked_sender" });
        return;
      }
    } catch (blockCheckErr) {
      console.warn("[Postmark Inbound] Error checking blocked senders (table may not exist yet):", blockCheckErr);
    }
    try {
      const allBlockedSubjects = await db.select({ keyword: blockedSubjects.keyword }).from(blockedSubjects);
      const subjectLower = (subject ?? "").toLowerCase();
      const matchedKeyword = allBlockedSubjects.find(
        (bs) => subjectLower.includes(bs.keyword)
      );
      if (matchedKeyword) {
        console.log(`[Postmark Inbound] Subject "${subject}" matches blocked keyword "${matchedKeyword.keyword}" \u2014 skipping`);
        res.status(200).json({ received: true, skipped: true, reason: "blocked_subject", keyword: matchedKeyword.keyword });
        return;
      }
    } catch (subjectCheckErr) {
      console.warn("[Postmark Inbound] Error checking blocked subjects (table may not exist yet):", subjectCheckErr);
    }
    const existingEmail = await db.select({ id: gmailIncomingEmails.id }).from(gmailIncomingEmails).where(eq16(gmailIncomingEmails.messageId, messageId)).limit(1);
    if (existingEmail.length > 0) {
      console.log(`[Postmark Inbound] Duplicate messageId ${messageId} \u2014 skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    let emailDate = null;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        emailDate = parsed;
      }
    }
    const [insertResult] = await db.insert(gmailIncomingEmails).values({
      messageId,
      threadId: null,
      fromEmail,
      fromName: fromName || null,
      subject: subject || null,
      bodyText: bodyText ? String(bodyText).substring(0, 65e3) : null,
      bodyHtml: bodyHtml ? String(bodyHtml).substring(0, 65e3) : null,
      emailDate,
      status: "processed",
      rawPayload: JSON.stringify(payload).substring(0, 65e3),
      recipient
    });
    const gmailEmailId = insertResult.insertId;
    console.log(
      `[Postmark Inbound] Stored email messageId=${messageId} from=${fromEmail} to=${recipient} subject="${subject}"`
    );
    const isReply = (subject || "").trim().toLowerCase().startsWith("re:");
    let linkedToExistingTicket = false;
    if (isReply) {
      try {
        const existingTickets = await db.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets).where(
          and10(
            eq16(supportTickets.fromEmail, fromEmail),
            inArray5(supportTickets.status, ["open", "in_progress", "awaiting_response", "customer_replied"])
          )
        ).orderBy(desc7(supportTickets.id)).limit(1);
        if (existingTickets.length > 0) {
          const ticketId = existingTickets[0].id;
          await db.insert(supportTicketReplies).values({
            ticketId,
            direction: "inbound",
            body: bodyText ? bodyText.substring(0, 65e3) : "(no body)",
            sentBy: fromName || fromEmail
          });
          await db.update(supportTickets).set({ status: "customer_replied" }).where(eq16(supportTickets.id, ticketId));
          linkedToExistingTicket = true;
          console.log(
            `[Postmark Inbound] Linked as reply to existing ticket #${ticketId} from ${fromEmail}`
          );
        }
      } catch (linkErr) {
        console.warn("[Postmark Inbound] Error checking for existing ticket:", linkErr);
      }
    }
    if (!linkedToExistingTicket) {
      const { category, priority } = categorizeEmail({
        fromEmail,
        fromName: fromName || "",
        subject: subject || "",
        bodyText: bodyText || ""
      });
      let hasExistingEmails = false;
      try {
        const previousEmails = await db.select({ id: gmailIncomingEmails.id }).from(gmailIncomingEmails).where(eq16(gmailIncomingEmails.fromEmail, fromEmail)).limit(2);
        hasExistingEmails = previousEmails.length > 1;
      } catch (err) {
        console.warn("[Postmark Inbound] Error checking existing emails:", err);
      }
      const customerStatus = determineCustomerStatus(fromEmail, hasExistingEmails);
      try {
        await db.insert(supportTickets).values({
          gmailEmailId: gmailEmailId ?? null,
          messageId,
          fromEmail,
          fromName: fromName || null,
          subject: subject || null,
          body: bodyText ? bodyText.substring(0, 65e3) : null,
          receivedAt: emailDate ?? /* @__PURE__ */ new Date(),
          category,
          priority,
          customerStatus,
          status: "open",
          assignedTo: null,
          notes: null,
          recipient
        });
        console.log(
          `[Postmark Inbound] Created ticket: category=${category} priority=${priority} customerStatus=${customerStatus} recipient=${recipient}`
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
        recipient
      });
    } else {
      res.status(200).json({
        received: true,
        processed: true,
        linkedAsReply: true,
        messageId
      });
    }
  } catch (err) {
    console.error("[Postmark Inbound] Unhandled error:", err);
    res.status(200).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : "Unknown error"
    });
  }
}

// server/webhooks/whatsappIncoming.ts
init_schema();
import { eq as eq17, and as and11, desc as desc8 } from "drizzle-orm";
import crypto from "crypto";
function validateTwilioSignature(authToken, signature, url, params) {
  let data = url;
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + (params[key] ?? "");
  }
  const computed = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  return computed === signature;
}
function stripWhatsAppPrefix(twilioNumber) {
  return twilioNumber.replace(/^whatsapp:/, "");
}
async function handleWhatsAppIncoming(req, res) {
  try {
    console.log("[WhatsApp Incoming] req.body keys:", Object.keys(req.body || {}));
    const {
      Body: body,
      From: from,
      To: to,
      MessageSid: messageSid
    } = req.body;
    console.log(`[WhatsApp Incoming] SID: ${messageSid}, From: ${from}, To: ${to}, Body: "${(body || "").substring(0, 80)}"`);
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const twilioSignature = req.headers["x-twilio-signature"];
    if (authToken && twilioSignature) {
      const host = req.headers["host"] || "";
      const path3 = req.originalUrl;
      const urlHttp = `http://${host}${path3}`;
      const urlHttps = `https://${host}${path3}`;
      const urlProd = "https://lavie-training-hub-production.up.railway.app/api/whatsapp/incoming";
      const validHttp = validateTwilioSignature(authToken, twilioSignature, urlHttp, req.body);
      const validHttps = validateTwilioSignature(authToken, twilioSignature, urlHttps, req.body);
      const validProd = validateTwilioSignature(authToken, twilioSignature, urlProd, req.body);
      if (validHttp || validHttps || validProd) {
        console.log("[WhatsApp Incoming] \u2713 Twilio signature valid");
      } else {
        console.warn(
          `[WhatsApp Incoming] \u26A0 Signature mismatch (not blocking). Tried: ${urlHttp}, ${urlHttps}, ${urlProd}`
        );
      }
    } else {
      console.warn("[WhatsApp Incoming] No signature header present \u2014 accepting request");
    }
    const fromNumber = stripWhatsAppPrefix(from || "");
    const toNumber = stripWhatsAppPrefix(to || "");
    if (!fromNumber) {
      console.error("[WhatsApp Incoming] No From number in request body");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    const db = await getDb();
    if (!db) {
      console.error("[WhatsApp Incoming] Database not available");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    let matchedContactId = null;
    let ownerUserId = null;
    const normalised = normalisePhone(fromNumber);
    const allContacts = await db.select().from(contacts);
    const matchedContact = allContacts.find((c) => {
      if (!c.phone) return false;
      const contactNormalised = normalisePhone(c.phone);
      if (!contactNormalised || !normalised) return false;
      return contactNormalised === normalised;
    });
    if (matchedContact) {
      matchedContactId = matchedContact.id;
      ownerUserId = matchedContact.assignedUserId;
      if (!ownerUserId) {
        const lastOutbound = await db.select().from(whatsappMessages).where(
          and11(
            eq17(whatsappMessages.contactId, matchedContactId),
            eq17(whatsappMessages.direction, "outbound")
          )
        ).orderBy(desc8(whatsappMessages.createdAt)).limit(1);
        if (lastOutbound.length > 0 && lastOutbound[0].sentByUserId) {
          ownerUserId = lastOutbound[0].sentByUserId;
        }
      }
      console.log(`[WhatsApp Incoming] Matched contact #${matchedContactId} (${matchedContact.name}), owner userId: ${ownerUserId}`);
    } else {
      console.log(`[WhatsApp Incoming] No contact match for ${fromNumber} (normalised: ${normalised})`);
    }
    await db.insert(whatsappMessages).values({
      contactId: matchedContactId,
      direction: "inbound",
      body: body || "",
      templateName: null,
      sentByUserId: ownerUserId,
      fromNumber,
      toNumber,
      twilioMessageSid: messageSid || null,
      status: "received",
      isRead: false
    });
    console.log(`[WhatsApp Incoming] \u2713 Message saved \u2014 contact: ${matchedContactId ?? "unmatched"}, SID: ${messageSid}`);
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[WhatsApp Incoming] Error processing webhook:", err);
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}

// server/webhooks/whatsappStatus.ts
init_schema();
import { eq as eq18 } from "drizzle-orm";
var STATUS_ORDER = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,
  // Failed is special — always allow setting it
  undelivered: -1
};
function isStatusUpgrade(current, incoming) {
  if (incoming === "failed" || incoming === "undelivered") return true;
  const currentOrder = STATUS_ORDER[current] ?? 0;
  const incomingOrder = STATUS_ORDER[incoming] ?? 0;
  return incomingOrder > currentOrder;
}
function mapStatus(twilioStatus) {
  switch (twilioStatus) {
    case "sent":
    case "queued":
    case "sending":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return null;
  }
}
async function handleWhatsAppStatus(req, res) {
  try {
    const { MessageSid, MessageStatus } = req.body;
    console.log(`[WhatsApp Status] SID: ${MessageSid}, Status: ${MessageStatus}`);
    if (!MessageSid || !MessageStatus) {
      console.warn("[WhatsApp Status] Missing MessageSid or MessageStatus \u2014 ignoring");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    const newStatus = mapStatus(MessageStatus);
    if (!newStatus) {
      console.log(`[WhatsApp Status] Unrecognised status "${MessageStatus}" \u2014 ignoring`);
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    const db = await getDb();
    if (!db) {
      console.error("[WhatsApp Status] Database not available");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    const [existing] = await db.select({ id: whatsappMessages.id, status: whatsappMessages.status }).from(whatsappMessages).where(eq18(whatsappMessages.twilioMessageSid, MessageSid)).limit(1);
    if (!existing) {
      console.log(`[WhatsApp Status] No message found for SID ${MessageSid} \u2014 ignoring`);
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    if (!isStatusUpgrade(existing.status, newStatus)) {
      console.log(`[WhatsApp Status] Skipping downgrade: ${existing.status} \u2192 ${newStatus} for SID ${MessageSid}`);
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }
    await db.update(whatsappMessages).set({ status: newStatus }).where(eq18(whatsappMessages.id, existing.id));
    console.log(`[WhatsApp Status] \u2713 Updated message #${existing.id} (SID: ${MessageSid}): ${existing.status} \u2192 ${newStatus}`);
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[WhatsApp Status] Error processing status callback:", err);
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}

// server/ensureTables.ts
import { sql as sql10 } from "drizzle-orm";
async function ensureSupportTicketsTable() {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] Cannot ensure tables: database not available");
    return;
  }
  try {
    await db.execute(sql10`
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
  try {
    await db.execute(sql10`
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

// server/ensureShareToken.ts
import { sql as sql11 } from "drizzle-orm";
async function ensureShareTokenColumn() {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql11`
      ALTER TABLE call_analyses ADD COLUMN shareToken varchar(64) DEFAULT NULL
    `);
    console.log("[DB] shareToken column added to call_analyses");
  } catch (err) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
    } else {
      console.error("[DB] Error adding shareToken column:", err);
    }
  }
  try {
    await db.execute(sql11`
      CREATE UNIQUE INDEX call_analyses_shareToken_unique ON call_analyses(shareToken)
    `);
    console.log("[DB] shareToken unique index created");
  } catch (err) {
    if (err?.code === "ER_DUP_KEYNAME" || err?.message?.includes("Duplicate key name")) {
    } else {
      console.error("[DB] Error creating shareToken index:", err);
    }
  }
}

// server/ensureTemplateVisibility.ts
import { sql as sql12 } from "drizzle-orm";
async function ensureTemplateVisibilityColumn() {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql12`
      ALTER TABLE email_templates ADD COLUMN visibility TEXT DEFAULT NULL
    `);
    console.log("[DB] visibility column added to email_templates");
  } catch (err) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
    } else {
      console.error("[DB] Error adding visibility column:", err);
    }
  }
}

// server/ensureBrandsColumn.ts
import { sql as sql13 } from "drizzle-orm";
async function ensureBrandsColumn() {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql13`
      ALTER TABLE contacts ADD COLUMN brands VARCHAR(512) DEFAULT NULL
    `);
    console.log("[DB] brands column added to contacts");
  } catch (err) {
    if (err?.code === "ER_DUP_FIELDNAME" || err?.message?.includes("Duplicate column")) {
    } else {
      console.error("[DB] Error adding brands column:", err);
    }
  }
}

// server/stripe.ts
import Stripe2 from "stripe";
init_schema();
import { eq as eq19 } from "drizzle-orm";
var _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe2(ENV.stripeSecretKey, {
      apiVersion: "2026-04-22.dahlia"
    });
  }
  return _stripe;
}
async function createPaymentIntent(req, res) {
  try {
    const { agentName } = req.body;
    const stripe2 = getStripe();
    const paymentIntent = await stripe2.paymentIntents.create({
      amount: 495,
      // £4.95 in pence
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        agentName: agentName ?? "",
        source: "lavie-training-hub"
      },
      description: "Lavi\xE9 Labs Trial Package \u2014 \xA34.95 P&P"
    });
    const db = await getDb();
    if (db) {
      await db.insert(formSubmissions).values({
        email: "",
        cardholderName: "",
        agentName: agentName ?? "",
        status: "new",
        stripePaymentIntentId: paymentIntent.id
      });
    }
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error("[Stripe] createPaymentIntent error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
}
async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  if (!ENV.stripeWebhookSecret) {
    console.warn("[Stripe] STRIPE_WEBHOOK_SECRET not set; skipping signature verification");
    res.json({ received: true });
    return;
  }
  let event;
  try {
    const stripe2 = getStripe();
    event = stripe2.webhooks.constructEvent(
      req.body,
      sig ?? "",
      ENV.stripeWebhookSecret
    );
  } catch (err) {
    console.error("[Stripe] Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const email = pi.metadata?.email ?? "";
    const agentName = pi.metadata?.agentName ?? "";
    let cardholderName = "";
    let cardLast4;
    let cardExpiry;
    let addressLine1;
    let addressLine2;
    let city;
    let postcode;
    try {
      const stripe2 = getStripe();
      const charges = await stripe2.charges.list({ payment_intent: pi.id, limit: 1 });
      const charge = charges.data[0];
      if (charge) {
        const billing = charge.billing_details;
        cardholderName = billing?.name ?? "";
        addressLine1 = billing?.address?.line1 ?? void 0;
        addressLine2 = billing?.address?.line2 ?? void 0;
        city = billing?.address?.city ?? void 0;
        postcode = billing?.address?.postal_code ?? void 0;
        const pm = charge.payment_method_details;
        if (pm?.card) {
          cardLast4 = pm.card.last4 ?? void 0;
          const expMonth = pm.card.exp_month;
          const expYear = pm.card.exp_year;
          if (expMonth && expYear) {
            cardExpiry = `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
          }
        }
      }
    } catch (chargeErr) {
      console.warn("[Stripe] Could not fetch charge details:", chargeErr);
    }
    const db = await getDb();
    if (db) {
      const updated = await db.update(formSubmissions).set({
        cardholderName,
        cardLast4,
        cardExpiry,
        addressLine1,
        addressLine2,
        city,
        postcode,
        status: "processed"
      }).where(eq19(formSubmissions.stripePaymentIntentId, pi.id));
      if (!updated) {
        await db.insert(formSubmissions).values({
          email,
          cardholderName,
          cardLast4,
          cardExpiry,
          addressLine1,
          addressLine2,
          city,
          postcode,
          agentName,
          status: "processed",
          stripePaymentIntentId: pi.id
        });
      }
    }
    await notifyOwner({
      title: "Payment Received via Stripe",
      content: [
        `Customer: ${cardholderName || email}`,
        `Email: ${email}`,
        `Card: **** **** **** ${cardLast4 ?? "N/A"} (exp ${cardExpiry ?? "N/A"})`,
        `Address: ${[addressLine1, addressLine2, city, postcode].filter(Boolean).join(", ") || "N/A"}`,
        `Agent: ${agentName || "N/A"}`,
        `Amount: \xA34.95`,
        `PaymentIntent: ${pi.id}`
      ].join("\n")
    });
  }
  res.json({ received: true });
}

// server/payment-html.ts
function getPaymentPageHtml(stripePk) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lavi&#233; Labs &#8212; Secure Payment</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f7f4;
      color: #1a1a1a;
      min-height: 100vh;
    }
    .header {
      background: #fff;
      border-bottom: 1px solid #e8e4df;
      padding: 16px 24px;
      text-align: center;
    }
    .header-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #1a1a1a;
    }
    .page {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px 64px;
      display: flex;
      gap: 32px;
      align-items: flex-start;
    }
    @media (max-width: 680px) {
      .page { flex-direction: column; }
    }
    .product {
      flex: 1;
      background: #fff;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .product img {
      width: 100%;
      max-width: 260px;
      display: block;
      margin: 0 auto 20px;
      border-radius: 12px;
    }
    .product-name { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .product-stars { color: #f5a623; font-size: 16px; margin-bottom: 4px; }
    .product-reviews { font-size: 13px; color: #888; margin-bottom: 12px; }
    .product-desc { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px; }
    .product-price { font-size: 22px; font-weight: 700; color: #2d6a4f; margin-bottom: 16px; }
    .trust-items { list-style: none; }
    .trust-items li { font-size: 13px; color: #444; padding: 4px 0; }
    .trust-items li::before { content: "\u2713  "; color: #2d6a4f; font-weight: 700; }
    .payment {
      flex: 1;
      background: #fff;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .payment-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; text-align: center; }
    #payment-request-btn { margin-bottom: 16px; }
    #payment-request-btn iframe { border-radius: 8px; }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0;
      color: #aaa;
      font-size: 13px;
    }
    .divider::before, .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #e5e5e5;
    }
    .field-label { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 6px; }
    .stripe-input {
      border: 1.5px solid #ddd;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      background: #fafafa;
      transition: border-color 0.2s;
    }
    .stripe-input.StripeElement--focus { border-color: #2d6a4f; background: #fff; }
    .stripe-input.StripeElement--invalid { border-color: #e74c3c; }
    .pay-btn {
      width: 100%;
      background: #1a3c2e;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.2s, opacity 0.2s;
      letter-spacing: 0.02em;
    }
    .pay-btn:hover { background: #2d6a4f; }
    .pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .secure-note { text-align: center; font-size: 12px; color: #aaa; margin-top: 14px; }
    .msg {
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      margin-bottom: 14px;
      display: none;
    }
    .msg.error { background: #fef2f2; color: #c0392b; border: 1px solid #fca5a5; display: block; }
    .msg.success { background: #f0fdf4; color: #166534; border: 1px solid #86efac; display: block; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #bbb; border-top: 1px solid #eee; }
    .badges {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #aaa;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">Lavi&#233;</div>
  </div>

  <div class="page">
    <div class="product">
      <img src="https://training.lavielabs.com/assets/matinika-product.png"
           onerror="this.style.display='none'"
           alt="Matinika Age Defying Cream" />
      <div class="product-name">Matinika Age Defying Cream</div>
      <div class="product-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <div class="product-reviews">(830 reviews)</div>
      <div class="product-desc">
        Enhance your complexion with this transformative skin treatment,
        crafted to refine texture and deliver a visibly tighter,
        more resilient appearance.
      </div>
      <div class="product-price">&#127468;&#127463; &pound;4.95 P&amp;P</div>
      <ul class="trust-items">
        <li>21-Day Free Trial</li>
        <li>Cancel Anytime</li>
        <li>Secure &amp; Encrypted</li>
        <li>All Skin Types &middot; Anti-Aging</li>
      </ul>
    </div>

    <div class="payment">
      <div class="payment-title">Secure Payment</div>
      <div id="msg" class="msg"></div>

      <!-- Apple Pay / Google Pay button -->
      <div id="payment-request-btn" style="display:none;"></div>
      <div id="divider" class="divider" style="display:none;">or pay with card</div>

      <!-- Card fields only -->
      <div class="field-label">Card Number</div>
      <div id="card-number" class="stripe-input"></div>

      <div style="display:flex;gap:12px;">
        <div style="flex:1;">
          <div class="field-label">Expiry</div>
          <div id="card-expiry" class="stripe-input"></div>
        </div>
        <div style="flex:1;">
          <div class="field-label">CVC</div>
          <div id="card-cvc" class="stripe-input"></div>
        </div>
      </div>

      <button id="pay-btn" class="pay-btn">Pay &pound;4.95</button>
      <div class="secure-note">&#128274; Your payment is secured by Stripe</div>
    </div>
  </div>

  <div class="badges">
    <span>Vegan</span>
    <span>Cruelty Free</span>
    <span>Dermatologist Tested</span>
    <span>60-Day Guarantee</span>
  </div>
  <div class="footer">&copy; 2025 Lavie Labs. All rights reserved.</div>

  <script>
    var params = new URLSearchParams(window.location.search);
    var agentName = params.get('agent') || '';

    var stripe = Stripe('${stripePk}');
    var elements = stripe.elements();

    var style = {
      base: {
        fontSize: '15px',
        color: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        '::placeholder': { color: '#aaa' }
      },
      invalid: { color: '#e74c3c' }
    };

    var cardNumber = elements.create('cardNumber', { style: style });
    var cardExpiry = elements.create('cardExpiry', { style: style });
    var cardCvc    = elements.create('cardCvc',    { style: style });

    cardNumber.mount('#card-number');
    cardExpiry.mount('#card-expiry');
    cardCvc.mount('#card-cvc');

    // \u2500\u2500 Helper: create a fresh PaymentIntent each time
    function createIntent() {
      return fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: agentName })
      }).then(function(res) {
        if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'Server error'); });
        return res.json();
      }).then(function(data) {
        return data.clientSecret;
      });
    }

    // \u2500\u2500 Apple Pay / Google Pay button
    var paymentRequest = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: { label: 'Matinika Trial Package', amount: 495 },
      requestPayerName: false,
      requestPayerEmail: false,
      requestShipping: false
    });

    var prButton = elements.create('paymentRequestButton', {
      paymentRequest: paymentRequest,
      style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '50px' } }
    });

    paymentRequest.canMakePayment().then(function(result) {
      if (result) {
        document.getElementById('payment-request-btn').style.display = 'block';
        document.getElementById('divider').style.display = 'flex';
        prButton.mount('#payment-request-btn');
      }
    });

    paymentRequest.on('paymentmethod', function(ev) {
      showMsg('', '');
      createIntent().then(function(clientSecret) {
        // Step 1: confirm without handling 3DS actions yet
        return stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        ).then(function(confirmResult) {
          if (confirmResult.error) {
            // Payment failed immediately
            ev.complete('fail');
            showMsg(confirmResult.error.message, 'error');
            return;
          }
          // Tell the payment sheet it can close
          ev.complete('success');
          // Step 2: if 3DS required, handle it now (after sheet closed)
          if (confirmResult.paymentIntent.status === 'requires_action') {
            return stripe.confirmCardPayment(clientSecret).then(function(r) {
              if (r.error) { showMsg(r.error.message, 'error'); }
              else { showSuccess(); }
            });
          }
          // Payment succeeded immediately
          showSuccess();
        });
      }).catch(function(e) {
        ev.complete('fail');
        showMsg(e.message || 'Payment failed. Please try again.', 'error');
      });
    });

    // \u2500\u2500 Manual card payment
    document.getElementById('pay-btn').addEventListener('click', function() {
      var btn = document.getElementById('pay-btn');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      showMsg('', '');

      createIntent().then(function(clientSecret) {
        return stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardNumber }
        });
      }).then(function(result) {
        if (result.error) {
          showMsg(result.error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Pay \xA34.95';
        } else if (result.paymentIntent.status === 'succeeded') {
          showSuccess();
          btn.textContent = 'Paid \u2713';
        }
      }).catch(function(e) {
        showMsg(e.message || 'Something went wrong', 'error');
        btn.disabled = false;
        btn.textContent = 'Pay \xA34.95';
      });
    });

    function showSuccess() {
      showMsg('Payment successful! Thank you.', 'success');
      document.getElementById('pay-btn').disabled = true;
    }

    function showMsg(text, type) {
      var el = document.getElementById('msg');
      el.textContent = text;
      el.className = 'msg' + (type ? ' ' + type : '');
    }
  </script>
</body>
</html>`;
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/mp4", "video/mp4", "audio/webm", "audio/x-m4a"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|m4a|mp4|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Please upload an audio file."));
    }
  }
});
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.post(
    "/api/webhooks/stripe",
    express2.raw({ type: "application/json" }),
    handleStripeWebhook
  );
  app.use(express2.json({ limit: "250mb" }));
  app.use(express2.urlencoded({ limit: "250mb", extended: true }));
  registerClerkRoutes(app);
  app.post("/api/webhooks/cloudtalk", handleCloudTalkWebhook);
  app.post("/api/webhooks/gmail", handleGmailWebhook);
  app.post("/api/webhooks/postmark-inbound", handlePostmarkInbound);
  app.post("/api/whatsapp/incoming", handleWhatsAppIncoming);
  app.post("/api/whatsapp/status", handleWhatsAppStatus);
  app.post("/api/stripe/create-payment-intent", createPaymentIntent);
  app.post(
    "/api/call-upload",
    upload.single("audio"),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "No audio file provided" });
          return;
        }
        const suffix = Date.now().toString(36);
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `call-recordings/${suffix}-${safeName}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        res.json({ fileKey, url, fileName: req.file.originalname });
      } catch (err) {
        console.error("[upload] error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
  );
  const ticketAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
    // 10MB max per file
  });
  app.post(
    "/api/ticket-attachment-upload",
    ticketAttachmentUpload.array("files", 5),
    // max 5 files
    async (req, res) => {
      try {
        const files = req.files;
        if (!files || files.length === 0) {
          res.status(400).json({ error: "No files provided" });
          return;
        }
        const uploaded = files.map((f) => ({
          filename: f.originalname,
          contentType: f.mimetype,
          size: f.size,
          buffer: f.buffer.toString("base64")
        }));
        res.json({ files: uploaded });
      } catch (err) {
        console.error("[ticket-attachment-upload] error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
  );
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.get("/api/debug-key", (_req, res) => {
    const sk = process.env.STRIPE_SECRET_KEY ?? "";
    const pk = process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
    res.json({
      sk_prefix: sk.substring(0, 8),
      sk_length: sk.length,
      pk_prefix: pk.substring(0, 8),
      pk_length: pk.length
    });
  });
  app.get("/api/debug-twilio", async (_req, res) => {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    const from = process.env.TWILIO_WHATSAPP_FROM ?? "";
    let apiResult = "not tested";
    try {
      const credentials = Buffer.from(`${sid}:${authToken}`).toString("base64");
      const r = await fetch("https://content.twilio.com/v1/Content", {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json"
        }
      });
      if (r.ok) {
        const data = await r.json();
        apiResult = `OK - ${(data.contents || []).length} templates`;
      } else {
        const errText = await r.text().catch(() => "");
        apiResult = `ERROR ${r.status}: ${errText.substring(0, 200)}`;
      }
    } catch (e) {
      apiResult = `EXCEPTION: ${e.message}`;
    }
    res.json({
      TWILIO_ACCOUNT_SID: sid ? sid.substring(0, 6) + "..." : "NOT SET",
      TWILIO_AUTH_TOKEN: authToken ? "set (" + authToken.length + " chars)" : "NOT SET",
      TWILIO_WHATSAPP_FROM: from || "NOT SET (will use default)",
      apiResult
    });
  });
  app.get("/payment-link-lavielabs", (_req, res) => {
    const html = getPaymentPageHtml(process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.timeout = 21e5;
  server.keepAliveTimeout = 21e5;
  server.headersTimeout = 2100100;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    setTimeout(() => {
      ensureSupportTicketsTable().catch(
        (err) => console.error("[DB] Error ensuring support_tickets table:", err)
      );
    }, 3e3);
    setTimeout(() => {
      ensureShareTokenColumn().catch(
        (err) => console.error("[DB] Error ensuring shareToken column:", err)
      );
    }, 4e3);
    setTimeout(() => {
      ensureTemplateVisibilityColumn().catch(
        (err) => console.error("[DB] Error ensuring template visibility column:", err)
      );
    }, 5e3);
    setTimeout(() => {
      ensureBrandsColumn().catch(
        (err) => console.error("[DB] Error ensuring brands column:", err)
      );
    }, 6e3);
    setTimeout(() => {
      syncUnsyncedContactsToCloudTalk().catch(
        (err) => console.error("[CloudTalk] Startup sync error:", err)
      );
    }, 5e3);
  });
}
startServer().catch(console.error);
