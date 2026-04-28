/**
 * PUBLIC SHARED CALL ANALYSIS VIEW
 * Standalone page — no auth required, no sidebar, no nav.
 * Renders the full analysis: scores, summary, strengths, improvements,
 * recommendations, key moments, transcript, audio player, talk ratio, indicators.
 */
import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Mic,
  Star,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── TYPES (same as CallCoach) ───────────────────────────────────────────────
interface CallAnalysisReport {
  overallScore: number;
  summary: string;
  stagesDetected: {
    stage: string;
    detected: boolean;
    quality: "strong" | "weak" | "missing";
    note: string;
  }[];
  strengths: string[];
  improvements: string[];
  topRecommendations: string[];
  keyMoments: {
    moment: string;
    type: "positive" | "negative" | "critical";
    coaching: string;
  }[];
  scriptComplianceScore: number;
  toneScore: number;
  closingAttempted: boolean;
  magicWandUsed: boolean;
  subscriptionDisclosed?: boolean;
  subscriptionMisrepresented?: boolean;
  tcRead?: boolean;
  complianceScore?: number;
  complianceIssues?: string[];
  saved?: boolean | null;
  upsellAttempted?: boolean | null;
  upsellSucceeded?: boolean | null;
  cancelReason?: string | null;
  customerName?: string | null;
  // Retention Manager Review (only for retention calls > 5 min)
  customerDifficultyScore?: number | null;
  customerDifficultyDescription?: string | null;
  callScore?: number | null;
  callScoreDescription?: string | null;
  customerProfile?: string | null;
  managerReview?: {
    title: string;
    timestamp: string;
    quote: string;
    feedback: string;
    suggestion: string;
  }[] | null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number) {
  if (score >= 75) return "bg-emerald-50 border-emerald-500/40";
  if (score >= 50) return "bg-amber-50 border-amber-500/40";
  return "bg-red-50 border-red-500/40";
}

function qualityBadge(quality: "strong" | "weak" | "missing") {
  if (quality === "strong") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Strong</Badge>;
  if (quality === "weak") return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Weak</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Missing</Badge>;
}

function CallTypeBadge({ callType }: { callType?: string | null }) {
  if (!callType) return null;
  const map: Record<string, { label: string; cls: string }> = {
    cold_call:           { label: "Cold Call",              cls: "bg-blue-50 text-blue-700 border-blue-200" },
    follow_up:           { label: "Follow-up",              cls: "bg-sky-50 text-sky-700 border-sky-200" },
    live_sub:            { label: "Live Sub",               cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pre_cycle_cancelled: { label: "Pre-Cycle Cancelled",    cls: "bg-red-50 text-red-700 border-red-200" },
    pre_cycle_decline:   { label: "Pre-Cycle Decline",      cls: "bg-orange-50 text-orange-700 border-orange-200" },
    end_of_instalment:   { label: "End of Instalment",      cls: "bg-purple-50 text-purple-700 border-purple-200" },
    from_cat:            { label: "From Cat",               cls: "bg-pink-50 text-pink-700 border-pink-200" },
    other:               { label: "Other",                  cls: "bg-gray-50 text-gray-700 border-gray-200" },
    opening:             { label: "Opening",                cls: "bg-blue-50 text-blue-700 border-blue-200" },
    retention_win_back:  { label: "Win Back",               cls: "bg-purple-50 text-purple-700 border-purple-200" },
    instalment_decline:  { label: "Instalment Decline",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const info = map[callType];
  if (!info) return null;
  return <Badge className={`text-xs ${info.cls}`}>{info.label}</Badge>;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function SharedCallView() {
  const [, params] = useRoute("/shared/call/:shareToken");
  const shareToken = params?.shareToken ?? "";

  const { data: analysis, isLoading, error } = trpc.callCoach.getSharedAnalysis.useQuery(
    { shareToken },
    { enabled: !!shareToken, retry: false }
  );

  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto" />
          <p className="text-gray-600 text-sm">Loading analysis...</p>
        </div>
      </div>
    );
  }

  // ── Not found / error ──
  if (!analysis || error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-800">Analysis Not Found</h1>
          <p className="text-gray-600 text-sm">This shared link may have expired or the analysis is no longer available.</p>
        </div>
      </div>
    );
  }

  // ── Parse report ──
  const report: CallAnalysisReport | null = analysis.analysisJson
    ? (() => { try { return JSON.parse(analysis.analysisJson); } catch { return null; } })()
    : null;

  // Talk ratio
  const repPct = analysis.repSpeechPct != null ? Math.round(analysis.repSpeechPct) : null;
  const custPct = repPct != null ? 100 - repPct : null;
  let ratioColor = "text-emerald-600";
  let ratioLabel = "Good ratio";
  if (repPct != null && repPct > 65) { ratioColor = "text-red-600"; ratioLabel = "Talking too much"; }
  else if (repPct != null && repPct < 30) { ratioColor = "text-amber-600"; ratioLabel = "Too passive"; }

  // Deal status
  const dealStatusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    closed:     { label: "Closed Deal",  color: "text-emerald-600", bg: "bg-emerald-500/15", border: "border-emerald-500/40" },
    follow_up:  { label: "Follow-up",    color: "text-amber-600",   bg: "bg-amber-500/15",   border: "border-amber-500/40" },
    not_closed: { label: "Not Closed",   color: "text-red-600",     bg: "bg-red-500/15",     border: "border-red-500/40" },
  };
  const dealStatus = analysis.closeStatus ? dealStatusMap[analysis.closeStatus] : null;

  // Retention long call detection
  const RETENTION_TYPES_SET = new Set(["pre_cycle_cancelled", "pre_cycle_decline", "live_sub", "from_cat", "other", "retention_win_back"]);
  const isRetentionLongCall = report != null && RETENTION_TYPES_SET.has(analysis.callType ?? "") && (analysis.durationSeconds ?? 0) > 300;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Branded Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: "oklch(0.50 0.20 265)" }}>
              L
            </div>
            <span className="text-lg font-semibold text-gray-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              LAVIE LABS
            </span>
          </div>
          <span className="text-gray-400 text-sm hidden sm:inline">|</span>
          <span className="text-gray-500 text-sm hidden sm:inline">AI Call Coach Report</span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── CONDITIONAL LAYOUT ── */}
        {isRetentionLongCall && report ? (
          <div className="space-y-5">
            {/* ── 1. HEADER: Customer name + call type badge + agent info ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-gray-800">
                  {report.customerName ?? analysis.customerName ?? "Customer"}
                </h2>
                <CallTypeBadge callType={analysis.callType} />
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-2 text-sm text-gray-600">
                {analysis.repName && <span className="font-medium text-gray-800">{analysis.repName}</span>}
                {analysis.callDate && <span>{new Date(analysis.callDate).toLocaleDateString()}</span>}
                {analysis.durationSeconds && (
                  <span>{Math.floor((analysis.durationSeconds ?? 0) / 60)}m {Math.round((analysis.durationSeconds ?? 0) % 60)}s</span>
                )}
                {dealStatus && (
                  <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${dealStatus.bg} ${dealStatus.border} ${dealStatus.color}`}>
                    {dealStatus.label}
                  </span>
                )}
              </div>
            </div>

            {/* ── 1b. DEAL RESULT / DEAL TYPE / LEAD TYPE BANNER ── */}
            {(() => {
              const isClosed = report.saved === true || report.upsellSucceeded === true;
              const ct = analysis.callType ?? "";
              let dealType = "No Deal";
              if (report.saved === true && report.upsellSucceeded === true) dealType = "Saved + Upsell";
              else if (report.saved === true && ct === "instalment_decline") dealType = "Card Recovered";
              else if (report.saved === true) dealType = "Saved Sub";
              else if (report.upsellSucceeded === true) dealType = "Upsell Only";
              const callTypeMap: Record<string, string> = {
                live_sub: "Live Sub", pre_cycle_cancelled: "Pre-Cycle Cancelled",
                pre_cycle_decline: "Pre-Cycle Decline", end_of_instalment: "End of Instalment",
                from_cat: "From Cat", other: "Other", retention_cancel_trial: "Cancel Trial",
                retention_win_back: "Win Back", instalment_decline: "Instalment Decline",
              };
              const leadLabel = callTypeMap[ct] ?? ct;
              return (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="grid grid-cols-3">
                    <div className={`p-4 text-center ${isClosed ? "bg-emerald-100" : "bg-red-100"}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Deal Result</p>
                      <p className={`text-lg font-bold ${isClosed ? "text-emerald-800" : "text-red-800"}`}>
                        {isClosed ? "CLOSED" : "NOT CLOSED"}
                      </p>
                    </div>
                    <div className="p-4 text-center bg-gray-50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Deal Type</p>
                      <p className="text-lg font-bold text-gray-800">{dealType}</p>
                    </div>
                    <div className="p-4 text-center bg-gray-50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Lead Type</p>
                      <p className="text-lg font-bold text-gray-800">{leadLabel}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── 2. CALL SCORE ── */}
            {report.callScore != null && (
              <Card className="bg-sky-50 border-sky-200 rounded-xl shadow-sm">
                <CardContent className="p-8 text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-7xl font-bold text-blue-600">{report.callScore.toFixed(1)}</span>
                    <span className="text-2xl font-semibold text-blue-400">/10</span>
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-800 mt-3">CALL SCORE</p>
                  {report.callScoreDescription && (
                    <p className="text-sm text-gray-600 mt-1">{report.callScoreDescription}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── 3. CUSTOMER DIFFICULTY ── */}
            {report.customerDifficultyScore != null && (
              <Card className="bg-gray-50 border-gray-200 rounded-xl shadow-sm">
                <CardContent className="p-6 text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-gray-800">{report.customerDifficultyScore}</span>
                    <span className="text-xl font-semibold text-gray-400">/10</span>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-800 mt-2">CUSTOMER DIFFICULTY</p>
                  {report.customerDifficultyDescription && (
                    <p className="text-sm text-gray-600 mt-1">{report.customerDifficultyDescription}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── 4. CUSTOMER PROFILE ── */}
            {report.customerProfile && (
              <Card className="bg-white border-gray-200 rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-800 flex items-center gap-2">
                    <span className="text-lg">{"\uD83D\uDC64"}</span> Customer Profile
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 leading-relaxed">{report.customerProfile}</p>
                </CardContent>
              </Card>
            )}

            {/* ── 5. MANAGER REVIEW ── */}
            {report.managerReview && report.managerReview.length > 0 && (
              <Card className="bg-white border-gray-200 rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-800 flex items-center gap-2">
                    <span className="text-lg">{"\uD83D\uDCCB"}</span> Manager Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.managerReview.map((item, i) => (
                    <div key={i} className="border-l-4 border-blue-400 pl-4 py-2 space-y-2">
                      <p className="text-sm font-bold text-gray-800">{item.title}</p>
                      <span className="inline-block text-xs font-semibold text-gray-800 bg-gray-100 rounded px-2 py-0.5">
                        ⏱ At {item.timestamp}
                      </span>
                      <p className="text-sm text-gray-600"><span className="font-bold text-gray-800">Why it was suboptimal:</span> {item.feedback}</p>
                      <p className="text-sm text-gray-800 italic"><span className="font-bold not-italic">What you said:</span> &ldquo;{item.quote}&rdquo;</p>
                      <p className="text-sm text-emerald-700 font-medium"><span className="font-bold">What you should have done:</span> {item.suggestion}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── 6. CALL RECORDING ── */}
            {analysis.audioFileUrl && (
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Call Recording</p>
                <audio
                  ref={audioRef}
                  controls
                  src={analysis.audioFileUrl}
                  className="w-full h-10"
                  style={{ accentColor: "#0d9488" }}
                  onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0)}
                />
                {analysis.wordTimestamps && (
                  <p className="text-[10px] text-teal-600 mt-1">Click any word in the transcript below to jump to that moment</p>
                )}
              </div>
            )}

            {/* ── 7. KEY MOMENTS ── */}
            {report.keyMoments?.length > 0 && (
              <Card className="bg-white border-gray-200 rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-800 uppercase tracking-wider">Key Moments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.keyMoments.map((km, i) => (
                    <div key={i} className={`rounded-lg p-3 border ${
                      km.type === "positive" ? "bg-emerald-50 border-emerald-500/30" :
                      km.type === "critical" ? "bg-red-50 border-red-500/30" :
                      "bg-amber-50 border-amber-500/30"
                    }`}>
                      <p className="text-gray-800 text-sm italic">&ldquo;{km.moment}&rdquo;</p>
                      <p className="text-gray-600 text-xs mt-2">{km.coaching}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── 8. RETENTION INDICATORS ── */}
            <div className="flex flex-wrap gap-2">
              <Badge className={report.saved ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                {report.saved ? "\u2713 Saved" : "\u2717 Not saved"}
              </Badge>
              <Badge className={report.upsellAttempted ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                {report.upsellAttempted ? "\u2713 Upsell attempted" : "\u2717 Upsell not attempted"}
              </Badge>
              <Badge className={report.upsellSucceeded ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                {report.upsellSucceeded ? "\u2713 Upsell succeeded" : "\u2717 Upsell not succeeded"}
              </Badge>
            </div>

            {/* ── 9. FULL TRANSCRIPT ── */}
            {analysis.transcript && (() => {
              type WordTs = { word: string; start: number; end: number; speaker: "Agent" | "Customer" };
              const wordTs: WordTs[] = analysis.wordTimestamps ? (() => { try { return JSON.parse(analysis.wordTimestamps); } catch { return []; } })() : [];
              const hasWordTs = wordTs.length > 0;
              const seekTo = (time: number) => {
                if (audioRef.current) { audioRef.current.currentTime = time; audioRef.current.play(); }
              };
              return (
                <Card className="bg-white border-gray-200 rounded-xl">
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowTranscript(!showTranscript)}>
                    <CardTitle className="text-sm text-gray-800 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Full Transcript</span>
                        {hasWordTs && (
                          <span className="text-[10px] font-normal text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            Interactive
                          </span>
                        )}
                      </div>
                      {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </CardTitle>
                  </CardHeader>
                  {showTranscript && (
                    <CardContent>
                      {hasWordTs ? (
                        <div className="max-h-[500px] overflow-y-auto pr-1 space-y-1">
                          {(() => {
                            type Block = { speaker: "Agent" | "Customer"; words: WordTs[] };
                            const blocks: Block[] = [];
                            for (const w of wordTs) {
                              if (blocks.length === 0 || blocks[blocks.length - 1].speaker !== w.speaker) {
                                blocks.push({ speaker: w.speaker, words: [w] });
                              } else {
                                blocks[blocks.length - 1].words.push(w);
                              }
                            }
                            return blocks.map((block, bi) => (
                              <div key={bi} className="flex gap-2">
                                <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide mt-0.5 w-14 text-right ${
                                  block.speaker === "Agent" ? "text-blue-600" : "text-emerald-600"
                                }`}>
                                  {block.speaker === "Agent" ? "Agent" : "Cust."}
                                </span>
                                <p className="text-sm leading-relaxed flex-1 flex flex-wrap gap-x-0.5">
                                  {block.words.map((w, wi) => {
                                    const isActive = audioCurrentTime >= w.start && audioCurrentTime < w.end;
                                    return (
                                      <span
                                        key={wi}
                                        onClick={() => seekTo(w.start)}
                                        title={`${Math.floor(w.start / 60)}:${String(Math.floor(w.start % 60)).padStart(2, '0')}`}
                                        className={`cursor-pointer rounded px-0.5 transition-colors ${
                                          isActive
                                            ? block.speaker === "Agent"
                                              ? "bg-blue-200 text-blue-900 font-semibold"
                                              : "bg-emerald-200 text-emerald-900 font-semibold"
                                            : block.speaker === "Agent"
                                              ? "text-blue-700 hover:bg-blue-100"
                                              : "text-emerald-700 hover:bg-emerald-100"
                                        }`}
                                      >
                                        {w.word}
                                      </span>
                                    );
                                  })}
                                </p>
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        <div className="max-h-[500px] overflow-y-auto">
                          <p className="text-base leading-relaxed text-gray-800 whitespace-pre-wrap">
                            {analysis.transcript}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })()}

            {/* ── 10. OLD SCORES (muted, smaller) ── */}
            <div className="grid grid-cols-3 gap-3 opacity-60">
              {[
                { label: "Overall Score", value: report.overallScore },
                { label: "Script Compliance", value: report.scriptComplianceScore },
                { label: "Tone & Confidence", value: report.toneScore },
              ].map(({ label, value }) => (
                <Card key={label} className={`bg-gray-50 border ${scoreBg(value)} rounded-lg`}>
                  <CardContent className="p-3 text-center">
                    <div className={`text-xl font-bold ${scoreColor(value)}`}>{Math.round(value)}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <>
        {/* Call Info Header */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col sm:flex-row gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200/60">
            {/* Left: call info */}
            <div className="flex-1 px-5 py-4 space-y-1.5">
              <h1 className="text-lg font-semibold text-gray-800 leading-tight">{analysis.fileName ?? "Call Recording"}</h1>
              {analysis.customerName && (
                <p className="text-sm text-teal-700 font-medium">Customer: {analysis.customerName}</p>
              )}
              {(analysis.repName || analysis.callDate) && (
                <p className="text-sm text-gray-700">
                  {analysis.repName && <span className="font-medium text-gray-800">{analysis.repName}</span>}
                  {analysis.callDate && <span>{analysis.repName ? " \u00b7 " : ""}{new Date(analysis.callDate).toLocaleDateString()}</span>}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {analysis.callType && <CallTypeBadge callType={analysis.callType} />}
                {analysis.durationSeconds && (
                  <span className="text-sm text-gray-700">
                    {Math.floor((analysis.durationSeconds ?? 0) / 60)}m {Math.round((analysis.durationSeconds ?? 0) % 60)}s
                  </span>
                )}
              </div>
            </div>

            {/* Right: Talk Ratio + Deal Status */}
            <div className="flex flex-row sm:flex-col items-center justify-center gap-6 px-8 py-6 sm:min-w-[200px] bg-gray-50">
              {repPct != null && (
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">Talk Ratio</p>
                  <div className="relative w-24 h-24">
                    <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                      <circle cx="48" cy="48" r="38" fill="none" stroke="#1e293b" strokeWidth="9" />
                      <circle
                        cx="48" cy="48" r="38" fill="none"
                        stroke={repPct > 65 ? "#ef4444" : repPct < 30 ? "#f59e0b" : "#10b981"}
                        strokeWidth="9"
                        strokeDasharray={`${(repPct / 100) * 239} 239`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-2xl font-bold leading-none ${ratioColor}`}>{repPct}%</span>
                      <span className="text-[10px] text-gray-600 mt-0.5">rep</span>
                    </div>
                  </div>
                  <p className={`text-xs font-semibold mt-1 ${ratioColor}`}>{ratioLabel}</p>
                  <p className="text-[11px] text-gray-700">Customer: {custPct}%</p>
                </div>
              )}
              {repPct != null && dealStatus && (
                <div className="hidden sm:block w-full h-px bg-gray-200 my-1" />
              )}
              {dealStatus && (
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">Deal Status</p>
                  <div className={`px-5 py-2.5 rounded-lg border ${dealStatus.bg} ${dealStatus.border} text-center min-w-[120px]`}>
                    <p className={`text-sm font-bold ${dealStatus.color}`}>{dealStatus.label}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {analysis.audioFileUrl && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Call Recording</p>
            <audio
              ref={audioRef}
              controls
              src={analysis.audioFileUrl}
              className="w-full h-10"
              style={{ accentColor: "#0d9488" }}
              onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0)}
            />
            {analysis.wordTimestamps && (
              <p className="text-[10px] text-teal-600 mt-1">Click any word in the transcript below to jump to that moment</p>
            )}
          </div>
        )}

        {/* ── Report Content ── */}
        {report && (
          <div className="space-y-5">
            {/* Score cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Overall Score", value: report.overallScore, icon: <Star className="w-5 h-5" /> },
                { label: "Script Compliance", value: report.scriptComplianceScore, icon: <CheckCircle2 className="w-5 h-5" /> },
                { label: "Tone & Confidence", value: report.toneScore, icon: <Mic className="w-5 h-5" /> },
                { label: "Rep Speech %", value: analysis.repSpeechPct ?? 0, icon: <BarChart3 className="w-5 h-5" /> },
                { label: "Compliance", value: report.complianceScore ?? null, icon: <AlertTriangle className="w-5 h-5" /> },
              ].filter(c => c.value !== null).map(({ label, value, icon }) => (
                <Card key={label} className={`bg-white border ${scoreBg(value ?? 0)} ${label === 'Compliance' && report.subscriptionMisrepresented ? 'ring-2 ring-red-500' : ''}`}>
                  <CardContent className="p-4 text-center">
                    <div className={`flex justify-center mb-2 ${scoreColor(value ?? 0)}`}>{icon}</div>
                    <div className={`text-3xl font-bold ${scoreColor(value ?? 0)}`}>{Math.round(value ?? 0)}</div>
                    <div className="text-xs text-gray-700 mt-1">{label}</div>
                    {label === 'Compliance' && report.subscriptionMisrepresented && (
                      <div className="text-xs text-red-600 font-bold mt-1">Critical</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Speech Time Breakdown */}
            {analysis.repSpeechPct != null && (() => {
              const agentPct = Math.round(analysis.repSpeechPct as number);
              const cPct = 100 - agentPct;
              const agentColor = agentPct > 65 ? "bg-red-500" : agentPct < 30 ? "bg-amber-500" : "bg-emerald-500";
              const agentTextColor = agentPct > 65 ? "text-red-700" : agentPct < 30 ? "text-amber-700" : "text-emerald-700";
              const lbl = agentPct > 65 ? "Rep is talking too much" : agentPct < 30 ? "Rep is too passive" : "Good talk ratio";
              return (
                <Card className="bg-white border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-3">Speech Time Breakdown</p>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-semibold text-gray-800 w-16 text-right">Agent</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className={`h-full rounded-full transition-all ${agentColor}`} style={{ width: `${agentPct}%` }} />
                      </div>
                      <span className={`text-sm font-bold w-10 ${agentTextColor}`}>{agentPct}%</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-semibold text-gray-800 w-16 text-right">Customer</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${cPct}%` }} />
                      </div>
                      <span className="text-sm font-bold w-10 text-blue-700">{cPct}%</span>
                    </div>
                    <p className={`text-xs font-medium ${agentTextColor}`}>{lbl}</p>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Compliance Issues Alert */}
            {report.complianceIssues && report.complianceIssues.length > 0 && (
              <Card className="bg-red-50 border-red-400 border-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Compliance Issues Detected
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.complianceIssues.map((issue, i) => (
                    <div key={i} className="flex gap-2 text-sm text-red-800 font-medium">
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span>{issue}</span>
                    </div>
                  ))}
                  {report.subscriptionMisrepresented && (
                    <div className="mt-3 p-3 bg-red-100 rounded-lg border border-red-300">
                      <p className="text-red-800 text-sm font-bold">CRITICAL VIOLATION: The rep denied or misrepresented the subscription nature of the product when directly asked by the customer.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Badges — call-type-aware indicators */}
            <div className="flex flex-wrap gap-2">
              {(() => {
                const ct = analysis.callType ?? "cold_call";
                const OPENING_TYPES = new Set(["cold_call", "follow_up", "opening"]);
                const RETENTION_TYPES = new Set(["pre_cycle_cancelled", "pre_cycle_decline", "live_sub", "from_cat", "other", "retention_win_back"]);

                if (OPENING_TYPES.has(ct)) {
                  return (
                    <>
                      <Badge className={report.closingAttempted ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.closingAttempted ? "\u2713 Close attempted" : "\u2717 No close attempt"}
                      </Badge>
                      <Badge className={report.magicWandUsed ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.magicWandUsed ? "\u2713 Magic Wand used" : "\u2717 Magic Wand missed"}
                      </Badge>
                      {report.subscriptionDisclosed != null && (
                        <Badge className={report.subscriptionDisclosed ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                          {report.subscriptionDisclosed ? "\u2713 Subscription disclosed" : "\u2717 Subscription not disclosed"}
                        </Badge>
                      )}
                    </>
                  );
                }

                if (RETENTION_TYPES.has(ct)) {
                  return (
                    <>
                      <Badge className={report.saved ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.saved ? "\u2713 Saved" : "\u2717 Not saved"}
                      </Badge>
                      <Badge className={report.upsellAttempted ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.upsellAttempted ? "\u2713 Upsell attempted" : "\u2717 Upsell not attempted"}
                      </Badge>
                      <Badge className={report.upsellSucceeded ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.upsellSucceeded ? "\u2713 Upsell succeeded" : "\u2717 Upsell not succeeded"}
                      </Badge>
                    </>
                  );
                }

                if (ct === "end_of_instalment") {
                  return (
                    <>
                      <Badge className={report.upsellAttempted ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.upsellAttempted ? "\u2713 Upsell attempted" : "\u2717 Upsell not attempted"}
                      </Badge>
                      <Badge className={report.upsellSucceeded ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                        {report.upsellSucceeded ? "\u2713 Upsell succeeded" : "\u2717 Upsell not succeeded"}
                      </Badge>
                    </>
                  );
                }

                if (ct === "instalment_decline") {
                  return (
                    <Badge className={report.saved ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                      {report.saved ? "\u2713 Card recovered" : "\u2717 Card not recovered"}
                    </Badge>
                  );
                }

                return (
                  <>
                    <Badge className={report.closingAttempted ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                      {report.closingAttempted ? "\u2713 Close attempted" : "\u2717 No close attempt"}
                    </Badge>
                    <Badge className={report.magicWandUsed ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-red-50 text-slate-800 border-red-200"}>
                      {report.magicWandUsed ? "\u2713 Magic Wand used" : "\u2717 Magic Wand missed"}
                    </Badge>
                  </>
                );
              })()}
              {/* Compliance badges — only for Opening calls */}
              {(() => {
                const ct = analysis.callType ?? "cold_call";
                const OPENING_TYPES = new Set(["cold_call", "follow_up", "opening"]);
                if (!OPENING_TYPES.has(ct)) return null;
                return (
                  <>
                    {report.tcRead != null && (
                      <Badge className={report.tcRead ? "bg-emerald-50 text-slate-800 border-emerald-200" : "bg-amber-50 text-slate-800 border-amber-200"}>
                        {report.tcRead ? "\u2713 T&C read" : "\u2717 T&C not read"}
                      </Badge>
                    )}
                    {report.subscriptionMisrepresented && (
                      <Badge className="bg-red-100 text-red-800 border-red-400 font-bold">
                        CRITICAL: Subscription denied
                      </Badge>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Summary */}
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 uppercase tracking-wider">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-800 leading-relaxed">{report.summary}</p>
              </CardContent>
            </Card>

            {/* Top 3 Recommendations */}
            <Card className="bg-white border-teal-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-teal-700 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Top 3 Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.topRecommendations.map((rec, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <p className="text-gray-800 text-sm leading-relaxed">{rec}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Script Stages */}
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 uppercase tracking-wider">Script Stage Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.stagesDetected.map((stage) => (
                  <div key={stage.stage} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{qualityBadge(stage.quality)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-sm font-medium">{stage.stage}</p>
                      <p className="text-gray-700 text-xs mt-0.5">{stage.note}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white border-emerald-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-emerald-700 text-sm">What Worked Well</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-white border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-700 text-sm">Areas to Improve</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.improvements.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Key Moments */}
            {report.keyMoments?.length > 0 && (
              <Card className="bg-white border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-700 uppercase tracking-wider">Key Moments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.keyMoments.map((km, i) => (
                    <div key={i} className={`rounded-lg p-3 border ${
                      km.type === "positive" ? "bg-emerald-50 border-emerald-500/30" :
                      km.type === "critical" ? "bg-red-50 border-red-500/30" :
                      "bg-amber-50 border-amber-500/30"
                    }`}>
                      <p className="text-gray-800 text-sm italic">&ldquo;{km.moment}&rdquo;</p>
                      <p className="text-gray-700 text-xs mt-2">{km.coaching}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            {analysis.transcript && (() => {
              type WordTs = { word: string; start: number; end: number; speaker: "Agent" | "Customer" };
              const wordTs: WordTs[] = analysis.wordTimestamps ? (() => { try { return JSON.parse(analysis.wordTimestamps); } catch { return []; } })() : [];
              const hasWordTs = wordTs.length > 0;

              const seekTo = (time: number) => {
                if (audioRef.current) {
                  audioRef.current.currentTime = time;
                  audioRef.current.play();
                }
              };

              return (
                <Card className="bg-white border-gray-200">
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowTranscript(!showTranscript)}>
                    <CardTitle className="text-sm text-gray-700 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Full Transcript</span>
                        {hasWordTs && (
                          <span className="text-[10px] font-normal text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            Interactive
                          </span>
                        )}
                      </div>
                      {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </CardTitle>
                  </CardHeader>
                  {showTranscript && (
                    <CardContent>
                      {hasWordTs ? (
                        <div className="max-h-[500px] overflow-y-auto pr-1 space-y-1">
                          {(() => {
                            type Block = { speaker: "Agent" | "Customer"; words: WordTs[] };
                            const blocks: Block[] = [];
                            for (const w of wordTs) {
                              if (blocks.length === 0 || blocks[blocks.length - 1].speaker !== w.speaker) {
                                blocks.push({ speaker: w.speaker, words: [w] });
                              } else {
                                blocks[blocks.length - 1].words.push(w);
                              }
                            }
                            return blocks.map((block, bi) => (
                              <div key={bi} className="flex gap-2">
                                <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide mt-0.5 w-14 text-right ${
                                  block.speaker === "Agent" ? "text-blue-600" : "text-emerald-600"
                                }`}>
                                  {block.speaker === "Agent" ? "Agent" : "Cust."}
                                </span>
                                <p className="text-sm leading-relaxed flex-1 flex flex-wrap gap-x-0.5">
                                  {block.words.map((w, wi) => {
                                    const isActive = audioCurrentTime >= w.start && audioCurrentTime < w.end;
                                    return (
                                      <span
                                        key={wi}
                                        onClick={() => seekTo(w.start)}
                                        title={`${Math.floor(w.start / 60)}:${String(Math.floor(w.start % 60)).padStart(2, '0')}`}
                                        className={`cursor-pointer rounded px-0.5 transition-colors ${
                                          isActive
                                            ? block.speaker === "Agent"
                                              ? "bg-blue-200 text-blue-900 font-semibold"
                                              : "bg-emerald-200 text-emerald-900 font-semibold"
                                            : block.speaker === "Agent"
                                              ? "text-blue-700 hover:bg-blue-100"
                                              : "text-emerald-700 hover:bg-emerald-100"
                                        }`}
                                      >
                                        {w.word}
                                      </span>
                                    );
                                  })}
                                </p>
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        (() => {
                          const lines = analysis.transcript!.split('\n').filter((l: string) => l.trim());
                          const hasSpeakerLabels = lines.some((l: string) => /^(Agent|Customer)\s*:/i.test(l));
                          if (hasSpeakerLabels) {
                            return (
                              <div className="max-h-[500px] overflow-y-auto pr-1 space-y-0.5">
                                {lines.map((line: string, idx: number) => {
                                  const agentMatch = line.match(/^(Agent|Rep|Sales|Caller|Advisor|Staff|Lavie|Team)\s*:/i);
                                  const customerMatch = line.match(/^(Customer|Client|Prospect|Lead|Person|User)\s*:/i);
                                  const isAgent = agentMatch && !line.match(/^(Customer|Client|Prospect|Lead)\s*:/i);
                                  const isCustomer = !isAgent && customerMatch;
                                  const trimmed = line.trim();
                                  if (!trimmed) return null;
                                  if (isAgent) {
                                    return (
                                      <p key={idx} className="text-sm leading-relaxed text-blue-700">
                                        <strong className="font-semibold">{line.split(':')[0].trim()}:</strong>{" "}
                                        {line.split(':').slice(1).join(':').trim()}
                                      </p>
                                    );
                                  } else if (isCustomer) {
                                    return (
                                      <p key={idx} className="text-sm leading-relaxed text-emerald-700">
                                        <strong className="font-semibold">{line.split(':')[0].trim()}:</strong>{" "}
                                        {line.split(':').slice(1).join(':').trim()}
                                      </p>
                                    );
                                  } else {
                                    return (
                                      <p key={idx} className="text-xs text-gray-500 italic">{trimmed}</p>
                                    );
                                  }
                                })}
                              </div>
                            );
                          } else {
                            return (
                              <div className="max-h-[500px] overflow-y-auto">
                                <p className="text-base leading-relaxed text-gray-800 whitespace-pre-wrap">
                                  {analysis.transcript}
                                </p>
                              </div>
                            );
                          }
                        })()
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })()}
          </div>
        )}
        </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center">
          <p className="text-xs text-gray-500">
            Generated by <span className="font-medium text-gray-700">Lavie Labs AI Coach</span> &middot; {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
