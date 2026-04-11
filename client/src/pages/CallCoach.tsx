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
}

// ─── CALL TYPE BADGE ─────────────────────────────────────────────────────────
function CallTypeBadge({ callType }: { callType?: string | null }) {
  if (!callType) return null;
  const map: Record<string, { label: string; cls: string }> = {
    opening: { label: "📞 Opening", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    retention_cancel_trial: { label: "🔄 Cancel Trial", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    retention_win_back: { label: "💎 Win Back", cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  };
  const info = map[callType];
  if (!info) return null;
  return <Badge className={`text-xs ${info.cls}`}>{info.label}</Badge>;
}

// ─── TALK RATIO BADGE ─────────────────────────────────────────────────────────
// repPct = % of total speech time spoken by the rep (dominant speaker)
// Ideal range: 40–60%. >65% = rep talks too much. <30% = rep too passive.
function TalkRatioBadge({ repPct }: { repPct?: number | null }) {
  if (repPct == null) return null;
  const rep = Math.round(repPct);
  const cust = 100 - rep;
  let color = "text-emerald-400";
  let barColor = "bg-emerald-500";
  let label = "Good ratio";
  if (rep > 65) { color = "text-red-400"; barColor = "bg-red-500"; label = "Rep talks too much"; }
  else if (rep < 30) { color = "text-amber-400"; barColor = "bg-amber-500"; label = "Rep too passive"; }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs border border-slate-600 rounded px-2 py-0.5 bg-slate-800/60"
      title={`Rep spoke ${rep}% of the call, customer ${cust}%`}
    >
      <span className="text-white font-medium">Talk:</span>
      {/* mini bar */}
      <span className="relative inline-block w-14 h-2 rounded-full bg-slate-700 overflow-hidden">
        <span
          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
          style={{ width: `${rep}%` }}
        />
      </span>
      <span className={`font-semibold ${color}`}>{rep}%</span>
      <span className="text-white">rep</span>
    </span>
  );
}

// ─── SCORE COLOUR ─────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 75) return "bg-emerald-500/20 border-emerald-500/40";
  if (score >= 50) return "bg-amber-500/20 border-amber-500/40";
  return "bg-red-500/20 border-red-500/40";
}

function qualityBadge(quality: "strong" | "weak" | "missing") {
  if (quality === "strong") return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">Strong</Badge>;
  if (quality === "weak") return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">Weak</Badge>;
  return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/40">Missing</Badge>;
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
      <DialogContent className="bg-[#0F1923] border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-400" />
            Flag Incorrect Analysis
          </DialogTitle>
        </DialogHeader>
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-slate-200 font-medium">Thank you for the feedback!</p>
            <p className="text-slate-400 text-sm">This helps us improve the AI over time.</p>
            <Button onClick={handleClose} className="mt-4 bg-teal-600 hover:bg-teal-500">Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Which section is incorrect?</label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger className="bg-[#1a2535] border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2535] border-slate-600">
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
                <label className="text-slate-300 text-sm mb-1.5 block">What's wrong? <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={issue}
                  onChange={e => setIssue(e.target.value)}
                  placeholder="e.g. Score is too high, the rep didn't actually close"
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  maxLength={512}
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Additional notes (optional)</label>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Any extra context that would help improve the AI..."
                  className="bg-[#1a2535] border-slate-600 text-white placeholder:text-slate-500 resize-none"
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} className="text-slate-400">Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!issue.trim() || submitFeedback.isPending}
                className="bg-amber-600 hover:bg-amber-500 text-white"
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
  const [callType, setCallType] = useState<"opening" | "retention_cancel_trial" | "retention_win_back">(
    (initialCallType as "opening" | "retention_cancel_trial" | "retention_win_back") ?? "opening"
  );
  const [saved, setSaved] = useState(false);

  // Sync form state whenever the modal opens (handles reopening with fresh data)
  useEffect(() => {
    if (open) {
      setRepName(initialRepName ?? "");
      setCallDate(initialCallDate ? new Date(initialCallDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      setCloseStatus((initialCloseStatus as "closed" | "not_closed" | "follow_up") ?? "not_closed");
      setCustomerName(initialCustomerName ?? "");
      setCallType((initialCallType as "opening" | "retention_cancel_trial" | "retention_win_back") ?? "opening");
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
      <DialogContent className="bg-[#0F1923] border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Call Details</DialogTitle>
        </DialogHeader>
        {saved ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-slate-200 font-medium">Details updated!</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Auto-extracted from call, or enter manually"
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Rep Name</label>
                <input
                  type="text"
                  value={repName}
                  onChange={e => setRepName(e.target.value)}
                  placeholder="Rep name"
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Call Date</label>
                <input
                  type="date"
                  value={callDate}
                  onChange={e => setCallDate(e.target.value)}
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Call Type</label>
                <select
                  value={callType}
                  onChange={e => setCallType(e.target.value as typeof callType)}
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="opening">📞 Opening</option>
                  <option value="retention_cancel_trial">🔄 Cancel Trial</option>
                  <option value="retention_win_back">💎 Win Back</option>
                </select>
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1.5 block">Close Status</label>
                <select
                  value={closeStatus}
                  onChange={e => setCloseStatus(e.target.value as typeof closeStatus)}
                  className="w-full bg-[#1a2535] border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="closed">✅ Closed</option>
                  <option value="not_closed">❌ Not Closed</option>
                  <option value="follow_up">🔄 Follow-up</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} className="text-slate-400">Cancel</Button>
              <Button
                onClick={() => updateDetails.mutate({ id: analysisId, repName, callDate, closeStatus, customerName: customerName || undefined, callType })}
                disabled={updateDetails.isPending}
                className="bg-teal-600 hover:bg-teal-500 text-white"
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
function AnalysisReport({ analysisId, onBack, onDeleted }: { analysisId: number; onBack: () => void; onDeleted?: () => void }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
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
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  const statusMap = {
    pending: { icon: <Clock className="w-5 h-5 text-slate-400" />, label: "Queued", color: "text-slate-400" },
    transcribing: { icon: <Loader2 className="w-5 h-5 animate-spin text-blue-400" />, label: "Transcribing audio...", color: "text-blue-400" },
    analyzing: { icon: <Loader2 className="w-5 h-5 animate-spin text-teal-400" />, label: "AI is analysing...", color: "text-teal-400" },
    done: { icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />, label: "Complete", color: "text-emerald-400" },
    error: { icon: <XCircle className="w-5 h-5 text-red-400" />, label: "Error", color: "text-red-400" },
  };

  const status = statusMap[analysis.status as keyof typeof statusMap];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-white">{analysis.fileName ?? "Call Recording"}</h2>
          {analysis.customerName && (
            <p className="text-sm text-teal-300 font-medium mt-0.5">
              👤 {analysis.customerName}
              {!analysis.repName && !analysis.callDate && !analysis.closeStatus ? null : <span className="text-slate-500 font-normal"> (customer)</span>}
            </p>
          )}
          {(analysis.repName || analysis.callDate || analysis.closeStatus) && (
            <p className="text-xs text-slate-400 mt-0.5">
              {analysis.repName && <span>{analysis.repName}</span>}
              {analysis.callDate && <span>{analysis.repName ? " · " : ""}{new Date(analysis.callDate).toLocaleDateString()}</span>}
              {analysis.closeStatus && <span>{(analysis.repName || analysis.callDate) ? " · " : ""}{{ closed: "✅ Closed", not_closed: "❌ Not Closed", follow_up: "🔄 Follow-up" }[analysis.closeStatus] ?? ""}</span>}
            </p>
          )}
          {(analysis.callType || analysis.repSpeechPct != null) && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <CallTypeBadge callType={analysis.callType} />
              <TalkRatioBadge repPct={analysis.repSpeechPct} />
            </div>
          )}
          {analysis.lastEditedByName && (
            <p className="text-xs text-slate-500 mt-0.5 italic">
              Last edited by {analysis.lastEditedByName}{analysis.lastEditedAt ? ` · ${new Date(analysis.lastEditedAt).toLocaleString()}` : ""}
            </p>
          )}
          <div className={`flex items-center gap-2 text-sm mt-1 ${status.color}`}>
            {status.icon}
            <span>{status.label}</span>
          <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEditModal(true)}
          className="text-slate-400 hover:text-teal-400 text-xs border border-slate-700 hover:border-teal-500"
        >
          ✏️ Edit Details
        </Button>
          {analysis.durationSeconds && (
              <span className="text-slate-500 ml-2">
                · {Math.floor((analysis.durationSeconds ?? 0) / 60)}m {Math.round((analysis.durationSeconds ?? 0) % 60)}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Processing states */}
      {(analysis.status === "pending" || analysis.status === "transcribing" || analysis.status === "analyzing") && (
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-teal-400 mx-auto" />
            <p className="text-slate-300 text-lg">{status.label}</p>
            <p className="text-slate-500 text-sm">This usually takes 30–90 seconds depending on call length.</p>
          </CardContent>
        </Card>
      )}

      {analysis.status === "error" && (
        <Card className="bg-red-900/20 border-red-500/40">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 text-red-400">
              <XCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Analysis failed</p>
                <p className="text-sm text-red-300 mt-1 break-words">{analysis.errorMessage ?? "Unknown error"}</p>
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
                className="text-red-400 hover:text-red-300 hover:bg-red-900/40 border border-red-500/40 text-xs"
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Overall Score", value: report.overallScore, icon: <Star className="w-5 h-5" /> },
                { label: "Script Compliance", value: report.scriptComplianceScore, icon: <CheckCircle2 className="w-5 h-5" /> },
                { label: "Tone & Confidence", value: report.toneScore, icon: <Mic className="w-5 h-5" /> },
                { label: "Rep Speech %", value: analysis.repSpeechPct ?? 0, icon: <BarChart3 className="w-5 h-5" /> },
              ].map(({ label, value, icon }) => (
                <Card key={label} className={`bg-[#0F1923] border ${scoreBg(value ?? 0)}`}>
                  <CardContent className="p-4 text-center">
                    <div className={`flex justify-center mb-2 ${scoreColor(value ?? 0)}`}>{icon}</div>
                    <div className={`text-3xl font-bold ${scoreColor(value ?? 0)}`}>{Math.round(value ?? 0)}</div>
                    <div className="text-xs text-slate-400 mt-1">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={report.closingAttempted ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"}>
                {report.closingAttempted ? "✓ Close attempted" : "✗ No close attempt"}
              </Badge>
              <Badge className={report.magicWandUsed ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>
                {report.magicWandUsed ? "✓ Magic Wand used" : "✗ Magic Wand missed"}
              </Badge>
            </div>

            {/* Summary */}
            <Card className="bg-[#0F1923] border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-200 leading-relaxed">{report.summary}</p>
              </CardContent>
            </Card>

            {/* Top 3 Recommendations */}
            <Card className="bg-[#0F1923] border-teal-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-teal-400 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Top 3 Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.topRecommendations.map((rec, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <p className="text-slate-200 text-sm leading-relaxed">{rec}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Script Stages */}
            <Card className="bg-[#0F1923] border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Script Stage Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.stagesDetected.map((stage) => (
                  <div key={stage.stage} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{qualityBadge(stage.quality)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm font-medium">{stage.stage}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{stage.note}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-[#0F1923] border-emerald-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-emerald-400 text-sm">What Worked Well</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-[#0F1923] border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-400 text-sm">Areas to Improve</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.improvements.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm text-slate-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Key Moments */}
            {report.keyMoments?.length > 0 && (
              <Card className="bg-[#0F1923] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Key Moments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.keyMoments.map((km, i) => (
                    <div key={i} className={`rounded-lg p-3 border ${
                      km.type === "positive" ? "bg-emerald-500/10 border-emerald-500/30" :
                      km.type === "critical" ? "bg-red-500/10 border-red-500/30" :
                      "bg-amber-500/10 border-amber-500/30"
                    }`}>
                      <p className="text-slate-200 text-sm italic">"{km.moment}"</p>
                      <p className="text-slate-400 text-xs mt-2">💡 {km.coaching}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Transcript toggle */}
            {analysis.transcript && (
              <Card className="bg-[#0F1923] border-slate-700">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowTranscript(!showTranscript)}>
                  <CardTitle className="text-sm text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Full Transcript</span>
                    {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </CardTitle>
                </CardHeader>
                {showTranscript && (
                  <CardContent>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">{analysis.transcript}</p>
                  </CardContent>
                )}
              </Card>
            )}
          {/* Flag as Incorrect button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFlagModal(true)}
              className="text-white bg-blue-700 hover:bg-blue-600 hover:text-white gap-2 border border-blue-500"
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
  const [callType, setCallType] = useState<"opening" | "retention_cancel_trial" | "retention_win_back">("opening");
  const inputRef = useRef<HTMLInputElement>(null);
  const startAnalysis = trpc.callCoach.startAnalysis.useMutation();

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
        callType,
      });
      onUploaded(analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [startAnalysis, onUploaded, repName, callDate, closeStatus, callType]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {/* Metadata fields */}
      <Card className="bg-[#0F1923] border-slate-700">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Call Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Rep Name</label>
              <input
                type="text"
                value={repName}
                onChange={e => setRepName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Call Date</label>
              <input
                type="date"
                value={callDate}
                onChange={e => setCallDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Close Status</label>
              <select
                value={closeStatus}
                onChange={e => setCloseStatus(e.target.value as typeof closeStatus)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="closed">✅ Closed</option>
                <option value="not_closed">❌ Not Closed</option>
                <option value="follow_up">🔄 Follow-up</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Call Type</label>
              <select
                value={callType}
                onChange={e => setCallType(e.target.value as typeof callType)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="opening">📞 Opening</option>
                <option value="retention_cancel_trial">🔄 Cancel Trial</option>
                <option value="retention_win_back">💎 Win Back</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          isDragging ? "border-teal-400 bg-teal-400/10" : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/30"
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
            <Loader2 className="w-12 h-12 animate-spin text-teal-400 mx-auto" />
            <p className="text-teal-400 font-medium">Uploading & starting analysis...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-12 h-12 text-slate-500 mx-auto" />
            <div>
              <p className="text-slate-200 font-medium">Drop your call recording here</p>
              <p className="text-slate-500 text-sm mt-1">or click to browse · MP3, WAV, M4A, OGG, WebM · max 50MB</p>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── MY CALLS LIST ─────────────────────────────────────────────────────────────
function MyCalls({ onSelect }: { onSelect: (id: number) => void }) {
  const utils = trpc.useUtils();
  const { data: analyses, isLoading } = trpc.callCoach.getMyAnalyses.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const deleteAnalysis = trpc.callCoach.deleteAnalysis.useMutation({
    onSuccess: () => {
      utils.callCoach.getMyAnalyses.invalidate();
      utils.callCoach.getAllAnalyses.invalidate();
    },
  });
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>;
  if (!analyses?.length) return (
    <div className="text-center py-12 text-slate-500">
      <Mic className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No calls analysed yet. Upload your first recording above.</p>
    </div>
  );

  const statusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Loader2 className="w-4 h-4 animate-spin text-teal-400" />;
  };

  return (
    <div className="space-y-2">
        {[...analyses].reverse().map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-4 p-4 rounded-lg bg-[#0F1923] border border-slate-700 hover:border-slate-600 cursor-pointer transition-colors"
          onClick={() => onSelect(a.id)}
        >
          {statusIcon(a.status)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-slate-200 text-sm font-medium truncate">{a.fileName ?? "Recording"}</p>
              <CallTypeBadge callType={a.callType} />
              <TalkRatioBadge repPct={a.repSpeechPct} />
            </div>
            <p className="text-slate-500 text-xs">{new Date(a.createdAt).toLocaleString()}</p>
          </div>
          {a.overallScore != null && (
            <div className={`text-lg font-bold ${scoreColor(a.overallScore)}`}>{Math.round(a.overallScore)}</div>
          )}
          {a.status !== "done" && a.status !== "error" && (
            <span className="text-xs text-slate-500 capitalize">{a.status}</span>
          )}
          {a.status === "error" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this failed call? This cannot be undone.")) {
                  deleteAnalysis.mutate({ id: a.id });
                }
              }}
              disabled={deleteAnalysis.isPending}
              className="text-red-400 hover:text-red-300 text-xs border border-red-500/40 rounded px-2 py-1 hover:bg-red-900/30 transition-colors flex-shrink-0"
              title="Delete failed call"
            >
              🗑️
            </button>
          )}
        </div>
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

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>;
  if (!analyses?.length) return (
    <div className="text-center py-12 text-slate-500">
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
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-teal-400">{analyses.length}</div>
            <div className="text-xs text-slate-400 mt-1">Total Calls</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore || "—"}</div>
            <div className="text-xs text-slate-400 mt-1">Team Avg Score</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-200">{Object.keys(byRep).length}</div>
            <div className="text-xs text-slate-400 mt-1">Active Reps</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-rep breakdown */}
      {Object.entries(byRep).map(([repName, repCalls]) => {
        const repDone = repCalls.filter(a => a.status === "done");
        const repAvg = repDone.length ? Math.round(repDone.reduce((s, a) => s + (a.overallScore ?? 0), 0) / repDone.length) : null;
        return (
          <Card key={repName} className="bg-[#0F1923] border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-200 text-base">{repName}</CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{repCalls.length} calls</span>
                  {repAvg != null && (
                    <span className={`text-lg font-bold ${scoreColor(repAvg)}`}>{repAvg} avg</span>
                  )}
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
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                        onClick={() => onSelect(a.id)}
                      >
                        {a.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> :
                         a.status === "error" ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> :
                         <Loader2 className="w-4 h-4 animate-spin text-teal-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-slate-300 text-sm truncate">{a.fileName ?? "Recording"}</p>
                            <CallTypeBadge callType={a.callType} />
                            <TalkRatioBadge repPct={a.repSpeechPct} />
                          </div>
                          <p className="text-slate-500 text-xs">
                            {a.customerName && <span className="text-teal-400/80">👤 {a.customerName} · </span>}
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
                        className="w-full text-xs text-teal-400 hover:text-teal-300 py-1.5 text-center transition-colors"
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

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>;
  if (!entries?.length) return (
    <div className="text-center py-12 text-slate-500">
      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No calls analysed yet. Be the first to upload!</p>
      <p className="text-xs mt-2 text-slate-600">Minimum 5 calls required for a reliable ranking.</p>
    </div>
  );

  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

  // Find most improved (reliable entries only, with upward trend)
  const mostImproved = entries.filter(e => e.isReliable && e.trend === "up")[0];

  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-500" />;
  };

  const closeStatusLabel = (rate: number) => {
    if (rate >= 60) return <span className="text-emerald-400">{rate}%</span>;
    if (rate >= 30) return <span className="text-amber-400">{rate}%</span>;
    return <span className="text-red-400">{rate}%</span>;
  };

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="text-xs text-slate-500 italic text-center">
        Rankings are based on AI scores only. Minimum 5 analysed calls required for a reliable ranking.
        <br />Reps with fewer than 5 calls are shown but marked as unranked.
      </div>

      {/* Most Improved badge */}
      {mostImproved && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <span className="text-2xl">\uD83D\uDE80</span>
          <div>
            <p className="text-emerald-400 text-sm font-bold">Most Improved</p>
            <p className="text-slate-300 text-sm">{mostImproved.repName} — score trending up over last 6 calls</p>
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
                ? "bg-amber-500/10 border-amber-500/30"
                : i === 1 && entry.isReliable
                ? "bg-slate-400/10 border-slate-400/30"
                : i === 2 && entry.isReliable
                ? "bg-orange-500/10 border-orange-500/30"
                : "bg-[#0F1923] border-slate-700"
            }`}
          >
            {/* Rank */}
            <div className="w-8 text-center flex-shrink-0">
              {entry.isReliable && i < 3
                ? <span className="text-xl">{medals[i]}</span>
                : <span className="text-slate-500 text-sm font-bold">#{i + 1}</span>
              }
            </div>

            {/* Name & stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-slate-200 font-semibold text-sm">{entry.repName}</p>
                {!entry.isReliable && (
                  <Badge className="text-xs bg-slate-700/50 text-slate-400 border-slate-600">Unranked &lt;5 calls</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-500">{entry.totalCalls} calls</span>
                <span className="text-xs text-slate-500">Close rate: {closeStatusLabel(entry.closeRate)}</span>
              </div>
            </div>

            {/* Score & trend */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {trendIcon(entry.trend)}
              {entry.avgScore != null
                ? <span className={`text-xl font-bold ${scoreColor(entry.avgScore)}`}>{entry.avgScore}</span>
                : <span className="text-slate-500 text-sm">—</span>
              }
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

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>;
  if (!feedbacks?.length) return (
    <div className="text-center py-12 text-slate-500">
      <Flag className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>No feedback submitted yet.</p>
      <p className="text-xs mt-2 text-slate-600">When reps flag incorrect analysis, it will appear here.</p>
    </div>
  );

  const sectionColors: Record<string, string> = {
    overall: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    script_compliance: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    tone: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    talk_ratio: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    recommendations: "bg-teal-500/20 text-teal-300 border-teal-500/40",
    transcript: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    other: "bg-slate-500/20 text-slate-300 border-slate-500/40",
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
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{feedbacks.length}</div>
            <div className="text-xs text-slate-400 mt-1">Total Flags</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0F1923] border-slate-700">
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold text-slate-200 capitalize">{topSection?.[0]?.replace("_", " ") ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-1">Most Flagged Section</div>
          </CardContent>
        </Card>
      </div>

      {/* Tip for improvement */}
      <div className="rounded-lg bg-teal-500/10 border border-teal-500/30 p-4 text-sm text-teal-300">
        💡 <strong>How to use this:</strong> Review the flags below, identify patterns, and share them with the AI trainer to improve the prompt. After 10+ flags, patterns become clear.
      </div>

      {/* Feedback list */}
      <div className="space-y-3">
        {[...feedbacks].reverse().map((f) => (
          <Card key={f.id} className="bg-[#0F1923] border-slate-700">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={sectionColors[f.section] ?? sectionColors.other}>{f.section.replace("_", " ")}</Badge>
                <span className="text-xs text-slate-500">{new Date(f.createdAt).toLocaleString()}</span>
                <span className="text-xs text-slate-500">· Call #{f.analysisId}</span>
              </div>
              <p className="text-slate-200 text-sm font-medium">{f.issue}</p>
              {f.comment && <p className="text-slate-400 text-xs leading-relaxed">{f.comment}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function CallCoach() {
  const { user, loading, isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "my-calls" | "leaderboard" | "manager" | "feedback">("upload");
  const utils = trpc.useUtils();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Mic className="w-12 h-12 text-teal-400 mx-auto" />
          <h2 className="text-white text-xl font-semibold">AI Call Coach</h2>
          <p className="text-slate-400">Sign in to analyse your calls</p>
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
      <div className="min-h-screen bg-[#0A1628] p-4 md:p-8">
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
    <div className="min-h-screen bg-[#0A1628] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Mic className="w-7 h-7 text-teal-400" />
            AI Call Coach
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Upload a call recording — AI transcribes, analyses script compliance, and gives you actionable coaching.
          </p>
        </div>

        {/* AI Capabilities Disclaimer */}
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: "oklch(0.18 0.04 250)" }}>
            <span className="text-base">⚠️</span>
            <p className="text-sm font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What this AI can — and cannot — do</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-700/60">
            {/* Can do */}
            <div className="px-4 py-4 space-y-2" style={{ background: "oklch(0.15 0.04 160 / 60%)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>✅ Reliable — use these insights</p>
              <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed">
                <li>• <strong>Talk/listen ratio</strong> — how much of the call you spoke vs. listened (accurate)</li>
                <li>• <strong>Script stage detection</strong> — did you cover Opening, Pitch, Close? (good accuracy)</li>
                <li>• <strong>Keyword spotting</strong> — did you mention trial, subscription, price? (accurate)</li>
                <li>• <strong>Full transcript</strong> — word-for-word record of the call (95%+ accuracy)</li>
                <li>• <strong>Obvious frustration signals</strong> — strong negative language, raised objections (good)</li>
              </ul>
            </div>
            {/* Cannot do */}
            <div className="px-4 py-4 space-y-2" style={{ background: "oklch(0.15 0.04 15 / 50%)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-red-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>❌ Unreliable — do not base decisions on these</p>
              <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed">
                <li>• <strong>Tone of voice / warmth</strong> — AI reads words, not true vocal emotion</li>
                <li>• <strong>Rapport quality</strong> — whether the customer genuinely connected with you</li>
                <li>• <strong>Subtle hesitation or sarcasm</strong> — easily missed without human context</li>
                <li>• <strong>"Why" the call was lost</strong> — AI sees patterns, not root causes</li>
                <li>• <strong>Overall rep quality</strong> — one score cannot capture a rep's full ability</li>
              </ul>
            </div>
          </div>
          <div className="px-4 py-2.5 text-xs text-slate-500 italic" style={{ background: "oklch(0.14 0.02 250)" }}>
            Use this tool as a starting point for coaching conversations — not as a final verdict. Always listen to the call yourself before making performance decisions.
          </div>
        </div>

        {/* Talk Ratio Legend */}
        <div className="rounded-xl border border-slate-700 overflow-hidden" style={{ background: "oklch(0.13 0.03 220 / 80%)" }}>
          <div className="px-4 py-2.5 border-b border-slate-700/60 flex items-center gap-2" style={{ background: "oklch(0.16 0.04 220 / 60%)" }}>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-200" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>📊 Talk Ratio — What the numbers mean</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-700/60">
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-400">40–65% rep speaking</p>
                <p className="text-xs text-slate-400 mt-0.5">Ideal balance — rep leads the call while giving the customer space to talk and engage.</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-400">Above 65% rep speaking</p>
                <p className="text-xs text-slate-400 mt-0.5">Rep is talking too much — not listening enough. Customer feels talked at, not heard.</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Below 30% rep speaking</p>
                <p className="text-xs text-slate-400 mt-0.5">Rep is too passive — not driving the conversation or guiding the customer toward the close.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
          {[
            { id: "upload", label: "Upload Call" },
            { id: "my-calls", label: "My Calls" },
            { id: "leaderboard", label: "\uD83C\uDFC6 Leaderboard" },
            ...(isAdmin ? [{ id: "manager", label: "Manager View" }, { id: "feedback", label: "🚩 AI Feedback" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
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
        {activeTab === "my-calls" && <MyCalls onSelect={setSelectedId} />}
        {activeTab === "leaderboard" && <Leaderboard />}
        {activeTab === "manager" && isAdmin && <ManagerDashboard onSelect={setSelectedId} />}
        {activeTab === "feedback" && isAdmin && <FeedbackReview />}
      </div>
    </div>
  );
}
