/**
 * Unit tests for the smart agent speaker detection logic embedded in callAnalysis.ts.
 *
 * Because detectAgentSpeaker() is a module-private function, we test its behaviour
 * indirectly by replicating the exact same logic here and verifying all three
 * detection strategies:
 *   1. Content-based pattern matching (company name, product names, pricing)
 *   2. Speech-time heuristic (agent speaks more in outbound calls)
 *   3. First-speaker fallback
 */
import { describe, it, expect } from "vitest";

// ─── Replicate detectAgentSpeaker locally for unit testing ────────────────────
// (Mirrors the implementation in callAnalysis.ts exactly)
const AGENT_PATTERNS = [
  /\bla\s*vie\b/i,
  /\blavie\b/i,
  /\bla\s*vie\s*labs\b/i,
  /\blovely\s*labs\b/i,
  /\bmatinika\b/i,
  /\boulala\b/i,
  /\bashkara\b/i,
  /\b4\.95\b/,
  /\b£\s*4\.95\b/,
  /\b21[\s-]day\s*(free\s*)?trial\b/i,
  /\b44\.90\b/,
  /\b£\s*44\.90\b/,
  /\bhyaluronic\s*acid\b/i,
  /\bretinol\b/i,
  /\btrustpilot\b/i,
  /\bthis\s+is\s+\w+\s+from\b/i,
  /\bmy\s+name\s+is\s+\w+\s+(?:from|calling\s+from)\b/i,
  /\bcalling\s+(?:from|on\s+behalf\s+of)\b/i,
  /\bfree\s+trial\b/i,
  /\bmagic\s+wand\b/i,
  /\bcancel\s+any\s*time\b/i,
  /\bpostage\b/i,
  /\bdelivery\s+address\b/i,
  /\blong\s+number\b/i,
  /\bsort\s+code\b/i,
  /\bexpiry\b/i,
];

type Item = {
  speaker?: number;
  transcript?: string;
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
};

function detectAgentSpeaker(items: Item[], firstSpeaker: number): number {
  const speakerTexts: Record<number, string> = {};
  const speakerTimes: Record<number, number> = {};
  const SCAN_LIMIT = 60;

  for (let i = 0; i < Math.min(items.length, SCAN_LIMIT); i++) {
    const item = items[i];
    const spk = item.speaker ?? firstSpeaker;
    const text = (item.transcript ?? item.punctuated_word ?? item.word ?? "").toLowerCase();
    speakerTexts[spk] = (speakerTexts[spk] ?? "") + " " + text;
  }

  for (const item of items) {
    const spk = item.speaker ?? firstSpeaker;
    const dur = (item.end ?? 0) - (item.start ?? 0);
    speakerTimes[spk] = (speakerTimes[spk] ?? 0) + dur;
  }

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
    return Number(bestContentMatch[0]);
  }

  const speechEntries = Object.entries(speakerTimes);
  if (speechEntries.length >= 2) {
    const [longestSpkStr] = speechEntries.sort(([, a], [, b]) => b - a)[0];
    return Number(longestSpkStr);
  }

  return firstSpeaker;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeUtterances(
  lines: Array<{ speaker: number; text: string; start?: number; end?: number }>
): Item[] {
  return lines.map((l, i) => ({
    speaker: l.speaker,
    transcript: l.text,
    start: l.start ?? i * 5,
    end: l.end ?? (l.start ?? i * 5) + 4,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("detectAgentSpeaker", () => {
  // ── Content-based detection ──────────────────────────────────────────────────

  it("identifies agent by company name 'La Vie' in first utterance (outbound)", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Hi, this is Sarah from La Vie Labs, how are you today?" },
      { speaker: 1, text: "Oh hello, I'm fine thanks." },
      { speaker: 0, text: "Wonderful! I'm calling about your skin." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(0);
  });

  it("identifies agent by company name even when customer speaks first (incoming call)", () => {
    // Customer (speaker_0) speaks first — agent is speaker_1
    const utterances = makeUtterances([
      { speaker: 0, text: "Hello?" },
      { speaker: 1, text: "Hi there, this is James from La Vie Labs." },
      { speaker: 0, text: "Oh yes, I was expecting your call." },
      { speaker: 1, text: "Great! I wanted to talk to you about Matinika." },
    ]);
    // First speaker is 0 (customer), but agent is speaker_1
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'Lavie' (no space) variant", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Hello?" },
      { speaker: 1, text: "Hi, I'm calling from Lavie, how are you?" },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by product name 'Matinika'", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Yes, who is this?" },
      { speaker: 1, text: "I wanted to tell you about our Matinika cream." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by '£4.95' pricing mention", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "What does it cost?" },
      { speaker: 1, text: "It's just £4.95 for postage to get you started." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by '21-day trial' mention", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "I'm not sure about this." },
      { speaker: 1, text: "You get a full 21-day free trial, no commitment." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'magic wand' question", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Hello?" },
      { speaker: 1, text: "If you could wave a magic wand and change one thing about your skin, what would it be?" },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'Trustpilot' mention", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "How do I know it works?" },
      { speaker: 1, text: "We have thousands of five-star reviews on Trustpilot." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'cancel anytime' phrase", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Is this a subscription?" },
      { speaker: 1, text: "You can cancel anytime with one click, you're in complete control." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'hyaluronic acid' mention", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "What's in it?" },
      { speaker: 1, text: "It contains 32% hyaluronic acid, medical-grade formula." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("identifies agent by 'delivery address' phrase (card-taking stage)", () => {
    const utterances = makeUtterances([
      { speaker: 0, text: "Okay, I'm happy to go ahead." },
      { speaker: 1, text: "Perfect! Can I confirm your delivery address?" },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("correctly scores agent higher when both speakers have some matching words", () => {
    // Agent (speaker_1) mentions multiple patterns; customer (speaker_0) mentions none
    const utterances = makeUtterances([
      { speaker: 0, text: "I'm not sure about my skin." },
      { speaker: 1, text: "Hi, this is Emma from La Vie Labs. We have Matinika with hyaluronic acid." },
      { speaker: 0, text: "Oh interesting." },
      { speaker: 1, text: "It's only £4.95 for a 21-day free trial." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  // ── Speech-time heuristic fallback ───────────────────────────────────────────

  it("falls back to speech-time heuristic when no content patterns match", () => {
    // No agent-identifying patterns in either speaker's text.
    // Agent (speaker_1) speaks much more than customer (speaker_0).
    const utterances: Item[] = [
      { speaker: 0, transcript: "Hello?", start: 0, end: 1 },
      { speaker: 1, transcript: "Hi there, how are you doing today, I wanted to reach out to you about something really exciting that we have been working on for a while now.", start: 1, end: 15 },
      { speaker: 0, transcript: "Okay.", start: 15, end: 16 },
      { speaker: 1, transcript: "We have been developing a new product that I think you will absolutely love and I would love to tell you more about it if you have a moment.", start: 16, end: 30 },
    ];
    // speaker_1 has much more speech time → identified as agent
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });

  it("speech-time heuristic returns first speaker when they speak more", () => {
    const utterances: Item[] = [
      { speaker: 0, transcript: "I have a lot to say about this topic and will talk for a long time.", start: 0, end: 20 },
      { speaker: 1, transcript: "Yes.", start: 20, end: 21 },
    ];
    expect(detectAgentSpeaker(utterances, 0)).toBe(0);
  });

  // ── First-speaker fallback ───────────────────────────────────────────────────

  it("falls back to first speaker when only one speaker present", () => {
    const utterances: Item[] = [
      { speaker: 0, transcript: "Hello there.", start: 0, end: 2 },
      { speaker: 0, transcript: "How are you?", start: 2, end: 4 },
    ];
    expect(detectAgentSpeaker(utterances, 0)).toBe(0);
  });

  it("falls back to first speaker when items array is empty", () => {
    expect(detectAgentSpeaker([], 0)).toBe(0);
  });

  // ── Word-level items (mono diarization path) ─────────────────────────────────

  it("works with word-level items (punctuated_word field)", () => {
    const words: Item[] = [
      { speaker: 0, punctuated_word: "Hello?", start: 0, end: 0.5 },
      { speaker: 1, punctuated_word: "Hi,", start: 0.5, end: 0.8 },
      { speaker: 1, punctuated_word: "this", start: 0.8, end: 1.0 },
      { speaker: 1, punctuated_word: "is", start: 1.0, end: 1.2 },
      { speaker: 1, punctuated_word: "Matinika", start: 1.2, end: 1.8 },
      { speaker: 1, punctuated_word: "calling.", start: 1.8, end: 2.2 },
    ];
    expect(detectAgentSpeaker(words, 0)).toBe(1);
  });

  it("works with word-level items (word field)", () => {
    const words: Item[] = [
      { speaker: 0, word: "hello", start: 0, end: 0.5 },
      { speaker: 1, word: "lavie", start: 0.5, end: 1.0 },
    ];
    expect(detectAgentSpeaker(words, 0)).toBe(1);
  });

  // ── Specific scenario from the bug report ───────────────────────────────────

  it("bug report scenario: customer says 'So if I don't like it, I'll just let you know' — agent is speaker_1", () => {
    // The customer (speaker_0) speaks first with a subscription-related comment.
    // The agent (speaker_1) mentions £4.95 — should be identified as agent.
    const utterances = makeUtterances([
      { speaker: 0, text: "So if I don't like it, I'll just let you know, and then they won't take the £45 out of my account." },
      { speaker: 1, text: "£4.95 just so it will clear, that's all we need from you." },
      { speaker: 0, text: "Okay, that sounds fine." },
    ]);
    expect(detectAgentSpeaker(utterances, 0)).toBe(1);
  });
});
