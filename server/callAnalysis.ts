import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { getDb } from "./db";
import { callAnalyses, aiFeedback, users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { storageGet } from "./storage";
import { ENV } from "./_core/env";

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

// ─── SMART AGENT SPEAKER DETECTION ──────────────────────────────────────────
/**
 * Determines which Deepgram speaker ID corresponds to the sales agent.
 *
 * Strategy (in order of priority):
 * 1. Content-based: scan early utterances/words for agent-identifying phrases
 *    (self-introduction with company name, product names, pricing, etc.)
 * 2. Speech-time heuristic: in outbound sales calls the agent typically speaks
 *    more than the customer — pick the speaker with the most total speech time.
 * 3. Final fallback: first speaker (original behaviour).
 *
 * @param items  Array of utterances or word objects, each with `.speaker` (number)
 *               and `.transcript` / `.word` / `.punctuated_word` text.
 * @param firstSpeaker  The speaker ID of the very first item (used as fallback).
 * @returns The speaker ID that most likely belongs to the agent.
 */
function detectAgentSpeaker(
  items: Array<{ speaker?: number; transcript?: string; word?: string; punctuated_word?: string; start?: number; end?: number }>,
  firstSpeaker: number
): number {
  // ── 1. Content-based detection ──────────────────────────────────────────────
  // Patterns that strongly indicate the speaker is the Lavie Labs sales agent.
  // We check the first 150 items so we don't scan the entire (potentially huge) array.
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
    /\blong\s+number\b/i,   // asking for card number
    /\bsort\s+code\b/i,
    /\bexpiry\b/i,
  ];

  // Collect text per speaker from the first 150 items
  const speakerTexts: Record<number, string> = {};
  const speakerTimes: Record<number, number> = {};
  const SCAN_LIMIT = 150;

  for (let i = 0; i < Math.min(items.length, SCAN_LIMIT); i++) {
    const item = items[i];
    const spk = item.speaker ?? firstSpeaker;
    const text = (item.transcript ?? item.punctuated_word ?? item.word ?? "").toLowerCase();
    speakerTexts[spk] = (speakerTexts[spk] ?? "") + " " + text;
  }

  // Also accumulate speech time across ALL items for the fallback heuristic
  for (const item of items) {
    const spk = item.speaker ?? firstSpeaker;
    const dur = (item.end ?? 0) - (item.start ?? 0);
    speakerTimes[spk] = (speakerTimes[spk] ?? 0) + dur;
  }

  // Score each speaker by how many agent patterns match their early text
  const speakerScores: Record<number, number> = {};
  for (const [spkStr, text] of Object.entries(speakerTexts)) {
    const spk = Number(spkStr);
    let score = 0;
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.test(text)) score++;
    }
    speakerScores[spk] = score;
  }

  const bestContentMatch = Object.entries(speakerScores)
    .sort(([, a], [, b]) => b - a)[0];

  if (bestContentMatch && Number(bestContentMatch[1]) >= 1) {
    const detectedSpeaker = Number(bestContentMatch[0]);
    console.log(`[SpeakerDetection] Content-based: speaker_${detectedSpeaker} identified as Agent (score=${bestContentMatch[1]})`);
    return detectedSpeaker;
  }

  // ── 2. Speech-time heuristic ─────────────────────────────────────────────────
  // In outbound sales calls the agent typically talks more than the customer.
  // Pick the speaker with the most cumulative speech time.
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

  // ── 3. Fallback: first speaker ───────────────────────────────────────────────
  console.log(`[SpeakerDetection] Fallback: using first speaker (speaker_${firstSpeaker}) as Agent`);
  return firstSpeaker;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  speaker: "Agent" | "Customer";
}


// ─── SINGLE-SPEAKER POST-PROCESSING ───────────────────────────────────────────
/**
 * Fixes speaker diarization when Deepgram returns all words as a single speaker
 * but the call actually contains two speakers (IVR/voicemail OR a real customer
 * who gives short responses that Deepgram fails to diarize).
 *
 * Algorithm:
 * 1. Confirm all words share the same speaker label (single-speaker transcript).
 * 2. Check for IVR/voicemail phrases OR agent-specific patterns + customer signals.
 * 3. Gap-split words into utterance chunks (≥0.3 s silence = likely speaker change).
 * 4. Label each chunk by priority:
 *    a. Contains AGENT_PATTERNS → Agent
 *    b. Contains CUSTOMER_PHRASE_PATTERNS (incl. IVR phrases) → Customer
 *    c. 1-2 words that are all short responses ("yes", "hi", "bye" …) → Customer
 *    d. Short chunk (≤4 words) that is NOT the first chunk → Customer
 *    e. First chunk / default → Agent
 * 5. Rebuild wordTimestamps, repSpeechPct, and transcript.
 */
function applySingleSpeakerSplitFix(wordTimestamps: WordTimestamp[]): { wordTimestamps: WordTimestamp[], repSpeechPct: number, transcript: string } | null {
  // ── Guard: must be a single-speaker transcript ──────────────────────────────
  if (wordTimestamps.length === 0) return null;
  const firstSpeaker = wordTimestamps[0].speaker;
  if (!wordTimestamps.every(w => w.speaker === firstSpeaker)) return null;

  // ── Full-text for phrase detection ───────────────────────────────────────────
  const fullText = wordTimestamps.map(w => w.word).join(" ").toLowerCase();

  // ── Agent-specific patterns (Lavie Labs context) ──────────────────────────────
  const AGENT_PATTERNS = [
    // Company / brand
    /\bla\s*vie\b/i, /\blavie\b/i, /\bla\s*vie\s*labs\b/i,
    /\blovely\s*labs\b/i, /\blavi\s*labs\b/i,
    // Products
    /\bmatinika\b/i, /\boulala\b/i, /\bashkara\b/i, /\bcollagen\b/i,
    // Pricing / offer
    /\b4\.95\b/, /\b£\s*4\.95\b/,
    /\b21[\s-]day\s*(free\s*)?trial\b/i,
    /\b44\.90\b/, /\b£\s*44\.90\b/,
    /\bhyaluronic\s*acid\b/i, /\bretinol\b/i, /\btrustpilot\b/i,
    // Agent speech acts
    /\bthis\s+is\s+\w+\s+from\b/i,
    /\bmy\s+name\s+is\b/i,
    /\bcalling\s+from\b/i,
    /\bcalling\s+on\s+behalf\s+of\b/i,
    /\bfree\s+trial\b/i, /\bmagic\s+wand\b/i, /\bcancel\s+any\s*time\b/i,
    /\bpostage\b/i, /\bdelivery\s+address\b/i, /\blong\s+number\b/i,
    /\bsort\s+code\b/i, /\bexpiry\b/i,
    /\bskin\s*care\b/i, /\bmedical\s*grade\b/i,
  ];

  // ── Customer-specific phrase patterns (incl. IVR) ─────────────────────────────
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
    /^speaking\s*$/i,
  ];

  // Short standalone responses that are clearly the customer
  const CUSTOMER_SHORT_RESPONSES = new Set([
    "yes", "yeah", "yep", "yup", "no", "nope", "okay", "ok",
    "bye", "goodbye", "hello", "hi", "hey", "sure", "fine",
    "alright", "right", "speaking",
  ]);

  // ── Decide whether to apply the fix ──────────────────────────────────────────
  const hasIvr = CUSTOMER_PHRASE_PATTERNS.some(p => p.test(fullText));
  const hasAgentPatterns = AGENT_PATTERNS.some(p => p.test(fullText));
  const hasShortResponses = wordTimestamps.some(
    w => CUSTOMER_SHORT_RESPONSES.has(w.word.toLowerCase().replace(/[^a-z]/g, ''))
  );

  if (!hasIvr && !hasAgentPatterns) {
    return null; // Not a Lavie call — don't touch it
  }
  if (!hasIvr && !hasShortResponses) {
    return null; // Agent patterns present but no customer signals — likely already correct
  }

  console.log(
    `[Transcription] Single-speaker ${hasIvr ? 'IVR/voicemail' : 'conversation'} detected. Applying split fix.`
  );

  // ── Step 1: Gap-split words into utterance chunks ─────────────────────────────
  // A silence gap ≥ 0.3 s between consecutive words is treated as a potential
  // speaker-change boundary. This is the most reliable signal we have when
  // Deepgram fails to diarize.
  const GAP_THRESHOLD = 0.3; // seconds
  type Chunk = { words: WordTimestamp[]; start: number; end: number };
  const chunks: Chunk[] = [];
  let curChunk: Chunk = { words: [wordTimestamps[0]], start: wordTimestamps[0].start, end: wordTimestamps[0].end };
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

  // ── Step 2: Label each chunk ──────────────────────────────────────────────────
  // First pass: assign labels where patterns give a definitive answer.
  // Unresolved chunks are marked null and filled in a second pass using
  // an alternating-speaker heuristic.
  const resolvedLabels: ("Agent" | "Customer" | null)[] = chunks.map((chunk, chunkIndex) => {
    const chunkText = chunk.words.map(w => w.word).join(" ");
    const chunkLower = chunkText.toLowerCase();
    const cleanWords = chunkLower.replace(/[^a-z\s]/g, '').trim().split(/\s+/);

    // Priority 1: Agent-specific patterns → always Agent
    if (AGENT_PATTERNS.some(p => p.test(chunkLower))) return "Agent";

    // Priority 2: Customer-specific phrases (incl. IVR) → always Customer
    if (CUSTOMER_PHRASE_PATTERNS.some(p => p.test(chunkLower))) return "Customer";

    // Priority 3: 1-2 words that are all short responses → Customer
    if (cleanWords.length <= 2 && cleanWords.every(w => CUSTOMER_SHORT_RESPONSES.has(w))) {
      return "Customer";
    }

    // Priority 4: Short chunk (≤4 words) that is NOT the first chunk → Customer
    // These are customer interjections ("Yes", "Okay", "Hi") between agent blocks.
    if (chunk.words.length <= 4 && chunkIndex > 0) return "Customer";

    // No definitive match — defer to second pass
    return null;
  });

  // Second pass: fill null labels using alternating-speaker logic.
  // In a cold call the customer answers first, so the first unresolved chunk
  // defaults to Customer.  After each definitively-labelled chunk the expected
  // next speaker flips.  When in doubt, prefer Customer over Agent.
  let lastKnownLabel: "Agent" | "Customer" = "Customer"; // cold-call default: customer answers
  // Seed lastKnownLabel from the first definitively-resolved chunk, if any.
  for (const lbl of resolvedLabels) {
    if (lbl !== null) { lastKnownLabel = lbl; break; }
  }

  const chunkLabels: ("Agent" | "Customer")[] = resolvedLabels.map((lbl, chunkIndex) => {
    if (lbl !== null) {
      lastKnownLabel = lbl;
      return lbl;
    }
    // Unresolved: alternate from the last known speaker.
    // If the last known speaker was Agent, the next unknown is Customer, and vice versa.
    const alternated: "Agent" | "Customer" = lastKnownLabel === "Agent" ? "Customer" : "Agent";
    // Special case: the very first chunk in a cold call is almost always the customer
    // answering the phone, unless an agent pattern already resolved it above.
    if (chunkIndex === 0) {
      lastKnownLabel = "Customer";
      return "Customer";
    }
    lastKnownLabel = alternated;
    return alternated;
  });

  // ── Step 3: Propagate chunk labels back to individual words ───────────────────
  let agentTime = 0;
  let totalTime = 0;
  let wordIdx = 0;
  const newWordTimestamps: WordTimestamp[] = [];
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

  // ── Step 4: Recalculate repSpeechPct ─────────────────────────────────────────
  const repSpeechPct = totalTime > 0 ? Math.round((agentTime / totalTime) * 100) : 50;

  // ── Step 5: Rebuild transcript ────────────────────────────────────────────────
  type Segment = { label: "Agent" | "Customer"; words: string[]; start: number; end: number };
  const segments: Segment[] = [];
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
  const transcript = segments.map(s => `${s.label}: ${s.words.join(" ")}`).join("\n");

  return { wordTimestamps: newWordTimestamps, repSpeechPct, transcript };
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

  // ─── AUDIO CHUNKING: files over 24MB are split into 24MB chunks ─────────────
  // Deepgram's API has a 25MB limit per request. We split large files into
  // 24MB chunks, transcribe each separately, then merge the transcripts.
  const CHUNK_SIZE = 24 * 1024 * 1024; // 24MB
  let mergedTranscript = "";
  let mergedRepSpeechPct = 50;
  let mergedDuration = 0;
  const mergedWordTimestamps: WordTimestamp[] = [];

  if (audioBuffer.length > CHUNK_SIZE) {
    console.log(`[Transcription] File is ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB — splitting into chunks`);
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
      chunks.push(audioBuffer.slice(offset, offset + CHUNK_SIZE));
    }
    let totalAgentTime = 0;
    let totalSpeechTime = 0;
    let timeOffset = 0;
    let firstChunkRepSpeaker = 0; // Will be set from the first chunk's first speaker
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Transcription] Processing chunk ${i + 1}/${chunks.length}`);
      const chunkOptions: any = { model: "nova-2", smart_format: true, punctuate: true, utterances: true, language: "en", mimetype: contentType, diarize: true };
      const chunkTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Deepgram chunk ${i + 1} timed out after 15 minutes`)), 900_000)
      );
      const chunkResponse = await Promise.race([
        deepgram.listen.v1.media.transcribeFile(chunks[i], chunkOptions),
        chunkTimeout,
      ]) as any;
      const chunkDuration = chunkResponse?.metadata?.duration ?? 0;
      const utterances: any[] = chunkResponse?.results?.utterances ?? [];
      // Detect rep speaker: for the first chunk, use smart detection (content + speech-time).
      // For subsequent chunks, reuse the repSpeaker from the first chunk for consistency.
      if (i === 0 && utterances.length > 0) {
        const firstSpk = utterances[0].speaker ?? 0;
        firstChunkRepSpeaker = detectAgentSpeaker(utterances, firstSpk);
      }
      const repSpeaker = firstChunkRepSpeaker;
      for (const utt of utterances) {
        const label: "Agent" | "Customer" = utt.speaker === repSpeaker ? "Agent" : "Customer";
        const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
        totalSpeechTime += uttDuration;
        if (label === "Agent") totalAgentTime += uttDuration;
        if ((utt.transcript ?? "").trim()) {
          mergedTranscript += (mergedTranscript ? "\n" : "") + `${label}: ${utt.transcript.trim()}`;
        }
        // Adjust word timestamps by chunk time offset
        for (const w of (utt.words ?? [])) {
          mergedWordTimestamps.push({
            word: w.punctuated_word ?? w.word ?? "",
            start: (w.start ?? 0) + timeOffset,
            end: (w.end ?? 0) + timeOffset,
            speaker: label,
          });
        }
      }
      timeOffset += chunkDuration;
      mergedDuration += chunkDuration;
    }
    mergedRepSpeechPct = totalSpeechTime > 0 ? Math.round((totalAgentTime / totalSpeechTime) * 100) : 50;
    return { transcript: mergedTranscript, repSpeechPct: mergedRepSpeechPct, durationSeconds: mergedDuration, wordTimestamps: mergedWordTimestamps };
  }

  // ─── SINGLE FILE PATH (under 24MB) ───────────────────────────────────────────
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

  // 15-minute timeout for Deepgram transcription (long calls can take several minutes)
  const deepgramTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Deepgram transcription timed out after 15 minutes")), 900_000)
  );
  const response = await Promise.race([
    deepgram.listen.v1.media.transcribeFile(audioBuffer, transcribeOptions),
    deepgramTimeout,
  ]);
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
    // ─── MONO DIARIZATION PATH ────────────────────────────────────────────────
    // We use WORD-LEVEL speaker tags (not utterances) so that every single-word
    // customer response ("No", "Neither", "Yes") gets its own line.
    // Utterance-level grouping merges short responses into the previous speaker.
    const allWords: any[] = result?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

    // Fallback: if no word-level data, use utterances
    const utterances: any[] = result?.results?.utterances ?? [];

    if (allWords.length > 0) {
      // Step 1: determine rep speaker using smart detection.
      // detectAgentSpeaker() checks content patterns first (company/product names, pricing),
      // then falls back to speech-time heuristic, then to first speaker.
      // This correctly handles incoming calls where the customer speaks first.
      const firstSpeaker = allWords[0]?.speaker ?? 0;
      const repSpeaker = detectAgentSpeaker(allWords, firstSpeaker);

      // Compute speech-time stats for repSpeechPct
      const speakerTimes: Record<number, number> = {};
      for (const w of allWords) {
        const spk = w.speaker ?? 0;
        const dur = (w.end ?? 0) - (w.start ?? 0);
        speakerTimes[spk] = (speakerTimes[spk] ?? 0) + dur;
      }
      const repSpeechTime = speakerTimes[repSpeaker] ?? 0;
      const totalSpeechTime = Object.values(speakerTimes).reduce((a, b) => a + b, 0);
      repSpeechPct = totalSpeechTime > 0 ? Math.round((repSpeechTime / totalSpeechTime) * 100) : 50;

      // Step 2: group consecutive words by speaker into segments
      // Each speaker change = new line. This guarantees single-word responses
      // like "No." or "Neither." always appear as their own Customer line.
      type Segment = { label: "Agent" | "Customer"; words: string[]; start: number; end: number };
      const segments: Segment[] = [];
      for (const w of allWords) {
        const label: "Agent" | "Customer" = w.speaker === repSpeaker ? "Agent" : "Customer";
        const wordText = (w.punctuated_word ?? w.word ?? "").trim();
        if (!wordText) continue;
        if (segments.length === 0 || segments[segments.length - 1].label !== label) {
          segments.push({ label, words: [wordText], start: w.start ?? 0, end: w.end ?? 0 });
        } else {
          segments[segments.length - 1].words.push(wordText);
          segments[segments.length - 1].end = w.end ?? 0;
        }
      }
      transcript = segments.map(s => `${s.label}: ${s.words.join(" ")}`).join("\n");
      if (!transcript.trim()) {
        transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      }

      // Step 3: build word timestamps
      const monoWordTimestamps: WordTimestamp[] = allWords.map((w: any) => ({
        word: w.punctuated_word ?? w.word ?? "",
        start: w.start ?? 0,
        end: w.end ?? 0,
        speaker: w.speaker === repSpeaker ? "Agent" as const : "Customer" as const,
      }));

      let finalTranscript = transcript;
      let finalRepSpeechPct = repSpeechPct;
      let finalWordTimestamps = monoWordTimestamps;
      
      // Apply IVR split fix if needed
      const ivrFix = applySingleSpeakerSplitFix(monoWordTimestamps);
      if (ivrFix) {
        finalTranscript = ivrFix.transcript;
        finalRepSpeechPct = ivrFix.repSpeechPct;
        finalWordTimestamps = ivrFix.wordTimestamps;
      }

      return { transcript: finalTranscript, repSpeechPct: finalRepSpeechPct, durationSeconds: duration, wordTimestamps: finalWordTimestamps };

    } else {
      // Utterance fallback (no word-level data available)
      // Use smart detection to identify the agent speaker.
      const firstUttSpeaker = utterances.length > 0 ? (utterances[0].speaker ?? 0) : 0;
      const repSpeaker = utterances.length > 0 ? detectAgentSpeaker(utterances, firstUttSpeaker) : 0;
      const speakerTimes: Record<number, number> = {};
      let totalSpeechTime = 0;
      for (const utt of utterances) {
        const uttDuration = (utt.end ?? 0) - (utt.start ?? 0);
        totalSpeechTime += uttDuration;
        const spk = utt.speaker ?? 0;
        speakerTimes[spk] = (speakerTimes[spk] ?? 0) + uttDuration;
      }
      const repSpeechTime = speakerTimes[repSpeaker] ?? 0;
      transcript = utterances.length > 0
        ? utterances.map((utt) => {
            const label = utt.speaker === repSpeaker ? "Agent" : "Customer";
            return `${label}: ${(utt.transcript ?? "").trim()}`;
          }).join("\n")
        : result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      repSpeechPct = totalSpeechTime > 0 ? Math.round((repSpeechTime / totalSpeechTime) * 100) : 50;
      const monoWordTimestamps: WordTimestamp[] = [];
      for (const utt of utterances) {
        const label: "Agent" | "Customer" = utt.speaker === repSpeaker ? "Agent" : "Customer";
        for (const w of (utt.words ?? [])) {
          monoWordTimestamps.push({ word: w.punctuated_word ?? w.word ?? "", start: w.start ?? 0, end: w.end ?? 0, speaker: label });
        }
      }
      let finalTranscript = transcript;
      let finalRepSpeechPct = repSpeechPct;
      let finalWordTimestamps = monoWordTimestamps;
      
      // Apply IVR split fix if needed
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
  /** AI-classified retention call type (only returned when initial callType is 'other'/retention placeholder) */
  retentionCallType?: "live_sub" | "cancel_live_sub" | "cancel_live_sub_2plus" | "pre_cycle_cancelled" | "pre_cycle_decline" | "end_of_instalment" | "from_cat" | "retention_win_back" | "other" | null;
  /** Did the customer cancel their subscription as a result of this call? (live_sub only - worst outcome) */
  customerCancelled?: boolean | null;
  // ─── 8-DIMENSION COACHING FIELDS ───
  rapportScore?: number | null;           // 0-100: personal connection with customer
  rapportQuote?: string | null;           // direct quote from the call
  excitementScore?: number | null;        // 0-100: product pitch enthusiasm
  excitementQuote?: string | null;        // direct quote showing pitch tone
  silenceAfterClose?: boolean | null;     // true = rep stayed silent after close
  silenceQuote?: string | null;           // what happened after close attempt
  callControl?: number | null;            // 0-100: did rep lead the conversation
  callControlQuote?: string | null;       // moment showing control or loss of it
  authenticityScore?: number | null;      // 0-100: natural vs scripted
  authenticityQuote?: string | null;      // most scripted or authentic moment
  objectionHandlingScore?: number | null; // 0-100: how well objections were handled
  objectionHandlingQuote?: string | null; // the objection and rep's response
  // ─── RETENTION MANAGER REVIEW (only for retention calls > 5 min) ───
  customerDifficultyScore?: number | null;        // 1-10: 1=hardest customer, 10=easiest
  customerDifficultyDescription?: string | null;  // Brief 5-10 word description
  callScore?: number | null;                       // 1.0-10.0 with one decimal
  callScoreDescription?: string | null;           // Brief 5-10 word description
  customerProfile?: string | null;                // 2-3 sentence customer description
  managerReview?: {
    title: string;         // e.g. "Missed Opportunity to Explore Needs Before Pitching"
    timestamp: string;     // e.g. "2:56"
    quote: string;         // Long direct quote (2-4 sentences) from transcript
    feedback: string;      // 3-4 sentences: customer state, what happened, why rep's approach was wrong
    suggestion: string;    // "You should have..." + technique name + exact words in quotes
  }[] | null;
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
Score MEDIUM if the rep attempted upsell but did not close.
Score LOW if the rep missed the upsell opportunity entirely.
Score CRITICALLY LOW (1-2) if the customer CANCELLED their subscription as a result of this call — this is the WORST possible outcome. The rep turned an active subscriber into a lost customer.
Do NOT penalise for missing "Magic Wand Question" — this is not a cold call script.
`,
      stages: ["Warm Rapport Building", "Needs Discovery", "Upsell Product Pitch", "Upsell Close", "Confirmation"],
      extraFields: `
  "saved": null,
  "upsellAttempted": <bool — did the rep introduce an additional product?>,
  "upsellSucceeded": <bool — did the customer agree to the upsell?>,
  "customerCancelled": <bool — did the customer cancel their subscription during or as a result of this call? This is the WORST outcome>,
  "cancelReason": null,`,
    };
  }
  if (callType === "cancel_live_sub") {
    return {
      context: `
CALL TYPE: Cancel Live Sub (Save + Upsell — First Cycle)
This customer is in their FIRST billing cycle and has requested to cancel their subscription.
The rep must first SAVE the subscription (prevent cancellation), then attempt an upsell.
Score HIGH for: understanding the cancellation reason, offering a tailored solution, saving the sub, AND attempting upsell.
Score MEDIUM for: saving without upsell attempt.
Score LOW for: failing to save the customer.
`,
      stages: ["Opening & Rapport", "Understand Cancel Reason", "Tailored Save Offer", "Save Close", "Upsell Attempt"],
      extraFields: `
  "saved": <bool — did the rep successfully retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`,
    };
  }
  if (callType === "cancel_live_sub_2plus") {
    return {
      context: `
CALL TYPE: Cancel Live Sub 2+ (Save + Upsell — Loyal Customer)
This customer has been subscribed for 2 or more billing cycles and has now requested to cancel.
This is a LOYAL customer — saving them is high priority. The rep must first SAVE the subscription, then attempt an upsell.
Score HIGH for: understanding the cancellation reason, leveraging their loyalty/history, saving the sub, AND attempting upsell.
Score MEDIUM for: saving without upsell attempt.
Score LOW for: failing to save a loyal customer.
`,
      stages: ["Opening & Rapport", "Acknowledge Loyalty", "Understand Cancel Reason", "Tailored Save Offer", "Save Close", "Upsell Attempt"],
      extraFields: `
  "saved": <bool — did the rep successfully retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell after saving?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other>",`,
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

  if (callType === "instalment_decline") {
    return {
      context: `
CALL TYPE: Instalment Plan Decline (Card Recovery)
This customer is on an instalment plan and their card payment has been declined. The rep's ONLY goal is to recover the card details (get new/updated payment information).
This is a simple, focused call — no upsell is needed.
Score 100 if the rep successfully recovers the card details.
Score LOW only if the rep fails to recover the card or handles the call poorly.
Do NOT penalise for missing "Magic Wand Question" or upsell — this is a card recovery call.
`,
      stages: ["Opening & Rapport", "Explain Payment Issue", "Collect New Card Details", "Confirm & Close"],
      extraFields: `
  "saved": <bool — did the rep successfully recover the card details?>,
  "upsellAttempted": null,
  "upsellSucceeded": null,
  "cancelReason": null,`,
    };
  }

  // "other" call type = Retention team (EXEMPT from compliance)
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
  "saved": <bool — did the rep successfully help/retain the customer?>,
  "upsellAttempted": <bool — did the rep attempt an upsell?>,
  "upsellSucceeded": <bool — did the upsell succeed?>,
  "cancelReason": "<Can't afford | Skin reaction | No results | Too many products | Didn't understand subscription | Other | null>",
  "retentionCallType": "<live_sub | cancel_live_sub | cancel_live_sub_2plus | pre_cycle_cancelled | pre_cycle_decline | end_of_instalment | from_cat | retention_win_back | other>",`,
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
  // ─── RETENTION EXEMPTION ─────────────────────────────────────────────────────
  // Retention call types are EXEMPT from all compliance checks.
  const RETENTION_CALL_TYPES = new Set(["live_sub", "cancel_live_sub", "cancel_live_sub_2plus", "pre_cycle_cancelled", "pre_cycle_decline", "end_of_instalment", "from_cat", "other", "retention_cancel_trial", "retention_win_back", "instalment_decline"]);
  const isRetentionCall = RETENTION_CALL_TYPES.has(callType);
  const isRetentionLongCall = isRetentionCall && durationMinutes > 5;

  const { context: callTypeContext, stages, extraFields } = getCallTypeContext(callType);
  const stagesJson = stages.map(s =>
    `    { "stage": "${s}", "detected": <bool>, "quality": "strong|weak|missing", "note": "<brief note>" }`
  ).join(",\n");

  // Compliance fields — only for Opening Team (cold_call, follow_up, opening)
  const complianceFields = isRetentionCall
    ? `
  "subscriptionDisclosed": true,
  "subscriptionMisrepresented": false,
  "tcRead": null,
  "complianceScore": null,
  "complianceIssues": [],`
    : `
  "subscriptionDisclosed": <bool — SUBSCRIPTION MENTION RULE: The agent does NOT need to use the word 'subscription' at all. Set this to FALSE only if the customer directly asked 'Is this a subscription?' or similar, AND the agent said No, denied it, or clearly dodged the question. If the customer never asked, set this to TRUE (no violation). If the customer asked and the agent confirmed it honestly in any way — including phrases like 'we'll top you up every 60 days', 'we'll send you a new Matinika every 60 days', 'we'll send it out every other month', 'we'll send it out every 2 months', or any similar explanation of the recurring delivery — set this to TRUE.>,
  "subscriptionMisrepresented": <bool — CRITICAL: Set TRUE only if the customer directly asked about the subscription AND the agent said No, denied it, or clearly evaded the question. Do NOT set TRUE just because the agent didn't use the word 'subscription' — explaining the recurring arrangement in plain language counts as a full and honest answer. If the customer never asked, this must be FALSE.>,
  "tcRead": <bool — FULL OFFER DETAILS CHECK: Set TRUE ONLY if the agent VERBALLY READ OUT ALL of the following during the call — they must be explicitly stated, not just referenced or implied: (1) the £4.95 postage charge, (2) the 21-day free trial period, (3) the £44.90 recurring charge every 60 days after the trial, (4) 48 Hour Premium Delivery with signature, (5) that the customer can stop, pause, cancel or amend at any time. Set FALSE if ANY of these were not explicitly read out. NOTE: For Instalment deals (e.g. £75 upfront + £37.73 x 11), Cancellation Clarity is N/A — do not penalise for missing cancellation mention.>,
  "complianceScore": <number 0-100. CRITICAL RULE: if subscriptionMisrepresented=true, this MUST be between 0-20 regardless of how good the rest of the call was. If tcRead=false (full offer details not read out), deduct 20-30 points. Perfect compliance = 90-100.>,
  "complianceIssues": [<list of specific compliance violations as strings. Examples: "Rep denied subscription when directly asked", "£4.95 postage not mentioned", "21-day trial period not mentioned", "£44.90 recurring price not mentioned", "Cancellation/pause rights not mentioned", "48 Hour Premium Delivery with signature not mentioned">],`;

  // Deal type detection block — only for Opening Team calls
  const dealTypeBlock = isRetentionCall ? `` : `
DEAL TYPE DETECTION:
Detect whether this call resulted in a Subscription deal or an Instalment deal:
- Subscription: recurring £4.95 trial → £44.90 every 60 days (all cancellation rules apply)
- Instalment: fixed payments (e.g. £75 upfront + £37.73 x 11 monthly instalments) → Cancellation Clarity = N/A for instalment deals
If you detect an instalment deal, do NOT penalise the rep for not mentioning cancellation rights.
`;

  const complianceRules = isRetentionCall
    ? `NOTE: This is a Retention call. Compliance checks do NOT apply. complianceScore=null, tcRead=null, subscriptionMisrepresented=false, complianceIssues=[].`
    : `COMPLIANCE SCORING RULES (apply strictly):
1. SUBSCRIPTION RULE: Only flag subscriptionMisrepresented=true if the customer directly asked 'Is this a subscription?' or similar AND the rep said No, denied it, or clearly dodged. Do NOT penalise the rep for not using the word 'subscription' — explaining the recurring arrangement in plain language is equally valid.
2. FULL OFFER DETAILS (tcRead): The rep must VERBALLY READ OUT ALL of: £4.95 postage, 21-day free trial, £44.90 every 60 days, 48 Hour Premium Delivery with signature, and the right to cancel/pause/stop/amend at any time. Missing any of these = tcRead=false → deduct 20-30 from complianceScore. For Instalment deals, Cancellation Clarity is N/A.
3. CANCELLATION CLARITY: The rep must give some clear indication that the customer can cancel, stop, pause, or amend at any time. Flag only if the rep gives NO indication at all. N/A for Instalment deals.
4. Perfect compliance (subscriptionMisrepresented=false, tcRead=true) = complianceScore 90-100.
5. If subscriptionMisrepresented=true → complianceScore MUST be 0-20. This overrides everything else.`;

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
  "rapportScore": <number 0-100 — how well did the rep build personal connection? Did they ask personal questions, respond warmly, use the customer's name?>,
  "rapportQuote": "<best or worst rapport moment — a direct quote from the call, or null>",
  "excitementScore": <number 0-100 — how enthusiastically did the rep describe the product? Did they use vivid language like 'feel', 'imagine', 'wake up with'? Or was it dry and technical?>,
  "excitementQuote": "<a direct quote showing the rep's product pitch tone, or null>",
  "silenceAfterClose": <bool — did the rep stay silent after asking for the close, or did they fill the silence by talking?>,
  "silenceQuote": "<quote showing what happened after the close attempt, or null>",
  "callControl": <number 0-100 — did the rep lead the conversation, or did the customer take over? Did the rep redirect off-topic conversations back to the sale?>,
  "callControlQuote": "<a moment where the rep lost or maintained control, or null>",
  "authenticityScore": <number 0-100 — did the rep sound like a real person or a scripted robot? Penalise heavy repetition of filler words like 'absolutely', 'definitely', 'of course'.>,
  "authenticityQuote": "<the most scripted-sounding or most authentic moment, or null>",
  "objectionHandlingScore": <number 0-100 — if there was an objection, how well did the rep handle it? Did they use the script? Did they give up too quickly? If no objection occurred, return 100.>,
  "objectionHandlingQuote": "<the objection and the rep's response, or null if no objection>",
${complianceFields}${extraFields}
${isRetentionLongCall ? `
  "customerDifficultyScore": <number 1-10. 1 = hardest customer (hostile, refusing, threatening, wants to cancel immediately). 10 = easiest customer (agrees immediately, friendly, no objections). Rate based on the customer's tone, resistance level, and objections throughout the call.>,
  "customerDifficultyDescription": "<brief 5-10 word description of the customer difficulty e.g. 'Cooperative — friendly tone, budget objections only'>",
  "callScore": <number 1.0-10.0 with one decimal. This is the MAIN performance score. Score based on how well the rep achieved the PRIMARY GOAL for this call type. Consider: Did they save/retain? Did they attempt upsell? Did they handle objections well? Did they use proper techniques?>,
  "callScoreDescription": "<brief 5-10 word summary e.g. 'Strong retention, great rapport, minor over-talking'>",
  "customerProfile": "<2-3 sentences describing who this customer is: their situation, relationship with the brand, financial constraints, emotional state, and what they wanted from this call>",
  "managerReview": [
    {
      "title": "<descriptive title — see EXAMPLES below>",
      "timestamp": "<MM:SS>",
      "quote": "<see EXAMPLES below for required length and detail>",
      "feedback": "<see EXAMPLES below for required depth>",
      "suggestion": "<see EXAMPLES below for required format>"
    }
  ],

  *** MANAGER REVIEW — QUALITY STANDARD ***
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

  EXAMPLE 3 (PERFECT quality — for a different scenario):
  {
    "title": "Anchoring with a Random Low Number",
    "timestamp": "3:41",
    "quote": "No. I know. Take if you have to take a second to just think about it. I mean, listen. I'm not talk. Is it I don't know. I'm just throwing a number out. 20 pounds?",
    "feedback": "The customer had just said she didn't know what her budget was because you put her on the spot. By immediately throwing out '20 pounds,' you anchored the negotiation extremely low. When you later pitched a package that was £25.35 a month, it felt more expensive than the £20 you had just suggested.",
    "suggestion": "Give her space to answer, or anchor high to make the discount look better. You should have said: 'That's completely fair. Most of our premium packages are around £80, but if I could build a custom routine for you closer to £30 or £40, would that be in the right ballpark?'"
  }

  RULES for managerReview (MUST follow):
  - Exactly 2-3 items per call
  - title: Clear coaching point name (5-10 words) — specific to what happened, not generic
  - quote: MUST be 2-4 FULL sentences copied VERBATIM from the transcript. Include customer responses in parentheses where relevant. If the rep continued talking after the customer responded, include that too. NEVER use short snippets of less than 2 sentences.
  - feedback: MUST be 3-4 sentences. Structure: (1) What the customer had just said/done and their emotional state, (2) What the rep did instead, (3) Why this was the wrong approach, (4) What opportunity was missed or what risk was created
  - suggestion: MUST start with 'You should have', name the specific technique if applicable (e.g. 'Magic Wand question', 'Silence after close', 'High anchor'), then give the EXACT alternative words in quotes that the rep should have said, then briefly explain why this works better
  - Write as a senior call center manager who has listened to this recording 3 times and is giving detailed, face-to-face coaching
  - Be 100% specific to THIS call — reference the customer by name, reference specific products/prices mentioned, reference the exact moment in the conversation. NEVER give generic advice that could apply to any call.
` : ''}}
${dealTypeBlock}${complianceRules}

IMPORTANT: For customerName, look for the customer's first name — the rep usually addresses them by name during the call (e.g. "Hi Sarah", "So [Name], what I'd love to do..."). Return just the first name as a string, or null if not found.
Be specific, actionable, and encouraging. Focus on the call type objectives above.`;

  const llmAbortController = new AbortController();
  const llmTimeoutId = setTimeout(() => llmAbortController.abort(), 900_000); // 15 min
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }, { signal: llmAbortController.signal });
    const content = response.choices[0]?.message?.content ?? "{}";
    return JSON.parse(content) as CallAnalysisReport;
  } finally {
    clearTimeout(llmTimeoutId);
  }
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
  callType?: "cold_call" | "follow_up" | "live_sub" | "pre_cycle_cancelled" | "pre_cycle_decline" | "end_of_instalment" | "from_cat" | "other" | "opening" | "retention_cancel_trial" | "retention_win_back" | "instalment_decline" | null;
  source?: "manual" | "webhook";
  cloudtalkCallId?: string | null;
  contactId?: number | null;
  customerName?: string | null;
  contactName?: string | null;
  externalNumber?: string | null;
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
    customerName: data.customerName ?? null,
    contactName: data.contactName ?? null,
    externalNumber: data.externalNumber ?? null,
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
    callType: "cold_call" | "follow_up" | "live_sub" | "pre_cycle_cancelled" | "pre_cycle_decline" | "end_of_instalment" | "from_cat" | "other" | "opening" | "retention_win_back" | "instalment_decline";
  }>
)
{
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(callAnalyses).set(update as any).where(eq(callAnalyses.id, id));
}

export async function getCallAnalysisById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(callAnalyses).where(eq(callAnalyses.id, id)).limit(1);
  return results[0] ?? null;
}

export async function getCallAnalysisByShareToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(callAnalyses).where(eq(callAnalyses.shareToken, token)).limit(1);
  return results[0] ?? null;
}

export async function generateShareToken(analysisId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if already has a token
  const existing = await db.select({ shareToken: callAnalyses.shareToken }).from(callAnalyses).where(eq(callAnalyses.id, analysisId)).limit(1);
  if (existing[0]?.shareToken) return existing[0].shareToken;
  // Generate a new token
  const { nanoid } = await import("nanoid");
  const token = nanoid(21);
  await db.update(callAnalyses).set({ shareToken: token }).where(eq(callAnalyses.id, analysisId));
  return token;
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
export async function processCallAnalysis(analysisId: number, audioUrl: string, audioFileKey?: string) {
  try {
    // Step 1: Transcribe
    await updateCallAnalysisStatus(analysisId, { status: "transcribing" });
    // Determine the URL to fetch audio from:
    // 1. If R2_PUBLIC_URL is set (Railway with public R2 bucket): build public URL from key — no auth needed
    // 2. If on Manus (BUILT_IN_FORGE_API_URL set): use storageGet to get a signed CloudFront URL
    // 3. Fallback: use the stored audioUrl directly
    let fetchUrl = audioUrl;
    if (audioFileKey && ENV.r2PublicUrl) {
      // Railway path: R2 bucket is public — build URL directly, no presigning needed
      const cleanKey = audioFileKey.replace(/^\/+/, "");
      fetchUrl = `${ENV.r2PublicUrl.replace(/\/+$/, "")}/${cleanKey}`;
      console.log(`[CallAnalysis] Using public R2 URL: ${fetchUrl}`);
    } else if (audioFileKey && ENV.forgeApiUrl) {
      // Manus path: use storageGet to get signed CloudFront URL
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
    // If AI classified the retention call type, update callType in DB
    if (callType === "other" && report.retentionCallType && report.retentionCallType !== "other") {
      (savePayload as any).callType = report.retentionCallType;
      console.log(`[CallAnalysis] AI classified retention call #${analysisId} as: ${report.retentionCallType}`);
    }
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

export async function getAgentDashboard(
  timeRange: "today" | "week" | "month" | "all" = "month"
): Promise<AgentSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Compute the window start for the selected range
  let rangeStart: Date | null = null;
  if (timeRange === "today") rangeStart = todayStart;
  else if (timeRange === "week") rangeStart = weekStart;
  else if (timeRange === "month") rangeStart = monthStart;

  const allRaw = await db.select().from(callAnalyses).orderBy(callAnalyses.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  // Filter to selected time range (but keep all calls for trend/score history)
  const all = rangeStart
    ? allRaw.filter((c) => new Date(c.createdAt) >= rangeStart!)
    : allRaw;

  const byUser = new Map<number, typeof all>();
  for (const row of all) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

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

    const callsToday = allRaw.filter((c) => c.userId === userId && new Date(c.createdAt) >= todayStart).length;
    const callsThisWeek = allRaw.filter((c) => c.userId === userId && new Date(c.createdAt) >= weekStart).length;

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

  const insightsAbortController = new AbortController();
  const insightsTimeoutId = setTimeout(() => insightsAbortController.abort(), 900_000); // 15 min
  let raw: string;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }, { signal: insightsAbortController.signal });
    raw = response.choices[0]?.message?.content ?? "[]";
  } finally {
    clearTimeout(insightsTimeoutId);
  }
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

// ─── AGENT PERSONAL COACHING DASHBOARD ───────────────────────────────────────
export interface CoachingFeedbackItem {
  category: string;
  status: "green" | "orange" | "red" | "yellow";
  title: string;
  detail: string;
  quote: string | null;
  callsAffected: number;
  relevantCallIds: number[];
}

export interface ComplianceCheckItem {
  label: string;
  pct: number;
  status: "green" | "orange" | "red" | "yellow";
}

export interface MyCoachingDashboard {
  closesThisWeek: number;
  closesLastWeek: number;
  avgScoreThisWeek: number | null;
  avgScoreLastWeek: number | null;
  complianceRate: number | null;
  complianceRateLastWeek: number | null;
  totalCallsThisWeek: number;
  avgRepSpeechPct: number | null;
  positives: CoachingFeedbackItem[];
  improvements: CoachingFeedbackItem[];
  complianceChecklist: ComplianceCheckItem[];
  recentCalls: Array<{
    id: number;
    callDate: string | null;
    customerName: string | null;
    overallScore: number | null;
    closeStatus: string | null;
    status: string;
    durationSeconds: number | null;
    audioFileUrl: string;
  }>;
}

export async function getMyCoachingDashboard(
  userId: number,
  timeRange: "today" | "week" | "month" | "all" = "month"
): Promise<MyCoachingDashboard> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const all = await db.select().from(callAnalyses)
    .where(eq(callAnalyses.userId, userId))
    .orderBy(callAnalyses.createdAt);
  const now = new Date();
  // Compute window start based on timeRange
  let windowStart: Date;
  if (timeRange === "today") {
    windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (timeRange === "week") {
    windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
  } else if (timeRange === "month") {
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    windowStart = new Date(0); // all time
  }
  // Previous window of same length for comparison
  const windowMs = now.getTime() - windowStart.getTime();
  const prevWindowStart = new Date(windowStart.getTime() - windowMs);
  const weekStart = windowStart; // alias for compatibility
  const twoWeeksStart = prevWindowStart;
  const thisWeekCalls = all.filter(c => new Date(c.createdAt) >= weekStart);
  const lastWeekCalls = all.filter(c => {
    const d = new Date(c.createdAt);
    return d >= twoWeeksStart && d < weekStart;
  });;

  const doneCalls = (calls: typeof all) => calls.filter(c => c.status === "done");
  const thisWeekDone = doneCalls(thisWeekCalls);
  const lastWeekDone = doneCalls(lastWeekCalls);

  const closesThisWeek = thisWeekDone.filter(c => c.closeStatus === "closed").length;
  const closesLastWeek = lastWeekDone.filter(c => c.closeStatus === "closed").length;

  const avgOf = (calls: typeof all) => {
    const scored = calls.filter(c => c.overallScore != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, c) => s + (c.overallScore as number), 0) / scored.length);
  };
  const avgScoreThisWeek = avgOf(thisWeekDone);
  const avgScoreLastWeek = avgOf(lastWeekDone);

  const complianceAvg = (calls: typeof all) => {
    let total = 0; let count = 0;
    for (const c of calls) {
      if (!c.analysisJson) continue;
      try {
        const r = JSON.parse(c.analysisJson) as CallAnalysisReport;
        if (r.complianceScore != null) { total += r.complianceScore; count++; }
      } catch { /* skip */ }
    }
    return count > 0 ? Math.round(total / count) : null;
  };
  const complianceRate = complianceAvg(thisWeekDone);
  const complianceRateLastWeek = complianceAvg(lastWeekDone);

  interface ParsedCall { id: number; report: CallAnalysisReport; }
  const parsed: ParsedCall[] = [];
  for (const c of thisWeekDone) {
    if (!c.analysisJson) continue;
    try { parsed.push({ id: c.id, report: JSON.parse(c.analysisJson) as CallAnalysisReport }); } catch { /* skip */ }
  }
  const totalParsed = parsed.length;

  const strengthCounts: Record<string, { count: number; ids: number[]; quotes: string[] }> = {};
  const improvementCounts: Record<string, { count: number; ids: number[]; quotes: string[] }> = {};
  let tcReadCount = 0, tcReadTotal = 0;
  let subDisclosedCount = 0, subDisclosedTotal = 0;
  let subMisrepCount = 0, subMisrepTotal = 0;
  let closingAttemptedCount = 0;
  let magicWandCount = 0;
  // 8-dimension accumulators
  let rapportTotal = 0, rapportCount = 0;
  let excitementTotal = 0, excitementCount = 0;
  let silenceOkCount = 0, silenceTotal = 0;
  let callControlTotal = 0, callControlCount = 0;
  let authenticityTotal = 0, authenticityCount = 0;
  let objectionTotal = 0, objectionCount = 0;
  // Best quotes per dimension (from highest-scoring call)
  let bestRapportQuote: { quote: string; callId: number } | null = null;
  let bestExcitementQuote: { quote: string; callId: number } | null = null;
  let worstSilenceQuote: { quote: string; callId: number } | null = null;
  let worstCallControlQuote: { quote: string; callId: number } | null = null;
  let worstAuthenticityQuote: { quote: string; callId: number } | null = null;
  let worstObjectionQuote: { quote: string; callId: number } | null = null;

  for (const { id, report } of parsed) {
    for (const s of report.strengths ?? []) {
      const key = s.slice(0, 80);
      if (!strengthCounts[key]) strengthCounts[key] = { count: 0, ids: [], quotes: [] };
      strengthCounts[key].count++; strengthCounts[key].ids.push(id);
    }
    for (const imp of report.improvements ?? []) {
      const key = imp.slice(0, 80);
      if (!improvementCounts[key]) improvementCounts[key] = { count: 0, ids: [], quotes: [] };
      improvementCounts[key].count++; improvementCounts[key].ids.push(id);
    }
    for (const km of report.keyMoments ?? []) {
      if (km.type === "negative" || km.type === "critical") {
        const key = km.coaching.slice(0, 80);
        if (!improvementCounts[key]) improvementCounts[key] = { count: 0, ids: [], quotes: [] };
        improvementCounts[key].count++; improvementCounts[key].ids.push(id);
        if (km.moment && improvementCounts[key].quotes.length < 1) improvementCounts[key].quotes.push(km.moment);
      } else if (km.type === "positive") {
        const key = km.coaching.slice(0, 80);
        if (!strengthCounts[key]) strengthCounts[key] = { count: 0, ids: [], quotes: [] };
        strengthCounts[key].count++; strengthCounts[key].ids.push(id);
        if (km.moment && strengthCounts[key].quotes.length < 1) strengthCounts[key].quotes.push(km.moment);
      }
    }
    if (report.tcRead != null) { tcReadTotal++; if (report.tcRead) tcReadCount++; }
    if (report.subscriptionDisclosed != null) { subDisclosedTotal++; if (report.subscriptionDisclosed) subDisclosedCount++; }
    if (report.subscriptionMisrepresented != null) { subMisrepTotal++; if (!report.subscriptionMisrepresented) subMisrepCount++; }
    if (report.closingAttempted) closingAttemptedCount++;
    if (report.magicWandUsed) magicWandCount++;
    // 8-dimension aggregation
    if (report.rapportScore != null) { rapportTotal += report.rapportScore; rapportCount++; if (report.rapportQuote && !bestRapportQuote) bestRapportQuote = { quote: report.rapportQuote, callId: id }; }
    if (report.excitementScore != null) { excitementTotal += report.excitementScore; excitementCount++; if (report.excitementQuote && !bestExcitementQuote) bestExcitementQuote = { quote: report.excitementQuote, callId: id }; }
    if (report.silenceAfterClose != null) { silenceTotal++; if (report.silenceAfterClose) silenceOkCount++; else if (report.silenceQuote && !worstSilenceQuote) worstSilenceQuote = { quote: report.silenceQuote, callId: id }; }
    if (report.callControl != null) { callControlTotal += report.callControl; callControlCount++; if (report.callControlQuote && report.callControl < 60 && !worstCallControlQuote) worstCallControlQuote = { quote: report.callControlQuote, callId: id }; }
    if (report.authenticityScore != null) { authenticityTotal += report.authenticityScore; authenticityCount++; if (report.authenticityQuote && report.authenticityScore < 70 && !worstAuthenticityQuote) worstAuthenticityQuote = { quote: report.authenticityQuote, callId: id }; }
    if (report.objectionHandlingScore != null) { objectionTotal += report.objectionHandlingScore; objectionCount++; if (report.objectionHandlingQuote && report.objectionHandlingScore < 70 && !worstObjectionQuote) worstObjectionQuote = { quote: report.objectionHandlingQuote, callId: id }; }
  }

  const positives: CoachingFeedbackItem[] = Object.entries(strengthCounts)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 3)
    .map(([key, val]) => ({
      category: "Strength", status: "green" as const,
      title: key,
      detail: `Keep doing this — it's working. This strength showed up in ${val.count} of your recent calls.`,
      quote: val.quotes[0] ?? null,
      callsAffected: val.count,
      relevantCallIds: Array.from(new Set(val.ids)).slice(0, 1),
    }));

  if (totalParsed > 0 && closingAttemptedCount / totalParsed >= 0.7) {
    positives.push({ category: "Closing — Confident & Direct", status: "green", title: "You ask for the close clearly and without hesitation", detail: `${closingAttemptedCount} closes this week. You're asking at the right moment and staying quiet after. That pause is where the sale is won — and you're nailing it.`, quote: null, callsAffected: closingAttemptedCount, relevantCallIds: thisWeekDone.slice(0, 1).map(c => c.id) });
  }
  if (totalParsed > 0 && magicWandCount / totalParsed >= 0.6) {
    positives.push({ category: "Magic Wand Question", status: "green", title: "You're using the Magic Wand question every call", detail: `You asked the Magic Wand question in ${magicWandCount} of ${totalParsed} calls. Customers who answer this question are far more likely to close — keep it in every call.`, quote: null, callsAffected: magicWandCount, relevantCallIds: thisWeekDone.slice(0, 1).map(c => c.id) });
  }

  // ── Categorise & enrich generic improvement cards ──────────────────────────
  // Map keyword patterns in the coaching text to specific, descriptive categories
  // and generate rich coaching detail text (not just repeating the title).
  const CATEGORY_RULES: { test: (t: string) => boolean; category: string; coachingDetail: (key: string, count: number, total: number) => string }[] = [
    {
      test: (t) => /magic\s*wand/i.test(t) && /answer|loop|use|tie|follow/i.test(t),
      category: "Magic Wand — Not Closing the Loop",
      coachingDetail: (_k, count, total) =>
        `You asked the question — great. But the customer told you exactly what she wanted and you moved on. Every answer she gives you is a door. When she says her concern — that's your cue to bring in the right product. Tie it back, every time. This happened in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /magic\s*wand/i.test(t),
      category: "Magic Wand Question",
      coachingDetail: (_k, count, total) =>
        `The Magic Wand question is your most powerful tool. Customers who answer it are far more likely to close. You skipped it in ${count} of ${total} calls — make it non-negotiable on every call.`,
    },
    {
      test: (t) => /clos(e|ing)|offer|ask(ed)?\s*(for|the)\s*(sale|close)|attempt/i.test(t) && !/loop/i.test(t),
      category: "Closing — Not Asking for the Sale",
      coachingDetail: (_k, count, total) =>
        `You can't win a sale you don't ask for. You missed the close attempt in ${count} of ${total} calls. Every call needs a clear, confident close — even if you think they're not ready. Ask, then stay silent.`,
    },
    {
      test: (t) => /rapport|personal|connect|name|warm/i.test(t),
      category: "Rapport — Build the Connection",
      coachingDetail: (_k, count, total) =>
        `Ask personal questions, use her name, and respond to what she shares. Don't rush to the pitch. A customer who feels heard is 2× more likely to close. This showed up in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /tone|energy|enthusiasm|excit|flat|monotone|boring|pitch/i.test(t),
      category: "Tone & Energy — Bring the Excitement",
      coachingDetail: (_k, count, total) =>
        `Replace technical language with vivid, sensory words: "feel", "imagine", "wake up with glowing skin". Make her want it before you mention the price. Your pitch fell flat in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /objection|push\s*back|think\s*about|hesitat|overcome|rebut/i.test(t),
      category: "Objection Handling — Don't Give Up",
      coachingDetail: (_k, count, total) =>
        `When a customer says "I need to think about it", don't accept it — ask which concern it is: the product, or giving card details. Then address that specific concern. You gave up too quickly in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /authenti|script|repeat|robot|natural|filler|absolutely/i.test(t),
      category: "Authenticity — You Sound Scripted",
      coachingDetail: (_k, count, total) =>
        `When you repeat the same word over and over, customers stop trusting you — it sounds like a script, not a real person. Replace filler words with nothing. Just say "yes", "exactly", or move straight to your next point. You'll sound 10× more real. Noticed in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /silence|pause|quiet|stop\s*talk/i.test(t),
      category: "Silence After Close — Hold the Pause",
      coachingDetail: (_k, count, total) =>
        `After you ask for the close — stop talking. The next person who speaks loses. You filled the silence instead of holding it in ${count} of ${total} calls. Let the pause do the work.`,
    },
    {
      test: (t) => /control|redirect|off.?topic|lead|steer|rambl/i.test(t),
      category: "Call Control — Lead the Conversation",
      coachingDetail: (_k, count, total) =>
        `When a customer goes off-topic, gently redirect: "That's interesting — let me just finish this one point and we'll come back to that." You're following them instead of leading. This happened in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /subscri|t\s*&\s*c|terms|compliance|misrepresent/i.test(t),
      category: "Compliance — Subscription Handling",
      coachingDetail: (_k, count, total) =>
        `Never deny or downplay the subscription. The correct response is: "You're in complete control — cancel anytime with one click or one email." Be proud of the subscription, not defensive. Flagged in ${count} of ${total} calls.`,
    },
    {
      test: (t) => /product|benefit|feature|ingredient|result|proof|trustpilot|review/i.test(t),
      category: "Product Knowledge — Sell the Benefits",
      coachingDetail: (_k, count, total) =>
        `Customers don't buy ingredients — they buy results. Paint the picture: "wake up with glowing skin", "feel the difference in 3 days". Use Trustpilot reviews and real results to build trust. Needed in ${count} of ${total} calls.`,
    },
  ];

  function classifyImprovement(key: string, count: number, total: number): { category: string; detail: string; status: "red" | "orange" | "yellow" } {
    const upper = key.toUpperCase();
    const pct = total > 0 ? count / total : 0;
    for (const rule of CATEGORY_RULES) {
      if (rule.test(key)) {
        let status: "red" | "orange" | "yellow" = pct >= 0.5 ? "red" : "orange";
        if (upper.includes("AUTHENTI") || upper.includes("SCRIPTED")) status = "yellow";
        return { category: rule.category, detail: rule.coachingDetail(key, count, total), status };
      }
    }
    // Fallback: derive a readable category from the key itself
    const fallbackCategory = key.length > 40 ? key.slice(0, 40).replace(/\s+\S*$/, "...") : key;
    const fallbackDetail = `This came up in ${count} of ${total} calls. Focus on this area in your next calls — small changes here will make a big difference to your results.`;
    return { category: fallbackCategory, detail: fallbackDetail, status: pct >= 0.5 ? "red" : "orange" };
  }

  const improvements: CoachingFeedbackItem[] = Object.entries(improvementCounts)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 4)
    .map(([key, val]) => {
      const { category, detail, status } = classifyImprovement(key, val.count, totalParsed);
      return { category, status, title: key, detail, quote: val.quotes[0] ?? null, callsAffected: val.count, relevantCallIds: Array.from(new Set(val.ids)).slice(0, 1) };
    });

  if (totalParsed > 0 && magicWandCount / totalParsed < 0.5) {
    const missedCalls = thisWeekDone.filter(c => { try { return !JSON.parse(c.analysisJson!).magicWandUsed; } catch { return false; } });
    const missedIds = missedCalls.map(c => c.id).slice(0, 1);
    improvements.push({ category: "Magic Wand — Not Closing the Loop", status: "orange", title: "You asked the magic wand question — but didn't use the answer", detail: `You asked the question — great. But the customer told you exactly what she wanted and you moved on. Every answer she gives you is a door. When she says her concern — that's your cue to tie back every product. Do it every time.`, quote: null, callsAffected: totalParsed - magicWandCount, relevantCallIds: missedIds });
  }
  if (totalParsed > 0 && closingAttemptedCount / totalParsed < 0.7) {
    const missedCalls = thisWeekDone.filter(c => { try { return !JSON.parse(c.analysisJson!).closingAttempted; } catch { return false; } });
    const missedIds = missedCalls.map(c => c.id).slice(0, 1);
    improvements.push({ category: "Closing Attempt", status: "red", title: "You're not attempting the close on every call", detail: `You only attempted to close in ${closingAttemptedCount} of ${totalParsed} calls. You can't win a sale you don't ask for. Every call needs a close attempt — even if you think they're not ready.`, quote: null, callsAffected: totalParsed - closingAttemptedCount, relevantCallIds: missedIds });
  }

  // ── 8-dimension: add to positives / improvements based on averages ──
  const avgRapport = rapportCount > 0 ? Math.round(rapportTotal / rapportCount) : null;
  const avgExcitement = excitementCount > 0 ? Math.round(excitementTotal / excitementCount) : null;
  const silencePct = silenceTotal > 0 ? Math.round((silenceOkCount / silenceTotal) * 100) : null;
  const avgCallControl = callControlCount > 0 ? Math.round(callControlTotal / callControlCount) : null;
  const avgAuthenticity = authenticityCount > 0 ? Math.round(authenticityTotal / authenticityCount) : null;
  const avgObjection = objectionCount > 0 ? Math.round(objectionTotal / objectionCount) : null;

  if (avgRapport != null && avgRapport >= 75) {
    positives.push({ category: "Rapport — Best on the Team", status: "green", title: "You build real connections — customers open up to you", detail: `Calls where you build rapport close at 2.1× the team average. This is your biggest weapon. Keep doing it — and do it earlier in the call.`, quote: bestRapportQuote?.quote ?? null, callsAffected: rapportCount, relevantCallIds: bestRapportQuote ? [bestRapportQuote.callId] : [] });
  } else if (avgRapport != null && avgRapport < 60) {
    improvements.push({ category: "Rapport", status: avgRapport < 45 ? "red" : "orange", title: "You're not building enough personal connection", detail: `Ask personal questions, use her name, and respond to what she shares. Don't rush to the pitch. A customer who feels heard is 2× more likely to close.`, quote: bestRapportQuote?.quote ?? null, callsAffected: rapportCount, relevantCallIds: bestRapportQuote ? [bestRapportQuote.callId] : [] });
  }

  if (avgExcitement != null && avgExcitement >= 75) {
    positives.push({ category: "Product Excitement", status: "green", title: "Your product pitch is vivid and enthusiastic", detail: `You're using emotional language that makes customers want the product. Keep painting the picture — 'wake up with glowing skin', 'feel the difference in 3 days'.`, quote: bestExcitementQuote?.quote ?? null, callsAffected: excitementCount, relevantCallIds: bestExcitementQuote ? [bestExcitementQuote.callId] : [] });
  } else if (avgExcitement != null && avgExcitement < 60) {
    improvements.push({ category: "Product Excitement", status: avgExcitement < 45 ? "red" : "orange", title: "Your product pitch sounds too technical", detail: `Replace technical language with vivid, sensory words: 'feel', 'imagine', 'wake up with glowing skin'. Make her want it before you mention the price. Listen to how you're pitching it now.`, quote: bestExcitementQuote?.quote ?? null, callsAffected: excitementCount, relevantCallIds: bestExcitementQuote ? [bestExcitementQuote.callId] : [] });
  }

  if (silencePct != null && silencePct >= 70) {
    positives.push({ category: "Silence After Close", status: "green", title: "You hold the silence after the close", detail: `You stayed silent after the close in ${silenceOkCount} of ${silenceTotal} calls. That pause is where the sale is won — and you're nailing it.`, quote: null, callsAffected: silenceOkCount, relevantCallIds: [] });
  } else if (silencePct != null && silencePct < 50) {
    improvements.push({ category: "Silence After Close", status: "red", title: "You're filling the silence after the close", detail: `After you ask for the close — stop talking. The next person who speaks loses. You filled the silence in ${silenceTotal - silenceOkCount} of ${silenceTotal} calls. Listen to this moment.`, quote: worstSilenceQuote?.quote ?? null, callsAffected: silenceTotal - silenceOkCount, relevantCallIds: worstSilenceQuote ? [worstSilenceQuote.callId] : [] });
  }

  if (avgCallControl != null && avgCallControl >= 75) {
    positives.push({ category: "Call Control", status: "green", title: "You lead the conversation confidently", detail: `You're steering the conversation back to the sale when customers go off-topic. That's a skill most reps never master.`, quote: null, callsAffected: callControlCount, relevantCallIds: [] });
  } else if (avgCallControl != null && avgCallControl < 60) {
    improvements.push({ category: "Call Control", status: avgCallControl < 45 ? "red" : "orange", title: "Customers are taking over the conversation", detail: `When a customer goes off-topic, gently redirect: "That's interesting — let me just finish this one point and we'll come back to that." You're following them instead of leading. Listen to this moment.`, quote: worstCallControlQuote?.quote ?? null, callsAffected: callControlCount, relevantCallIds: worstCallControlQuote ? [worstCallControlQuote.callId] : [] });
  }

  if (avgAuthenticity != null && avgAuthenticity >= 75) {
    positives.push({ category: "Authenticity", status: "green", title: "You sound natural and genuine", detail: `Customers trust you because you sound like a real person, not a script. That's rare — and it's why they stay on the call.`, quote: null, callsAffected: authenticityCount, relevantCallIds: [] });
  } else if (avgAuthenticity != null && avgAuthenticity < 60) {
    improvements.push({ category: "Authenticity — You Sound Scripted", status: avgAuthenticity < 45 ? "red" : "orange", title: "You sound too scripted on this call", detail: `When you repeat the same word over and over, customers stop trusting you — it sounds like a script, not a real person. Replace filler words like "absolutely" with nothing. Just say what you mean — "yes", "exactly", or move straight to your next point. You'll sound 10× more real.`, quote: worstAuthenticityQuote?.quote ?? null, callsAffected: authenticityCount, relevantCallIds: worstAuthenticityQuote ? [worstAuthenticityQuote.callId] : [] });
  }

  if (avgObjection != null && avgObjection >= 75) {
    positives.push({ category: "Objection Handling", status: "green", title: "You handle objections well", detail: `You're using the right responses and not giving up too quickly. When a customer pushes back, you push back with empathy — and it's working.`, quote: null, callsAffected: objectionCount, relevantCallIds: [] });
  } else if (avgObjection != null && avgObjection < 60) {
    improvements.push({ category: "Objection Handling", status: avgObjection < 45 ? "red" : "orange", title: "You're giving up on objections too quickly", detail: `When a customer says "I need to think about it", don't accept it — ask which of the two concerns it is: the product, or giving card details. Then address that specific concern. Listen to how you handled it here.`, quote: worstObjectionQuote?.quote ?? null, callsAffected: objectionCount, relevantCallIds: worstObjectionQuote ? [worstObjectionQuote.callId] : [] });
  }

  const pct = (count: number, total: number) => total > 0 ? Math.round((count / total) * 100) : 100;
  const trafficLight = (p: number): "green" | "orange" | "red" => p >= 85 ? "green" : p >= 60 ? "orange" : "red";
  // ── Compliance improvement cards (specific, actionable) ──────────────────────
  const tcPct = pct(tcReadCount, tcReadTotal);
  const subMisrepPct = pct(subMisrepCount, subMisrepTotal);
  if (tcReadTotal > 0 && tcPct < 85) {
    // Find the most recent call where tcRead was false
    const failCall = [...thisWeekDone].reverse().find(c => {
      try { return JSON.parse(c.analysisJson!).tcRead === false; } catch { return false; }
    });
    improvements.unshift({
      category: "Compliance — Fix First",
      status: "red",
      title: "You're referencing T&Cs instead of reading them aloud",
      detail: `The rule is clear: you must read them out verbally on every call. Saying "find them on the website" is not enough and puts you at compliance risk. Next call — read them out loud before taking card details.`,
      quote: failCall ? (() => { try { const r = JSON.parse(failCall.analysisJson!); return r.silenceQuote ?? r.callControlQuote ?? null; } catch { return null; } })() : null,
      callsAffected: tcReadTotal - tcReadCount,
      relevantCallIds: failCall ? [failCall.id] : [],
    });
  }
  if (subMisrepTotal > 0 && subMisrepPct < 85) {
    const failCall = [...thisWeekDone].reverse().find(c => {
      try { return JSON.parse(c.analysisJson!).subscriptionMisrepresented === true; } catch { return false; }
    });
    improvements.unshift({
      category: "Compliance — Fix First",
      status: "red",
      title: "You denied or downplayed the subscription",
      detail: `Never say "it's not a subscription" or "you won't be charged". The correct response is: "You're in complete control — cancel anytime with one click or one email." Be proud of the subscription, not defensive.`,
      quote: null,
      callsAffected: subMisrepTotal - subMisrepCount,
      relevantCallIds: failCall ? [failCall.id] : [],
    });
  }

  const complianceChecklist: ComplianceCheckItem[] = [
    { label: "Full offer details read aloud (T&Cs)", pct: pct(tcReadCount, tcReadTotal), status: trafficLight(pct(tcReadCount, tcReadTotal)) },
    { label: "Subscription clearly explained", pct: pct(subDisclosedCount, subDisclosedTotal), status: trafficLight(pct(subDisclosedCount, subDisclosedTotal)) },
    { label: "No subscription misrepresentation", pct: pct(subMisrepCount, subMisrepTotal), status: trafficLight(pct(subMisrepCount, subMisrepTotal)) },
    { label: "Close attempted every call", pct: pct(closingAttemptedCount, totalParsed), status: trafficLight(pct(closingAttemptedCount, totalParsed)) },
    { label: "Magic Wand question asked", pct: pct(magicWandCount, totalParsed), status: trafficLight(pct(magicWandCount, totalParsed)) },
  ];

  const recentCalls = [...all].reverse().slice(0, 10).map(c => ({
    id: c.id, callDate: c.callDate ? new Date(c.callDate).toISOString() : null,
    customerName: c.customerName ?? null, overallScore: c.overallScore != null ? Math.round(c.overallScore) : null,
    closeStatus: c.closeStatus ?? null, status: c.status, durationSeconds: c.durationSeconds ?? null, audioFileUrl: c.audioFileUrl,
  }));

  const withSpeechPct = thisWeekDone.filter(c => c.repSpeechPct != null);
  const avgRepSpeechPct = withSpeechPct.length > 0
    ? Math.round(withSpeechPct.reduce((s, c) => s + (c.repSpeechPct as number), 0) / withSpeechPct.length)
    : null;
  return {
    closesThisWeek, closesLastWeek, avgScoreThisWeek, avgScoreLastWeek,
    complianceRate, complianceRateLastWeek, totalCallsThisWeek: thisWeekCalls.length,
    avgRepSpeechPct,
    positives: positives.slice(0, 3), improvements: improvements.slice(0, 4),
    complianceChecklist, recentCalls,
  };
}
