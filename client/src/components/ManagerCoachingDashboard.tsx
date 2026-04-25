/**
 * ManagerCoachingDashboard
 * ─────────────────────────
 * Visual grid dashboard showing one card per agent.
 * Each card: avatar, name, calls analyzed, avg AI score (color-coded),
 * top issue, trend indicator. Clicking navigates to that agent's Agent View.
 *
 * Color rules:
 *   Score > 70  → green
 *   Score 40-70 → amber
 *   Score < 40  → red
 *
 * Text: dark readable colors only (text-gray-800 / text-slate-800 primary,
 * text-gray-600 secondary). NEVER text-gray-400 or lighter for readable text.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Users, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface IssueItem {
  category: string;
  title: string;
  quote: string | null;
  callsAffected: number;
  callId: number | null;
  status: "green" | "orange" | "red";
}

// ── Parse analysisJson to extract top issue ────────────────────────────────────
function extractIssues(
  calls: Array<{ id: number; analysisJson?: string | null; status: string }>
): IssueItem[] {
  const issueCounts: Record<string, { count: number; callId: number; quote: string | null; category: string }> = {};

  for (const call of calls) {
    if (call.status !== "done" || !call.analysisJson) continue;
    try {
      const r = JSON.parse(call.analysisJson);

      // Compliance issues first (most critical)
      if (r.subscriptionMisrepresented) {
        const key = "Subscription misrepresented to customer";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: null, category: "Compliance" };
        issueCounts[key].count++;
      }
      if (!r.tcRead) {
        const key = "T&Cs not read aloud";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: null, category: "Compliance" };
        issueCounts[key].count++;
      }
      if (!r.subscriptionDisclosed) {
        const key = "Subscription not clearly explained";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: null, category: "Compliance" };
        issueCounts[key].count++;
      }

      // Key moments — negative/critical
      for (const km of r.keyMoments ?? []) {
        if (km.type === "negative" || km.type === "critical") {
          const key = km.coaching.slice(0, 80);
          if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: km.moment ?? null, category: "Coaching" };
          issueCounts[key].count++;
        }
      }

      // Top improvements
      for (const imp of r.improvements ?? []) {
        const key = imp.slice(0, 80);
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: null, category: "Improvement" };
        issueCounts[key].count++;
      }

      // 8-dimension coaching checks
      if (r.rapportScore != null && r.rapportScore < 60) {
        const key = "Low rapport — not building personal connection";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.rapportQuote ?? null, category: "Rapport" };
        issueCounts[key].count++;
      }
      if (r.excitementScore != null && r.excitementScore < 60) {
        const key = "Product pitch too technical — not creating desire";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.excitementQuote ?? null, category: "Excitement" };
        issueCounts[key].count++;
      }
      if (r.silenceAfterClose === false) {
        const key = "Filling the silence after the close";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.silenceQuote ?? null, category: "Silence" };
        issueCounts[key].count++;
      }
      if (r.callControl != null && r.callControl < 60) {
        const key = "Losing control of the conversation";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.callControlQuote ?? null, category: "Call Control" };
        issueCounts[key].count++;
      }
      if (r.authenticityScore != null && r.authenticityScore < 60) {
        const key = "Sounding scripted — overusing filler words";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.authenticityQuote ?? null, category: "Authenticity" };
        issueCounts[key].count++;
      }
      if (r.objectionHandlingScore != null && r.objectionHandlingScore < 60) {
        const key = "Giving up on objections too quickly";
        if (!issueCounts[key]) issueCounts[key] = { count: 0, callId: call.id, quote: r.objectionHandlingQuote ?? null, category: "Objections" };
        issueCounts[key].count++;
      }
    } catch { /* skip */ }
  }

  const totalDone = calls.filter(c => c.status === "done").length;

  return Object.entries(issueCounts)
    .sort((a, b) => {
      const aIsCompliance = a[1].category === "Compliance";
      const bIsCompliance = b[1].category === "Compliance";
      if (aIsCompliance && !bIsCompliance) return -1;
      if (!aIsCompliance && bIsCompliance) return 1;
      return b[1].count - a[1].count;
    })
    .slice(0, 5)
    .map(([title, val]) => {
      const pct = totalDone > 0 ? val.count / totalDone : 0;
      const isCompliance = val.category === "Compliance";
      const status: "red" | "orange" | "green" =
        isCompliance ? "red" :
        pct >= 0.5 ? "red" :
        pct >= 0.25 ? "orange" : "green";
      return {
        category: val.category,
        title,
        quote: val.quote,
        callsAffected: val.count,
        callId: val.callId,
        status,
      };
    });
}

// ── Score color helpers (green >70, amber 40-70, red <40) ─────────────────────
function getScoreColor(score: number | null): string {
  if (score == null) return "text-gray-600";
  if (score > 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function getScoreBg(score: number | null): string {
  if (score == null) return "bg-gray-100";
  if (score > 70) return "bg-emerald-50";
  if (score >= 40) return "bg-amber-50";
  return "bg-red-50";
}

function getScoreBorder(score: number | null): string {
  if (score == null) return "border-gray-200";
  if (score > 70) return "border-emerald-200";
  if (score >= 40) return "border-amber-200";
  return "border-red-200";
}

// ── Deterministic avatar colors ───────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-blue-600", "bg-teal-600",
  "bg-emerald-600", "bg-rose-600", "bg-orange-600", "bg-cyan-600",
  "bg-fuchsia-600", "bg-sky-600", "bg-purple-600", "bg-pink-600",
  "bg-lime-700", "bg-amber-700",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Trend indicator component ─────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: "improving" | "stable" | "declining" }) {
  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
        <TrendingUp className="w-3 h-3" /> Improving
      </span>
    );
  }
  if (trend === "declining") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <TrendingDown className="w-3 h-3" /> Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
      <Minus className="w-3 h-3" /> Stable
    </span>
  );
}

// ── Agent card component ──────────────────────────────────────────────────────
function AgentGridCard({
  agent,
  topIssue,
  onClick,
}: {
  agent: {
    userId: number;
    repName: string;
    totalCalls: number;
    avgScore: number | null;
    trendIndicator: "improving" | "stable" | "declining";
    callsThisWeek: number;
  };
  topIssue: IssueItem | null;
  onClick: () => void;
}) {
  const initials = agent.repName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarColor = getAvatarColor(agent.repName);
  const scoreBg = getScoreBg(agent.avgScore);
  const scoreBorder = getScoreBorder(agent.avgScore);
  const scoreColor = getScoreColor(agent.avgScore);

  const doneCalls = agent.totalCalls; // totalCalls from the dashboard already represents the filtered range

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl border ${scoreBorder} p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer group`}
    >
      {/* Top row: avatar + name + trend */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm`}>
            {initials}
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition-colors">
              {agent.repName}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {doneCalls} {doneCalls === 1 ? "call" : "calls"} analyzed
            </div>
          </div>
        </div>
      </div>

      {/* Score + trend row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className={`${scoreBg} rounded-xl px-3 py-2 flex items-center gap-2`}>
          <span className="text-xs font-semibold text-gray-600">AI Score</span>
          <span className={`text-xl font-black ${scoreColor}`}>
            {agent.avgScore ?? "—"}
          </span>
        </div>
        <TrendBadge trend={agent.trendIndicator} />
      </div>

      {/* Top issue */}
      {topIssue ? (
        <div className="flex items-start gap-2 mt-2">
          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
            topIssue.status === "red" ? "text-red-500" :
            topIssue.status === "orange" ? "text-amber-500" : "text-emerald-500"
          }`} />
          <span className="text-xs text-gray-600 leading-snug line-clamp-2">
            {topIssue.title}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs text-emerald-600 font-semibold">No issues detected</span>
        </div>
      )}
    </button>
  );
}

// ── Team section header ───────────────────────────────────────────────────────
function TeamSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-widest text-gray-600 mb-3 px-0.5">
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ManagerCoachingDashboard({
  onSelectCall,
}: {
  onSelectCall: (id: number) => void;
}) {
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "all">("month");
  const { data: agents, isLoading } = trpc.callCoach.getAgentDashboard.useQuery({ timeRange }, {
    refetchInterval: 10_000,
  });
  const { data: allAnalyses } = trpc.callCoach.getAllAnalyses.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const { data: agentList } = trpc.callCoach.getAgentList.useQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
      </div>
    );
  }

  // Build per-agent call map from allAnalyses for issue extraction
  const callsByUserId: Record<number, Array<{ id: number; analysisJson?: string | null; status: string }>> = {};
  for (const a of allAnalyses ?? []) {
    if (!callsByUserId[a.userId]) callsByUserId[a.userId] = [];
    callsByUserId[a.userId].push({ id: a.id, analysisJson: (a as any).analysisJson ?? null, status: a.status });
  }

  // Build agent data with issues
  type AgentCardData = {
    userId: number;
    repName: string;
    totalCalls: number;
    avgScore: number | null;
    trendIndicator: "improving" | "stable" | "declining";
    callsThisWeek: number;
    topIssue: IssueItem | null;
    team: string | null;
  };

  const agentCards: AgentCardData[] = [];

  // All known agents from agentList (includes agents with 0 calls)
  const agentListMap = new Map((agentList ?? []).map(a => [a.id, a]));
  const agentDashboardMap = new Map((agents ?? []).map(a => [a.userId, a]));

  // Start with agents who have call data
  const processedUserIds = new Set<number>();

  for (const agent of agents ?? []) {
    processedUserIds.add(agent.userId);
    const calls = callsByUserId[agent.userId] ?? [];
    const allIssues = extractIssues(calls);
    const topIssue = allIssues[0] ?? null;

    agentCards.push({
      userId: agent.userId,
      repName: agent.repName,
      totalCalls: agent.totalCalls,
      avgScore: agent.avgScore,
      trendIndicator: agent.trendIndicator,
      callsThisWeek: agent.callsThisWeek,
      topIssue,
      team: null, // will be resolved below
    });
  }

  // Add agents from agentList who have no calls yet
  for (const agent of agentList ?? []) {
    if (!processedUserIds.has(agent.id)) {
      agentCards.push({
        userId: agent.id,
        repName: agent.name ?? `Agent #${agent.id}`,
        totalCalls: 0,
        avgScore: null,
        trendIndicator: "stable",
        callsThisWeek: 0,
        topIssue: null,
        team: null,
      });
    }
  }

  // Sort: agents with issues first, then by score (lowest first for attention), then alphabetical
  agentCards.sort((a, b) => {
    // Agents with red issues first
    const aUrgency = a.topIssue?.status === "red" ? 0 : a.topIssue?.status === "orange" ? 1 : 2;
    const bUrgency = b.topIssue?.status === "red" ? 0 : b.topIssue?.status === "orange" ? 1 : 2;
    if (aUrgency !== bUrgency) return aUrgency - bUrgency;
    // Then by score (lowest first for attention)
    const aScore = a.avgScore ?? 999;
    const bScore = b.avgScore ?? 999;
    if (aScore !== bScore) return aScore - bScore;
    // Then alphabetical
    return a.repName.localeCompare(b.repName);
  });

  // Navigate to agent's coaching view
  const goToAgentView = (userId: number) => {
    window.location.href = `/ai-coach?tab=my-calls&agentId=${userId}`;
  };

  // Summary stats
  const totalAgents = agentCards.length;
  const totalCalls = agentCards.reduce((s, a) => s + a.totalCalls, 0);
  const agentsWithScores = agentCards.filter(a => a.avgScore != null);
  const teamAvgScore = agentsWithScores.length > 0
    ? Math.round(agentsWithScores.reduce((s, a) => s + (a.avgScore ?? 0), 0) / agentsWithScores.length)
    : null;
  const redCount = agentCards.filter(a => a.topIssue?.status === "red").length;
  const decliningCount = agentCards.filter(a => a.trendIndicator === "declining").length;

  const TIME_LABELS: Record<typeof timeRange, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    all: "All Time",
  };

  return (
    <div className="space-y-5 pb-8">
      {/* ── Time range filter ── */}
      <div className="flex gap-2 flex-wrap">
        {(["today", "week", "month", "all"] as const).map(r => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              timeRange === r
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
            }`}
          >
            {TIME_LABELS[r]}
          </button>
        ))}
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: "👥", value: totalAgents, label: "Agents", color: "text-gray-800" },
          { icon: "📞", value: totalCalls, label: "Calls Analyzed", color: "text-gray-800" },
          {
            icon: "⭐",
            value: teamAvgScore ?? "—",
            label: "Team Avg Score",
            color: teamAvgScore != null ? getScoreColor(teamAvgScore) : "text-gray-600",
          },
          {
            icon: "🚨",
            value: redCount,
            label: "Need Attention",
            color: redCount > 0 ? "text-red-600" : "text-emerald-600",
          },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] font-semibold text-gray-600 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Status message ── */}
      {redCount > 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-red-600 px-0.5">
          🚨 {redCount} {redCount === 1 ? "agent needs" : "agents need"} immediate attention
        </div>
      )}
      {decliningCount > 0 && redCount === 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 px-0.5">
          ⚠ {decliningCount} {decliningCount === 1 ? "agent is" : "agents are"} declining — review their calls
        </div>
      )}
      {redCount === 0 && decliningCount === 0 && agentCards.length > 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 px-0.5">
          ✅ All agents are on track
        </div>
      )}

      {/* ── Agent grid ── */}
      {agentCards.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No agents found. Coaching cards will appear after agents are added.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentCards.map(agent => (
            <AgentGridCard
              key={agent.userId}
              agent={agent}
              topIssue={agent.topIssue}
              onClick={() => goToAgentView(agent.userId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
