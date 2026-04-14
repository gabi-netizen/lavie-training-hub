import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, ChevronDown, ChevronUp, Target, Zap, ShieldCheck } from "lucide-react";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const CALL_TYPE_LABELS: Record<string, string> = {
  cold_call: "Cold Call",
  follow_up: "Follow-up",
  live_sub: "Live Sub",
  pre_cycle_cancelled: "Pre-Cycle Cancelled",
  pre_cycle_decline: "Pre-Cycle Decline",
  end_of_instalment: "End of Instalment",
  from_cat: "From Cat (Escalation)",
  other: "Other",
  opening: "Opening (Legacy)",
  retention_cancel_trial: "Cancel Trial (Legacy)",
  retention_win_back: "Winback (Legacy)",
};

const TEAM_LABELS: Record<string, string> = {
  opening: "Opening Team",
  retention: "Retention Team",
};

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
] as const;

type Range = "today" | "week" | "month" | "all";

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-400 text-sm">—</span>;
  const color = score >= 75 ? "bg-emerald-100 text-emerald-800" : score >= 55 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold ${color}`}>{score}</span>;
}

function RateBadge({ rate, label }: { rate: number | null; label?: string }) {
  if (rate == null) return <span className="text-gray-400 text-sm">—</span>;
  const color = rate >= 60 ? "bg-emerald-100 text-emerald-800" : rate >= 35 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold ${color}`}>
      {rate}%{label ? ` ${label}` : ""}
    </span>
  );
}

function ProgressBar({ value, color = "bg-teal-500" }: { value: number | null; color?: string }) {
  if (value == null) return <div className="h-2 bg-gray-100 rounded-full w-full" />;
  return (
    <div className="h-2 bg-gray-100 rounded-full w-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

interface CallTypeRow {
  callType: string;
  team: "opening" | "retention";
  totalCalls: number;
  avgScore: number | null;
  saveRate: number | null;
  upsellAttemptRate: number | null;
  upsellSuccessRate: number | null;
  cancelReasons: Record<string, number>;
  byAgent: {
    userId: number;
    repName: string;
    totalCalls: number;
    avgScore: number | null;
    saveRate: number | null;
    upsellSuccessRate: number | null;
  }[];
}

function CallTypeCard({ row }: { row: CallTypeRow }) {
  const [expanded, setExpanded] = useState(false);
  const isRetention = row.team === "retention";
  const label = CALL_TYPE_LABELS[row.callType] ?? row.callType;

  const topCancelReason = Object.entries(row.cancelReasons)
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-base">{label}</span>
            <Badge variant="outline" className={`text-xs ${isRetention ? "border-purple-300 text-purple-700 bg-purple-50" : "border-teal-300 text-teal-700 bg-teal-50"}`}>
              {TEAM_LABELS[row.team]}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{row.totalCalls} calls analysed</p>
        </div>

        {/* Key metrics */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">AI Score</p>
            <ScoreBadge score={row.avgScore} />
          </div>
          {isRetention && (
            <>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Save Rate</p>
                <RateBadge rate={row.saveRate} />
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Upsell Rate</p>
                <RateBadge rate={row.upsellSuccessRate} />
              </div>
            </>
          )}
          {!isRetention && (
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Upsell</p>
              <RateBadge rate={row.upsellSuccessRate} />
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-2 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Progress bars */}
      <div className="px-5 pb-3 grid grid-cols-3 gap-4">
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>AI Score</span>
            <span>{row.avgScore ?? "—"}/100</span>
          </div>
          <ProgressBar value={row.avgScore} color={row.avgScore != null && row.avgScore >= 75 ? "bg-emerald-500" : row.avgScore != null && row.avgScore >= 55 ? "bg-amber-500" : "bg-red-500"} />
        </div>
        {isRetention && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Save Rate</span>
              <span>{row.saveRate != null ? `${row.saveRate}%` : "—"}</span>
            </div>
            <ProgressBar value={row.saveRate} color="bg-blue-500" />
          </div>
        )}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Upsell Success</span>
            <span>{row.upsellSuccessRate != null ? `${row.upsellSuccessRate}%` : "—"}</span>
          </div>
          <ProgressBar value={row.upsellSuccessRate} color="bg-purple-500" />
        </div>
      </div>

      {/* Expanded: per-agent + cancel reasons */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
          {/* Per-agent table */}
          {row.byAgent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Performance by Agent</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Agent</th>
                      <th className="pb-2 pr-4 font-medium text-center">Calls</th>
                      <th className="pb-2 pr-4 font-medium text-center">Avg Score</th>
                      {isRetention && <th className="pb-2 pr-4 font-medium text-center">Save Rate</th>}
                      <th className="pb-2 font-medium text-center">Upsell Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.byAgent.map((agent, i) => (
                      <tr key={agent.userId} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-gray-400 font-medium">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium text-gray-900">{agent.repName}</td>
                        <td className="py-2 pr-4 text-center text-gray-600">{agent.totalCalls}</td>
                        <td className="py-2 pr-4 text-center"><ScoreBadge score={agent.avgScore} /></td>
                        {isRetention && <td className="py-2 pr-4 text-center"><RateBadge rate={agent.saveRate} /></td>}
                        <td className="py-2 text-center"><RateBadge rate={agent.upsellSuccessRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cancel reasons */}
          {isRetention && Object.keys(row.cancelReasons).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Cancel Reasons</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(row.cancelReasons)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <span key={reason} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700">
                      {reason}
                      <span className="font-semibold text-gray-900">{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Upsell attempt rate */}
          {row.upsellAttemptRate != null && (
            <p className="text-xs text-gray-500">
              Upsell attempted in <span className="font-semibold text-gray-700">{row.upsellAttemptRate}%</span> of calls
              {row.upsellSuccessRate != null && (
                <> · Success rate when attempted: <span className="font-semibold text-gray-700">{row.upsellSuccessRate}%</span></>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SUMMARY CARDS ────────────────────────────────────────────────────────────
function SummaryCards({ rows }: { rows: CallTypeRow[] }) {
  const totalCalls = rows.reduce((s, r) => s + r.totalCalls, 0);
  const retentionRows = rows.filter(r => r.team === "retention");
  const openingRows = rows.filter(r => r.team === "opening");

  const avgScore = (() => {
    const scored = rows.filter(r => r.avgScore != null);
    if (!scored.length) return null;
    const weighted = scored.reduce((s, r) => s + (r.avgScore! * r.totalCalls), 0);
    const total = scored.reduce((s, r) => s + r.totalCalls, 0);
    return total > 0 ? Math.round(weighted / total) : null;
  })();

  const avgSaveRate = (() => {
    const withRate = retentionRows.filter(r => r.saveRate != null);
    if (!withRate.length) return null;
    const weighted = withRate.reduce((s, r) => s + (r.saveRate! * r.totalCalls), 0);
    const total = withRate.reduce((s, r) => s + r.totalCalls, 0);
    return total > 0 ? Math.round(weighted / total) : null;
  })();

  const avgUpsellRate = (() => {
    const withRate = rows.filter(r => r.upsellSuccessRate != null);
    if (!withRate.length) return null;
    const weighted = withRate.reduce((s, r) => s + (r.upsellSuccessRate! * r.totalCalls), 0);
    const total = withRate.reduce((s, r) => s + r.totalCalls, 0);
    return total > 0 ? Math.round(weighted / total) : null;
  })();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalCalls}</p>
              <p className="text-xs text-gray-500">Total Calls</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgScore ?? "—"}</p>
              <p className="text-xs text-gray-500">Avg AI Score</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgSaveRate != null ? `${avgSaveRate}%` : "—"}</p>
              <p className="text-xs text-gray-500">Avg Save Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgUpsellRate != null ? `${avgUpsellRate}%` : "—"}</p>
              <p className="text-xs text-gray-500">Avg Upsell Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CallTypePerformance() {
  const [range, setRange] = useState<Range>("all");
  const { data, isLoading } = trpc.callCoach.getCallTypePerformance.useQuery({ range });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const rows = data ?? [];
  const openingRows = rows.filter(r => r.team === "opening");
  const retentionRows = rows.filter(r => r.team === "retention");

  return (
    <div className="space-y-6">
      {/* Header + range filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Call Type Performance</h2>
          <p className="text-sm text-gray-500 mt-0.5">Save rates, upsell rates and AI scores broken down by call type</p>
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                range === opt.value ? "bg-teal-600 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No analysed calls yet</p>
          <p className="text-sm mt-1">Performance data will appear once calls have been analysed by AI</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <SummaryCards rows={rows} />

          {/* Opening Team */}
          {openingRows.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                Opening Team
              </h3>
              {openingRows.map(row => (
                <CallTypeCard key={row.callType} row={row} />
              ))}
            </div>
          )}

          {/* Retention Team */}
          {retentionRows.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                Retention Team
              </h3>
              {retentionRows.map(row => (
                <CallTypeCard key={row.callType} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
