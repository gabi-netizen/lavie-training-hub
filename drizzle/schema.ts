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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallAnalysis = typeof callAnalyses.$inferSelect;
export type InsertCallAnalysis = typeof callAnalyses.$inferInsert;
