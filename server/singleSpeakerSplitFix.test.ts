/**
 * Tests for the single-speaker split fix logic embedded in applySingleSpeakerSplitFix().
 *
 * Because the function is not exported, we replicate its logic here as a
 * pure helper so it can be unit-tested independently of the Deepgram API.
 */
import { describe, it, expect } from "vitest";

// ─── Replicated logic (mirrors applySingleSpeakerSplitFix in callAnalysis.ts) ─
type WordTimestamp = { word: string; start: number; end: number; speaker: "Agent" | "Customer" };
type Chunk = { words: WordTimestamp[]; start: number; end: number };

const AGENT_PATTERNS = [
  /\bla\s*vie\b/i, /\blavie\b/i, /\bla\s*vie\s*labs\b/i,
  /\blovely\s*labs\b/i, /\blavi\s*labs\b/i,
  /\bmatinika\b/i, /\boulala\b/i, /\bashkara\b/i, /\bcollagen\b/i,
  /\b4\.95\b/, /\b£\s*4\.95\b/,
  /\b21[\s-]day\s*(free\s*)?trial\b/i,
  /\b44\.90\b/, /\b£\s*44\.90\b/,
  /\bhyaluronic\s*acid\b/i, /\bretinol\b/i, /\btrustpilot\b/i,
  /\bthis\s+is\s+\w+\s+from\b/i,
  /\bmy\s+name\s+is\b/i,
  /\bcalling\s+from\b/i,
  /\bcalling\s+on\s+behalf\s+of\b/i,
  /\bfree\s+trial\b/i, /\bmagic\s+wand\b/i, /\bcancel\s+any\s*time\b/i,
  /\bpostage\b/i, /\bdelivery\s+address\b/i, /\blong\s+number\b/i,
  /\bsort\s+code\b/i, /\bexpiry\b/i,
  /\bskin\s*care\b/i, /\bmedical\s*grade\b/i,
];

const CUSTOMER_PHRASE_PATTERNS = [
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
  /\bspeaking\b/i,
];

const CUSTOMER_SHORT_RESPONSES = new Set([
  "yes", "yeah", "yep", "yup", "no", "nope", "okay", "ok",
  "bye", "goodbye", "hello", "hi", "hey", "sure", "fine",
  "alright", "right", "speaking",
]);

function applySingleSpeakerSplitFix(
  wordTimestamps: WordTimestamp[]
): { wordTimestamps: WordTimestamp[]; repSpeechPct: number; transcript: string } | null {
  if (wordTimestamps.length === 0) return null;
  const firstSpeaker = wordTimestamps[0].speaker;
  if (!wordTimestamps.every(w => w.speaker === firstSpeaker)) return null;

  const fullText = wordTimestamps.map(w => w.word).join(" ").toLowerCase();

  const hasIvr = CUSTOMER_PHRASE_PATTERNS.some(p => p.test(fullText));
  const hasAgentPatterns = AGENT_PATTERNS.some(p => p.test(fullText));
  const hasShortResponses = wordTimestamps.some(
    w => CUSTOMER_SHORT_RESPONSES.has(w.word.toLowerCase().replace(/[^a-z]/g, ""))
  );

  if (!hasIvr && !hasAgentPatterns) return null;
  if (!hasIvr && !hasShortResponses) return null;

  const GAP_THRESHOLD = 0.3;
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

  const chunkLabels: ("Agent" | "Customer")[] = chunks.map((chunk, chunkIndex) => {
    const chunkLower = chunk.words.map(w => w.word).join(" ").toLowerCase();
    const cleanWords = chunkLower.replace(/[^a-z\s]/g, "").trim().split(/\s+/);

    if (AGENT_PATTERNS.some(p => p.test(chunkLower))) return "Agent";
    if (CUSTOMER_PHRASE_PATTERNS.some(p => p.test(chunkLower))) return "Customer";
    if (cleanWords.length <= 2 && cleanWords.every(w => CUSTOMER_SHORT_RESPONSES.has(w))) return "Customer";
    if (chunk.words.length <= 4 && chunkIndex > 0) return "Customer";
    if (chunkIndex === 0) return "Agent";
    return "Agent";
  });

  let agentTime = 0;
  let totalTime = 0;
  const newWordTimestamps: WordTimestamp[] = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const label = chunkLabels[ci];
    for (const w of chunks[ci].words) {
      const dur = w.end - w.start;
      totalTime += dur;
      if (label === "Agent") agentTime += dur;
      newWordTimestamps.push({ ...w, speaker: label });
    }
  }

  const repSpeechPct = totalTime > 0 ? Math.round((agentTime / totalTime) * 100) : 50;

  type Segment = { label: "Agent" | "Customer"; words: string[] };
  const segments: Segment[] = [];
  for (const w of newWordTimestamps) {
    const wordText = w.word.trim();
    if (!wordText) continue;
    if (segments.length === 0 || segments[segments.length - 1].label !== w.speaker) {
      segments.push({ label: w.speaker, words: [wordText] });
    } else {
      segments[segments.length - 1].words.push(wordText);
    }
  }
  const transcript = segments.map(s => `${s.label}: ${s.words.join(" ")}`).join("\n");

  return { wordTimestamps: newWordTimestamps, repSpeechPct, transcript };
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function makeWords(entries: [string, number, number][], speaker: "Agent" | "Customer" = "Agent"): WordTimestamp[] {
  return entries.map(([word, start, end]) => ({ word, start, end, speaker }));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe("applySingleSpeakerSplitFix", () => {

  it("returns null for an empty array", () => {
    expect(applySingleSpeakerSplitFix([])).toBeNull();
  });

  it("returns null when speakers are already mixed", () => {
    const words: WordTimestamp[] = [
      { word: "Hello", start: 0, end: 0.5, speaker: "Agent" },
      { word: "Yes", start: 1, end: 1.2, speaker: "Customer" },
    ];
    expect(applySingleSpeakerSplitFix(words)).toBeNull();
  });

  it("returns null when there are no Lavie/IVR signals at all", () => {
    // Generic conversation with no Lavie patterns and no IVR phrases
    const words = makeWords([
      ["How", 0, 0.3], ["are", 0.3, 0.5], ["you", 0.5, 0.7],
      ["Fine", 1.2, 1.5], ["thanks", 1.5, 1.8],
    ]);
    expect(applySingleSpeakerSplitFix(words)).toBeNull();
  });

  it("returns null when agent patterns exist but no customer signals", () => {
    // Agent-only call (no short responses, no customer phrases)
    const words = makeWords([
      ["My", 0, 0.2], ["name", 0.2, 0.4], ["is", 0.4, 0.5], ["Angel", 0.5, 0.8],
      ["calling", 0.9, 1.2], ["from", 1.2, 1.4], ["La", 1.4, 1.6], ["Vie", 1.6, 1.9],
      ["Labs", 1.9, 2.2],
    ]);
    expect(applySingleSpeakerSplitFix(words)).toBeNull();
  });

  // ── IVR / Voicemail case ────────────────────────────────────────────────────

  it("splits IVR/voicemail call: IVR words → Customer, agent response → Agent", () => {
    const words = makeWords([
      // IVR block (no gap between words)
      ["The", 0, 0.3], ["person", 0.3, 0.6], ["you", 0.6, 0.8], ["are", 0.8, 1.0],
      ["calling", 1.0, 1.3], ["is", 1.3, 1.5], ["not", 1.5, 1.8], ["available.", 1.8, 2.2],
      ["Please", 2.2, 2.5], ["leave", 2.5, 2.8], ["a", 2.8, 2.9], ["message.", 2.9, 3.3],
      // Gap 0.5s
      // Agent response
      ["La", 3.8, 4.0], ["Vie", 4.0, 4.3], ["Labs.", 4.3, 4.7],
    ]);
    const result = applySingleSpeakerSplitFix(words);
    expect(result).not.toBeNull();
    // IVR chunk → Customer ("not available" phrase triggers Customer label)
    const notWord = result!.wordTimestamps.find(w => w.word === "not");
    expect(notWord?.speaker).toBe("Customer");
    const leaveWord = result!.wordTimestamps.find(w => w.word === "leave");
    expect(leaveWord?.speaker).toBe("Customer");
    // La Vie Labs chunk is after gap → agent pattern match → Agent
    const lavieWord = result!.wordTimestamps.find(w => w.word === "Vie");
    expect(lavieWord?.speaker).toBe("Agent");
    expect(result!.repSpeechPct).toBeGreaterThan(0);
    expect(result!.repSpeechPct).toBeLessThan(100);
  });

  // ── Real customer short-response case (Patricia/Angel example) ──────────────

  it("splits real conversation: agent intro → Agent, customer objection → Customer", () => {
    const words = makeWords([
      // Agent opening (chunk 0, no gap)
      ["Hello?", 0.0, 0.5], ["Speaking", 0.6, 0.9], ["to", 0.9, 1.0], ["Patricia?", 1.0, 1.4],
      // Gap 0.4s → new chunk
      // Mixed agent + customer in same chunk (Deepgram doesn't separate them)
      ["Yes.", 1.8, 2.0], ["Hi,", 2.3, 2.5], ["Hi.", 2.8, 3.0],
      ["My", 3.2, 3.3], ["name", 3.3, 3.5], ["is", 3.5, 3.6], ["Angel.", 3.6, 3.9],
      ["I'm", 4.0, 4.2], ["calling", 4.2, 4.5], ["from", 4.5, 4.7],
      ["Lavi", 4.7, 4.9], ["Labs.", 4.9, 5.2],
      ["We", 5.3, 5.4], ["specialize", 5.4, 5.8], ["in", 5.8, 5.9],
      ["medical", 5.9, 6.2], ["grade", 6.2, 6.5], ["skin", 6.5, 6.7], ["care.", 6.7, 7.0],
      // Gap 0.5s → new chunk: customer objection
      ["Not", 7.5, 7.7], ["at", 7.7, 7.8], ["the", 7.8, 7.9],
      ["moment,", 7.9, 8.2], ["please.", 8.2, 8.5],
      ["I'm", 8.6, 8.8], ["away.", 8.8, 9.1],
      // Gap 0.4s → new chunk: customer goodbye
      ["Bye.", 9.5, 9.8],
    ]);

    const result = applySingleSpeakerSplitFix(words);
    expect(result).not.toBeNull();

    // Customer objection chunk must be labelled Customer
    const notAtMoment = result!.wordTimestamps.find(w => w.word === "Not");
    expect(notAtMoment?.speaker).toBe("Customer");

    const away = result!.wordTimestamps.find(w => w.word === "away.");
    expect(away?.speaker).toBe("Customer");

    const bye = result!.wordTimestamps.find(w => w.word === "Bye.");
    expect(bye?.speaker).toBe("Customer");

    // Agent chunk (contains "calling from" + "Lavi Labs") must be Agent
    const lavi = result!.wordTimestamps.find(w => w.word === "Lavi");
    expect(lavi?.speaker).toBe("Agent");

    // repSpeechPct should be > 0 and < 100
    expect(result!.repSpeechPct).toBeGreaterThan(0);
    expect(result!.repSpeechPct).toBeLessThan(100);

    // Transcript should contain both Agent: and Customer: lines
    expect(result!.transcript).toContain("Agent:");
    expect(result!.transcript).toContain("Customer:");
  });

  it("correctly detects IVR call and labels IVR as Customer", () => {
    const words = makeWords([
      ["Please", 0, 0.4], ["leave", 0.4, 0.7], ["a", 0.7, 0.8], ["message", 0.8, 1.2],
      ["after", 1.2, 1.5], ["the", 1.5, 1.7], ["tone.", 1.7, 2.0],
      // Gap
      ["Fincare.", 2.6, 3.0],
    ]);
    const result = applySingleSpeakerSplitFix(words);
    expect(result).not.toBeNull();
    // IVR chunk → Customer
    const leaveMsg = result!.wordTimestamps.find(w => w.word === "leave");
    expect(leaveMsg?.speaker).toBe("Customer");
  });

  it("handles short customer response 'yes' as Customer when after agent block", () => {
    const words = makeWords([
      // Agent block (contains agent pattern)
      ["My", 0, 0.2], ["name", 0.2, 0.4], ["is", 0.4, 0.5], ["Angel,", 0.5, 0.8],
      ["calling", 0.9, 1.2], ["from", 1.2, 1.4], ["La", 1.4, 1.6], ["Vie", 1.6, 1.9],
      ["Labs.", 1.9, 2.2],
      // Gap 0.5s
      // Customer: "Yes"
      ["Yes.", 2.7, 2.9],
      // Gap 0.4s
      // Agent continues
      ["We", 3.3, 3.5], ["offer", 3.5, 3.8], ["a", 3.8, 3.9], ["free", 3.9, 4.2],
      ["trial.", 4.2, 4.6],
    ]);
    const result = applySingleSpeakerSplitFix(words);
    expect(result).not.toBeNull();

    const yes = result!.wordTimestamps.find(w => w.word === "Yes.");
    expect(yes?.speaker).toBe("Customer");

    const free = result!.wordTimestamps.find(w => w.word === "free");
    expect(free?.speaker).toBe("Agent");
  });

  it("recalculates repSpeechPct correctly based on new labels", () => {
    // Agent block: 5s, Customer block: 2s → repSpeechPct ≈ 71%
    const words = makeWords([
      ["My", 0, 0.5], ["name", 0.5, 1.0], ["is", 1.0, 1.5], ["Angel,", 1.5, 2.0],
      ["calling", 2.0, 2.5], ["from", 2.5, 3.0], ["La", 3.0, 3.5], ["Vie", 3.5, 4.0],
      ["Labs.", 4.0, 5.0],
      // Gap 0.5s
      ["Not", 5.5, 6.0], ["at", 6.0, 6.5], ["the", 6.5, 7.0],
      ["moment.", 7.0, 7.5],
    ]);
    const result = applySingleSpeakerSplitFix(words);
    expect(result).not.toBeNull();
    // Agent time = 5s, Customer time = 2s, total = 7s → 71%
    expect(result!.repSpeechPct).toBe(71);
  });

});
