import { float, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  /** Call type: opening (new sale), retention_cancel_trial (cancel trial), retention_win_back (win back) */
  callType: mysqlEnum("callType", ["opening", "retention_cancel_trial", "retention_win_back"]).default("opening"),
  /** User ID of the person who last edited the call details (repName/callDate/closeStatus) */
  lastEditedByUserId: int("lastEditedByUserId"),
  /** Display name of the person who last edited the call details */
  lastEditedByName: varchar("lastEditedByName", { length: 256 }),
  /** Timestamp of the most recent manual edit to call details */
  lastEditedAt: timestamp("lastEditedAt"),
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
    "done_deal", "retained_sub", "cancelled_sub", "closed"
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
