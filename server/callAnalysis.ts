import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { callAnalyses, aiFeedback, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY ?? "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── LAVIE LABS SCRIPT CONTEXT ────────────────────────────────────────────────
const LAVIE_SCRIPT_CONTEXT = `
You are an expert sales coach for Lavie Labs, a UK skincare company.

The sales script has these key stages:
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

// ─── TRANSCRIBE WITH DEEPGRAM ─────────────────────────────────────────────────
export async function transcribeAudio(audioUrl: string): Promise<{
  transcript: string;
  repSpeechPct: number;
  durationSeconds: number;
}> {
  // Deepgram v5 SDK uses transcribeFile — download audio first then pass as buffer
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio for transcription: ${audioRes.status} ${audioRes.statusText}`);
  }
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";

  const response = await deepgram.listen.v1.media.transcribeFile(
    audioBuffer,
    {
      model: "nova-2",
      smart_format: true,
      diarize: true,
      punctuate: true,
      utterances: true,
      language: "en",
      mimetype: contentType,
    } as any
  );

  const result = response as any;
  const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  const duration = result?.metadata?.duration ?? 0;

  // Calculate rep speech percentage using diarization
  // The rep is the speaker with the MOST total speech time (they drive the call).
  // We cannot assume Speaker 0 is always the rep — Deepgram assigns IDs by first appearance.
  const utterances: any[] = result?.results?.utterances ?? [];
  const speakerTimes: Record<number, number> = {};
  let totalSpeechTime = 0;

  for (const utt of utterances) {
    const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
    totalSpeechTime += uttDuration;
    const spk = utt.speaker ?? 0;
    speakerTimes[spk] = (speakerTimes[spk] ?? 0) + uttDuration;
  }

  // Rep = speaker with most speech time
  let repSpeechTime = 0;
  if (Object.keys(speakerTimes).length > 0) {
    repSpeechTime = Math.max(...Object.values(speakerTimes));
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

export async function analyseCallWithAI(
  transcript: string,
  repSpeechPct: number,
  durationMinutes: number
): Promise<CallAnalysisReport> {
  const prompt = `${LAVIE_SCRIPT_CONTEXT}

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
    { "stage": "Opening", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Magic Wand Question", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Qualify", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Product Pitch", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Social Proof", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" },
    { "stage": "Offer & Close", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }
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
  "customerName": "<first name of the customer if mentioned in the call, otherwise null>"
}

IMPORTANT: For customerName, look for the customer's first name — the rep usually addresses them by name during the call (e.g. "Hi Sarah", "So [Name], what I'd love to do..."). Return just the first name as a string, or null if not found.

Be specific, actionable, and encouraging. Focus on Lavie Labs script compliance.`;

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
  callType?: "opening" | "retention_cancel_trial" | "retention_win_back" | null;
  source?: "manual" | "webhook";
  cloudtalkCallId?: string | null;
  contactId?: number | null;
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
    source: data.source ?? "manual",
    cloudtalkCallId: data.cloudtalkCallId ?? null,
    contactId: data.contactId ?? null,
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

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(callAnalyses)
    .where(eq(callAnalyses.status, "done"))
    .orderBy(callAnalyses.createdAt);

  // Group by userId
  type CallRow = (typeof all)[number];
  const byUser = new Map<number, CallRow[]>();
  for (const row of all) {
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
export async function processCallAnalysis(analysisId: number, audioUrl: string) {
  try {
    // Step 1: Transcribe
    await updateCallAnalysisStatus(analysisId, { status: "transcribing" });
    const { transcript, repSpeechPct, durationSeconds } = await transcribeAudio(audioUrl);

    await updateCallAnalysisStatus(analysisId, {
      transcript,
      repSpeechPct,
      durationSeconds,
    });

    // Step 2: Analyse
    await updateCallAnalysisStatus(analysisId, { status: "analyzing" });
    const report = await analyseCallWithAI(transcript, repSpeechPct, durationSeconds / 60);

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
  callType?: "opening" | "retention_cancel_trial" | "retention_win_back";
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

// ─── DELETE FAILED ANALYSIS ───────────────────────────────────────────────────
/**
 * Deletes a call analysis record — only allowed when status is "error".
 * Returns true if deleted, false if not found or not in error state.
 */
export async function deleteFailedAnalysis(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db.select({ id: callAnalyses.id, status: callAnalyses.status })
    .from(callAnalyses)
    .where(eq(callAnalyses.id, id))
    .limit(1);

  if (!row) return false;
  if (row.status !== "error") return false;

  await db.delete(callAnalyses).where(eq(callAnalyses.id, id));
  return true;
}

// ─── REP PROFILE & TEAM DASHBOARD ────────────────────────────────────────────

export interface RepProfileData {
  repName: string;
  userId: number;
  totalCalls: number;
  allTimeAvg: number | null;
  last10Avg: number | null;
  trendIndicator: "improving" | "stable" | "declining";
  trendDelta: number; // last10Avg - allTimeAvg
  rank: number; // 1-based rank among all reps
  totalReps: number;
  closeRate: number;
  avgTalkRatio: number | null;
  scriptComplianceAvg: number | null;
  toneAvg: number | null;
  scoreHistory: { date: string; score: number }[]; // all scored calls sorted by date
  bestCall: { id: number; score: number; fileName: string | null; date: string } | null;
  worstCall: { id: number; score: number; fileName: string | null; date: string } | null;
  isReliable: boolean; // true if 5+ calls
}

export async function getTeamDashboard(): Promise<RepProfileData[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(callAnalyses)
    .where(eq(callAnalyses.status, "done"))
    .orderBy(callAnalyses.createdAt);

  type CallRow = (typeof all)[number];

  // Group by repName (case-insensitive, trimmed) — same logic as Manager View
  // Falls back to "Unknown Rep" when repName is null/empty
  const byRepName = new Map<string, CallRow[]>();
  for (const row of all) {
    const key = (row.repName?.trim() || "Unknown Rep").toLowerCase();
    if (!byRepName.has(key)) byRepName.set(key, []);
    byRepName.get(key)!.push(row);
  }

  // First pass: compute allTimeAvg for ranking
  const repEntries: Array<{ repKey: string; allTimeAvg: number | null; calls: CallRow[] }> = [];
  for (const [repKey, calls] of Array.from(byRepName.entries())) {
    const scored = calls.filter(c => c.overallScore != null);
    const scores = scored.map(c => c.overallScore as number);
    const allTimeAvg = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    repEntries.push({ repKey, allTimeAvg, calls });
  }

  // Sort by allTimeAvg desc for ranking
  repEntries.sort((a, b) => {
    if (a.allTimeAvg == null && b.allTimeAvg == null) return 0;
    if (a.allTimeAvg == null) return 1;
    if (b.allTimeAvg == null) return -1;
    return b.allTimeAvg - a.allTimeAvg;
  });

  const totalReps = repEntries.length;
  const profiles: RepProfileData[] = [];

  for (let rankIdx = 0; rankIdx < repEntries.length; rankIdx++) {
    const { repKey, allTimeAvg, calls } = repEntries[rankIdx];
    // Use the most recent non-null repName, or capitalise the key as fallback
    const repName = calls.slice().reverse().find(c => c.repName?.trim())?.repName
      ?? repKey.charAt(0).toUpperCase() + repKey.slice(1);
    // Representative userId: use the most common userId in this group
    const userId = calls[calls.length - 1]?.userId ?? 0;
    const scored = calls.filter(c => c.overallScore != null);
    const scores = scored.map(c => c.overallScore as number);

    // Last 10 avg
    const last10Scores = scores.slice(-10);
    const last10Avg = last10Scores.length > 0
      ? Math.round(last10Scores.reduce((a, b) => a + b, 0) / last10Scores.length)
      : null;

    // Trend indicator: compare last10Avg vs allTimeAvg
    const trendDelta = (last10Avg != null && allTimeAvg != null) ? last10Avg - allTimeAvg : 0;
    let trendIndicator: "improving" | "stable" | "declining" = "stable";
    if (trendDelta >= 5) trendIndicator = "improving";
    else if (trendDelta <= -5) trendIndicator = "declining";

    // Close rate
    const closedCalls = calls.filter(c => c.closeStatus === "closed").length;
    const closeRate = calls.length > 0 ? Math.round((closedCalls / calls.length) * 100) : 0;

    // Avg talk ratio
    const withTalkRatio = calls.filter(c => c.repSpeechPct != null);
    const avgTalkRatio = withTalkRatio.length > 0
      ? Math.round(withTalkRatio.reduce((a, c) => a + (c.repSpeechPct as number), 0) / withTalkRatio.length)
      : null;

    // Category avgs from analysisJson
    let scriptComplianceTotal = 0, toneTotal = 0, catCount = 0;
    for (const call of scored) {
      try {
        const report = JSON.parse(call.analysisJson ?? "{}") as Partial<CallAnalysisReport>;
        if (report.scriptComplianceScore != null && report.toneScore != null) {
          scriptComplianceTotal += report.scriptComplianceScore;
          toneTotal += report.toneScore;
          catCount++;
        }
      } catch { /* skip malformed */ }
    }
    const scriptComplianceAvg = catCount > 0 ? Math.round(scriptComplianceTotal / catCount) : null;
    const toneAvg = catCount > 0 ? Math.round(toneTotal / catCount) : null;

    // Score history (all scored calls, sorted by date)
    const scoreHistory = scored.map(c => ({
      date: (c.createdAt ?? new Date()).toISOString().split("T")[0],
      score: Math.round(c.overallScore as number),
    }));

    // Best and worst calls
    let bestCall: RepProfileData["bestCall"] = null;
    let worstCall: RepProfileData["worstCall"] = null;
    if (scored.length > 0) {
      const best = scored.reduce((a, b) => (a.overallScore! > b.overallScore! ? a : b));
      const worst = scored.reduce((a, b) => (a.overallScore! < b.overallScore! ? a : b));
      bestCall = {
        id: best.id,
        score: Math.round(best.overallScore!),
        fileName: best.fileName ?? null,
        date: (best.createdAt ?? new Date()).toISOString().split("T")[0],
      };
      worstCall = {
        id: worst.id,
        score: Math.round(worst.overallScore!),
        fileName: worst.fileName ?? null,
        date: (worst.createdAt ?? new Date()).toISOString().split("T")[0],
      };
    }

    profiles.push({
      repName,
      userId: userId,
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
      isReliable: calls.length >= 5,
    });
  }

  return profiles;
}

// ─── AGENT DASHBOARD (admin view) ─────────────────────────────────────────────
export interface AgentSummary {
  userId: number;
  repName: string;
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  avgScore: number | null;
  last10Avg: number | null;
  trendDelta: number;
  trendIndicator: "improving" | "stable" | "declining";
  lastCallAt: string | null;
  lastCallScore: number | null;
  lastCallCustomer: string | null;
  lastCallStatus: string | null;
  closeRate: number;
  pendingCalls: number;
  recentCalls: Array<{
    id: number;
    createdAt: string;
    callDate: string | null;
    customerName: string | null;
    overallScore: number | null;
    closeStatus: string | null;
    status: string;
    source: string | null;
    callType: string | null;
    repSpeechPct: number | null;
  }>;
}

export async function getAgentDashboard(): Promise<AgentSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(callAnalyses).orderBy(callAnalyses.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const byUser = new Map<number, typeof all>();
  for (const row of all) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const summaries: AgentSummary[] = [];

  for (const [userId, calls] of Array.from(byUser.entries())) {
    const user = userMap.get(userId);
    const repName = user?.name ?? calls[calls.length - 1]?.repName ?? `Rep #${userId}`;

    const doneCalls = calls.filter((c) => c.status === "done");
    const pendingCalls = calls.filter(
      (c) => c.status === "pending" || c.status === "transcribing" || c.status === "analyzing"
    ).length;

    const scored = doneCalls.filter((c) => c.overallScore != null);
    const scores = scored.map((c) => c.overallScore as number);
    const avgScore =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const last10Scores = scores.slice(-10);
    const last10Avg =
      last10Scores.length > 0
        ? Math.round(last10Scores.reduce((a, b) => a + b, 0) / last10Scores.length)
        : null;
    const trendDelta = last10Avg != null && avgScore != null ? last10Avg - avgScore : 0;
    const trendIndicator: "improving" | "stable" | "declining" =
      trendDelta >= 5 ? "improving" : trendDelta <= -5 ? "declining" : "stable";

    const callsToday = calls.filter((c) => new Date(c.createdAt) >= todayStart).length;
    const callsThisWeek = calls.filter((c) => new Date(c.createdAt) >= weekStart).length;

    const lastCall = calls[calls.length - 1] ?? null;

    const closedCount = doneCalls.filter((c) => c.closeStatus === "closed").length;
    const closeRate =
      doneCalls.length > 0 ? Math.round((closedCount / doneCalls.length) * 100) : 0;

    const recentCalls = [...calls]
      .reverse()
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        createdAt: new Date(c.createdAt).toISOString(),
        callDate: c.callDate ? new Date(c.callDate).toISOString() : null,
        customerName: c.customerName ?? null,
        overallScore: c.overallScore != null ? Math.round(c.overallScore) : null,
        closeStatus: c.closeStatus ?? null,
        status: c.status,
        source: (c as any).source ?? null,
        callType: c.callType ?? null,
        repSpeechPct: c.repSpeechPct != null ? Math.round(c.repSpeechPct) : null,
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
      recentCalls,
    });
  }

  summaries.sort((a, b) => b.totalCalls - a.totalCalls);
  return summaries;
}
