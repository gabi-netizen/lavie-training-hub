import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { callAnalyses, aiFeedback } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY ?? "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type CallType = "opening" | "retention_cancel_trial" | "retention_win_back";

// ─── PROMPT CONTEXTS PER CALL TYPE ────────────────────────────────────────────

const OPENING_CONTEXT = `
You are an expert sales coach for Lavie Labs, a UK skincare company.

This is an OPENING call — a cold outbound call to a new prospect. The rep's goal is to close a 21-day free trial for £4.95 postage.

The correct sales flow has these key stages:
1. OPENING: Warm greeting, introduce yourself from Lavie Labs, ask how they are
2. MAGIC WAND QUESTION: "If you could wave a magic wand and change one thing about your skin, what would it be?"
3. QUALIFY: How long have they had this concern? What have they tried before?
4. PRODUCT PITCH: Matinika (32% Hyaluronic Acid, medical-grade), Oulala (retinol serum), Ashkara (eye serum)
5. SOCIAL PROOF: Reference Trustpilot reviews, website results
6. OFFER & CLOSE: £4.95 for 21-day free trial, subscription framing (cancel anytime), VIP discount
7. CONFIRMATION: Take details, confirm delivery address

Key objection handlers:
- Subscription objection: "You're in complete control, cancel anytime with one click"
- Trust/card objection: "Fully regulated UK company, encrypted payment, Trustpilot reviews"
- Too many products: "Replace 3 products with one medical-grade cream"

Golden rules:
- Never get defensive about the subscription
- After the close — stop talking (silence is part of the close)
- Always tie back to the customer's Magic Wand answer
`;

const RETENTION_CANCEL_TRIAL_CONTEXT = `
You are an expert retention coach for Lavie Labs, a UK skincare company.

This is a RETENTION — CANCEL TRIAL call. The customer is on a 21-day free trial and wants to cancel before being charged. The rep's goal is to:
1. PREVENT the cancellation — keep the customer on the trial
2. If they insist on cancelling — UPSELL to an annual plan (full or split payment) as an alternative

The correct retention flow for a trial cancellation:
1. EMPATHY OPENING: Acknowledge their concern warmly, don't be defensive
2. DISCOVER THE REASON: Find out WHY they want to cancel (not seeing results yet? worried about subscription? financial concern?)
3. ADDRESS THE CONCERN: Directly handle the specific objection
   - Not seeing results: "The first 3 weeks are about deep hydration — visible results typically appear in weeks 2-3"
   - Worried about subscription: "You're in complete control, one click to cancel anytime"
   - Financial: Offer the annual plan as a better value alternative
4. SAVE THE TRIAL: Try to keep them on the free trial — remind them it's still free
5. UPSELL TO ANNUAL: If they're wavering, offer annual plan (better value, locks in discount)
6. CLOSE: Either save the trial or close the annual plan

Golden rules:
- Never cancel without trying to save first
- The annual plan is the backup close — always offer it before giving up
- Empathy first, solution second
`;

const RETENTION_WIN_BACK_CONTEXT = `
You are an expert retention coach for Lavie Labs, a UK skincare company.

This is a RETENTION — WIN BACK call. The customer previously cancelled their subscription (approximately 1 month ago) and the rep is calling to win them back. The goal is to re-engage the customer and close them on an annual plan.

The correct win-back flow:
1. WARM RE-ENGAGEMENT: Friendly reconnect — "Hi [Name], it's [Rep] from Lavie Labs, I was thinking about you..."
2. CHECK IN: Ask how their skin has been since they stopped using the cream — plant the seed of missing results
3. REFRAME THE VALUE: Remind them of the results they were getting, what they're missing now
4. INTRODUCE THE ANNUAL OFFER: Present the annual plan as a special returning-customer offer (better value, locked-in price)
5. HANDLE OBJECTIONS: Address why they originally cancelled and what's changed
6. CLOSE: Close on annual plan (full payment or split payment option)

Golden rules:
- Don't make them feel guilty for leaving — make them feel valued for coming back
- The annual plan is the primary offer — not the monthly subscription
- Reference their original skin concern and tie the value back to it
- Split payment option is available if full annual is too much upfront
`;

// ─── TRANSCRIBE WITH DEEPGRAM ─────────────────────────────────────────────────
export async function transcribeAudio(audioUrl: string): Promise<{
  transcript: string;
  repSpeechPct: number;
  durationSeconds: number;
}> {
  const response = await deepgram.listen.v1.media.transcribeUrl({
    url: audioUrl,
    model: "nova-2",
    smart_format: true,
    diarize: true,
    punctuate: true,
    utterances: true,
    language: "en",
  });

  const result = response as any;
  const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  const duration = result?.metadata?.duration ?? 0;

  // Calculate rep speech percentage using diarization
  // Speaker 0 is typically the rep (first speaker)
  const utterances: any[] = result?.results?.utterances ?? [];
  let repSpeechTime = 0;
  let totalSpeechTime = 0;

  for (const utt of utterances) {
    const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
    totalSpeechTime += uttDuration;
    if (utt.speaker === 0) {
      repSpeechTime += uttDuration;
    }
  }

  const repSpeechPct = totalSpeechTime > 0
    ? Math.round((repSpeechTime / totalSpeechTime) * 100)
    : 50;

  return {
    transcript,
    repSpeechPct,
    durationSeconds: duration,
  };
}

// ─── ANALYSE WITH GPT-4 ───────────────────────────────────────────────────────
export interface CallAnalysisReport {
  overallScore: number; // 0-100
  summary: string;
  stagesDetected: {
    stage: string;
    detected: boolean;
    quality: "strong" | "weak" | "missing";
    note: string;
  }[];
  strengths: string[];
  improvements: string[];
  topRecommendations: string[]; // exactly 3
  keyMoments: {
    moment: string;
    type: "positive" | "negative" | "critical";
    coaching: string;
  }[];
  scriptComplianceScore: number; // 0-100
  toneScore: number; // 0-100
  closingAttempted: boolean;
  magicWandUsed: boolean;
  customerName: string | null; // extracted from transcript, null if not found
}

function buildPrompt(
  callType: CallType,
  transcript: string,
  repSpeechPct: number,
  durationMinutes: number
): string {
  const context =
    callType === "opening"
      ? OPENING_CONTEXT
      : callType === "retention_cancel_trial"
      ? RETENTION_CANCEL_TRIAL_CONTEXT
      : RETENTION_WIN_BACK_CONTEXT;

  const stagesForType =
    callType === "opening"
      ? `[
    { "stage": "Opening", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Magic Wand Question", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Qualify", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Product Pitch", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Social Proof", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Offer & Close", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }
  ]`
      : callType === "retention_cancel_trial"
      ? `[
    { "stage": "Empathy Opening", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Discover Cancellation Reason", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Address the Concern", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Save the Trial", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Upsell to Annual Plan", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Close", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }
  ]`
      : `[
    { "stage": "Warm Re-engagement", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Check In on Skin", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Reframe the Value", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Introduce Annual Offer", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Handle Objections", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Close", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }
  ]`;

  const magicWandNote =
    callType === "opening"
      ? `"magicWandUsed": <bool — did the rep ask the Magic Wand Question?>,`
      : `"magicWandUsed": false,`;

  return `${context}

---

CALL TRANSCRIPT:
${transcript}

---

CALL STATS:
- Rep speech: ${repSpeechPct}% of conversation
- Duration: ${durationMinutes.toFixed(1)} minutes

---

Analyse this call and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence summary of the call>",
  "stagesDetected": ${stagesForType},
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "topRecommendations": ["<rec 1>", "<rec 2>", "<rec 3>"],
  "keyMoments": [
    { "moment": "<quote or description>", "type": "positive|negative|critical", "coaching": "<what to do differently or keep doing>" }
  ],
  "scriptComplianceScore": <number 0-100>,
  "toneScore": <number 0-100>,
  "closingAttempted": <bool>,
  ${magicWandNote}
  "customerName": "<first name of the customer if mentioned in the call, otherwise null>"
}

IMPORTANT: For customerName, look for the customer's first name — the rep usually addresses them by name during the call (e.g. "Hi Sarah", "So [Name]..."). Return just the first name as a string, or null if not found.

Be specific, actionable, and encouraging. Score based on the correct flow for this call type.`;
}

export async function analyseCallWithAI(
  transcript: string,
  repSpeechPct: number,
  durationMinutes: number,
  callType: CallType = "opening"
): Promise<CallAnalysisReport> {
  const prompt = buildPrompt(callType, transcript, repSpeechPct, durationMinutes);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as CallAnalysisReport;
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
export async function createCallAnalysisRecord(data: {
  userId: number;
  repName: string | null;
  audioFileKey: string;
  audioFileUrl: string;
  fileName: string;
  callDate?: Date | null;
  closeStatus?: "closed" | "not_closed" | "follow_up" | null;
  callType?: CallType;
}) {
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
    callType: data.callType ?? "opening",
    status: "pending",
  });

  return (result as any).insertId as number;
}

export async function updateCallAnalysisStatus(
  id: number,
  update: Partial<{
    status: "pending" | "transcribing" | "analyzing" | "done" | "error";
    transcript: string;
    repSpeechPct: number;
    durationSeconds: number;
    overallScore: number;
    analysisJson: string;
    errorMessage: string;
    customerName: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(callAnalyses).set(update).where(eq(callAnalyses.id, id));
}

export async function getCallAnalysisById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(callAnalyses).where(eq(callAnalyses.id, id)).limit(1);
  return results[0] ?? null;
}

export async function listCallAnalysesByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callAnalyses)
    .where(eq(callAnalyses.userId, userId))
    .orderBy(callAnalyses.createdAt);
}

export async function listAllCallAnalyses() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callAnalyses).orderBy(callAnalyses.createdAt);
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  repName: string;
  userId: number;
  totalCalls: number;
  avgScore: number | null;
  closedCalls: number;
  closeRate: number; // 0-100
  trend: "up" | "down" | "stable"; // based on last 3 vs previous 3 calls
  recentScores: number[]; // last 5 scores
  isReliable: boolean; // true if 5+ calls
}

export async function getLeaderboard(callType?: CallType): Promise<LeaderboardEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const query = db.select().from(callAnalyses)
    .where(eq(callAnalyses.status, "done"))
    .orderBy(callAnalyses.createdAt);

  const all = await query;

  // Filter by callType if specified
  const filtered = callType
    ? all.filter(r => r.callType === callType)
    : all;

  // Group by userId
  type CallRow = (typeof all)[number];
  const byUser = new Map<number, CallRow[]>();
  for (const row of filtered) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  const entries: LeaderboardEntry[] = [];

  for (const [userId, calls] of Array.from(byUser.entries())) {
    const repName = calls[calls.length - 1]?.repName ?? `Rep #${userId}`;
    const scoredCalls = calls.filter((c: CallRow) => c.overallScore != null);
    const scores: number[] = scoredCalls.map((c: CallRow) => c.overallScore as number);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    const closedCalls = calls.filter(c => c.closeStatus === "closed").length;
    const closeRate = calls.length > 0
      ? Math.round((closedCalls / calls.length) * 100)
      : 0;

    // Trend: compare avg of last 3 vs avg of previous 3
    let trend: "up" | "down" | "stable" = "stable";
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
      isReliable: calls.length >= 5,
    });
  }

  // Sort by avgScore desc, then totalCalls desc
  entries.sort((a, b) => {
    if (a.avgScore == null && b.avgScore == null) return 0;
    if (a.avgScore == null) return 1;
    if (b.avgScore == null) return -1;
    return b.avgScore - a.avgScore;
  });

  return entries;
}

// ─── FULL PIPELINE ────────────────────────────────────────────────────────────
export async function processCallAnalysis(analysisId: number, audioUrl: string, callType: CallType = "opening") {
  try {
    // Step 1: Transcribe
    await updateCallAnalysisStatus(analysisId, { status: "transcribing" });
    const { transcript, repSpeechPct, durationSeconds } = await transcribeAudio(audioUrl);

    await updateCallAnalysisStatus(analysisId, {
      transcript,
      repSpeechPct,
      durationSeconds,
    });

    // Step 2: Analyse using the correct prompt for this call type
    await updateCallAnalysisStatus(analysisId, { status: "analyzing" });
    const report = await analyseCallWithAI(transcript, repSpeechPct, durationSeconds / 60, callType);

    // Step 3: Save results (including AI-extracted customer name)
    const savePayload: Parameters<typeof updateCallAnalysisStatus>[1] = {
      status: "done",
      overallScore: report.overallScore,
      analysisJson: JSON.stringify(report),
    };
    if (report.customerName) savePayload.customerName = report.customerName;
    await updateCallAnalysisStatus(analysisId, savePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CallAnalysis] Failed for id=${analysisId}:`, message);
    await updateCallAnalysisStatus(analysisId, {
      status: "error",
      errorMessage: message,
    });
  }
}

// ─── AI FEEDBACK ─────────────────────────────────────────────────────

export interface FeedbackInput {
  analysisId: number;
  userId: number;
  section: "overall" | "script_compliance" | "tone" | "talk_ratio" | "recommendations" | "transcript" | "other";
  issue: string;
  comment: string | null;
}

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(aiFeedback).values({
    analysisId: input.analysisId,
    userId: input.userId,
    section: input.section,
    issue: input.issue,
    comment: input.comment,
  });
}

export interface FeedbackSummaryItem {
  id: number;
  analysisId: number;
  userId: number;
  section: string;
  issue: string;
  comment: string | null;
  createdAt: Date;
}

export async function getFeedbackSummary(): Promise<FeedbackSummaryItem[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(aiFeedback).orderBy(aiFeedback.createdAt);
  return rows.map(r => ({
    id: r.id,
    analysisId: r.analysisId,
    userId: r.userId,
    section: r.section,
    issue: r.issue,
    comment: r.comment ?? null,
    createdAt: r.createdAt,
  }));
}

// ─── UPDATE CALL DETAILS ──────────────────────────────────────────────────────

export interface UpdateCallDetailsInput {
  id: number;
  repName?: string;
  callDate?: Date;
  closeStatus?: "closed" | "not_closed" | "follow_up";
  customerName?: string;
  callType?: CallType;
  lastEditedByUserId?: number;
  lastEditedByName?: string;
}

export async function updateCallDetails(input: UpdateCallDetailsInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = {};
  if (input.repName !== undefined) updates.repName = input.repName;
  if (input.callDate !== undefined) updates.callDate = input.callDate;
  if (input.closeStatus !== undefined) updates.closeStatus = input.closeStatus;
  if (input.customerName !== undefined) updates.customerName = input.customerName;
  if (input.callType !== undefined) updates.callType = input.callType;
  if (input.lastEditedByUserId !== undefined) updates.lastEditedByUserId = input.lastEditedByUserId;
  if (input.lastEditedByName !== undefined) updates.lastEditedByName = input.lastEditedByName;
  // Always stamp the edit time when any detail is changed
  updates.lastEditedAt = new Date();
  if (Object.keys(updates).length === 1) return; // only lastEditedAt — nothing meaningful changed
  await db.update(callAnalyses).set(updates).where(eq(callAnalyses.id, input.id));
}
