import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { callAnalyses } from "../drizzle/schema";
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
  "magicWandUsed": <bool>
}

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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(callAnalyses).values({
    userId: data.userId,
    repName: data.repName,
    audioFileKey: data.audioFileKey,
    audioFileUrl: data.audioFileUrl,
    fileName: data.fileName,
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

    // Step 3: Save results
    await updateCallAnalysisStatus(analysisId, {
      status: "done",
      overallScore: report.overallScore,
      analysisJson: JSON.stringify(report),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CallAnalysis] Failed for id=${analysisId}:`, message);
    await updateCallAnalysisStatus(analysisId, {
      status: "error",
      errorMessage: message,
    });
  }
}
