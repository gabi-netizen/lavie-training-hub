/*
  DESIGN PHILOSOPHY: Dark Command Center
  - Deep navy (#0F1923) background for focus during live calls
  - Color-coded objection buttons: navy blue, teal, burgundy
  - Space Grotesk for headings, DM Sans for body
  - Subtle glow effects on active states
  - 150ms fade transitions on tab switches
*/

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Play, BookOpen, Shield } from "lucide-react";

// ─── VIDEO CDN URLS ───────────────────────────────────────────────────────────
const OBJ1_CLIPS = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02a_objection1_partA_da3b69ac.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02b_obj1_B_d4100b43.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02c_obj1_C_2b47aad8.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02d_obj1_D_7fd819d5.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02e_obj1_E_44ae47b6.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_02f_obj1_F_a9927af3.mp4",
];

const OBJ2_CLIPS = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03a_obj2_A_303a540e.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03b_obj2_B_33a4ab4b.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03c_obj2_C_d3ed12e2.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03d_obj2_D_fe66fc2d.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03e_obj2_E_02d9ebb1.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03f_obj2_F_d46e8220.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_03g_obj2_G_659e65b5.mp4",
];

const OBJ3_CLIPS = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04a_obj3_A_dafc5606.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04b_obj3_B_528f4abe.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04c_obj3_C_7c159cc3.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04d_obj3_D_5c43d90d.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04e_obj3_E_0b86eab1.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04f_obj3_F_c8b52b7f.mp4",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/clip_04g_obj3_G_235d52b9.mp4",
];

// ─── OBJECTION DATA ───────────────────────────────────────────────────────────
const OBJECTIONS = [
  {
    id: 1,
    label: "Objection 1 — Subscription",
    btnClass: "btn-obj1",
    clips: OBJ1_CLIPS,
    script: [
      {
        type: "quote",
        text: "I'm so glad you asked! Yes, after your 21-day free trial, it does automatically transition into a subscription so you never run out of your cream.",
      },
      {
        type: "quote",
        text: "But here is the best part: you are in complete control. You can cancel, pause, or change it at any time with just one click or a quick email.",
      },
      {
        type: "quote",
        text: "Most of our ladies just keep it going because they fall in love with how their skin looks — and it locks in your 30% VIP discount forever.",
      },
      {
        type: "quote",
        text: "Does that make sense?",
      },
      {
        type: "note",
        text: "Then stop talking. That pause is where the sale is won.",
      },
      {
        type: "note",
        text: "Golden rule: never get defensive about the subscription. Be proud of it — it is a benefit, not a trap.",
      },
    ],
  },
  {
    id: 2,
    label: "Objection 2 — Trust & Card",
    btnClass: "btn-obj2",
    clips: OBJ2_CLIPS,
    script: [
      {
        type: "quote",
        text: "I completely understand, [Name]. Usually, when my clients say they need to think about it, it comes down to one of two things: either they aren't sure the cream will actually work for their skin, or they are worried about giving their card details today. Which one is it for you?",
      },
      {
        type: "note",
        text: "Wait for their answer. Then respond to what they actually said.",
      },
      {
        type: "label",
        text: "If they doubt the product will work:",
      },
      {
        type: "quote",
        text: "That is exactly why we do the 21-day free trial. You pay nothing for the product — just £4.95 postage. If your skin doesn't feel incredible after 21 days, you stop. Zero risk, zero commitment. You have nothing to lose and potentially the best skin of your life to gain.",
      },
      {
        type: "label",
        text: "If they hesitate about giving card details:",
      },
      {
        type: "quote",
        text: "I completely understand — and honestly, I respect that you're careful with your card details. That tells me you're smart. Let me reassure you: Lavie Labs is a fully regulated UK company. We have thousands of happy customers who have shared their results on Trustpilot and across the web. Your details are completely safe with us, and we use fully encrypted, secure payment processing.",
      },
      {
        type: "quote",
        text: "And remember — you are in complete control. You can cancel at any time with one email or one click. The only reason we ask for the £4.95 today is to cover our premium 48-hour tracked delivery, which requires your signature on arrival — so your package is always safe and in your hands. Nothing hidden, nothing complicated.",
      },
    ],
  },
  {
    id: 3,
    label: "Objection 3 — Too Many Products",
    btnClass: "btn-obj3",
    clips: OBJ3_CLIPS,
    script: [
      {
        type: "quote",
        text: "I hear that all the time — and I completely understand. But let me ask you something: if your cabinet is full, it probably means those products promised you results and didn't fully deliver. Am I right?",
      },
      {
        type: "note",
        text: "Wait for them to agree — they almost always will. Once they say yes, you have the door wide open.",
      },
      {
        type: "quote",
        text: "That is exactly why I'm not here to add another jar to your collection. My goal is to replace three of those products with one medical-grade cream that actually gives you the results you've been looking for — that plump, hydrated, glowing skin you deserve.",
      },
      {
        type: "quote",
        text: "And here is the thing — the product is completely free for twenty-one days. You don't have to throw anything away, you don't have to commit to anything. Just put Matinika on your skin for three weeks and let it prove itself against everything else in that cabinet.",
      },
      {
        type: "quote",
        text: "And those twenty-one days aren't just a trial — they are the beginning of a personalised skincare journey. We watch how your skin responds, and we work with you to make sure you're getting exactly the right results.",
      },
      {
        type: "quote",
        text: "That is what makes Lavie Labs different from anything in that cabinet — we don't just send you a cream and disappear. We are with you every step of the way.",
      },
    ],
  },
];

// ─── PITCH DATA ───────────────────────────────────────────────────────────────
const PITCH_STAGES = [
  {
    id: "opening",
    title: "Opening & Discovery",
    subtitle: "Build rapport, find her goal",
    icon: "👋",
    steps: [
      {
        label: "Warm Opening",
        script:
          "Hi [Name], my name is [Your Name] calling from Lavie Labs — how are you today? I'm calling because you recently expressed interest in our skincare range, and I just wanted to have a quick chat to find out a little more about you and your skin.",
      },
      {
        label: "The Magic Wand Question",
        script:
          "If you could wave a magic wand and change one thing about your skin — just one thing — what would it be? What would make you feel absolutely amazing when you look in the mirror?",
        note: "Write down her exact answer. Every product pitch and close must tie back to this.",
      },
      {
        label: "Qualify the Concern",
        script:
          "How long have you been dealing with that? And have you tried anything before to help with it?",
        note: "Let her talk. The more she describes the problem, the more she wants the solution.",
      },
    ],
  },
  {
    id: "matinika",
    title: "Product Pitch — Matinika",
    subtitle: "Medical-grade hydration cream",
    icon: "✨",
    steps: [
      {
        label: "The Benefit Hook",
        script:
          "So based on what you've just told me about [her concern], I want to tell you about something that I think is going to genuinely change how your skin feels. This isn't just another moisturiser.",
      },
      {
        label: "The Transformation",
        script:
          "Matinika is a medical-grade formula with the highest concentration of Hyaluronic Acid available without a prescription. What that means for you is that tight, dry feeling is going to disappear. You're going to wake up with skin that feels plump, bouncy, and genuinely hydrated — the kind of glow that makes you feel confident going completely makeup-free.",
      },
      {
        label: "The Comparison",
        script:
          "High-street creams typically contain around 5% Hyaluronic Acid. Matinika contains 32%. That is the difference between surface hydration and deep, lasting change in your skin.",
      },
    ],
  },
  {
    id: "oulala",
    title: "Product Pitch — Oulala & Ashkara",
    subtitle: "Retinol serum + eye treatment",
    icon: "💎",
    steps: [
      {
        label: "Oulala Retinol Serum",
        script:
          "Alongside Matinika, we also have Oulala — our medical-grade retinol serum. Retinol is clinically proven to smooth fine lines and improve skin texture. What you'll notice is that you wake up looking genuinely refreshed — that plump, youthful radiance that most people spend years trying to find.",
      },
      {
        label: "Ashkara Eye Serum",
        script:
          "And for the eye area — which is usually the first place we see tiredness and ageing — we have Ashkara. It's essentially like eight hours of sleep in a bottle. You'll look wide awake and refreshed even on your most tired days.",
      },
      {
        label: "Tie Back to Her Goal",
        script:
          "Everything I've just described — [repeat her magic wand answer] — that is exactly what this range is designed to do for your skin specifically.",
      },
    ],
  },
  {
    id: "close",
    title: "The Offer & Close",
    subtitle: "£4.95 trial, subscription, confirmation",
    icon: "🎯",
    steps: [
      {
        label: "The Free Trial Offer",
        script:
          "Here is what I'd love to do for you today. I want to send you the full Matinika cream — worth £59 — completely free. All I ask is £4.95 to cover our premium 48-hour tracked delivery with signature on arrival. That is it. No catch, no commitment.",
      },
      {
        label: "The Subscription Framing",
        script:
          "After your 21 days, if you love it — and I genuinely believe you will — it automatically continues as a subscription so you never run out. But you are in complete control. Cancel, pause, or change at any time with one click or one email. Most of our ladies keep it because they fall in love with their skin.",
      },
      {
        label: "The Confirmation Close",
        script:
          "Brilliant! Let me take your details and get this sent out to you. I'm so excited for you to start seeing real changes in your skin, especially with [her concern]. Can I start with your full name?",
        note: "After the close — stop talking. Do not add anything. Just take the details.",
      },
    ],
  },
];

// ─── SUBTITLE TEXT PER CLIP ─────────────────────────────────────────────────
const OBJ1_SUBTITLES = [
  "The customer asks: 'Is this a subscription?' Here is exactly what you say: I'm so glad you asked!",
  "Yes, after your 21-day free trial, it automatically transitions into a subscription so you never run out of your cream.",
  "But here is the best part: you are in complete control. You can cancel, pause, or change it at any time with just one click or a quick email.",
  "Most of our ladies just keep it going because they fall in love with how their skin looks — and it locks in your 30% VIP discount forever.",
  "Does that make sense? Then stop talking. That pause is where the sale is won.",
  "Golden rule: never get defensive about the subscription. Be proud of it — it is a benefit, not a trap.",
];

const OBJ2_SUBTITLES = [
  "Objection two — the customer says: 'I need to think about it.' Here is what you say:",
  "I completely understand. Usually this comes down to one of two things: they aren't sure the cream will work, or they're worried about giving card details. Which one is it for you?",
  "If they doubt the product: That is exactly why we do the 21-day free trial. You pay nothing for the product — just £4.95 postage. Zero risk, zero commitment.",
  "If they hesitate about card details: I completely understand — and I respect that. Let me reassure you: Lavie Labs is a fully regulated UK company.",
  "We have thousands of happy customers who have shared their results on Trustpilot and across the web. Your details are completely safe — we use fully encrypted, secure payment processing.",
  "You are in complete control. Cancel at any time with one email or one click.",
  "The only reason we ask for £4.95 is to cover our premium 48-hour tracked delivery with signature on arrival. Nothing hidden, nothing complicated.",
];

const OBJ3_SUBTITLES = [
  "Objection three — the customer says: 'I have too many products.' Here is what you say: I hear that all the time — and I completely understand.",
  "But let me ask you something: if your cabinet is full, it probably means those products promised you results and didn't fully deliver. Am I right? — Wait for them to agree.",
  "That is exactly why I'm not here to add another jar to your collection.",
  "My goal is to replace three of those products with one medical-grade cream that actually gives you the results you've been looking for — that plump, hydrated, glowing skin you deserve.",
  "The product is completely free for twenty-one days. You don't have to throw anything away, you don't have to commit to anything. Just put Matinika on your skin for three weeks.",
  "Those twenty-one days aren't just a trial — they are the beginning of a personalised skincare journey. We watch how your skin responds and work with you to get exactly the right results.",
  "That is what makes Lavie Labs different — we don't just send you a cream and disappear. We are with you every step of the way.",
];

// ─── VIDEO PLAYER COMPONENT ───────────────────────────────────────────────────
// Strategy: render ALL clips as <video> elements simultaneously, all preloading
// in parallel. Only the active clip is visible (opacity-100); all others are
// opacity-0 but already buffered. Switching is instant — no load gap at all.
function VideoPlayer({ clips, subtitles }: { clips: string[]; subtitles?: string[] }) {
  const [currentClip, setCurrentClip] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Reset everything when the objection changes
  useEffect(() => {
    setCurrentClip(0);
    setPlaying(false);
    setReadyCount(0);
    setFinished(false);
    videoRefs.current.forEach((v) => {
      if (v) { v.pause(); v.currentTime = 0; }
    });
  }, [clips]);

  const handleCanPlayThrough = useCallback(() => {
    setReadyCount((n) => n + 1);
  }, []);

  const handleEnded = useCallback((idx: number) => {
    if (idx < clips.length - 1) {
      // Advance to next clip instantly — it's already buffered
      setCurrentClip(idx + 1);
      const next = videoRefs.current[idx + 1];
      if (next) {
        next.currentTime = 0;
        next.play().catch(() => {});
      }
    } else {
      setPlaying(false);
      setFinished(true);
    }
  }, [clips.length]);

  const handlePlay = () => {
    const first = videoRefs.current[0];
    if (!first) return;
    setPlaying(true);
    setFinished(false);
    setCurrentClip(0);
    // Pause & reset all clips first
    videoRefs.current.forEach((v) => { if (v) { v.pause(); v.currentTime = 0; } });
    first.play().catch(() => {});
  };

  const allReady = readyCount >= clips.length;

  return (
    <>
    <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "9/16", maxHeight: "340px" }}>

      {/* All clips rendered simultaneously, only active one is visible */}
      {clips.map((src, idx) => (
        <video
          key={src}
          ref={(el) => { videoRefs.current[idx] = el; }}
          src={src}
          preload="auto"
          playsInline
          muted={false}
          onCanPlayThrough={handleCanPlayThrough}
          onEnded={() => handleEnded(idx)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-100"
          style={{ opacity: playing && currentClip === idx ? 1 : 0, zIndex: playing && currentClip === idx ? 1 : 0 }}
        />
      ))}

      {/* Controls overlay on top of active clip */}
      {playing && (
        <div className="absolute bottom-2 right-2 z-10 bg-black/60 rounded-full px-2 py-0.5 text-xs text-white/70">
          {currentClip + 1} / {clips.length}
        </div>
      )}

      {/* Initial play overlay */}
      {!playing && !finished && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 hover:bg-black/50 transition-colors"
        >
          {!allReady ? (
            <>
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-white/60 text-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Loading {readyCount}/{clips.length}…
              </span>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                <Play className="w-7 h-7 text-white ml-1" fill="white" />
              </div>
              <span className="text-white/80 text-sm font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {clips.length} clips · ~{clips.length * 8}s
              </span>
            </>
          )}
        </button>
      )}

      {/* Replay overlay after all clips finish */}
      {finished && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 hover:bg-black/50 transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <span className="text-white text-2xl">↺</span>
          </div>
          <span className="text-white/80 text-sm font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Replay
          </span>
        </button>
      )}
    </div>

    {/* Subtitle / script line below the video */}
    {subtitles && playing && subtitles[currentClip] && (
      <div
        className="mt-3 rounded-lg px-4 py-3 text-sm leading-relaxed"
        style={{
          background: "oklch(0.18 0.02 250 / 0.9)",
          border: "1px solid oklch(0.35 0.04 250 / 0.5)",
          color: "oklch(0.92 0.01 250)",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: "1.6",
        }}
      >
        {subtitles[currentClip]}
      </div>
    )}
    </>
  );
}

// ─── SCRIPT BLOCK COMPONENT ───────────────────────────────────────────────────
function ScriptSection({ items }: { items: { type: string; text: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        if (item.type === "quote") {
          return (
            <div key={i} className="script-block">
              <p className="text-base leading-relaxed">"{item.text}"</p>
            </div>
          );
        }
        if (item.type === "note") {
          return (
            <div key={i} className="coaching-note flex gap-2 items-start">
              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed">{item.text}</p>
            </div>
          );
        }
        if (item.type === "label") {
          return (
            <p key={i} className="text-sm font-semibold uppercase tracking-wider mt-1" style={{ color: "oklch(0.7 0.1 60)", fontFamily: "'Space Grotesk', sans-serif" }}>
              {item.text}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}

// ─── FULL CALL SCRIPT DATA ───────────────────────────────────────────────────
const FULL_SCRIPT_LINES: { type: "say" | "note"; text: string }[] = [
  { type: "say", text: "Hi [Name], my name is [Your Name] calling from Lavie Labs — how are you today? I'm calling because you recently expressed interest in our skincare range, and I just wanted to have a quick chat to find out a little more about you and your skin." },
  { type: "note", text: "Build warmth. Let her talk. Listen." },
  { type: "say", text: "If you could wave a magic wand and change one thing about your skin — just one thing — what would it be? What would make you feel absolutely amazing when you look in the mirror?" },
  { type: "note", text: "Write down her exact answer. Every pitch and close must tie back to this one answer." },
  { type: "say", text: "How long have you been dealing with that? And have you tried anything before to help with it?" },
  { type: "note", text: "Let her talk. The more she describes the problem, the more she wants the solution." },
  { type: "say", text: "So based on what you've just told me about [her concern], I want to tell you about something that I think is going to genuinely change how your skin feels. This isn't just another moisturiser." },
  { type: "say", text: "Matinika is a medical-grade formula with the highest concentration of Hyaluronic Acid available without a prescription. What that means for you is that tight, dry feeling is going to disappear. You're going to wake up with skin that feels plump, bouncy, and genuinely hydrated — the kind of glow that makes you feel confident going completely makeup-free." },
  { type: "say", text: "High-street creams typically contain around 5% Hyaluronic Acid. Matinika contains 32%. That is the difference between surface hydration and deep, lasting change in your skin." },
  { type: "say", text: "Alongside Matinika, we also have Oulala — our medical-grade retinol serum. Retinol is clinically proven to smooth fine lines and improve skin texture. What you'll notice is that you wake up looking genuinely refreshed — that plump, youthful radiance that most people spend years trying to find." },
  { type: "say", text: "And for the eye area — which is usually the first place we see tiredness and ageing — we have Ashkara. It's essentially like eight hours of sleep in a bottle. You'll look wide awake, bright-eyed, and refreshed every single morning." },
  { type: "say", text: "Everything I've just described — [repeat her magic wand answer] — that is exactly what this range is designed to do for your skin specifically." },
  { type: "note", text: "Pause. Let that land. Then move to the offer." },
  { type: "say", text: "Here is what I'd love to do for you today. I want to send you the full Matinika cream — worth £59 — completely free. All I ask is £4.95 to cover our premium 48-hour tracked delivery with signature on arrival. That is it. No catch, no commitment." },
  { type: "say", text: "After your 21 days, if you love it — and I genuinely believe you will — it automatically continues as a subscription so you never run out. But you are in complete control. Cancel, pause, or change at any time with one click or one email. Most of our ladies keep it because they fall in love with their skin." },
  { type: "say", text: "Brilliant! Let me take your details and get this sent out to you. I'm so excited for you to start seeing real changes in your skin, especially with [her concern]. Can I start with your full name?" },
  { type: "note", text: "Stop talking. Do not add anything. Just take the details." },
];

// ─── FULL SCRIPT COMPONENT ───────────────────────────────────────────────────
function FullCallScript() {
  return (
    <div className="flex flex-col gap-4">
      {FULL_SCRIPT_LINES.map((line, i) =>
        line.type === "say" ? (
          <div key={i} className="script-block">
            <p className="text-base leading-relaxed">"{line.text}"</p>
          </div>
        ) : (
          <div key={i} className="coaching-note flex gap-2 items-start">
            <Shield className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm leading-relaxed">{line.text}</p>
          </div>
        )
      )}
    </div>
  );
}

// ─── PITCH FULL SCRIPT (no accordion, continuous flow) ───────────────────────
function PitchFullScript() {
  return (
    <div className="flex flex-col gap-6">
      {PITCH_STAGES.map((stage) => (
        <div key={stage.id} className="flex flex-col gap-4">
          {/* Stage heading */}
          <div className="flex items-center gap-3 pb-2 border-b border-white/10">
            <span className="text-2xl">{stage.icon}</span>
            <div>
              <p className="font-bold text-base text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {stage.title}
              </p>
              <p className="text-sm mt-0.5" style={{ color: "oklch(0.6 0.01 250)" }}>
                {stage.subtitle}
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-4">
            {stage.steps.map((step, i) => (
              <div key={i} className="flex flex-col gap-2">
                <p
                  className="text-sm font-semibold uppercase tracking-wider"
                  style={{ color: "oklch(0.65 0.15 250)", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {step.label}
                </p>
                <div className="script-block">
                  <p className="text-base leading-relaxed">"{step.script}"</p>
                </div>
                {step.note && (
                  <div className="coaching-note flex gap-2 items-start">
                    <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-sm leading-relaxed">{step.note}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── LIVE CALL SCRIPT DATA ───────────────────────────────────────────────────
const LIVE_CALL_SECTIONS = [
  {
    id: "intro",
    icon: "📞",
    title: "Introduction & Discovery",
    subtitle: "🔥 HIGH ENERGY — NO PAUSES — CONFIDENCE — SAY IT WITH A SMILE! 🔥",
    items: [
      { type: "say", text: "Hi [Name], it's [Your Name] from Lavie Labs. We're a medical-grade skincare company working in partnership with UK Best Offers. We're calling today to send you a complimentary Anti-Aging Starter Kit to try!" },
      { type: "say", text: "Because our products are medical-grade and highly active, I just need to ask a few quick questions to make sure we send you the perfect match for your skin. Would you say your skin is more on the dry side, combination, or oily?" },
      { type: "note", text: "Listen and adapt based on their answer. Focus on how the skin FEELS to them." },
      { type: "label", text: "If Dry:" },
      { type: "say", text: "Have you always had drier skin, or is this a recent change where your skin just feels like it's lost its bounce and hydration?" },
      { type: "say", text: "Do you ever get that tight, uncomfortable feeling right after you step out of the shower?" },
      { type: "say", text: "Are there specific areas that feel rough or flaky, where makeup just doesn't sit right?" },
      { type: "label", text: "If Combination:" },
      { type: "say", text: "Has it always been combination, or did you used to have oilier skin that has changed over time?" },
      { type: "say", text: "Do you find your T-zone gets shiny by midday while your cheeks feel tight?" },
      { type: "label", text: "If Oily:" },
      { type: "say", text: "Have you always struggled with oily skin?" },
      { type: "say", text: "Do you find yourself having to blot or powder throughout the day to keep the shine down?" },
      { type: "say", text: "Are you prone to breakouts, or do you have any stubborn post-blemish marks you'd love to fade?" },
    ],
  },
  {
    id: "routine",
    icon: "🧴",
    title: "Routine & Education",
    subtitle: "Build rapport and introduce Hyaluronic Acid",
    items: [
      { type: "say", text: "Do you currently have a skincare routine you follow morning and night? What are you using right now?" },
      { type: "note", text: "Listen actively. Compliment their effort, no matter how small." },
      { type: "say", text: "I love that you have a routine! Taking that time for yourself is half the battle. The other half is making sure you are using powerful active ingredients which you will receive using medical grade products." },
      { type: "say", text: "Tell me, are you familiar with Hyaluronic Acid? Have you heard of it?" },
      { type: "say", text: "Hyaluronic Acid is actually something our bodies produce naturally. Think of it like a sponge that holds water inside your skin. It's what gives young skin that plump, bouncy, glowing look." },
      { type: "say", text: "The catch is, after we turn 25, our bodies stop making as much of it. That's when we start noticing our skin feeling drier, looking a bit duller, and those fine lines start creeping in. Our goal is simply to give that hydration back to your skin, so it can look and feel plump, smooth, and radiant again." },
    ],
  },
  {
    id: "magicwand",
    icon: "✨",
    title: "The Magic Wand Question",
    subtitle: "Crucial for emotional buy-in — listen carefully",
    items: [
      { type: "say", text: "I always like to ask my clients this question: If you had a magic wand and could improve just ONE thing about your skin right now when you look in the mirror, what would it be? What result would make you feel amazing? It could be the eye area — some puffiness, lines, or dark circles — or it could be elasticity, or lines and wrinkles. What would your choice be?" },
      { type: "note", text: "Listen carefully. Recap their exact words to show you understand their pain point." },
      { type: "say", text: "So just to clarify, you would like to soften the lines around your mouth and treat the dry skin and get it looking more radiant. Did I get that right?" },
    ],
  },
  {
    id: "products",
    icon: "💎",
    title: "Product Presentation",
    subtitle: "Benefit-driven — always tie back to their magic wand answer",
    items: [
      { type: "label", text: "Matinika (Day & Night Cream):" },
      { type: "say", text: "Based on what you just told me about wanting to [insert their goal], the first product I am so excited to send you is called Matinika. Now, I could bore you with the science and tell you it has 32% active Hyaluronic Acid compared to the 5% you might find in high street brands, but what really matters is what it's going to do for you." },
      { type: "say", text: "The very first time you put this on, you're going to notice the texture. It's incredibly silky and lightweight. It doesn't sit heavy on your face; your skin just drinks it right up. Instantly, that tight, dry feeling is going to vanish. Your skin is going to feel incredibly soft, deeply nourished, and you're going to have this beautiful, healthy glow that lasts all day long." },
      { type: "say", text: "We have clients telling us constantly that they finally feel confident going makeup-free because their skin just looks so healthy and hydrated." },
      { type: "label", text: "Oulala Retinol Serum (Fine Lines/Texture):" },
      { type: "say", text: "The second product I'm including in your kit is our Oulala Face and Neck Retinol Serum. Retinol is the gold standard for anti-aging. What this is going to do for you is gently sweep away all those tired, dead skin cells that make our complexion look dull. You are going to literally see your skin transforming — tighter, significantly smoother, and those deeper lines you mentioned are going to start softening. You're going to wake up looking refreshed, with that plump, youthful radiance we all want." },
      { type: "label", text: "OR — Ashkara Eye Serum (Dark Circles/Puffiness):" },
      { type: "say", text: "Because you specifically mentioned wanting to target [dark circles / hooded eye lids / puffy bags / fine lines around the eyes], I am making sure to include our Ashkara Eye Serum in your kit. When you use this daily, it's going to smooth out those fine lines, visibly reduce that morning puffiness, and brighten up those dark circles. Apply the eye serum mornings and evenings." },
    ],
  },
  {
    id: "socialproof",
    icon: "⭐",
    title: "Social Proof & Website Walkthrough",
    subtitle: "Show the website, build trust visually",
    items: [
      { type: "say", text: "I want to show you exactly what you'll be receiving. I've just sent an email to [Email Address]. Could you let me know when that pops up? It will be from Lavie Labs." },
      { type: "say", text: "Fantastic. If you click the link to our website, you'll see our homepage. We are incredibly proud of our rating on Trustpilot — we have thousands of happy customers who have shared their results there and across the web. I am going to be your personal skincare concierge — if you ever need anything, I'm right here." },
      { type: "say", text: "If you scroll down just a bit, you'll see some Before & After photos of real women using our products. Take a look at those. Do any of those transformations stand out to you?" },
      { type: "note", text: "Guide them to see the results they want." },
      { type: "note", text: "🎁 Compare the women on our website with your customer's needs!" },
      { type: "say", text: "Look at the brightness in their skin. You can see how much softer their fine lines look, and they all have that gorgeous, healthy glow. That is exactly the result we are aiming for with your skin using the Matinika and the [Oulala/Ashkara]." },
    ],
  },
  {
    id: "offer",
    icon: "🎁",
    title: "The Offer & Close",
    subtitle: "Confident, clear, no hesitation",
    items: [
      { type: "say", text: "Here is how this works: We are sending you a 21-day, completely risk-free trial of the Matinika, alongside a starter size of the serum. We want you to feel the textures, see the glow, and experience the results in your own mirror without any pressure." },
      { type: "say", text: "If for any reason you don't absolutely love how your skin feels, you can pause or cancel at any time, no questions asked." },
      { type: "say", text: "Once you fall in love with the results, as a VIP client, you unlock a permanent 30% discount. So instead of paying the normal £59 for a two-month supply of Matinika, it comes all the way down to just £44.95 every 60 days." },
      { type: "say", text: "We send everything via our premium 48-hour tracked delivery with signature on arrival, so your package is always safe and in your hands. We just ask you to cover the small £4.95 postage fee today." },
      { type: "say", text: "I am so excited for you to start seeing real changes in your skin, especially with [reiterate their main concern]. Are you ready to give your skin the hydration it deserves and try this out?" },
      { type: "note", text: "Process payment. Stop talking. Do not add anything." },
      { type: "say", text: "Will you be using Visa, Mastercard, or Amex for the £4.95 postage?" },
    ],
  },
  {
    id: "confirmation",
    icon: "✅",
    title: "Confirmation & Usage Instructions",
    subtitle: "Warm close — set expectations and build excitement",
    items: [
      { type: "say", text: "Perfect. Just to summarise for our recorded line: Today it is just £4.95 for the premium tracked shipping. You are receiving your Matinika and your starter [Oulala/Ashkara]." },
      { type: "say", text: "In 21 days, if you're loving your results — and I know you will be — your subscription will begin and you'll receive your next supply at your exclusive 30% VIP discount." },
      { type: "say", text: "For best results, use the Matinika morning and night on clean skin. Apply a small amount — a little goes a long way — and gently massage it in until fully absorbed. Follow with the [Oulala/Ashkara] serum. You should start noticing a difference in how your skin feels within the first few days." },
      { type: "say", text: "I'm going to send you a confirmation email right now with all the details, your order number, and my direct contact information. If you ever have any questions, please don't hesitate to reach out — I am your personal skincare concierge and I am here for you." },
      { type: "say", text: "I am so excited for you to start this journey. Enjoy your beautiful new skin!" },
      { type: "note", text: "End the call warmly. The customer should feel excited, not sold to." },
    ],
  },
];

// ─── LIVE CALL SCRIPT COMPONENT ──────────────────────────────────────────────
function LiveCallScript() {
  return (
    <div className="flex flex-col gap-6">
      {LIVE_CALL_SECTIONS.map((section) => (
        <div key={section.id} className="flex flex-col gap-3">
          {/* Section heading */}
          <div className="flex items-center gap-3 pb-2 border-b border-white/10">
            <span className="text-xl">{section.icon}</span>
            <div>
              <p className="font-bold text-base text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {section.title}
              </p>
              {section.subtitle && (
                <p className="text-base font-black tracking-wide mt-1" style={{ color: "oklch(0.82 0.22 145)", textShadow: "0 0 12px oklch(0.65 0.22 145 / 0.4)", letterSpacing: "0.04em" }}>
                  {section.subtitle}
                </p>
              )}
            </div>
          </div>
          {/* Items */}
          <div className="flex flex-col gap-3">
            {section.items.map((item, i) =>
              item.type === "say" ? (
                <div key={i} className="script-block">
                  <p className="text-base leading-relaxed">"{item.text}"</p>
                </div>
              ) : item.type === "label" ? (
                <p key={i} className="text-sm font-bold uppercase tracking-wider mt-1" style={{ color: "oklch(0.65 0.15 250)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {item.text}
                </p>
              ) : (
                <div key={i} className="coaching-note flex gap-2 items-start">
                  <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm leading-relaxed">{item.text}</p>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DIAGNOSTICS DATA ───────────────────────────────────────────────────────
const DIAGNOSTICS = [
  {
    icon: "🗣️",
    symptomShort: "Can't get into the conversation",
    symptom: "The customer gives one-word answers. The call feels flat. You cannot get any momentum going.",
    rootCause: "Tone, energy, or pacing issue. You may be speaking too fast, too quietly, or sounding like you are reading from a script.",
    fixes: [
      "Slow down by 20%. Pause after every sentence.",
      "Smile physically — it changes your voice instantly.",
      "Drop your pitch lower. A deeper, calmer voice builds trust.",
      "Use her name once in the first 30 seconds.",
    ],
    powerLine: "[Name], I'm so glad I caught you today — I've got something really exciting I want to share with you.",
  },
  {
    icon: "📵",
    symptomShort: "Customer hangs up or disengages early",
    symptom: "She says 'I'm busy' or 'not interested' within the first 60 seconds.",
    rootCause: "The opening does not create curiosity. It sounds like a sales call, not a personal call.",
    fixes: [
      "Lead with the gift, not the product: 'I'm calling to send you something complimentary.'",
      "Never say 'I'm calling to tell you about our products.'",
      "Create a pattern interrupt — say something unexpected.",
    ],
    powerLine: "I'm not here to sell you anything today — I'm actually calling because we want to send you something completely free.",
  },
  {
    icon: "🤔",
    symptomShort: "She agrees but won't buy",
    symptom: "She says 'that sounds lovely' and 'yes, yes' but hesitates at the close.",
    rootCause: "Emotional buy-in is missing. She has not connected the product to her specific problem. The Magic Wand answer was never tied back.",
    fixes: [
      "Go back to her Magic Wand answer. Repeat it word for word.",
      "Make it personal: 'This is literally designed for exactly what you described.'",
      "Create soft urgency: 'We only have a limited number of starter kits available this week.'",
    ],
    powerLine: "[Name], you told me you want [her exact words]. This is exactly what Matinika is going to do for you. Let's get this sent out today.",
  },
  {
    icon: "❓",
    symptomShort: "She asks too many questions",
    symptom: "She asks about ingredients, side effects, competitors, return policy — the call becomes an interrogation.",
    rootCause: "Trust has not been established. She is in research mode, not buying mode.",
    fixes: [
      "Answer briefly, then redirect: 'Great question — what matters most is what it's going to do for your skin.'",
      "Bring in social proof: 'We have thousands of customers on Trustpilot who felt the same way before they tried it.'",
      "Do not over-explain. Every extra detail creates a new objection.",
    ],
    powerLine: "I completely understand — and the best way to answer all of that is just to try it. That is exactly why we do the free trial.",
  },
  {
    icon: "📧",
    symptomShort: 'She says "send me an email"',
    symptom: "She asks you to email her the information instead of continuing the call.",
    rootCause: "She wants to exit the call politely. This is a soft objection, not a genuine request for information.",
    fixes: [
      "Do not agree immediately. Acknowledge and re-engage.",
      "Say: 'Of course — and while I have you, can I just ask one quick question?'",
      "Then ask the Magic Wand question. Get her talking again.",
      "If she insists — send the email AND book a follow-up call in the same breath.",
    ],
    powerLine: "Absolutely, I'll send that over right now. And just while I have you for one second — if you could change just one thing about your skin, what would it be?",
  },
  {
    icon: "😰",
    symptomShort: "I feel like I'm selling, not helping",
    symptom: "You feel uncomfortable. The conversation feels pushy. You are losing confidence mid-call.",
    rootCause: "You have slipped into pitch mode instead of consultation mode. You are talking about the product, not about her.",
    fixes: [
      "Stop. Ask a question. Get her talking.",
      "Remind yourself: 'I am a skincare concierge, not a salesperson.'",
      "Every sentence should be about her skin, her goal, her result.",
      "Use 'you' three times more than 'I' or 'we.'",
    ],
    powerLine: "I just want to make sure I'm giving you exactly what's right for your skin — can I ask you one more thing?",
  },
  {
    icon: "⏳",
    symptomShort: "She needs to think about it",
    symptom: "She says 'let me think about it' or 'I'll call you back.'",
    rootCause: "There is an unspoken objection she has not voiced. She is not saying no — she is saying she needs more certainty.",
    fixes: [
      "Do not accept it. Gently ask: 'Of course — can I ask what's making you hesitate?'",
      "Listen. The real objection will come out.",
      "Remind her it is completely risk-free: 'There is genuinely nothing to lose — it is just £4.95 for the postage.'",
      "Offer a soft close: 'Why don't we get it sent out, and if you change your mind during the 21 days, you can cancel with one email?'",
    ],
    powerLine: "I completely respect that. Can I just ask — is it the subscription you're unsure about, or is there something else on your mind?",
  },
  {
    icon: "💸",
    symptomShort: "She says it's too expensive",
    symptom: "She objects to the £4.95 or the ongoing subscription price.",
    rootCause: "She does not yet see the value. The price feels bigger than the benefit in her mind.",
    fixes: [
      "Anchor to the full value first: 'The full kit is worth over £100 — today you are getting it for £4.95.'",
      "Break down the subscription: 'That is less than £1.50 a day for medical-grade skincare.'",
      "Compare to what she is already spending: 'Most of our ladies were spending £30–£40 a month on products that were not working.'",
    ],
    powerLine: "I completely understand — and when you think about it, £44.95 every two months works out to less than a coffee a day. And you are getting medical-grade results that actually show in the mirror.",
  },
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<"objections" | "pitch" | "fullscript" | "livescript" | "diagnostics">("objections");
  const [activeDiagnostic, setActiveDiagnostic] = useState<number | null>(null);
  const [activeObjId, setActiveObjId] = useState<number | null>(null);

  const activeObj = OBJECTIONS.find((o) => o.id === activeObjId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.13 0.025 250)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-white/8" style={{ background: "oklch(0.16 0.025 250)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.3 0.12 250)" }}>
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Lavié Labs
          </h1>
          <p className="text-xs" style={{ color: "oklch(0.55 0.01 250)" }}>
            Training Hub
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-white/8 px-4" style={{ background: "oklch(0.16 0.025 250)" }}>
        <button
          onClick={() => setActiveTab("objections")}
          className={`py-3 px-1 mr-6 text-sm font-semibold transition-colors ${activeTab === "objections" ? "tab-active" : "tab-inactive"}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Objection Trainer
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`py-3 px-1 mr-6 text-sm font-semibold transition-colors ${activeTab === "diagnostics" ? "tab-active" : "tab-inactive"}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Call Diagnostics
        </button>
        <button
          onClick={() => setActiveTab("livescript")}
          className={`py-3 px-1 text-sm font-semibold transition-colors ${activeTab === "livescript" ? "tab-active" : "tab-inactive"}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Live Call Script
        </button>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">

        {/* ── OBJECTION TRAINER TAB ── */}
        {activeTab === "objections" && (
          <div className="fade-in flex flex-col gap-4">
            <p className="text-sm uppercase tracking-widest font-semibold" style={{ color: "oklch(0.5 0.01 250)", fontFamily: "'Space Grotesk', sans-serif" }}>
              Tap the objection you're facing
            </p>

            {/* Objection Buttons */}
            <div className="flex flex-col gap-3">
              {OBJECTIONS.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setActiveObjId(activeObjId === obj.id ? null : obj.id)}
                  className={`${obj.btnClass} ${activeObjId === obj.id ? "active" : ""} w-full rounded-xl px-5 py-4 text-left font-semibold text-base`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {obj.label}
                </button>
              ))}
            </div>

            {/* Active Objection Panel */}
            {activeObj && (
              <div className="fade-in flex flex-col gap-4 mt-2">
                {/* Video + Subtitle */}
                <div className="flex flex-col items-center gap-0">
                  <div style={{ width: "100%", maxWidth: "240px" }}>
                    <VideoPlayer clips={activeObj.clips} subtitles={activeObj.id === 1 ? OBJ1_SUBTITLES : activeObj.id === 2 ? OBJ2_SUBTITLES : OBJ3_SUBTITLES} />
                  </div>
                </div>

                {/* Script */}
                <div className="flex flex-col gap-2">
                  <p
                    className="text-sm uppercase tracking-widest font-semibold"
                    style={{ color: "oklch(0.5 0.01 250)", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Full Script
                  </p>
                  <ScriptSection items={activeObj.script} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CALL DIAGNOSTICS TAB ── */}
        {activeTab === "diagnostics" && (
          <div className="fade-in flex flex-col gap-4">
            {activeDiagnostic === null ? (
              <>
                <p className="text-sm uppercase tracking-widest font-semibold" style={{ color: "oklch(0.5 0.01 250)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Quick Reference
                </p>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: "oklch(0.28 0.04 250)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "oklch(0.2 0.04 250)" }}>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "oklch(0.7 0.15 250)", fontFamily: "'Space Grotesk', sans-serif" }}>Symptom</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "oklch(0.7 0.15 250)", fontFamily: "'Space Grotesk', sans-serif" }}>Root Cause</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "oklch(0.7 0.15 250)", fontFamily: "'Space Grotesk', sans-serif" }}>Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Can't get into the conversation", "Tone / energy / pacing", "Voice + opening lines"],
                        ["Customer hangs up early", "Opening not creating curiosity", "Change the approach"],
                        ["She agrees but won't buy", "Weak urgency / close", "Closing techniques"],
                        ["She asks too many questions", "Trust not built", "Social proof"],
                        ['She says "send me an email"', "Wants to exit politely", "Re-engage technique"],
                        ["I feel like I'm selling", "Pitch mode, not consultation", "Talk like a concierge"],
                        ["She needs to think about it", "Unspoken objection", "Uncover & reassure"],
                        ["She says it's too expensive", "Value not clear yet", "Anchor & break down"],
                      ].map(([symptom, cause, fix], i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "oklch(0.16 0.025 250)" : "oklch(0.18 0.03 250)", borderTop: "1px solid oklch(0.22 0.03 250)" }}>
                          <td className="px-3 py-2 text-white/80">{symptom}</td>
                          <td className="px-3 py-2" style={{ color: "oklch(0.75 0.12 60)" }}>{cause}</td>
                          <td className="px-3 py-2" style={{ color: "oklch(0.75 0.18 145)" }}>{fix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm uppercase tracking-widest font-semibold mt-2" style={{ color: "oklch(0.5 0.01 250)", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Tap for full diagnostic
                </p>
                <div className="flex flex-col gap-3">
                  {DIAGNOSTICS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveDiagnostic(i)}
                      className="w-full rounded-xl px-4 py-3 text-left flex items-center justify-between"
                      style={{ background: "oklch(0.18 0.04 250)", border: "1px solid oklch(0.28 0.04 250)" }}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-lg">{d.icon}</span>
                        <span className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{d.symptomShort}</span>
                      </span>
                      <span style={{ color: "oklch(0.55 0.01 250)" }}>›</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveDiagnostic(null)}
                  className="text-sm font-semibold flex items-center gap-1"
                  style={{ color: "oklch(0.65 0.18 250)", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  ← Back to Diagnostics
                </button>
                {(() => {
                  const d = DIAGNOSTICS[activeDiagnostic];
                  return (
                    <div className="flex flex-col gap-3">
                      <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{d.symptomShort}</h2>
                      <div className="rounded-xl p-4" style={{ background: "oklch(0.18 0.06 15)", border: "1px solid oklch(0.35 0.1 15)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "oklch(0.65 0.18 15)" }}>Symptom</p>
                        <p className="text-sm text-white/80 leading-relaxed">{d.symptom}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "oklch(0.18 0.06 60)", border: "1px solid oklch(0.35 0.1 60)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "oklch(0.75 0.15 60)" }}>Root Cause</p>
                        <p className="text-sm text-white/80 leading-relaxed">{d.rootCause}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "oklch(0.16 0.06 145)", border: "1px solid oklch(0.35 0.12 145)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "oklch(0.75 0.2 145)" }}>Fix It Now</p>
                        <ul className="flex flex-col gap-2">
                          {d.fixes.map((fix, fi) => (
                            <li key={fi} className="text-sm leading-relaxed flex gap-2" style={{ color: "oklch(0.85 0.15 145)" }}>
                              <span>→</span><span>{fix}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "oklch(0.16 0.06 250)", border: "1px solid oklch(0.45 0.18 250)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "oklch(0.7 0.18 250)" }}>💬 Power Line</p>
                        <p className="text-sm font-semibold leading-relaxed italic" style={{ color: "oklch(0.92 0.05 250)" }}>"{d.powerLine}"</p>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {activeTab === "livescript" && (
          <div className="fade-in flex flex-col gap-3">
            <p className="text-sm uppercase tracking-widest font-semibold" style={{ color: "oklch(0.5 0.01 250)", fontFamily: "'Space Grotesk', sans-serif" }}>
              Benefit-Driven Sales Script — Full Call Flow
            </p>
            <LiveCallScript />
          </div>
        )}
      </main>
    </div>
  );
}
