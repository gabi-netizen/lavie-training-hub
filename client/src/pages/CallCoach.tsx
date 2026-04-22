import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Mic,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Users,
  ArrowLeft,
  Trophy,
  Medal,
  Flag,
  Sparkles,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CallTypePerformance from "@/components/CallTypePerformance";

// ─── TYPES ────────────────────────────────────────────────────────────────────
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
  // Compliance fields
  subscriptionDisclosed?: boolean;
  subscriptionMisrepresented?: boolean;
  tcRead?: boolean;
  complianceScore?: number;
  complianceIssues?: string[];
  // Retention
  saved?: boolean | null;
  upsellAttempted?: boolean | null;
  upsellSucceeded?: boolean | null;
  cancelReason?: string | null;
  customerName?: string | null;
}

// ─── CALL TYPE BADGE ─────────────────────────────────────────────────────────
function CallTypeBadge({ callType }: { callType?: string | null }) {
  if (!callType) return null;
  const map: Record<string, { label: string; cls: string }> = {
    // Opening team
    cold_call:           { label: "📞 Cold Call",           cls: "bg-blue-50 text-blue-700 border-blue-200" },
    follow_up:           { label: "🔄 Follow-up",           cls: "bg-sky-50 text-sky-700 border-sky-200" },
    // Retention team
    live_sub:            { label: "💚 Live Sub",            cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pre_cycle_cancelled: { label: "🚫 Pre-Cycle Cancelled", cls: "bg-red-50 text-red-700 border-red-200" },
    pre_cycle_decline:   { label: "💳 Pre-Cycle Decline",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
    end_of_instalment:   { label: "💎 End of Instalment",   cls: "bg-purple-50 text-purple-700 border-purple-200" },
    from_cat:            { label: "🔀 From Cat",            cls: "bg-pink-50 text-pink-700 border-pink-200" },
    other:               { label: "❓ Other",               cls: "bg-gray-50 text-gray-700 border-gray-200" },
    // Legacy
    opening:             { label: "📞 Opening",             cls: "bg-blue-50 text-blue-700 border-blue-200" },
    retention_cancel_trial: { label: "🔄 Cancel Trial",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
    retention_win_back:  { label: "💎 Win Back",            cls: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  const info = map[callType];
  if (!info) return null;
  return <Badge className={`text-xs ${info.cls}`}>{info.label}</Badge>;
}

// ─── TALK RATIO BADGE ─────────────────────────────────────────────────────────
// repPct = % of total speech time spoken by the rep (dominant speaker)
// Ideal range: 40–65%. >65% = rep talks too much. <30% = rep too passive.
function TalkRatioBadge({ repPct }: { repPct?: number | null }) {
  const [showTooltip, setShowTooltip] = useState(false);
  if (repPct == null) return null;
  const rep = Math.round(repPct);
  const cust = 100 - rep;
  let color = "text-emerald-600";
  let barColor = "bg-emerald-500";
  let label = "Good ratio";
  if (rep > 65) { color = "text-red-600"; barColor = "bg-red-500"; label = "Rep talks too much"; }
  else if (rep < 30) { color = "text-amber-600"; barColor = "bg-amber-500"; label = "Rep too passive"; }
  return (
    <span
      className="relative inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded px-2 py-0.5 bg-gray-50 cursor-pointer select-none"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => { e.stopPropagation(); setShowTooltip(v => !v); }}
    >
      <span className="text-gray-700 font-medium">Talk:</span>
      {/* mini bar */}
      <span className="relative inline-block w-14 h-2 rounded-full bg-gray-200 overflow-hidden">
        <span
          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
          style={{ width: `${rep}%` }}
        />
      </span>
      <span className={`font-semibold ${color}`}>{rep}%</span>
      <span className="text-gray-700">rep</span>

      {/* ── Tooltip popup with 3 zones ── */}
      {showTooltip && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          style={{ minWidth: "220px" }}
        >
          <span
            className="flex flex-col gap-1.5 rounded-xl p-3 shadow-2xl"
            style={{ background: "white", border: "1px solid oklch(0.85 0.03 265)" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-800 mb-0.5">Talk Ratio Guide</span>
            {/* Green zone */}
            <span className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded flex-shrink-0" style={{ background: "oklch(0.55 0.2 145)" }} />
              <span className="flex flex-col">
                <span className="text-[11px] font-bold" style={{ color: "oklch(0.40 0.20 145)" }}>40–65% rep speaking</span>
                <span className="text-[10px] text-gray-700 leading-snug">Ideal — you lead, she talks. Sale happens here.</span>
              </span>
            </span>
            {/* Amber zone */}
            <span className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded flex-shrink-0" style={{ background: "oklch(0.65 0.18 60)" }} />
              <span className="flex flex-col">
                <span className="text-[11px] font-bold" style={{ color: "oklch(0.8 0.18 60)" }}>Below 30% rep speaking</span>
                <span className="text-[10px] text-gray-700 leading-snug">Too passive — you're not driving the close.</span>
              </span>
            </span>
            {/* Red zone */}
            <span className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded flex-shrink-0" style={{ background: "oklch(0.55 0.22 15)" }} />
              <span className="flex flex-col">
                <span className="text-[11px] font-bold" style={{ color: "oklch(0.7 0.22 15)" }}>Above 65% rep speaking</span>
                <span className="text-[10px] text-gray-700 leading-snug">Too much — she feels talked at, not heard.</span>
              </span>
            </span>
            {/* Arrow pointer */}
            <span
              className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45"
              style={{ background: "white", borderRight: "1px solid oklch(0.35 0.08 250 / 60%)", borderBottom: "1px solid oklch(0.35 0.08 250 / 60%)" }}
            />
          </span>
        </span>
      )}
    </span>
  );
}

// ─── SCORE COLOUR ─────────────────────────────────────────────────────────────
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

// ─── 5-TIER REP STATUS ───────────────────────────────────────────────────────
function getRepStatus(score: number): { label: string; color: string; bg: string; border: string; emoji: string } {
  if (score >= 85) return { label: "Elite",       color: "text-teal-600",   bg: "bg-teal-50",   border: "border-teal-400/50",   emoji: "💎" };
  if (score >= 70) return { label: "Proficient",  color: "text-emerald-600",bg: "bg-emerald-50",border: "border-emerald-400/50",emoji: "🟢" };
  if (score >= 55) return { label: "On Track",    color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-400/50",  emoji: "🟡" };
  if (score >= 40) return { label: "Developing",  color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-400/50", emoji: "🟠" };
  return              { label: "Needs Work",  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-400/50",    emoji: "🔴" };
}

function RepStatusBadge({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const s = getRepStatus(score);
  const textSize = size === "md" ? "text-sm" : "text-xs";
  const px = size === "md" ? "px-3 py-1" : "px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${textSize} ${px} ${s.bg} ${s.border} ${s.color}`}>
      <span>{s.emoji}</span>
      <span>{s.label}</span>
    </span>
  );
}

function qualityBadge(quality: "strong" | "weak" | "missing") {
  if (quality === "strong") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Strong</Badge>;
  if (quality === "weak") return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Weak</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Missing</Badge>;
}

// ─── FLAG FEEDBACK MODAL ─────────────────────────────────────────────────────
function FlagFeedbackModal({
  analysisId,
  open,
  onClose,
}: {
  analysisId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [section, setSection] = useState<string>("overall");
  const [issue, setIssue] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitFeedback = trpc.callCoach.submitFeedback.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = () => {
    if (!issue.trim()) return;
    submitFeedback.mutate({
      analysisId,
      section: section as "overall" | "script_compliance" | "tone" | "talk_ratio" | "recommendations" | "transcript" | "other",
      issue: issue.trim(),
      comment: comment.trim() || undefined,
    });
  };

  const handleClose = () => {
    setSubmitted(false);
    setIssue("");
    setComment("");
    setSection("overall");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-600" />
            Flag Incorrect Analysis
          </DialogTitle>
        </DialogHeader>
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="text-gray-700 font-medium">Thank you for the feedback!</p>
            <p className="text-gray-700 text-sm">This helps us improve the AI over time.</p>
            <Button onClick={handleClose} className="mt-4 bg-teal-600 hover:bg-teal-500">Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Which section is incorrect?</label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-300">
                    <SelectItem value="overall">Overall Score</SelectItem>
                    <SelectItem value="script_compliance">Script Compliance</SelectItem>
                    <SelectItem value="tone">Tone & Confidence</SelectItem>
                    <SelectItem value="talk_ratio">Talk Ratio</SelectItem>
                    <SelectItem value="recommendations">Recommendations</SelectItem>
                    <SelectItem value="transcript">Transcript</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">What's wrong? <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  value={issue}
                  onChange={e => setIssue(e.target.value)}
                  placeholder="e.g. Score is too high, the rep didn't actually close"
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm placeholder:text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  maxLength={512}
                />
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Additional notes (optional)</label>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Any extra context that would help improve the AI..."
                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-800 resize-none"
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} className="text-gray-700">Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!issue.trim() || submitFeedback.isPending}
                className="bg-amber-600 hover:bg-amber-500 text-gray-900"
              >
                {submitFeedback.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Flag className="w-4 h-4 mr-2" />}
                Submit Flag
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── EDIT DETAILS MODAL ──────────────────────────────────────────────────────
function EditDetailsModal({
  analysisId,
  initialRepName,
  initialCallDate,
  initialCloseStatus,
  initialCustomerName,
  initialCallType,
  open,
  onClose,
  onSaved,
}: {
  analysisId: number;
  initialRepName?: string | null;
  initialCallDate?: Date | null;
  initialCloseStatus?: string | null;
  initialCustomerName?: string | null;
  initialCallType?: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [repName, setRepName] = useState(initialRepName ?? "");
  const [callDate, setCallDate] = useState(() => {
    if (!initialCallDate) return new Date().toISOString().split("T")[0];
    return new Date(initialCallDate).toISOString().split("T")[0];
  });
  const [closeStatus, setCloseStatus] = useState<"closed" | "not_closed" | "follow_up">(
    (initialCloseStatus as "closed" | "not_closed" | "follow_up") ?? "not_closed"
  );
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [callType, setCallType] = useState<string>(
    initialCallType ?? "cold_call"
  );
  const [saved, setSaved] = useState(false);

  // Sync form state whenever the modal opens (handles reopening with fresh data)
  useEffect(() => {
    if (open) {
      setRepName(initialRepName ?? "");
      setCallDate(initialCallDate ? new Date(initialCallDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      setCloseStatus((initialCloseStatus as "closed" | "not_closed" | "follow_up") ?? "not_closed");
      setCustomerName(initialCustomerName ?? "");
      setCallType(initialCallType ?? "cold_call");
      setSaved(false);
    }
  }, [open, initialRepName, initialCallDate, initialCloseStatus, initialCustomerName, initialCallType]);
  const utils = trpc.useUtils();
  const updateDetails = trpc.callCoach.updateCallDetails.useMutation({
    onSuccess: async () => {
      await utils.callCoach.getAnalysis.invalidate({ id: analysisId });
      await utils.callCoach.getMyAnalyses.invalidate();
      await utils.callCoach.getAllAnalyses.invalidate();
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); onSaved(); }, 1200);
    },
  });

  const handleClose = () => { setSaved(false); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-700">Edit Call Details</DialogTitle>
        </DialogHeader>
        {saved ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-gray-700 font-medium">Details updated!</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Auto-extracted from call, or enter manually"
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm placeholder:text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Rep Name</label>
                <input
                  type="text"
                  value={repName}
                  onChange={e => setRepName(e.target.value)}
                  placeholder="Rep name"
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm placeholder:text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Call Date</label>
                <input
                  type="date"
                  value={callDate}
                  onChange={e => setCallDate(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Call Type</label>
                <select
                  value={callType}
                  onChange={e => setCallType(e.target.value as typeof callType)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <optgroup label="── Opening Team ──">
                    <option value="cold_call">📞 Cold Call</option>
                    <option value="follow_up">🔄 Follow-up</option>
                  </optgroup>
                  <optgroup label="── Retention Team ──">
                    <option value="live_sub">💚 Live Sub</option>
                    <option value="pre_cycle_cancelled">🚫 Pre-Cycle Cancelled</option>
                    <option value="pre_cycle_decline">💳 Pre-Cycle Decline</option>
                    <option value="end_of_instalment">💎 End of Instalment</option>
                    <option value="from_cat">🔀 From Cat</option>
                    <option value="other">❓ Other</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-gray-800 text-sm mb-1.5 block">Close Status</label>
                <select
                  value={closeStatus}
                  onChange={e => setCloseStatus(e.target.value as typeof closeStatus)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="closed">✅ Closed</option>
                  <option value="not_closed">❌ Not Closed</option>
                  <option value="follow_up">🔄 Follow-up</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} className="text-gray-700">Cancel</Button>
              <Button
                onClick={() => updateDetails.mutate({ id: analysisId, repName, callDate, closeStatus, customerName: customerName || undefined, callType: callType as any })}
                disabled={updateDetails.isPending}
                className="bg-teal-600 hover:bg-teal-500 text-gray-900"
              >
                {updateDetails.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── ANALYSIS REPORT VIEW ─────────────────────────────────────────────────────
function AnalysisReport({ analysisId, onBack, onDeleted, bestCallId, worstCallId, onNavigateCall }: { analysisId: number; onBack: () => void; onDeleted?: () => void; bestCallId?: number | null; worstCallId?: number | null; onNavigateCall?: (id: number) => void }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const utils = trpc.useUtils();
  const deleteAnalysis = trpc.callCoach.deleteAnalysis.useMutation({
    onSuccess: () => {
      utils.callCoach.getMyAnalyses.invalidate();
      utils.callCoach.getAllAnalyses.invalidate();
      if (onDeleted) onDeleted(); else onBack();
    },
  });
  const { data: analysis, isLoading } = trpc.callCoach.getAnalysis.useQuery(
    { id: analysisId },
    { refetchInterval: (query) => {
        const data = query.state.data;
        if (!data || data.status === "pending" || data.status === "transcribing" || data.status === "analyzing") return 2000;
        return false;
      }
    }
  );

  if (isLoading || !analysis) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const statusMap = {
    pending: { icon: <Clock className="w-5 h-5 text-gray-700" />, label: "Queued", color: "text-gray-700" },
    transcribing: { icon: <Loader2 className="w-5 h-5 animate-spin text-blue-600" />, label: "Transcribing audio...", color: "text-blue-600" },
    analyzing: { icon: <Loader2 className="w-5 h-5 animate-spin text-teal-600" />, label: "AI is analysing...", color: "text-teal-600" },
    done: { icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, label: "Complete", color: "text-emerald-600" },
    error: { icon: <XCircle className="w-5 h-5 text-red-600" />, label: "Error", color: "text-red-600" },
  };

  const status = statusMap[analysis.status as keyof typeof statusMap];

  // Deal status config
  const dealStatusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    closed:     { label: "Closed Deal",  color: "text-emerald-600", bg: "bg-emerald-500/15", border: "border-emerald-500/40" },
    follow_up:  { label: "Follow-up",    color: "text-amber-600",   bg: "bg-amber-500/15",   border: "border-amber-500/40" },
    not_closed: { label: "Not Closed",   color: "text-red-600",     bg: "bg-red-500/15",     border: "border-red-500/40" },
  };
  const dealStatus = analysis.closeStatus ? dealStatusMap[analysis.closeStatus] : null;

  // Talk ratio display
  const repPct = analysis.repSpeechPct != null ? Math.round(analysis.repSpeechPct) : null;
  const custPct = repPct != null ? 100 - repPct : null;
  let ratioColor = "text-emerald-600";
  let ratioLabel = "Good ratio";
  if (repPct != null && repPct > 65) { ratioColor = "text-red-600"; ratioLabel = "Talking too much"; }
  else if (repPct != null && repPct < 30) { ratioColor = "text-amber-600"; ratioLabel = "Too passive"; }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        {/* Back button row + Best/Worst navigation */}
        <div className="px-4 pt-3 pb-0 flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-700 hover:text-gray-900 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {(bestCallId || worstCallId) && onNavigateCall && (
            <div className="flex items-center gap-2">
              {bestCallId && bestCallId !== analysisId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigateCall(bestCallId)}
                  className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs gap-1"
                >
                  🏆 Best Call
                </Button>
              )}
              {worstCallId && worstCallId !== analysisId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigateCall(worstCallId)}
                  className="text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 text-xs gap-1"
                >
                  ⚠️ Needs Work
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Two-column content */}
        <div className="flex flex-col sm:flex-row gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200/60 px-0">
          {/* Left: call info */}
          <div className="flex-1 px-4 pb-4 pt-2 space-y-1">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">{analysis.fileName ?? "Call Recording"}</h2>
            {analysis.customerName && (
              <p className="text-sm text-teal-600 font-medium">
                👤 {analysis.customerName}
                {!analysis.repName && !analysis.callDate && !analysis.closeStatus ? null : <span className="text-gray-800 font-normal"> (customer)</span>}
              </p>
            )}
            {(analysis.repName || analysis.callDate) && (
              <p className="text-xs text-gray-700">
                {analysis.repName && <span className="font-medium text-gray-800">{analysis.repName}</span>}
                {analysis.callDate && <span>{analysis.repName ? " · " : ""}{new Date(analysis.callDate).toLocaleDateString()}</span>}
              </p>
            )}
            {analysis.callType && (
              <div className="pt-0.5">
                <CallTypeBadge callType={analysis.callType} />
              </div>
            )}
            {analysis.lastEditedByName && (
              <p className="text-xs text-gray-800 italic">
                Last edited by {analysis.lastEditedByName}{analysis.lastEditedAt ? ` · ${new Date(analysis.lastEditedAt).toLocaleString()}` : ""}
              </p>
            )}
            <div className={`flex items-center gap-2 text-sm pt-1 ${status.color}`}>
              {status.icon}
              <span>{status.label}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEditModal(true)}
                className="text-gray-700 hover:text-teal-600 text-xs border border-gray-200 hover:border-teal-500"
              >
                ✏️ Edit Details
              </Button>
              {analysis.durationSeconds && (
                <span className="text-gray-800">
                  · {Math.floor((analysis.durationSeconds ?? 0) / 60)}m {Math.round((analysis.durationSeconds ?? 0) % 60)}s
                </span>
              )}
            </div>
          </div>

          {/* Right: Talk Ratio + Deal Status */}
          <div className="flex flex-row sm:flex-col items-center justify-center gap-6 px-8 py-6 sm:min-w-[200px] bg-gray-50">
            {/* Talk Ratio */}
            {repPct != null && (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700 mb-1">Talk Ratio</p>
                {/* Circular gauge */}
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
                    <span className="text-[10px] text-gray-700 mt-0.5">rep</span>
                  </div>
                </div>
                <p className={`text-xs font-semibold mt-1 ${ratioColor}`}>{ratioLabel}</p>
                <p className="text-[11px] text-gray-800">👤 Customer: {custPct}%</p>
              </div>
            )}

            {/* Divider between the two stats */}
            {repPct != null && dealStatus && (
              <div className="hidden sm:block w-full h-px bg-gray-100 my-1" />
            )}

            {/* Deal Status */}
            {dealStatus && (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700 mb-1">Deal Status</p>
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
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">🎙️ Call Recording</p>
          <audio
            ref={audioRef}
            controls
            src={analysis.audioFileUrl}
            className="w-full h-10"
            style={{ accentColor: "#0d9488" }}
            onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0)}
          />
          {analysis.wordTimestamps && (
            <p className="text-[10px] text-teal-600 mt-1">💡 Click any word in the transcript below to jump to that moment</p>
          )}
        </div>
      )}

      {/* Processing states */}
      {(analysis.status === "pending" || analysis.status === "transcribing" || analysis.status === "analyzing") && (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
            <p className="text-gray-800 text-lg">{status.label}</p>
            <p className="text-gray-800 text-sm">This usually takes 30–90 seconds depending on call length.</p>
          </CardContent>
        </Card>
      )}

      {analysis.status === "error" && (
        <Card className="bg-red-900/20 border-red-500/40">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 text-red-600">
              <XCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Analysis failed</p>
                <p className="text-sm text-red-600 mt-1 break-words">{analysis.errorMessage ?? "Unknown error"}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this failed call? This cannot be undone.")) {
                    deleteAnalysis.mutate({ id: analysisId });
                  }
                }}
                disabled={deleteAnalysis.isPending}
                className="text-red-600 hover:text-red-600 hover:bg-red-900/40 border border-red-500/40 text-xs"
              >
                {deleteAnalysis.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                🗑️ Delete Failed Call
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.status === "done" && analysis.analysisJson && (() => {
        const report: CallAnalysisReport = JSON.parse(analysis.analysisJson);
        return (
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
                <Card key={label} className={`bg-gray-50 border ${scoreBg(value ?? 0)} ${label === 'Compliance' && report.subscriptionMisrepresented ? 'ring-2 ring-red-500' : ''}`}>
                  <CardContent className="p-4 text-center">
                    <div className={`flex justify-center mb-2 ${scoreColor(value ?? 0)}`}>{icon}</div>
                    <div className={`text-3xl font-bold ${scoreColor(value ?? 0)}`}>{Math.round(value ?? 0)}</div>
                    <div className="text-xs text-gray-700 mt-1">{label}</div>
                    {label === 'Compliance' && report.subscriptionMisrepresented && (
                      <div className="text-xs text-red-600 font-bold mt-1">🚨 Critical</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Compliance Issues Alert */}
            {report.complianceIssues && report.complianceIssues.length > 0 && (
              <Card className="bg-red-50 border-red-400 border-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> 🚨 Compliance Issues Detected
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
                      <p className="text-red-800 text-sm font-bold">🚨 CRITICAL VIOLATION: The rep denied or misrepresented the subscription nature of the product when directly asked by the customer. This results in a very low compliance score regardless of sale outcome. This must be addressed immediately with the agent.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={report.closingAttempted ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                {report.closingAttempted ? "✓ Close attempted" : "✗ No close attempt"}
              </Badge>
              <Badge className={report.magicWandUsed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                {report.magicWandUsed ? "✓ Magic Wand used" : "✗ Magic Wand missed"}
              </Badge>
              {report.subscriptionDisclosed != null && (
                <Badge className={report.subscriptionDisclosed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                  {report.subscriptionDisclosed ? "✓ Subscription disclosed" : "✗ Subscription NOT disclosed"}
                </Badge>
              )}
              {report.tcRead != null && (
                <Badge className={report.tcRead ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                  {report.tcRead ? "✓ T&C read" : "✗ T&C not read"}
                </Badge>
              )}
              {report.subscriptionMisrepresented && (
                <Badge className="bg-red-100 text-red-800 border-red-400 font-bold animate-pulse">
                  🚨 CRITICAL: Subscription denied
                </Badge>
              )}
            </div>

            {/* Summary */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 uppercase tracking-wider">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">{report.summary}</p>
              </CardContent>
            </Card>

            {/* Top 3 Recommendations */}
            <Card className="bg-gray-50 border-teal-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-teal-600 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Top 3 Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.topRecommendations.map((rec, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <p className="text-gray-700 text-sm leading-relaxed">{rec}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Script Stages */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 uppercase tracking-wider">Script Stage Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.stagesDetected.map((stage) => (
                  <div key={stage.stage} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{qualityBadge(stage.quality)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-sm font-medium">{stage.stage}</p>
                      <p className="text-gray-700 text-xs mt-0.5">{stage.note}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-gray-50 border-emerald-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-emerald-600 text-sm">What Worked Well</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-gray-50 border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-600 text-sm">Areas to Improve</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.improvements.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-700">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Key Moments */}
            {report.keyMoments?.length > 0 && (
              <Card className="bg-gray-50 border-gray-200">
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
                      <p className="text-gray-700 text-sm italic">"{km.moment}"</p>
                      <p className="text-gray-700 text-xs mt-2">💡 {km.coaching}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Transcript toggle */}
            {analysis.transcript && (() => {
              // Parse word timestamps if available
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
              <Card className="bg-gray-50 border-gray-200">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowTranscript(!showTranscript)}>
                  <CardTitle className="text-sm text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>Full Transcript</span>
                      {hasWordTs && (
                        <span className="text-[10px] font-normal text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          ⚡ Interactive
                        </span>
                      )}
                    </div>
                    {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </CardTitle>
                </CardHeader>
                {showTranscript && (
                  <CardContent>
                    {hasWordTs ? (
                      // ── INTERACTIVE TRANSCRIPT ──
                      <div className="max-h-[500px] overflow-y-auto pr-1 space-y-1">
                        {(() => {
                          // Group words into utterance blocks by consecutive speaker
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
                      // ── PLAIN TRANSCRIPT (old calls without word timestamps) ──
                      (() => {
                        const lines = analysis.transcript.split('\n').filter((l: string) => l.trim());
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
                                    <p key={idx} className="text-xs text-slate-400 italic">{trimmed}</p>
                                  );
                                }
                              })}
                            </div>
                          );
                        } else {
                          return (
                            <div className="max-h-[500px] overflow-y-auto">
                              <p className="text-base leading-relaxed text-slate-800 whitespace-pre-wrap font-serif text-center">
                                {analysis.transcript}
                              </p>
                            </div>
                          );
                        }
                      })()
                    )}
                  </CardContent>
                )}
              </Card>);
            })()}
          {/* Flag as Incorrect + PDF Download buttons */}
          <div className="flex justify-between items-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Build a printable HTML page with the report data
                const r = report;
                const repName = analysis.repName ?? 'Unknown Rep';
                const callDate = analysis.callDate ? new Date(analysis.callDate).toLocaleDateString('en-GB') : 'Unknown Date';
                const complianceAlert = r.subscriptionMisrepresented
                  ? `<div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin:16px 0">
                      <strong style="color:#b91c1c">🚨 CRITICAL COMPLIANCE VIOLATION</strong><br/>
                      <p style="color:#991b1b;margin:8px 0 0">The rep denied or misrepresented the subscription when directly asked by the customer. This must be addressed immediately.</p>
                    </div>` : '';
                const complianceIssuesHtml = r.complianceIssues && r.complianceIssues.length > 0
                  ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin:12px 0">
                      <strong style="color:#b91c1c">Compliance Issues:</strong><ul style="margin:8px 0 0;padding-left:20px">${r.complianceIssues.map(i => `<li style="color:#991b1b">${i}</li>`).join('')}</ul></div>` : '';
                const html = `<!DOCTYPE html><html><head><title>Call Report — ${repName} — ${callDate}</title>
                  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:14px}
                  h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#374151;margin:20px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
                  .scores{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.score-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;text-align:center;min-width:100px}
                  .score-num{font-size:28px;font-weight:bold}.score-label{font-size:11px;color:#6b7280;margin-top:4px}
                  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;margin:3px;border:1px solid}
                  .green{background:#ecfdf5;color:#065f46;border-color:#6ee7b7}.red{background:#fef2f2;color:#991b1b;border-color:#fca5a5}.amber{background:#fffbeb;color:#92400e;border-color:#fcd34d}
                  ul{padding-left:20px}li{margin:4px 0}.moment{background:#f9fafb;border-left:3px solid #6b7280;padding:8px 12px;margin:8px 0;border-radius:0 6px 6px 0}
                  .moment.positive{border-color:#10b981}.moment.negative{border-color:#f59e0b}.moment.critical{border-color:#ef4444;background:#fef2f2}
                  @media print{body{margin:20px}}</style></head><body>
                  <h1>AI Call Coach Report</h1>
                  <p style="color:#6b7280">${repName} &bull; ${callDate} &bull; ${analysis.callType ?? 'Call'}</p>
                  ${complianceAlert}
                  <div class="scores">
                    <div class="score-card"><div class="score-num">${Math.round(r.overallScore)}</div><div class="score-label">Overall Score</div></div>
                    <div class="score-card"><div class="score-num">${Math.round(r.scriptComplianceScore)}</div><div class="score-label">Script Compliance</div></div>
                    <div class="score-card"><div class="score-num">${Math.round(r.toneScore)}</div><div class="score-label">Tone & Confidence</div></div>
                    ${r.complianceScore != null ? `<div class="score-card" style="${r.subscriptionMisrepresented ? 'border:2px solid #ef4444' : ''}"><div class="score-num" style="color:${r.complianceScore < 40 ? '#dc2626' : r.complianceScore < 70 ? '#d97706' : '#16a34a'}">${Math.round(r.complianceScore)}</div><div class="score-label">Compliance</div></div>` : ''}
                    <div class="score-card"><div class="score-num">${analysis.repSpeechPct ?? 0}%</div><div class="score-label">Rep Speech</div></div>
                  </div>
                  <div style="margin:12px 0">
                    <span class="badge ${r.closingAttempted ? 'green' : 'red'}">${r.closingAttempted ? '✓ Close attempted' : '✗ No close attempt'}</span>
                    <span class="badge ${r.magicWandUsed ? 'green' : 'amber'}">${r.magicWandUsed ? '✓ Magic Wand used' : '✗ Magic Wand missed'}</span>
                    ${r.subscriptionDisclosed != null ? `<span class="badge ${r.subscriptionDisclosed ? 'green' : 'red'}">${r.subscriptionDisclosed ? '✓ Subscription disclosed' : '✗ Subscription NOT disclosed'}</span>` : ''}
                    ${r.tcRead != null ? `<span class="badge ${r.tcRead ? 'green' : 'amber'}">${r.tcRead ? '✓ T&C read' : '✗ T&C not read'}</span>` : ''}
                  </div>
                  ${complianceIssuesHtml}
                  <h2>Summary</h2><p>${r.summary}</p>
                  <h2>Top 3 Recommendations</h2><ol>${r.topRecommendations.map(rec => `<li>${rec}</li>`).join('')}</ol>
                  <h2>What Worked Well</h2><ul>${r.strengths.map(s => `<li style="color:#065f46">${s}</li>`).join('')}</ul>
                  <h2>Areas to Improve</h2><ul>${r.improvements.map(s => `<li style="color:#92400e">${s}</li>`).join('')}</ul>
                  ${r.keyMoments?.length > 0 ? `<h2>Key Moments</h2>${r.keyMoments.map(km => `<div class="moment ${km.type}"><p style="font-style:italic">&ldquo;${km.moment}&rdquo;</p><p style="font-size:12px;color:#374151;margin-top:6px">💡 ${km.coaching}</p></div>`).join('')}` : ''}
                  <h2>Script Stage Compliance</h2><ul>${r.stagesDetected.map(s => `<li><strong>${s.stage}</strong> — ${s.quality.toUpperCase()}: ${s.note}</li>`).join('')}</ul>
                  ${analysis.transcript ? `<h2>Full Transcript</h2><pre style="font-size:12px;white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:6px">${analysis.transcript}</pre>` : ''}
                  <p style="color:#9ca3af;font-size:11px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:8px">Generated by Lavie Labs AI Coach &bull; ${new Date().toLocaleString('en-GB')}</p>
                </body></html>`;
                const win = window.open('', '_blank');
                if (win) { win.document.write(html); win.document.close(); win.print(); }
              }}
              className="text-slate-800 bg-sky-200 hover:bg-sky-300 gap-2 border border-sky-300 font-medium"
            >
              ⬇️ Download PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFlagModal(true)}
              className="text-slate-800 bg-emerald-200 hover:bg-emerald-300 gap-2 border border-emerald-300 font-medium"
            >
              <Flag className="w-4 h-4" />
              Flag incorrect analysis
            </Button>
          </div>
          <FlagFeedbackModal
          analysisId={analysisId}
          open={showFlagModal}
          onClose={() => setShowFlagModal(false)}
        />
        <EditDetailsModal
          analysisId={analysisId}
          initialRepName={analysis.repName}
          initialCallDate={analysis.callDate}
          initialCloseStatus={analysis.closeStatus}
          initialCustomerName={analysis.customerName}
          initialCallType={analysis.callType}
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSaved={() => setShowEditModal(false)}
        />
          </div>
        );
      })()}
    </div>
  );
}

// ─── UPLOAD ZONE ─────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }: { onUploaded: (id: number) => void }) {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repName, setRepName] = useState(user?.name ?? "");
  const [callDate, setCallDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [closeStatus, setCloseStatus] = useState<"closed" | "not_closed" | "follow_up" | "">("not_closed");
  const [callType, setCallType] = useState<string>("cold_call");
  const [contactId, setContactId] = useState<number | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const startAnalysis = trpc.callCoach.startAnalysis.useMutation();
  const agentListQuery = trpc.callCoach.getAgentList.useQuery();
  const contactsQuery = trpc.contacts.list.useQuery(
    { search: contactSearch || undefined, limit: 10 },
    { enabled: contactSearch.length > 0 }
  );
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum size is 50MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/call-upload", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const { fileKey, url, fileName } = await res.json();
      const { analysisId } = await startAnalysis.mutateAsync({
        audioFileKey: fileKey,
        audioFileUrl: url,
        fileName,
        repName: repName || undefined,
        callDate: callDate || undefined,
        closeStatus: closeStatus || undefined,
        callType: callType as any,
        contactId: contactId ?? undefined,
      });
      onUploaded(analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [startAnalysis, onUploaded, repName, callDate, closeStatus, callType, contactId]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {/* Metadata fields */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-gray-700 uppercase tracking-wider font-semibold">Call Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-700">Rep Name</label>
              <select
                value={repName}
                onChange={e => setRepName(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              >
                <option value="">Select rep...</option>
                {(agentListQuery.data ?? []).map(agent => (
                  <option key={agent.id} value={agent.name ?? ""}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-700">Call Date</label>
              <input
                type="date"
                value={callDate}
                onChange={e => setCallDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-700">Close Status</label>
              <select
                value={closeStatus}
                onChange={e => setCloseStatus(e.target.value as typeof closeStatus)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              >
                <option value="closed">✅ Closed</option>
                <option value="not_closed">❌ Not Closed</option>
                <option value="follow_up">🔄 Follow-up</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-700">Call Type</label>
              <select
                value={callType}
                onChange={e => setCallType(e.target.value as typeof callType)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              >
                <optgroup label="── Opening Team ──">
                  <option value="cold_call">📞 Cold Call</option>
                  <option value="follow_up">🔄 Follow-up</option>
                </optgroup>
                <optgroup label="── Retention Team ──">
                  <option value="live_sub">💚 Live Sub</option>
                  <option value="pre_cycle_cancelled">🚫 Pre-Cycle Cancelled</option>
                  <option value="pre_cycle_decline">💳 Pre-Cycle Decline</option>
                  <option value="end_of_instalment">💎 End of Instalment</option>
                  <option value="from_cat">🔀 From Cat</option>
                  <option value="other">❓ Other</option>
                </optgroup>
              </select>
            </div>
          </div>
          {/* Contact selector — full width */}
          <div className="space-y-1 relative">
            <label className="text-xs text-gray-700">Link to Contact (optional)</label>
            <input
              type="text"
              value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); setShowContactDropdown(true); if (!e.target.value) { setContactId(null); } }}
              onFocus={() => setShowContactDropdown(true)}
              placeholder={contactId ? `Contact #${contactId} selected` : "Search by name or phone..."}
              className={`w-full bg-white border rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-slate-500 focus:outline-none focus:border-teal-500 ${
                contactId ? "border-teal-500 bg-teal-50" : "border-gray-300"
              }`}
            />
            {contactId && (
              <button
                type="button"
                onClick={() => { setContactId(null); setContactSearch(""); }}
                className="absolute right-2 top-7 text-gray-400 hover:text-red-500 text-xs"
              >✕ Clear</button>
            )}
            {showContactDropdown && contactSearch.length > 0 && (
              <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {contactsQuery.isLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
                )}
                {!contactsQuery.isLoading && (contactsQuery.data ?? []).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No contacts found</div>
                )}
                {(contactsQuery.data ?? []).map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 border-b border-gray-100 last:border-0"
                    onClick={() => {
                      setContactId(c.id);
                      setContactSearch(c.name + (c.phone ? ` (${c.phone})` : ""));
                      setShowContactDropdown(false);
                    }}
                  >
                    <span className="font-medium text-gray-800">{c.name}</span>
                    {c.phone && <span className="text-gray-500 ml-2">{c.phone}</span>}
                    {c.leadType && <span className="ml-2 text-xs text-indigo-600">{c.leadType}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          isDragging ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
            <p className="text-teal-600 font-medium">Uploading & starting analysis...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-12 h-12 text-gray-800 mx-auto" />
            <div>
              <p className="text-gray-700 font-medium">Drop your call recording here</p>
              <p className="text-gray-800 text-sm mt-1">or click to browse · MP3, WAV, M4A, OGG, WebM · max 50MB</p>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── SHARED CALL ROW ─────────────────────────────────────────────────────────
function CallRow({
  a,
  onSelect,
  onDelete,
  deleteIsPending,
}: {
  a: any;
  onSelect: (id: number) => void;
  onDelete?: (id: number) => void;
  deleteIsPending?: boolean;
}) {
  const statusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    return <Loader2 className="w-4 h-4 animate-spin text-teal-600 flex-shrink-0" />;
  };
  const displayDate = a.callDate ?? a.createdAt;
  const dateStr = displayDate
    ? new Date(displayDate).toLocaleString("en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer transition-colors"
      onClick={() => onSelect(a.id)}
    >
      {statusIcon(a.status)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-gray-800 text-sm font-medium truncate">
            {a.customerName ?? (a.source === "webhook" ? "Auto call" : (a.fileName ?? "Recording"))}
          </p>
          {a.source === "webhook" && (
            <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold">AUTO</span>
          )}
          <CallTypeBadge callType={a.callType} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{dateStr}</span>
          {/* Talk Ratio hidden until data is reliable */}
          {a.closeStatus && (
            <span className={`text-xs font-medium ${
              a.closeStatus === "closed" ? "text-emerald-600" :
              a.closeStatus === "follow_up" ? "text-amber-600" : "text-red-500"
            }`}>
              {a.closeStatus === "closed" ? "✅ Closed" : a.closeStatus === "follow_up" ? "🔄 Follow-up" : "❌ Not closed"}
            </span>
          )}
        </div>
      </div>
      {a.overallScore != null ? (
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className={`text-xl font-bold ${scoreColor(a.overallScore)}`}>{Math.round(a.overallScore)}</span>
          <RepStatusBadge score={Math.round(a.overallScore)} size="sm" />
        </div>
      ) : a.status !== "done" && a.status !== "error" ? (
        <span className="text-xs text-gray-400 capitalize flex-shrink-0">{a.status}…</span>
      ) : null}
      {a.status === "error" && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm("Delete this failed call?")) onDelete(a.id); }}
          disabled={deleteIsPending}
          className="text-red-500 text-xs border border-red-300 rounded px-2 py-1 hover:bg-red-50 transition-colors flex-shrink-0"
        >🗑️</button>
      )}
    </div>
  );
}

// ─── ADMIN AGENT DASHBOARD ───────────────────────────────────────────────────
function AdminAgentDashboard({ onSelect }: { onSelect: (id: number) => void }) {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const { data: agents, isLoading } = trpc.callCoach.getAgentDashboard.useQuery(undefined, {
    refetchInterval: 10000,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!agents?.length) return (
    <div className="text-center py-12 text-gray-500">
      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">No calls yet. Calls will appear here automatically after agents finish their calls.</p>
    </div>
  );

  const trendIcon = (t: string, delta: number) => {
    if (t === "improving") return <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold"><TrendingUp className="w-3.5 h-3.5" />+{delta}</span>;
    if (t === "declining") return <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown className="w-3.5 h-3.5" />{delta}</span>;
    return <span className="flex items-center gap-1 text-gray-400 text-xs"><Minus className="w-3.5 h-3.5" />Stable</span>;
  };

  const lastCallTime = (iso: string | null) => {
    if (!iso) return "No calls";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const totalCallsToday = agents.reduce((s, a) => s + a.callsToday, 0);
  const totalThisWeek = agents.reduce((s, a) => s + a.callsThisWeek, 0);
  const totalPending = agents.reduce((s, a) => s + a.pendingCalls, 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Agents", value: agents.length, icon: "👥" },
          { label: "Calls Today", value: totalCallsToday, icon: "📞" },
          { label: "This Week", value: totalThisWeek, icon: "📅" },
          { label: "Analyzing", value: totalPending, icon: "⏳" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center shadow-sm">
            <div className="text-xl mb-0.5">{stat.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Agent cards */}
      {agents.map((agent) => {
        const isExpanded = expandedAgent === agent.userId;
        const s = agent.avgScore;
        const borderCls = s == null ? "border-gray-200" : s >= 75 ? "border-emerald-300" : s >= 55 ? "border-amber-300" : "border-red-300";
        const bgCls = s == null ? "bg-white" : s >= 75 ? "bg-emerald-50/30" : s >= 55 ? "bg-amber-50/30" : "bg-red-50/30";

        return (
          <div key={agent.userId} className={`rounded-xl border-2 ${borderCls} ${bgCls} overflow-hidden`}>
            {/* Header row */}
            <div
              className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-black/5 transition-colors"
              onClick={() => setExpandedAgent(isExpanded ? null : agent.userId)}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {agent.repName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>

              {/* Name + last call info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{agent.repName}</span>
                  {agent.pendingCalls > 0 && (
                    <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5 font-semibold animate-pulse">
                      {agent.pendingCalls} analyzing…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">Last: <span className="font-medium text-gray-700">{lastCallTime(agent.lastCallAt)}</span></span>
                  {agent.lastCallCustomer && <span className="text-xs text-gray-400 truncate max-w-[100px]">{agent.lastCallCustomer}</span>}
                  {agent.lastCallStatus === "closed" && <span className="text-xs text-emerald-600 font-medium">✅ Closed</span>}
                  {agent.lastCallStatus === "follow_up" && <span className="text-xs text-amber-600 font-medium">🔄 Follow-up</span>}
                  {agent.lastCallStatus === "not_closed" && <span className="text-xs text-red-500 font-medium">❌ Not closed</span>}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                <div className="text-center hidden sm:block">
                  <div className="text-lg font-bold text-gray-900">{agent.callsToday}</div>
                  <div className="text-xs text-gray-400">today</div>
                </div>
                <div className="text-center hidden sm:block">
                  <div className="text-lg font-bold text-gray-700">{agent.callsThisWeek}</div>
                  <div className="text-xs text-gray-400">week</div>
                </div>
                {s != null ? (
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${scoreColor(s)}`}>{s}</div>
                    <div className="text-xs text-gray-400">avg</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-xl text-gray-300">—</div>
                    <div className="text-xs text-gray-400">avg</div>
                  </div>
                )}
                <div className="text-center hidden sm:block">
                  {trendIcon(agent.trendIndicator, Math.abs(agent.trendDelta))}
                  <div className="text-xs text-gray-400">trend</div>
                </div>
                <div className="text-center hidden md:block">
                  <div className="text-lg font-bold text-gray-700">{agent.closeRate}%</div>
                  <div className="text-xs text-gray-400">close</div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            {/* Expanded call feed */}
            {isExpanded && (
              <div className="border-t border-gray-200 bg-gray-50/60 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent Calls</span>
                  <span className="text-xs text-gray-400">{agent.totalCalls} total</span>
                </div>
                {agent.recentCalls.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No calls yet</p>
                ) : (
                  agent.recentCalls.map((c: any) => (
                    <CallRow key={c.id} a={c} onSelect={onSelect} />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MY CALLS (agent personal view or admin dashboard) ───────────────────────
function MyCalls({ onSelect, isAdmin }: { onSelect: (id: number) => void; isAdmin?: boolean }) {
  const utils = trpc.useUtils();
  const deleteAnalysis = trpc.callCoach.deleteAnalysis.useMutation({
    onSuccess: () => {
      utils.callCoach.getMyAnalyses.invalidate();
      utils.callCoach.getAllAnalyses.invalidate();
    },
  });

  // Admins get the full agent dashboard view
  if (isAdmin) return <AdminAgentDashboard onSelect={onSelect} />;

  // Agents see their own calls
  const { data: analyses, isLoading } = trpc.callCoach.getMyAnalyses.useQuery(undefined, {
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!analyses?.length) return (
    <div className="text-center py-12 text-gray-500">
      <Mic className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">No calls yet. Your calls will appear here automatically after each call.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {[...analyses].reverse().map((a) => (
        <CallRow
          key={a.id}
          a={a}
          onSelect={onSelect}
          onDelete={(id) => deleteAnalysis.mutate({ id })}
          deleteIsPending={deleteAnalysis.isPending}
        />
      ))}
    </div>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
const MANAGER_PREVIEW_COUNT = 5;
function ManagerDashboard({ onSelect }: { onSelect: (id: number) => void }) {
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());
  const { data: analyses, isLoading } = trpc.callCoach.getAllAnalyses.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const toggleRep = (name: string) => {
    setExpandedReps(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!analyses?.length) return (
    <div className="text-center py-12 text-gray-800">
      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No calls analysed yet across the team.</p>
    </div>
  );

  const done = analyses.filter(a => a.status === "done");
  const avgScore = done.length ? Math.round(done.reduce((s, a) => s + (a.overallScore ?? 0), 0) / done.length) : 0;

  // Group by rep
  const byRep: Record<string, typeof analyses> = {};
  for (const a of analyses) {
    const name = a.repName ?? "Unknown";
    if (!byRep[name]) byRep[name] = [];
    byRep[name].push(a);
  }

  return (
    <div className="space-y-6">
      {/* Team stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-teal-600">{analyses.length}</div>
            <div className="text-xs text-gray-700 mt-1">Total Calls</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore || "—"}</div>
            <div className="text-xs text-gray-700 mt-1">Team Avg Score</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">{Object.keys(byRep).length}</div>
            <div className="text-xs text-gray-700 mt-1">Active Reps</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-rep breakdown */}
      {Object.entries(byRep).map(([repName, repCalls]) => {
        const repDone = repCalls.filter(a => a.status === "done");
        const repAvg = repDone.length ? Math.round(repDone.reduce((s, a) => s + (a.overallScore ?? 0), 0) / repDone.length) : null;
        return (
          <Card key={repName} className="bg-gray-50 border-gray-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-700 text-base">{repName}</CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-800">{repCalls.length} calls</span>
                  {repAvg != null && (
                    <span className={`text-lg font-bold ${scoreColor(repAvg)}`}>{repAvg}</span>
                  )}
                  {repAvg != null && <RepStatusBadge score={repAvg} size="sm" />}
                </div>
              </div>
              {repAvg != null && <Progress value={repAvg} className="h-1.5 mt-2" />}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {(() => {
                const sorted = [...repCalls].reverse();
                const isExpanded = expandedReps.has(repName);
                const visible = isExpanded ? sorted : sorted.slice(0, MANAGER_PREVIEW_COUNT);
                return (
                  <>
                    {visible.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/50 hover:bg-white cursor-pointer transition-colors"
                        onClick={() => onSelect(a.id)}
                      >
                        {a.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> :
                         a.status === "error" ? <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" /> :
                         <Loader2 className="w-4 h-4 animate-spin text-teal-600 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-gray-800 text-sm truncate">
                              {(a as any).source === "webhook"
                                ? `📞 ${a.customerName ?? a.repName ?? "Auto-analyzed call"}`
                                : (a.fileName ?? "Recording")}
                            </p>
                            {(a as any).source === "webhook" && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5 font-bold">AUTO</span>
                            )}
                            <CallTypeBadge callType={a.callType} />
                          </div>
                          <p className="text-gray-800 text-xs">
                            {a.customerName && (a as any).source !== "webhook" && <span className="text-teal-600/80">👤 {a.customerName} · </span>}
                            {new Date(a.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {a.overallScore != null && (
                          <span className={`text-sm font-bold ${scoreColor(a.overallScore)}`}>{Math.round(a.overallScore)}</span>
                        )}
                      </div>
                    ))}
                    {sorted.length > MANAGER_PREVIEW_COUNT && (
                      <button
                        onClick={() => toggleRep(repName)}
                        className="w-full text-xs text-teal-600 hover:text-teal-600 py-1.5 text-center transition-colors"
                      >
                        {isExpanded
                          ? `▲ Show less`
                          : `▼ Show all ${sorted.length} calls`}
                      </button>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
function Leaderboard() {
  const { data: entries, isLoading } = trpc.callCoach.getLeaderboard.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!entries?.length) return (
    <div className="text-center py-12 text-gray-800">
      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No calls analysed yet. Be the first to upload!</p>
      <p className="text-xs mt-2 text-gray-800">Minimum 5 calls required for a reliable ranking.</p>
    </div>
  );

  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

  // Find most improved (reliable entries only, with upward trend)
  const mostImproved = entries.filter(e => e.isReliable && e.trend === "up")[0];

  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4 text-emerald-600" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-800" />;
  };

  const closeStatusLabel = (rate: number) => {
    if (rate >= 60) return <span className="text-emerald-600">{rate}%</span>;
    if (rate >= 30) return <span className="text-amber-600">{rate}%</span>;
    return <span className="text-red-600">{rate}%</span>;
  };

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="text-xs text-gray-800 italic text-center">
        Rankings are based on AI scores only. Minimum 5 analysed calls required for a reliable ranking.
        <br />Reps with fewer than 5 calls are shown but marked as unranked.
      </div>

      {/* Most Improved badge */}
      {mostImproved && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-500/30">
          <span className="text-2xl">\uD83D\uDE80</span>
          <div>
            <p className="text-emerald-600 text-sm font-bold">Most Improved</p>
            <p className="text-gray-800 text-sm">{mostImproved.repName} — score trending up over last 6 calls</p>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div
            key={entry.userId}
            className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
              i === 0 && entry.isReliable
                ? "bg-amber-50 border-amber-500/30"
                : i === 1 && entry.isReliable
                ? "bg-gray-100 border-gray-300"
                : i === 2 && entry.isReliable
                ? "bg-orange-50 border-orange-500/30"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            {/* Rank */}
            <div className="w-8 text-center flex-shrink-0">
              {entry.isReliable && i < 3
                ? <span className="text-xl">{medals[i]}</span>
                : <span className="text-gray-800 text-sm font-bold">#{i + 1}</span>
              }
            </div>

            {/* Name & stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-gray-700 font-semibold text-sm">{entry.repName}</p>
                {!entry.isReliable && (
                  <Badge className="text-xs bg-gray-100/50 text-gray-700 border-gray-300">Unranked &lt;5 calls</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-800">{entry.totalCalls} calls</span>
                <span className="text-xs text-gray-800">Close rate: {closeStatusLabel(entry.closeRate)}</span>
              </div>
            </div>

            {/* Score & trend */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex items-center gap-2">
                {trendIcon(entry.trend)}
                {entry.avgScore != null
                  ? <span className={`text-xl font-bold ${scoreColor(entry.avgScore)}`}>{entry.avgScore}</span>
                  : <span className="text-gray-800 text-sm">—</span>
                }
              </div>
              {entry.avgScore != null && <RepStatusBadge score={entry.avgScore} size="sm" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FEEDBACK REVIEW (ADMIN) ─────────────────────────────────────────────────
function FeedbackReview() {
  const { data: feedbacks, isLoading } = trpc.callCoach.getFeedbackSummary.useQuery();

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!feedbacks?.length) return (
    <div className="text-center py-12 text-gray-800">
      <Flag className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No feedback submitted yet.</p>
      <p className="text-xs mt-2 text-gray-800">When reps flag incorrect analysis, it will appear here.</p>
    </div>
  );

  const sectionColors: Record<string, string> = {
    overall: "bg-blue-50 text-blue-700 border-blue-200",
    script_compliance: "bg-purple-50 text-purple-700 border-purple-200",
    tone: "bg-pink-50 text-pink-700 border-pink-200",
    talk_ratio: "bg-cyan-50 text-cyan-700 border-cyan-200",
    recommendations: "bg-teal-50 text-teal-600 border-teal-500/40",
    transcript: "bg-orange-50 text-orange-700 border-orange-200",
    other: "bg-gray-100 text-gray-800 border-gray-200",
  };

  // Count by section
  const sectionCounts: Record<string, number> = {};
  for (const f of feedbacks) {
    sectionCounts[f.section] = (sectionCounts[f.section] ?? 0) + 1;
  }
  const topSection = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{feedbacks.length}</div>
            <div className="text-xs text-gray-700 mt-1">Total Flags</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold text-gray-700 capitalize">{topSection?.[0]?.replace("_", " ") ?? "—"}</div>
            <div className="text-xs text-gray-700 mt-1">Most Flagged Section</div>
          </CardContent>
        </Card>
      </div>

      {/* Tip for improvement */}
      <div className="rounded-lg bg-teal-50 border border-teal-500/30 p-4 text-sm text-teal-600">
        💡 <strong>How to use this:</strong> Review the flags below, identify patterns, and share them with the AI trainer to improve the prompt. After 10+ flags, patterns become clear.
      </div>

      {/* Feedback list */}
      <div className="space-y-3">
        {[...feedbacks].reverse().map((f) => (
          <Card key={f.id} className="bg-gray-50 border-gray-200">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={sectionColors[f.section] ?? sectionColors.other}>{f.section.replace("_", " ")}</Badge>
                <span className="text-xs text-gray-800">{new Date(f.createdAt).toLocaleString()}</span>
                <span className="text-xs text-gray-800">· Call #{f.analysisId}</span>
              </div>
              <p className="text-gray-700 text-sm font-medium">{f.issue}</p>
              {f.comment && <p className="text-gray-700 text-xs leading-relaxed">{f.comment}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── TEAM DASHBOARD ─────────────────────────────────────────────────────────
type RepProfileData = {
  repName: string;
  userId: number;
  totalCalls: number;
  allTimeAvg: number | null;
  last10Avg: number | null;
  trendIndicator: "improving" | "stable" | "declining";
  trendDelta: number;
  rank: number;
  totalReps: number;
  closeRate: number;
  avgTalkRatio: number | null;
  scriptComplianceAvg: number | null;
  toneAvg: number | null;
  scoreHistory: { date: string; score: number }[];
  bestCall: { id: number; score: number; fileName: string | null; date: string } | null;
  worstCall: { id: number; score: number; fileName: string | null; date: string } | null;
  isReliable: boolean;
};

function TrendIndicator({ trend, delta }: { trend: "improving" | "stable" | "declining"; delta: number }) {
  if (trend === "improving") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
      <TrendingUp className="w-3 h-3" /> +{delta} Improving
    </span>
  );
  if (trend === "declining") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-500/15 border border-red-500/30 rounded-full px-2 py-0.5">
      <TrendingDown className="w-3 h-3" /> {delta} Declining
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
      <Minus className="w-3 h-3" /> Stable
    </span>
  );
}

function RepInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-gray-900 font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

function RepProfileModal({ rep, onClose }: { rep: RepProfileData; onClose: () => void }) {
  const rankMedals = ["🥇", "🥈", "🥉"];
  const rankLabel = rep.rank <= 3 && rep.isReliable ? rankMedals[rep.rank - 1] : `#${rep.rank}`;

  // Build mini sparkline data
  const chartData = rep.scoreHistory.slice(-10).map((h, i) => ({ call: i + 1, score: h.score, date: h.date }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-50 border-gray-200 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-gray-900">
            <RepInitials name={rep.repName} />
            <div>
              <div className="text-lg font-bold">{rep.repName}</div>
              <div className="flex items-center gap-2 mt-1">
                {rep.allTimeAvg != null && <RepStatusBadge score={rep.allTimeAvg} size="md" />}
                <span className="text-gray-800 text-xs">{rankLabel} of {rep.totalReps} reps</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Dual score row */}
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-800 uppercase tracking-widest mb-1">All-Time Avg</p>
              <p className={`text-3xl font-bold ${rep.allTimeAvg != null ? scoreColor(rep.allTimeAvg) : "text-gray-800"}`}>
                {rep.allTimeAvg ?? "—"}
              </p>
              <p className="text-xs text-gray-800 mt-1">{rep.totalCalls} calls total</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-800 uppercase tracking-widest mb-1">Last 10 Avg</p>
              <p className={`text-3xl font-bold ${rep.last10Avg != null ? scoreColor(rep.last10Avg) : "text-gray-800"}`}>
                {rep.last10Avg ?? "—"}
              </p>
              <div className="mt-1">
                <TrendIndicator trend={rep.trendIndicator} delta={Math.abs(rep.trendDelta)} />
              </div>
            </div>
          </div>

          {/* Score history sparkline */}
          {chartData.length >= 2 && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs text-gray-700 uppercase tracking-widest mb-3">Score History (last 10 calls)</p>
              <div className="h-24">
                <svg viewBox={`0 0 ${chartData.length * 40} 80`} className="w-full h-full" preserveAspectRatio="none">
                  {/* Grid line at 70 */}
                  <line x1="0" y1={80 - (70 / 100) * 80} x2={chartData.length * 40} y2={80 - (70 / 100) * 80}
                    stroke="rgba(20,184,166,0.2)" strokeDasharray="4,4" strokeWidth="1" />
                  {/* Score line */}
                  <polyline
                    points={chartData.map((d, i) => `${i * 40 + 20},${80 - (d.score / 100) * 80}`).join(" ")}
                    fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinejoin="round"
                  />
                  {/* Dots */}
                  {chartData.map((d, i) => (
                    <circle key={i} cx={i * 40 + 20} cy={80 - (d.score / 100) * 80} r="4"
                      fill={d.score >= 70 ? "#10b981" : d.score >= 55 ? "#f59e0b" : "#ef4444"}
                      stroke="#0A1628" strokeWidth="2"
                    />
                  ))}
                </svg>
              </div>
              <div className="flex justify-between text-xs text-gray-800 mt-1">
                <span>Oldest</span><span className="text-teal-500/60">— 70 target</span><span>Latest</span>
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
            <p className="text-xs text-gray-700 uppercase tracking-widest">Category Breakdown</p>
            {[
              { label: "Script Compliance", value: rep.scriptComplianceAvg, icon: "📋" },
              { label: "Tone & Delivery", value: rep.toneAvg, icon: "🎙️" },
              { label: "Talk Ratio", value: rep.avgTalkRatio, icon: "🗣️", suffix: "% rep" },
            ].map(({ label, value, icon, suffix }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-800">{icon} {label}</span>
                  <span className={`text-xs font-bold ${value != null ? scoreColor(value) : "text-gray-800"}`}>
                    {value != null ? `${value}${suffix ?? ""}` : "—"}
                  </span>
                </div>
                {value != null && !suffix && (
                  <Progress value={value} className="h-1.5" />
                )}
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-800 mb-1">Close Rate</p>
              <p className={`text-lg font-bold ${rep.closeRate >= 60 ? "text-emerald-600" : rep.closeRate >= 30 ? "text-amber-600" : "text-red-600"}`}>
                {rep.closeRate}%
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-800 mb-1">Best Score</p>
              <p className={`text-lg font-bold ${rep.bestCall ? scoreColor(rep.bestCall.score) : "text-gray-800"}`}>
                {rep.bestCall?.score ?? "—"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-800 mb-1">Worst Score</p>
              <p className={`text-lg font-bold ${rep.worstCall ? scoreColor(rep.worstCall.score) : "text-gray-800"}`}>
                {rep.worstCall?.score ?? "—"}
              </p>
            </div>
          </div>

          {!rep.isReliable && (
            <div className="rounded-lg bg-amber-50 border border-amber-500/30 p-3 text-xs text-amber-600">
              ⚠️ This rep has fewer than 5 analysed calls — stats may not be representative yet.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-300 text-gray-800 hover:bg-gray-100">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamDashboard() {
  const { data: reps, isLoading } = trpc.callCoach.getTeamDashboard.useQuery();
  const [selectedRep, setSelectedRep] = useState<RepProfileData | null>(null);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;
  if (!reps?.length) return (
    <div className="text-center py-12 text-gray-800">
      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No analysed calls yet.</p>
      <p className="text-xs mt-2 text-gray-800">Once reps upload and analyse calls, their profiles will appear here.</p>
    </div>
  );

  const scored = reps.filter(r => r.allTimeAvg != null);
  const teamAvg = scored.length > 0
    ? Math.round(scored.reduce((a, r) => a + r.allTimeAvg!, 0) / scored.length)
    : null;

  return (
    <div className="space-y-4">
      {/* Team summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-800 mb-1">Total Reps</p>
          <p className="text-2xl font-bold text-gray-900">{reps.length}</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-800 mb-1">Team Avg</p>
          <p className={`text-2xl font-bold ${teamAvg != null ? scoreColor(teamAvg) : "text-gray-800"}`}>{teamAvg ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-800 mb-1">Improving</p>
          <p className="text-2xl font-bold text-emerald-600">{reps.filter(r => r.trendIndicator === "improving").length}</p>
        </div>
      </div>

      {/* Ranked table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2rem_1fr_5rem_5rem_4rem_4rem_4rem] gap-2 px-3 py-2 bg-white/80 border-b border-gray-200 text-xs text-gray-800 font-medium uppercase tracking-wide">
          <span className="text-center">#</span>
          <span>Rep</span>
          <span className="text-center">Status</span>
          <span className="text-center">Trend</span>
          <span className="text-center">Avg</span>
          <span className="text-center">Last 10</span>
          <span className="text-center">Close</span>
        </div>

        {/* Table rows */}
        {reps.map((rep) => (
          <button
            key={rep.repName}
            onClick={() => setSelectedRep(rep)}
            className="w-full grid grid-cols-[2rem_1fr_5rem_5rem_4rem_4rem_4rem] gap-2 px-3 py-3 border-b border-gray-200 hover:bg-teal-500/5 hover:border-teal-500/20 transition-all cursor-pointer group text-left items-center last:border-b-0"
          >
            {/* Rank */}
            <span className="text-center text-gray-800 text-sm font-bold">
              {rep.rank <= 3
                ? ["🥇", "🥈", "🥉"][rep.rank - 1]
                : <span className="text-gray-800">#{rep.rank}</span>}
            </span>

            {/* Name + calls count */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <RepInitials name={rep.repName} />
                <span className="text-gray-700 font-semibold text-sm truncate group-hover:text-teal-600 transition-colors">{rep.repName}</span>
                {!rep.isReliable && <span className="text-[10px] text-gray-800 flex-shrink-0">({rep.totalCalls})</span>}
              </div>
              {rep.isReliable && <span className="text-[10px] text-gray-800 ml-7">{rep.totalCalls} calls</span>}
            </div>

            {/* Status badge */}
            <div className="flex justify-center">
              {rep.allTimeAvg != null
                ? <RepStatusBadge score={rep.allTimeAvg} size="sm" />
                : <span className="text-gray-800 text-xs">—</span>}
            </div>

            {/* Trend */}
            <div className="flex justify-center">
              <TrendIndicator trend={rep.trendIndicator} delta={Math.abs(rep.trendDelta)} />
            </div>

            {/* All-time avg */}
            <span className={`text-center text-sm font-bold ${rep.allTimeAvg != null ? scoreColor(rep.allTimeAvg) : "text-gray-800"}`}>
              {rep.allTimeAvg ?? "—"}
            </span>

            {/* Last 10 avg */}
            <span className={`text-center text-sm font-bold ${rep.last10Avg != null ? scoreColor(rep.last10Avg) : "text-gray-800"}`}>
              {rep.last10Avg ?? "—"}
            </span>

            {/* Close rate */}
            <span className={`text-center text-sm font-bold ${rep.closeRate >= 60 ? "text-emerald-600" : rep.closeRate >= 30 ? "text-amber-600" : "text-red-600"}`}>
              {rep.closeRate}%
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-800 text-center">Click any row to view the full rep profile. Stats based on AI-analysed calls only.</p>

      {/* Rep Profile Modal */}
      {selectedRep && <RepProfileModal rep={selectedRep} onClose={() => setSelectedRep(null)} />}
    </div>
  );
}

// ─── OPENING TEAM DASHBOARD ─────────────────────────────────────────────────
interface OpeningAgentRow {
  repName: string;
  userId: number;
  totalCalls: number;
  closeRate3Plus: number | null;
  closeRate10Plus: number | null;
  avgCallQuality: number | null;
  avgCompliance: number | null;
  trend: "improving" | "stable" | "declining";
  topWeakSpot: string | null;
  scoreHistory: { date: string; score: number }[];
  bestCall: { id: number; score: number; date: string; audioFileUrl: string | null } | null;
  worstCall: { id: number; score: number; date: string; audioFileUrl: string | null } | null;
  complianceFailures: { issue: string; count: number }[];
  durationBuckets: {
    "3-5": { calls: number; closed: number; closeRate: number | null };
    "5-10": { calls: number; closed: number; closeRate: number | null };
    "10+": { calls: number; closed: number; closeRate: number | null };
  };
}

function CloseRateBar({ rate, label }: { rate: number | null; label: string }) {
  const pct = rate ?? 0;
  const color = pct >= 50 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-400";
  const textColor = pct >= 50 ? "text-emerald-700" : pct >= 30 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className={`font-bold ${textColor}`}>{rate != null ? `${rate}%` : "—"}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AgentProfileDrawer({ agent, onClose, onSelectCall }: { agent: OpeningAgentRow; onClose: () => void; onSelectCall: (id: number) => void }) {
  const quality = agent.avgCallQuality;
  const status = quality != null ? getRepStatus(quality) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{agent.repName}</h2>
            <p className="text-xs text-gray-500">{agent.totalCalls} calls analysed</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + quality */}
          {status && quality != null && (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${status.bg} ${status.border}`}>
              <span className="text-3xl">{status.emoji}</span>
              <div>
                <p className={`font-bold text-base ${status.color}`}>{status.label}</p>
                <p className="text-xs text-gray-600">Avg Call Quality: <strong>{quality}/100</strong></p>
              </div>
            </div>
          )}

          {/* Close rates by duration */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Close Rate by Duration</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {(["3-5", "5-10", "10+"] as const).map(bucket => {
                const b = agent.durationBuckets[bucket];
                const pct = b.closeRate;
                const color = pct != null && pct >= 50 ? "text-emerald-600" : pct != null && pct >= 30 ? "text-amber-600" : "text-red-600";
                return (
                  <div key={bucket} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">{bucket} min</p>
                    <p className={`text-xl font-bold ${color}`}>{pct != null ? `${pct}%` : "—"}</p>
                    <p className="text-xs text-gray-400">{b.calls} calls</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 italic">Longer calls = higher close rate. If 3–5 min is low, the rep is losing customers before the pitch.</p>
          </div>

          {/* Compliance failures */}
          {agent.complianceFailures.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-red-600">Top Compliance Issues</p>
              {agent.complianceFailures.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{f.issue}</span>
                  <span className="font-bold text-red-600 ml-2">{f.count}x</span>
                </div>
              ))}
            </div>
          )}

          {/* Score history */}
          {agent.scoreHistory.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Score History (last {Math.min(agent.scoreHistory.length, 10)} calls)</p>
              <div className="flex items-end gap-1 h-16">
                {agent.scoreHistory.slice(-10).map((s, i) => {
                  const h = Math.max(4, Math.round((s.score / 100) * 64));
                  const bg = s.score >= 75 ? "bg-emerald-500" : s.score >= 50 ? "bg-amber-400" : "bg-red-400";
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <span className="text-[9px] text-gray-500">{s.score}</span>
                      <div className={`w-full rounded-sm ${bg}`} style={{ height: `${h}px` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Best / Worst call */}
          <div className="grid grid-cols-2 gap-3">
            {agent.bestCall && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                <p className="text-xs font-bold text-emerald-700">🏆 Best Call</p>
                <p className="text-lg font-bold text-emerald-600">{agent.bestCall.score}/100</p>
                <p className="text-xs text-gray-500">{agent.bestCall.date}</p>
                <div className="flex gap-2">
                  <button onClick={() => onSelectCall(agent.bestCall!.id)} className="text-xs text-teal-600 underline">View analysis</button>
                  {agent.bestCall.audioFileUrl && (
                    <a href={agent.bestCall.audioFileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">▶ Listen</a>
                  )}
                </div>
              </div>
            )}
            {agent.worstCall && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-xs font-bold text-red-700">⚠️ Needs Work</p>
                <p className="text-lg font-bold text-red-600">{agent.worstCall.score}/100</p>
                <p className="text-xs text-gray-500">{agent.worstCall.date}</p>
                <div className="flex gap-2">
                  <button onClick={() => onSelectCall(agent.worstCall!.id)} className="text-xs text-teal-600 underline">View analysis</button>
                  {agent.worstCall.audioFileUrl && (
                    <a href={agent.worstCall.audioFileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">▶ Listen</a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

//// Date preset options
const DATE_PRESET_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last 7 Days", value: "last_7" },
  { label: "This Month", value: "this_month" },
  { label: "Last 3 Months", value: "last_3m" },
  { label: "This Year", value: "this_year" },
  { label: "Previous Month", value: "prev_month" },
  { label: "Custom Date", value: "custom" },
] as const;

function getPresetDatesNew(preset: string): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (preset === "today") return { dateFrom: fmt(now), dateTo: fmt(now) };
  if (preset === "yesterday") {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return { dateFrom: fmt(d), dateTo: fmt(d) };
  }
  if (preset === "this_week") {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    return { dateFrom: fmt(start), dateTo: fmt(now) };
  }
  if (preset === "last_7") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { dateFrom: fmt(d), dateTo: fmt(now) };
  }
  if (preset === "this_month") {
    return { dateFrom: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: fmt(now) };
  }
  if (preset === "last_3m") {
    const d = new Date(now); d.setMonth(d.getMonth() - 3);
    return { dateFrom: fmt(d), dateTo: fmt(now) };
  }
  if (preset === "this_year") {
    return { dateFrom: fmt(new Date(now.getFullYear(), 0, 1)), dateTo: fmt(now) };
  }
  if (preset === "prev_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { dateFrom: fmt(start), dateTo: fmt(end) };
  }
  return {};
}

function OpeningDashboard() {
  const [preset, setPreset] = useState<string>("all");
  // Custom date: separate day/month/year selectors
  const [customDay, setCustomDay] = useState("");
  const [customMonth, setCustomMonth] = useState("");
  const [customYear, setCustomYear] = useState("");
  const [customToDay, setCustomToDay] = useState("");
  const [customToMonth, setCustomToMonth] = useState("");
  const [customToYear, setCustomToYear] = useState("");

  const buildCustomDate = (day: string, month: string, year: string) => {
    if (!day || !month || !year) return undefined;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  const queryInput = (() => {
    if (preset === "all") return {};
    if (preset === "custom") {
      return {
        dateFrom: buildCustomDate(customDay, customMonth, customYear),
        dateTo: buildCustomDate(customToDay, customToMonth, customToYear),
      };
    }
    return getPresetDatesNew(preset);
  })();

  const { data, isLoading } = trpc.callCoach.getOpeningDashboard.useQuery(queryInput);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);

  // Best Practice Extraction
  type BestPracticeInsight = {
    pattern: string;
    impact: string;
    example: string;
    category: "opening" | "pitch" | "objection" | "close" | "compliance" | "tone";
    frequency: number;
  };
  type BestPracticesResult = {
    insights: BestPracticeInsight[];
    topCallsAnalysed: number;
    generatedAt: string;
    teamAvgScore: number | null;
    topCallsAvgScore: number | null;
  };
  const [bestPracticesData, setBestPracticesData] = useState<BestPracticesResult | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const getBestPractices = trpc.callCoach.getBestPractices.useMutation({
    onSuccess: (result) => {
      setBestPracticesData(result as BestPracticesResult);
      setShowInsights(true);
    },
  });
  const categoryConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    opening:    { label: "Opening",    color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
    pitch:      { label: "Pitch",      color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200" },
    objection:  { label: "Objection",  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
    close:      { label: "Close",      color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
    compliance: { label: "Compliance", color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200" },
    tone:       { label: "Tone",       color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200" },
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  if (!data || data.totalOpeningCalls === 0) return (
    <div className="text-center py-12 text-gray-500">
      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>No Opening team calls analysed yet.</p>
      <p className="text-xs mt-1">Upload cold calls or follow-ups to see the dashboard.</p>
    </div>
  );

  // Find the agent who owns the selected call to get best/worst call IDs
  const selectedCallAgent = selectedCallId != null
    ? data.agents.find(a => a.bestCall?.id === selectedCallId || a.worstCall?.id === selectedCallId)
    : null;

  if (selectedCallId !== null) {
    return (
      <div>
        <AnalysisReport
          analysisId={selectedCallId}
          onBack={() => setSelectedCallId(null)}
          onDeleted={() => setSelectedCallId(null)}
          bestCallId={selectedCallAgent?.bestCall?.id ?? null}
          worstCallId={selectedCallAgent?.worstCall?.id ?? null}
          onNavigateCall={(id) => setSelectedCallId(id)}
        />
      </div>
    );
  }

  const kpiCard = (label: string, value: string | null, sub: string, gradient: string, iconEl: React.ReactNode) => (
    <div className={`rounded-2xl p-5 flex flex-col gap-2 shadow-md ${gradient}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-75">{label}</p>
        <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">{iconEl}</div>
      </div>
      <p className="text-3xl font-extrabold tracking-tight leading-none">{value ?? "—"}</p>
      <p className="text-[11px] opacity-65 font-medium">{sub}</p>
    </div>
  );

  const activeLabel = DATE_PRESET_OPTIONS.find(p => p.value === preset)?.label ?? "All time";
  const presetDates = preset !== "all" && preset !== "custom" ? getPresetDatesNew(preset) : null;

  // Day/month/year options
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const months = [
    { v: "1", l: "January" }, { v: "2", l: "February" }, { v: "3", l: "March" },
    { v: "4", l: "April" }, { v: "5", l: "May" }, { v: "6", l: "June" },
    { v: "7", l: "July" }, { v: "8", l: "August" }, { v: "9", l: "September" },
    { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" },
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
  const selectCls = "text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400";

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Date Range</p>
          {preset !== "all" && (
            <button onClick={() => setPreset("all")} className="text-xs text-teal-600 hover:underline">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={preset}
            onChange={e => setPreset(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 min-w-[160px]"
          >
            {DATE_PRESET_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {presetDates && (
            <span className="text-xs text-gray-400">{presetDates.dateFrom} → {presetDates.dateTo}</span>
          )}
        </div>
        {preset === "custom" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-8">From</span>
              <select value={customDay} onChange={e => setCustomDay(e.target.value)} className={selectCls}>
                <option value="">Day</option>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={customMonth} onChange={e => setCustomMonth(e.target.value)} className={selectCls}>
                <option value="">Month</option>
                {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select value={customYear} onChange={e => setCustomYear(e.target.value)} className={selectCls}>
                <option value="">Year</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-8">To</span>
              <select value={customToDay} onChange={e => setCustomToDay(e.target.value)} className={selectCls}>
                <option value="">Day</option>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={customToMonth} onChange={e => setCustomToMonth(e.target.value)} className={selectCls}>
                <option value="">Month</option>
                {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select value={customToYear} onChange={e => setCustomToYear(e.target.value)} className={selectCls}>
                <option value="">Year</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCard(
          "Close Rate (3+ min)",
          data.overallCloseRate3Plus != null ? `${data.overallCloseRate3Plus}%` : null,
          "Calls ≥ 3 minutes",
          "bg-gradient-to-br from-indigo-500 to-indigo-700 text-white",
          <TrendingUp size={16} className="text-white" />
        )}
        {kpiCard(
          "Close Rate (10+ min)",
          data.overallCloseRate10Plus != null ? `${data.overallCloseRate10Plus}%` : null,
          "Calls ≥ 10 minutes",
          "bg-gradient-to-br from-violet-500 to-violet-700 text-white",
          <Trophy size={16} className="text-white" />
        )}
        {kpiCard(
          "Avg Call Quality",
          data.avgCallQuality != null ? `${data.avgCallQuality}/100` : null,
          "Overall AI score",
          "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white",
          <Star size={16} className="text-white" />
        )}
        {kpiCard(
          "Total Calls",
          `${data.totalOpeningCalls}`,
          "Opening team calls analysed",
          "bg-gradient-to-br from-sky-500 to-sky-700 text-white",
          <Mic size={16} className="text-white" />
        )}
      </div>

      {/* Insight banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <strong>💡 Key insight:</strong> Calls over 10 minutes close at a significantly higher rate. If a rep's 3–5 min close rate is low, they're losing customers before the pitch. Focus coaching on engagement in the first 3 minutes.
      </div>

      {/* Agent table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-bold text-gray-700" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Opening Team — Agent Performance</p>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by Avg Call Quality. Click any row to see full agent profile.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-center">Calls</th>
                <th className="px-4 py-2 text-center">Close Rate (3+)</th>
                <th className="px-4 py-2 text-center">Close Rate (10+)</th>
                <th className="px-4 py-2 text-center">Call Quality</th>
                <th className="px-4 py-2 text-center">Trend</th>
                <th className="px-4 py-2 text-left">Top Issue</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((agent, i) => {
                const quality = agent.avgCallQuality;
                const status = quality != null ? getRepStatus(quality) : null;
                return (
                  <tr
                    key={i}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCallId(agent.bestCall?.id ?? null)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                          {agent.repName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{agent.repName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{agent.totalCalls}</td>
                    <td className="px-4 py-3 text-center">
                      {agent.closeRate3Plus != null ? (
                        <span className={`font-bold ${
                          agent.closeRate3Plus >= 50 ? "text-emerald-600" :
                          agent.closeRate3Plus >= 30 ? "text-amber-600" : "text-red-600"
                        }`}>{agent.closeRate3Plus}%</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {agent.closeRate10Plus != null ? (
                        <span className={`font-bold ${
                          agent.closeRate10Plus >= 50 ? "text-emerald-600" :
                          agent.closeRate10Plus >= 30 ? "text-amber-600" : "text-red-600"
                        }`}>{agent.closeRate10Plus}%</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {status && quality != null ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${status.bg} ${status.border} ${status.color}`}>
                          {status.emoji} {quality}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {agent.trend === "improving" && <span className="text-emerald-600 text-xs flex items-center justify-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Up</span>}
                      {agent.trend === "declining" && <span className="text-red-600 text-xs flex items-center justify-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> Down</span>}
                      {agent.trend === "stable" && <span className="text-gray-400 text-xs flex items-center justify-center gap-1"><Minus className="w-3.5 h-3.5" /> Stable</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-[160px] truncate">
                      {agent.topWeakSpot ?? <span className="text-gray-400">None found</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AI Best Practice Extraction ── */}
      <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-purple-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <div>
              <p className="text-sm font-bold text-purple-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AI Best Practice Extraction</p>
              <p className="text-xs text-purple-700">Analyses your top-scoring calls and identifies what the best reps do differently</p>
            </div>
          </div>
          <Button
            onClick={() => getBestPractices.mutate(queryInput)}
            disabled={getBestPractices.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-2 flex-shrink-0"
            size="sm"
          >
            {getBestPractices.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing calls...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Generate Insights</>
            )}
          </Button>
        </div>

        {getBestPractices.isError && (
          <div className="px-4 py-3 text-sm text-red-600">
            ⚠️ {getBestPractices.error?.message ?? "Failed to generate insights. Make sure there are at least 3 analysed calls."}
          </div>
        )}

        {showInsights && bestPracticesData && (
          <div className="p-4 space-y-4">
            {/* Stats row */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-xs text-purple-700">
                <span className="font-bold">{bestPracticesData.topCallsAnalysed}</span> top calls analysed
              </div>
              {bestPracticesData.teamAvgScore != null && (
                <div className="text-xs text-purple-700">
                  Team avg: <span className="font-bold">{bestPracticesData.teamAvgScore}/100</span>
                </div>
              )}
              {bestPracticesData.topCallsAvgScore != null && (
                <div className="text-xs text-purple-700">
                  Top calls avg: <span className="font-bold text-emerald-700">{bestPracticesData.topCallsAvgScore}/100</span>
                </div>
              )}
              <div className="text-xs text-purple-500 ml-auto">
                Generated {new Date(bestPracticesData.generatedAt).toLocaleString()}
              </div>
            </div>

            {/* Insights grid */}
            {bestPracticesData.insights.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No patterns found. Try with more calls.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {bestPracticesData.insights.map((insight, i) => {
                  const cat = categoryConfig[insight.category] ?? categoryConfig.tone;
                  return (
                    <div key={i} className="rounded-xl border border-white bg-white shadow-sm p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{insight.pattern}</p>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.bg} ${cat.border} ${cat.color}`}>
                          {cat.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{insight.impact}</p>
                      {insight.example && (
                        <blockquote className="text-xs italic text-gray-500 border-l-2 border-purple-300 pl-2">
                          "{insight.example}"
                        </blockquote>
                      )}
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-400"
                            style={{ width: `${insight.frequency}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">{insight.frequency}% of top calls</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!showInsights && !getBestPractices.isPending && (
          <div className="px-4 py-6 text-center text-sm text-purple-700 opacity-70">
            Click <strong>Generate Insights</strong> to discover what your best reps do differently.
          </div>
        )}
      </div>

    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
const VALID_TABS = ["upload", "my-calls", "leaderboard", "team", "opening", "performance", "manager", "feedback"] as const;
type TabId = typeof VALID_TABS[number];

export default function CallCoach() {
  const { user, loading, isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Read initial tab from URL query param (?tab=team etc.)
  const initialTab = (): TabId => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as TabId | null;
    return t && VALID_TABS.includes(t) ? t : "upload";
  };

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const utils = trpc.useUtils();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Mic className="w-12 h-12 text-teal-600 mx-auto" />
          <h2 className="text-gray-900 text-xl font-semibold">AI Call Coach</h2>
          <p className="text-gray-700">Sign in to analyse your calls</p>
          <Button asChild className="bg-teal-600 hover:bg-teal-700">
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";

  if (selectedId !== null) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <AnalysisReport
            analysisId={selectedId}
            onBack={() => setSelectedId(null)}
            onDeleted={() => { setSelectedId(null); setActiveTab("my-calls"); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Mic className="w-7 h-7 text-teal-600" />
            AI Call Coach
          </h1>
          <p className="text-gray-700 mt-1 text-sm">
            Upload a call recording — AI transcribes, analyses script compliance, and gives you actionable coaching.
          </p>
        </div>

        {/* AI Capabilities Disclaimer */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: "oklch(0.97 0.02 265)" }}>
            <span className="text-base">⚠️</span>
            <p className="text-sm font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What this AI can — and cannot — do</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200/60">
            {/* Can do */}
            <div className="px-4 py-4 space-y-2" style={{ background: "oklch(0.96 0.04 160)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>✅ Reliable — use these insights</p>
              <ul className="space-y-1.5 text-xs text-gray-800 leading-relaxed">
                <li>• <strong>Talk/listen ratio</strong> — how much of the call you spoke vs. listened (accurate)</li>
                <li>• <strong>Script stage detection</strong> — did you cover Opening, Pitch, Close? (good accuracy)</li>
                <li>• <strong>Keyword spotting</strong> — did you mention trial, subscription, price? (accurate)</li>
                <li>• <strong>Full transcript</strong> — word-for-word record of the call (95%+ accuracy)</li>
                <li>• <strong>Obvious frustration signals</strong> — strong negative language, raised objections (good)</li>
              </ul>
            </div>
            {/* Cannot do */}
            <div className="px-4 py-4 space-y-2" style={{ background: "oklch(0.97 0.03 15)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-red-600" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>❌ Unreliable — do not base decisions on these</p>
              <ul className="space-y-1.5 text-xs text-gray-800 leading-relaxed">
                <li>• <strong>Tone of voice / warmth</strong> — AI reads words, not true vocal emotion</li>
                <li>• <strong>Rapport quality</strong> — whether the customer genuinely connected with you</li>
                <li>• <strong>Subtle hesitation or sarcasm</strong> — easily missed without human context</li>
                <li>• <strong>"Why" the call was lost</strong> — AI sees patterns, not root causes</li>
                <li>• <strong>Overall rep quality</strong> — one score cannot capture a rep's full ability</li>
              </ul>
            </div>
          </div>
          <div className="px-4 py-2.5 text-xs text-gray-800 italic" style={{ background: "white" }}>
            Use this tool as a starting point for coaching conversations — not as a final verdict. Always listen to the call yourself before making performance decisions.
          </div>
        </div>

        {/* Talk Ratio Legend */}
        <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ background: "white" }}>
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2" style={{ background: "oklch(0.95 0.02 220)" }}>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-700" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>📊 Talk Ratio — What the numbers mean</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200/60">
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-600">40–65% rep speaking</p>
                <p className="text-xs text-gray-700 mt-0.5">Ideal balance — rep leads the call while giving the customer space to talk and engage.</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-600">Below 30% rep speaking</p>
                <p className="text-xs text-gray-700 mt-0.5">Rep is too passive — not driving the conversation or guiding the customer toward the close.</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-600">Above 65% rep speaking</p>
                <p className="text-xs text-gray-700 mt-0.5">Rep is talking too much — not listening enough. Customer feels talked at, not heard.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/50 rounded-lg p-1">
          {[
            { id: "upload", label: "Upload Call" },
            { id: "my-calls", label: "My Calls" },
            { id: "leaderboard", label: "🏆 Leaderboard" },
            { id: "team", label: "👥 Team" },
            { id: "opening", label: "🎯 Opening" },
            ...(isAdmin ? [{ id: "performance", label: "📊 Performance" }, { id: "manager", label: "Manager View" }, { id: "feedback", label: "🚩 AI Feedback" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-600 text-gray-900"
                  : "text-gray-700 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "upload" && (
          <UploadZone
            onUploaded={(id) => {
              utils.callCoach.getMyAnalyses.invalidate();
              setSelectedId(id);
            }}
          />
        )}
        {activeTab === "my-calls" && <MyCalls onSelect={setSelectedId} isAdmin={isAdmin} />}
        {activeTab === "leaderboard" && <Leaderboard />}
        {activeTab === "team" && <TeamDashboard />}
        {activeTab === "opening" && <OpeningDashboard />}
        {activeTab === "performance" && isAdmin && <CallTypePerformance />}
        {activeTab === "manager" && isAdmin && <ManagerDashboard onSelect={setSelectedId} />}
        {activeTab === "feedback" && isAdmin && <FeedbackReview />}
      </div>
    </div>
  );
}
