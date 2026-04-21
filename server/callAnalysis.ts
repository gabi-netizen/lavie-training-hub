import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { callAnalyses, aiFeedback, users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

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
PAYMENT METHOD — IMPORTANT:
Approximately 30% of sales are completed via a secure payment form/link sent to the customer.
A sale is CLOSED and "closingAttempted" = true AND the call counts as a successful close if ANY of the following occur:
1. The rep takes card details directly on the call (standard method)
2. The rep sends a payment form/link to the customer AND the customer confirms they have filled it in / will fill it in
3. The customer mentions they already filled in the form/link before or during the call
Do NOT penalise a rep for using the form/link method — it is an equally valid and approved payment route.
If the transcript contains phrases like "I'll send you a link", "fill in the form", "I've filled it in", "sent you the form", "payment link" — treat this as a closing attempt. If the customer confirms completion, treat it as a successful close.
`;

// ─── TRANSCRIBE WITH DEEPGRAM ─────────────────────────────────────────────────
// ─── DETECT AUDIO CHANNEL COUNT ──────────────────────────────────────────────
function detectChannelCount(buffer: Buffer): number {
  // WAV: channels stored at byte offset 22-23 (little-endian uint16)
  if (buffer.length > 24 && buffer.slice(0, 4).toString() === "RIFF") {
    return buffer.readUInt16LE(22);
  }
  // MP3/other formats: assume mono — diarize handles it
  return 1;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  speaker: "Agent" | "Customer";
}

export async function transcribeAudio(audioUrl: string): Promise<{
  transcript: string;
  repSpeechPct: number;
  durationSeconds: number;
  wordTimestamps: WordTimestamp[];
}> {
  // Download audio first
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio for transcription: ${audioRes.status} ${audioRes.statusText}`);
  }
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";

  // Auto-detect stereo: if 2 channels, use multichannel (channel 0 = Agent, channel 1 = Customer)
  const channelCount = detectChannelCount(audioBuffer);
  const useMultichannel = channelCount >= 2;

  const transcribeOptions: any = {
    model: "nova-2",
    smart_format: true,
    punctuate: true,
    utterances: true,
    language: "en",
    mimetype: contentType,
  };

  if (useMultichannel) {
    transcribeOptions.multichannel = true;
  } else {
    transcribeOptions.diarize = true;
  }

  const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, transcribeOptions);
  const result = response as any;
  const duration = result?.metadata?.duration ?? 0;

  let transcript: string;
  let repSpeechPct: number;

  if (useMultichannel) {
    // Stereo: channel 0 = Agent (rep), channel 1 = Customer
    const channels: any[] = result?.results?.channels ?? [];
    const agentCh = channels[0];
    const customerCh = channels[1];

    type Line = { start: number; label: string; text: string };
    const lines: Line[] = [];

    // Try paragraphs/sentences first
    const agentSentences = agentCh?.alternatives?.[0]?.paragraphs?.paragraphs?.flatMap((p: any) => p.sentences) ?? [];
    const customerSentences = customerCh?.alternatives?.[0]?.paragraphs?.paragraphs?.flatMap((p: any) => p.sentences) ?? [];

    for (const s of agentSentences) {
      if ((s.text ?? "").trim()) lines.push({ start: s.start ?? 0, label: "Agent", text: s.text.trim() });
    }
    for (const s of customerSentences) {
      if ((s.text ?? "").trim()) lines.push({ start: s.start ?? 0, label: "Customer", text: s.text.trim() });
    }

    // Fallback: use utterances if sentences empty
    if (lines.length === 0) {
      const agentUtts = agentCh?.alternatives?.[0]?.paragraphs?.transcript ?? agentCh?.alternatives?.[0]?.transcript ?? "";
      const customerUtts = customerCh?.alternatives?.[0]?.paragraphs?.transcript ?? customerCh?.alternatives?.[0]?.transcript ?? "";
      if (agentUtts) lines.push({ start: 0, label: "Agent", text: agentUtts });
      if (customerUtts) lines.push({ start: 0.5, label: "Customer", text: customerUtts });
    }

    lines.sort((a, b) => a.start - b.start);

    // Merge consecutive same-speaker lines
    const merged: { label: string; text: string }[] = [];
    for (const line of lines) {
      if (!line.text) continue;
      if (merged.length > 0 && merged[merged.length - 1].label === line.label) {
        merged[merged.length - 1].text += " " + line.text;
      } else {
        merged.push({ label: line.label, text: line.text });
      }
    }

    transcript = merged.map(l => `${l.label}: ${l.text}`).join("\n");

    // Talk ratio from word-level timestamps
    const agentWords: any[] = agentCh?.alternatives?.[0]?.words ?? [];
    const customerWords: any[] = customerCh?.alternatives?.[0]?.words ?? [];
    const agentTime = agentWords.reduce((sum: number, w: any) => sum + ((w.end ?? 0) - (w.start ?? 0)), 0);
    const customerTime = customerWords.reduce((sum: number, w: any) => sum + ((w.end ?? 0) - (w.start ?? 0)), 0);
    const totalTime = agentTime + customerTime;
    repSpeechPct = totalTime > 0 ? Math.round((agentTime / totalTime) * 100) : 50;

    if (!transcript.trim()) {
      transcript = agentCh?.alternatives?.[0]?.transcript ?? "";
    }

    // Build word timestamps for interactive transcript
    const wordTimestamps: WordTimestamp[] = [
      ...agentWords.map((w: any) => ({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: "Agent" as const })),
      ...customerWords.map((w: any) => ({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: "Customer" as const })),
    ].sort((a, b) => a.start - b.start);

    return {
      transcript,
      repSpeechPct,
      durationSeconds: duration,
      wordTimestamps,
    };
  } else {
    // Mono diarization path
    const utterances: any[] = result?.results?.utterances ?? [];
    const speakerTimes: Record<number, number> = {};
    let totalSpeechTime = 0;
    for (const utt of utterances) {
      const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
      totalSpeechTime += uttDuration;
      const spk = utt.speaker ?? 0;
      speakerTimes[spk] = (speakerTimes[spk] ?? 0) + uttDuration;
    }
    let repSpeaker = 0;
    let repSpeechTime = 0;
    if (Object.keys(speakerTimes).length > 0) {
      const maxEntry = Object.entries(speakerTimes).reduce((a, b) => b[1] > a[1] ? b : a);
      repSpeaker = Number(maxEntry[0]);
      repSpeechTime = maxEntry[1];
    }
    if (utterances.length > 0) {
      transcript = utterances
        .map((utt) => {
          const label = utt.speaker === repSpeaker ? "Agent" : "Customer";
          return `${label}: ${(utt.transcript ?? "").trim()}`;
        })
        .join("\n");
    } else {
      transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    }
    repSpeechPct = totalSpeechTime > 0
      ? Math.round((repSpeechTime / totalSpeechTime) * 100)
      : 50;

    // Build word timestamps from utterances (mono/diarized path)
    const monoWordTimestamps: WordTimestamp[] = [];
    for (const utt of utterances) {
      const label: "Agent" | "Customer" = utt.speaker === repSpeaker ? "Agent" : "Customer";
      const words: any[] = utt.words ?? [];
      for (const w of words) {
        monoWordTimestamps.push({
          word: w.punctuated_word ?? w.word ?? "",
          start: w.start ?? 0,
          end: w.end ?? 0,
          speaker: label,
        });
      }
    }

    return {
      transcript,
      repSpeechPct,
      durationSeconds: duration,
      wordTimestamps: monoWordTimestamps,
    };
  }
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
  // ─── COMPLIANCE FIELDS ───
  subscriptionDisclosed: boolean;       // Did the rep clearly explain it's a subscription before closing?
  subscriptionMisrepresented: boolean;  // Did the rep say "No" or deny it's a subscription when asked?
  tcRead: boolean;                      // Did the rep read or reference the Terms & Conditions?
  complianceScore: number;              // 0-100. CRITICAL: must be 0-20 if subscriptionMisrepresented=true
  complianceIssues: string[];           // List of specific compliance violations found (empty if none)
  // ─── RETENTION-SPECIFIC ───
  saved?: boolean | null;
  upsellAttempted?: boolean | null;
  upsellSucceeded?: boolean | null;
  cancelReason?: string | null;
}

// ─── CALL TYPE CONTEXT BUILDERS ───────────────────────────────────────────────
function getCallTypeContext(callType: string): { context: string; stages: string[]; extraFields: string } {
  if (callType === "live_sub") {
    return {
      context: `
CALL TYPE: Live Sub (Premium Upsell Lead)
This customer is an ACTIVE subscriber who has NOT requested to cancel. This is a premium upsell opportunity.
The rep's PRIMARY goal is to introduce and close an additional product (Oulala retinol serum or Ashkara eye serum).
Score HIGH if the rep identified an upsell opportunity and closed it.
Score LOW if the rep missed the upsell opportunity entirely.
Do NOT penalise for missing "Magic Wand Question" — this is not a cold call script.
`,
      stages: ["Warm Rapport Building", "Needs Discovery", "Upsell Product Pitch", "Upsell Close", "Confirmation"],
      extraFields: `
  "saved": null,
  "upsellAttempted": <bool — did the rep introduce an additional product?>,
  "upsellSucceeded": <bool — did the customer agree to the upsell?>,
  "cancelReason": null,`,
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
  "saved": <bool — did the rep successfully retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`,
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
  "saved": <bool — did the rep successfully update payment and retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": null,`,
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
  "saved": <bool — did the rep retain/reactivate the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": null,`,
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
  "saved": <bool — did the rep successfully resolve and retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Trust issue | Other>",`,
    };
  }

  // Opening: cold_call, follow_up, or legacy "opening"
  return {
    context: callType === "follow_up"
      ? `
CALL TYPE: Follow-up (Opening Team)
This is a follow-up call to a previous conversation. The rep should reference the previous call, re-engage the customer's interest, and close the sale.
Score HIGH for: referencing previous conversation, re-engaging the customer's concern, and closing.
`
      : `
CALL TYPE: Cold Call (Opening Team)
This is a first-time outbound call to a new prospect. The full Lavie Labs script applies.
Score HIGH for: following all 7 stages of the script, using the Magic Wand Question, and closing.
`,
    stages: ["Opening", "Magic Wand Question", "Qualify", "Product Pitch", "Social Proof", "Offer & Close"],
    extraFields: `
  "saved": null,
  "upsellAttempted": null,
  "upsellSucceeded": null,
  "cancelReason": null,`,
  };
}

export async function analyseCallWithAI(
  transcript: string,
  repSpeechPct: number,
  durationMinutes: number,
  callType: string = "cold_call"
): Promise<CallAnalysisReport> {
  const { context: callTypeContext, stages, extraFields } = getCallTypeContext(callType);
  const stagesJson = stages.map(s =>
    `    { "stage": "${s}", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }`
  ).join(",\n");

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
  "subscriptionDisclosed": <bool — SUBSCRIPTION MENTION RULE: The agent does NOT need to use the word 'subscription' at all. Set this to FALSE only if the customer directly asked 'Is this a subscription?' or similar, AND the agent said No, denied it, or clearly dodged the question. If the customer never asked, set this to TRUE (no violation). If the customer asked and the agent confirmed it honestly in any way — including phrases like 'we'll top you up every 60 days', 'we'll send you a new Matinika every 60 days', 'we'll send it out every other month', 'we'll send it out every 2 months', or any similar explanation of the recurring delivery — set this to TRUE.>,
  "subscriptionMisrepresented": <bool — CRITICAL: Set TRUE only if the customer directly asked about the subscription AND the agent said No, denied it, or clearly evaded the question. Do NOT set TRUE just because the agent didn't use the word 'subscription' — explaining the recurring arrangement in plain language (e.g. 'we top you up every 60 days', 'we send a new one every 2 months') counts as a full and honest answer. If the customer never asked, this must be FALSE.>,
  "tcRead": <bool — FULL OFFER DETAILS CHECK: Set TRUE if the agent clearly communicated ALL of the following: (1) the £4.95 postage charge, (2) two products included, (3) DHL tracked delivery with a one-hour delivery slot, (4) the 21-day free trial period, (5) the £44.95 price every 60 days after the trial, AND (6) that the customer can stop, pause, cancel or amend at any time. The agent does NOT need to say the words 'terms and conditions' — what matters is that all these details were communicated. Set FALSE if any of these key details were missing.>,
  "complianceScore": <number 0-100. CRITICAL RULE: if subscriptionMisrepresented=true, this MUST be between 0-20 regardless of how good the rest of the call was. If tcRead=false (full offer details not communicated), deduct 20-30 points. Perfect compliance = 90-100.>,
  "complianceIssues": [<list of specific compliance violations as strings. Examples: "Rep denied subscription when directly asked", "£4.95 postage not mentioned", "21-day trial period not mentioned", "£44.95 recurring price not mentioned", "Cancellation/pause rights not mentioned", "DHL tracked delivery details not mentioned">],${extraFields}
}
COMPLIANCE SCORING RULES (apply strictly):
1. SUBSCRIPTION RULE: Only flag subscriptionMisrepresented=true if the customer directly asked 'Is this a subscription?' or similar AND the rep said No, denied it, or clearly dodged. Do NOT penalise the rep for not using the word 'subscription' — explaining the recurring arrangement in plain language is equally valid and acceptable. Examples of acceptable answers when asked: 'we'll top you up every 60 days', 'we'll send you a new Matinika every 60 days', 'we'll send it out every other month / every 2 months', or any similar honest description of the recurring delivery.
2. FULL OFFER DETAILS (tcRead): The rep must clearly communicate ALL of: £4.95 postage, two products, DHL tracked delivery with one-hour slot, 21-day free trial, £44.95 every 60 days, and the right to cancel/pause/stop/amend at any time. Missing any of these = tcRead=false → deduct 20-30 from complianceScore.
3. CANCELLATION CLARITY: The rep must give some clear indication that the customer can cancel, stop, pause, or amend at any time. The exact words don't matter — flag only if the rep gives NO indication at all that the customer can exit the arrangement.
4. Perfect compliance (subscriptionMisrepresented=false, tcRead=true) = complianceScore 90-100.
5. If subscriptionMisrepresented=true → complianceScore MUST be 0-20. This overrides everything else.

IMPORTANT: For customerName, look for the customer's first name — the rep usually addresses them by name during the call (e.g. "Hi Sarah", "So [Name], what I'd love to do..."). Return just the first name as a string, or null if not found.
Be specific, actionable, and encouraging. Focus on the call type objectives above.`;

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
  callType?: "cold_call" | "follow_up" | "live_sub" | "pre_cycle_cancelled" | "pre_cycle_decline" | "end_of_instalment" | "from_cat" | "other" | "opening" | "retention_cancel_trial" | "retention_win_back" | null;
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
    callType: (data.callType ?? "cold_call") as any,
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
    saved: boolean;
    upsellAttempted: boolean;
    upsellSucceeded: boolean;
    cancelReason: string;
    wordTimestamps: string;
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
    const { transcript, repSpeechPct, durationSeconds, wordTimestamps } = await transcribeAudio(audioUrl);
    await updateCallAnalysisStatus(analysisId, {
      transcript,
      repSpeechPct,
      durationSeconds,
      wordTimestamps: wordTimestamps.length > 0 ? JSON.stringify(wordTimestamps) : undefined,
    });
    // Step 2: Analyse — fetch callType from DB so the prompt is tailored
    await updateCallAnalysisStatus(analysisId, { status: "analyzing" });
    const record = await getCallAnalysisById(analysisId);
    const callType = record?.callType ?? "cold_call";
    const report = await analyseCallWithAI(transcript, repSpeechPct, durationSeconds / 60, callType);

    // Step 3: Save results (including AI-extracted customer name)
    const savePayload: Parameters<typeof updateCallAnalysisStatus>[1] = {
      status: "done",
      overallScore: report.overallScore,
      analysisJson: JSON.stringify(report),
    };
    if (report.customerName) savePayload.customerName = report.customerName;
    if (report.saved !== undefined && report.saved !== null) savePayload.saved = report.saved;
    if (report.upsellAttempted !== undefined && report.upsellAttempted !== null) savePayload.upsellAttempted = report.upsellAttempted;
    if (report.upsellSucceeded !== undefined && report.upsellSucceeded !== null) savePayload.upsellSucceeded = report.upsellSucceeded;
    if (report.cancelReason) savePayload.cancelReason = report.cancelReason;
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

// ─── CALL TYPE PERFORMANCE DASHBOARD ─────────────────────────────────────────
export interface CallTypePerformanceRow {
  callType: string;
  team: "opening" | "retention";
  totalCalls: number;
  avgScore: number | null;
  // Retention-specific
  saveRate: number | null;       // % saved (saved=true / total with saved!=null)
  upsellAttemptRate: number | null; // % upsell attempted
  upsellSuccessRate: number | null; // % upsell succeeded (of those attempted)
  // Cancel reasons breakdown (retention only)
  cancelReasons: Record<string, number>;
  // Per-agent breakdown
  byAgent: {
    userId: number;
    repName: string;
    totalCalls: number;
    avgScore: number | null;
    saveRate: number | null;
    upsellSuccessRate: number | null;
  }[];
}

const RETENTION_TYPES = new Set(["live_sub", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat"]);
const OPENING_TYPES = new Set(["cold_call", "follow_up"]);

export async function getCallTypePerformance(
  range: "today" | "week" | "month" | "all" = "all"
): Promise<CallTypePerformanceRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  let since: Date | null = null;
  if (range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "month") {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const rows = await db
    .select({
      callType: callAnalyses.callType,
      userId: callAnalyses.userId,
      repName: callAnalyses.repName,
      overallScore: callAnalyses.overallScore,
      saved: callAnalyses.saved,
      upsellAttempted: callAnalyses.upsellAttempted,
      upsellSucceeded: callAnalyses.upsellSucceeded,
      cancelReason: callAnalyses.cancelReason,
      createdAt: callAnalyses.createdAt,
    })
    .from(callAnalyses)
    .where(
      since
        ? sql`${callAnalyses.status} = 'done' AND ${callAnalyses.createdAt} >= ${since}`
        : eq(callAnalyses.status, "done")
    );

  // Group by callType
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    const ct = row.callType ?? "other";
    if (!grouped[ct]) grouped[ct] = [];
    grouped[ct].push(row);
  }

  const result: CallTypePerformanceRow[] = [];

  for (const [callType, calls] of Object.entries(grouped)) {
    const team = RETENTION_TYPES.has(callType) ? "retention" : "opening";

    const scores = calls.filter(c => c.overallScore != null).map(c => c.overallScore as number);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    // Save rate (retention only)
    const withSaved = calls.filter(c => c.saved !== null && c.saved !== undefined);
    const savedCount = withSaved.filter(c => c.saved === true).length;
    const saveRate = withSaved.length > 0 ? Math.round((savedCount / withSaved.length) * 100) : null;

    // Upsell rates
    const withUpsellAttempt = calls.filter(c => c.upsellAttempted !== null && c.upsellAttempted !== undefined);
    const upsellAttemptedCount = withUpsellAttempt.filter(c => c.upsellAttempted === true).length;
    const upsellAttemptRate = withUpsellAttempt.length > 0 ? Math.round((upsellAttemptedCount / withUpsellAttempt.length) * 100) : null;

    const withUpsellSuccess = calls.filter(c => c.upsellAttempted === true);
    const upsellSucceededCount = withUpsellSuccess.filter(c => c.upsellSucceeded === true).length;
    const upsellSuccessRate = withUpsellSuccess.length > 0 ? Math.round((upsellSucceededCount / withUpsellSuccess.length) * 100) : null;

    // Cancel reasons
    const cancelReasons: Record<string, number> = {};
    for (const c of calls) {
      if (c.cancelReason) {
        cancelReasons[c.cancelReason] = (cancelReasons[c.cancelReason] ?? 0) + 1;
      }
    }

    // Per-agent breakdown
    const agentMap: Record<number, typeof calls> = {};
    for (const c of calls) {
      if (!agentMap[c.userId]) agentMap[c.userId] = [];
      agentMap[c.userId].push(c);
    }

    const byAgent = Object.entries(agentMap).map(([uid, agentCalls]) => {
      const aScores = agentCalls.filter(c => c.overallScore != null).map(c => c.overallScore as number);
      const aAvgScore = aScores.length > 0 ? Math.round(aScores.reduce((a, b) => a + b, 0) / aScores.length) : null;
      const aWithSaved = agentCalls.filter(c => c.saved !== null && c.saved !== undefined);
      const aSavedCount = aWithSaved.filter(c => c.saved === true).length;
      const aSaveRate = aWithSaved.length > 0 ? Math.round((aSavedCount / aWithSaved.length) * 100) : null;
      const aWithUpsell = agentCalls.filter(c => c.upsellAttempted === true);
      const aUpsellSucceeded = aWithUpsell.filter(c => c.upsellSucceeded === true).length;
      const aUpsellSuccessRate = aWithUpsell.length > 0 ? Math.round((aUpsellSucceeded / aWithUpsell.length) * 100) : null;
      return {
        userId: Number(uid),
        repName: agentCalls[0]?.repName ?? "Unknown",
        totalCalls: agentCalls.length,
        avgScore: aAvgScore,
        saveRate: aSaveRate,
        upsellSuccessRate: aUpsellSuccessRate,
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
      byAgent,
    });
  }

  // Sort: retention first, then by totalCalls desc
  result.sort((a, b) => {
    if (a.team !== b.team) return a.team === "retention" ? -1 : 1;
    return b.totalCalls - a.totalCalls;
  });

  return result;
}

// ─── OPENING TEAM DASHBOARD ───────────────────────────────────────────────────

const OPENING_CALL_TYPES = new Set(["cold_call", "follow_up", "opening"]);

export interface OpeningAgentRow {
  repName: string;
  userId: number;
  totalCalls: number;
  // Close rates by duration bucket
  closeRate3Plus: number | null;   // calls >= 3 min
  closeRate10Plus: number | null;  // calls >= 10 min
  // Quality
  avgCallQuality: number | null;   // avg overallScore
  avgCompliance: number | null;    // avg complianceScore from analysisJson
  // Trend
  trend: "improving" | "stable" | "declining";
  // Top compliance failure
  topWeakSpot: string | null;
  // For drill-down
  scoreHistory: { date: string; score: number }[];
  bestCall: { id: number; score: number; date: string; audioFileUrl: string | null } | null;
  worstCall: { id: number; score: number; date: string; audioFileUrl: string | null } | null;
  complianceFailures: { issue: string; count: number }[];
  // Duration buckets: close rate for 3-5, 5-10, 10+
  durationBuckets: {
    "3-5": { calls: number; closed: number; closeRate: number | null };
    "5-10": { calls: number; closed: number; closeRate: number | null };
    "10+": { calls: number; closed: number; closeRate: number | null };
  };
}

export interface OpeningDashboardData {
  // KPI cards
  overallCloseRate3Plus: number | null;
  overallCloseRate10Plus: number | null;
  avgCallQuality: number | null;
  totalOpeningCalls: number;
  // Per-agent rows
  agents: OpeningAgentRow[];
}

export async function getOpeningDashboard(opts?: { dateFrom?: Date; dateTo?: Date }): Promise<OpeningDashboardData> {
  const db = await getDb();
  if (!db) return { overallCloseRate3Plus: null, overallCloseRate10Plus: null, avgCallQuality: null, totalOpeningCalls: 0, agents: [] };
  const all = await db
    .select()
    .from(callAnalyses)
    .where(sql`status = 'done'`);
  // Apply date range filter on callDate (falls back to createdAt)
  const filtered = all.filter(c => {
    const d = c.callDate ?? c.createdAt;
    if (!d) return true;
    if (opts?.dateFrom && d < opts.dateFrom) return false;
    if (opts?.dateTo && d > opts.dateTo) return false;
    return true;
  });
  // Replace `all` with `filtered` below
  const allForDashboard = filtered;

  // Filter to Opening team only
  const openingCalls = allForDashboard.filter(c =>
    c.callType == null || OPENING_CALL_TYPES.has(c.callType)
  );

  // Group by repName (case-insensitive)
  const byRep = new Map<string, typeof openingCalls>();
  for (const c of openingCalls) {
    const key = (c.repName?.trim() || "Unknown").toLowerCase();
    if (!byRep.has(key)) byRep.set(key, []);
    byRep.get(key)!.push(c);
  }

  // Helper: close rate for a subset of calls
  function closeRate(calls: typeof openingCalls): number | null {
    const withStatus = calls.filter(c => c.closeStatus != null);
    if (withStatus.length === 0) return null;
    const closed = withStatus.filter(c => c.closeStatus === "closed").length;
    return Math.round((closed / withStatus.length) * 100);
  }

  // Helper: duration bucket
  function bucket(c: (typeof openingCalls)[0]): "3-5" | "5-10" | "10+" | null {
    const sec = c.durationSeconds;
    if (sec == null) return null;
    if (sec >= 600) return "10+";
    if (sec >= 300) return "5-10";
    if (sec >= 180) return "3-5";
    return null;
  }

  const agents: OpeningAgentRow[] = [];

  for (const [, calls] of Array.from(byRep.entries())) {
    const repName = calls.slice().reverse().find(c => c.repName?.trim())?.repName ?? "Unknown";
    const userId = calls[calls.length - 1]?.userId ?? 0;

    // Duration-filtered close rates
    const calls3Plus = calls.filter(c => c.durationSeconds != null && c.durationSeconds >= 180);
    const calls10Plus = calls.filter(c => c.durationSeconds != null && c.durationSeconds >= 600);

    // Duration buckets
    const b35 = calls.filter(c => bucket(c) === "3-5");
    const b510 = calls.filter(c => bucket(c) === "5-10");
    const b10 = calls.filter(c => bucket(c) === "10+");

    // Avg call quality (overallScore)
    const scored = calls.filter(c => c.overallScore != null);
    const scores = scored.map(c => c.overallScore as number);
    const avgCallQuality = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    // Avg compliance score + top weak spots from analysisJson
    let complianceTotal = 0;
    let complianceCount = 0;
    const issueMap: Record<string, number> = {};
    for (const c of scored) {
      try {
        const r = JSON.parse(c.analysisJson ?? "{}") as {
          complianceScore?: number;
          complianceIssues?: string[];
        };
        if (r.complianceScore != null) {
          complianceTotal += r.complianceScore;
          complianceCount++;
        }
        for (const issue of r.complianceIssues ?? []) {
          issueMap[issue] = (issueMap[issue] ?? 0) + 1;
        }
      } catch { /* skip */ }
    }
    const avgCompliance = complianceCount > 0 ? Math.round(complianceTotal / complianceCount) : null;
    const complianceFailures = Object.entries(issueMap)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);
    const topWeakSpot = complianceFailures[0]?.issue ?? null;

    // Trend: last 5 vs previous 5
    let trend: "improving" | "stable" | "declining" = "stable";
    if (scores.length >= 6) {
      const recent = scores.slice(-5);
      const prev = scores.slice(-10, -5);
      if (prev.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
        if (recentAvg - prevAvg >= 5) trend = "improving";
        else if (prevAvg - recentAvg >= 5) trend = "declining";
      }
    }

    // Score history
    const scoreHistory = scored.map(c => ({
      date: (c.createdAt ?? new Date()).toISOString().split("T")[0],
      score: Math.round(c.overallScore as number),
    }));

    // Best / worst
    let bestCall: OpeningAgentRow["bestCall"] = null;
    let worstCall: OpeningAgentRow["worstCall"] = null;
    if (scored.length > 0) {
      const best = scored.reduce((a, b) => (a.overallScore! > b.overallScore! ? a : b));
      const worst = scored.reduce((a, b) => (a.overallScore! < b.overallScore! ? a : b));
      bestCall = { id: best.id, score: Math.round(best.overallScore!), date: (best.createdAt ?? new Date()).toISOString().split("T")[0], audioFileUrl: best.audioFileUrl };
      worstCall = { id: worst.id, score: Math.round(worst.overallScore!), date: (worst.createdAt ?? new Date()).toISOString().split("T")[0], audioFileUrl: worst.audioFileUrl };
    }

    agents.push({
      repName,
      userId,
      totalCalls: calls.length,
      closeRate3Plus: closeRate(calls3Plus),
      closeRate10Plus: closeRate(calls10Plus),
      avgCallQuality,
      avgCompliance,
      trend,
      topWeakSpot,
      scoreHistory,
      bestCall,
      worstCall,
      complianceFailures,
      durationBuckets: {
        "3-5": { calls: b35.length, closed: b35.filter(c => c.closeStatus === "closed").length, closeRate: closeRate(b35) },
        "5-10": { calls: b510.length, closed: b510.filter(c => c.closeStatus === "closed").length, closeRate: closeRate(b510) },
        "10+": { calls: b10.length, closed: b10.filter(c => c.closeStatus === "closed").length, closeRate: closeRate(b10) },
      },
    });
  }

  // Sort by avgCallQuality desc
  agents.sort((a, b) => {
    if (a.avgCallQuality == null) return 1;
    if (b.avgCallQuality == null) return -1;
    return b.avgCallQuality - a.avgCallQuality;
  });

  // Overall KPIs
  const all3Plus = openingCalls.filter(c => c.durationSeconds != null && c.durationSeconds >= 180);
  const all10Plus = openingCalls.filter(c => c.durationSeconds != null && c.durationSeconds >= 600);
  const allScored = openingCalls.filter(c => c.overallScore != null);
  const allScores = allScored.map(c => c.overallScore as number);

  return {
    overallCloseRate3Plus: closeRate(all3Plus),
    overallCloseRate10Plus: closeRate(all10Plus),
    avgCallQuality: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null,
    totalOpeningCalls: openingCalls.length,
    agents,
  };
}

// ─── BEST PRACTICE EXTRACTION ─────────────────────────────────────────────────
export interface BestPracticeInsight {
  pattern: string;
  impact: string;
  example: string;
  category: "opening" | "pitch" | "objection" | "close" | "compliance" | "tone";
  frequency: number;
}

export interface BestPracticesResult {
  insights: BestPracticeInsight[];
  topCallsAnalysed: number;
  generatedAt: string;
  teamAvgScore: number | null;
  topCallsAvgScore: number | null;
}

export async function getBestPractices(opts?: { dateFrom?: Date; dateTo?: Date }): Promise<BestPracticesResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allCalls = await db
    .select()
    .from(callAnalyses)
    .where(sql`status = 'done' AND analysisJson IS NOT NULL`);

  const openingTypes = ["cold_call", "follow_up", "opening"];
  let openingCalls = allCalls.filter(c => !c.callType || openingTypes.includes(c.callType));

  if (opts?.dateFrom || opts?.dateTo) {
    openingCalls = openingCalls.filter(c => {
      const d = c.callDate ? new Date(c.callDate) : (c.createdAt ? new Date(c.createdAt) : null);
      if (!d) return false;
      if (opts!.dateFrom && d < opts!.dateFrom) return false;
      if (opts!.dateTo && d > opts!.dateTo) return false;
      return true;
    });
  }

  if (openingCalls.length < 3) {
    throw new Error("Not enough calls to generate insights. Need at least 3 analysed calls.");
  }

  const scoredCalls = openingCalls.filter(c => c.overallScore != null);
  const teamAvgScore = scoredCalls.length > 0
    ? Math.round(scoredCalls.reduce((a, c) => a + (c.overallScore ?? 0), 0) / scoredCalls.length)
    : null;

  let topCalls = scoredCalls.filter(c => (c.overallScore ?? 0) >= 75);
  if (topCalls.length < 3) {
    const sorted = [...scoredCalls].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
    topCalls = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3)));
  }

  const topCallsAvgScore = topCalls.length > 0
    ? Math.round(topCalls.reduce((a, c) => a + (c.overallScore ?? 0), 0) / topCalls.length)
    : null;

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
- Key Moments: ${(report.keyMoments ?? []).filter((m: { type: string }) => m.type === "positive").slice(0, 2).map((m: { moment: string }) => m.moment).join("; ")}`;
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  let insights: BestPracticeInsight[] = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    insights = JSON.parse(cleaned);
  } catch {
    insights = [];
  }

  return {
    insights,
    topCallsAnalysed: topCalls.length,
    generatedAt: new Date().toISOString(),
    teamAvgScore,
    topCallsAvgScore,
  };
}
