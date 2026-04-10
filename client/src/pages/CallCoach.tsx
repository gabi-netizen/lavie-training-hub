import { useState, useRef, useCallback } from "react";
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
  Mic,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Users,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

// ─── ANALYSIS REPORT VIEW ─────────────────────────────────────────────────────
function AnalysisReport({ analysisId, onBack }: { analysisId: number; onBack: () => void }) {
  const [showTranscript, setShowTranscript] = useState(false);
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
          <div className={`flex items-center gap-2 text-sm mt-1 ${status.color}`}>
            {status.icon}
            <span>{status.label}</span>
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
            <div className="flex items-center gap-3 text-red-400">
              <XCircle className="w-6 h-6 flex-shrink-0" />
              <div>
                <p className="font-medium">Analysis failed</p>
                <p className="text-sm text-red-300 mt-1">{analysis.errorMessage ?? "Unknown error"}</p>
              </div>
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
          </div>
        );
      })()}
    </div>
  );
}

// ─── UPLOAD ZONE ─────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }: { onUploaded: (id: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const { analysisId } = await startAnalysis.mutateAsync({ audioFileKey: fileKey, audioFileUrl: url, fileName });
      onUploaded(analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [startAnalysis, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
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

// ─── MY CALLS LIST ────────────────────────────────────────────────────────────
function MyCalls({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: analyses, isLoading } = trpc.callCoach.getMyAnalyses.useQuery(undefined, {
    refetchInterval: 5000,
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
            <p className="text-slate-200 text-sm font-medium truncate">{a.fileName ?? "Recording"}</p>
            <p className="text-slate-500 text-xs">{new Date(a.createdAt).toLocaleString()}</p>
          </div>
          {a.overallScore != null && (
            <div className={`text-lg font-bold ${scoreColor(a.overallScore)}`}>{Math.round(a.overallScore)}</div>
          )}
          {a.status !== "done" && a.status !== "error" && (
            <span className="text-xs text-slate-500 capitalize">{a.status}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: analyses, isLoading } = trpc.callCoach.getAllAnalyses.useQuery(undefined, {
    refetchInterval: 10000,
  });

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
              {[...repCalls].reverse().slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                  onClick={() => onSelect(a.id)}
                >
                  {a.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> :
                   a.status === "error" ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> :
                   <Loader2 className="w-4 h-4 animate-spin text-teal-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm truncate">{a.fileName ?? "Recording"}</p>
                    <p className="text-slate-500 text-xs">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                  {a.overallScore != null && (
                    <span className={`text-sm font-bold ${scoreColor(a.overallScore)}`}>{Math.round(a.overallScore)}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function CallCoach() {
  const { user, loading, isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "my-calls" | "manager">("upload");
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
          <AnalysisReport analysisId={selectedId} onBack={() => setSelectedId(null)} />
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

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
          {[
            { id: "upload", label: "Upload Call" },
            { id: "my-calls", label: "My Calls" },
            ...(isAdmin ? [{ id: "manager", label: "Manager View" }] : []),
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
        {activeTab === "manager" && isAdmin && <ManagerDashboard onSelect={setSelectedId} />}
      </div>
    </div>
  );
}
