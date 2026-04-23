/**
 * ManagerCoachingDashboard
 * ─────────────────────────
 * Admin view for the "My Calls" tab.
 * Shows a coaching queue: one row per agent, sorted by urgency.
 * Each row shows the agent's most critical issue this week (from analysisJson).
 * Traffic-light colors only: green / orange / red. Black text.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Users, ChevronDown, ChevronUp, Play, ArrowRight } from "lucide-react";

// ── Color helpers ──────────────────────────────────────────────────────────────
const DOT: Record<"green" | "orange" | "red", string> = {
  green: "bg-[#16a34a]",
  orange: "bg-[#d97706]",
  red: "bg-[#dc2626]",
};
const BORDER: Record<"green" | "orange" | "red", string> = {
  green: "border-l-[#16a34a]",
  orange: "border-l-[#d97706]",
  red: "border-l-[#dc2626]",
};
const LABEL_COLOR: Record<"green" | "orange" | "red", string> = {
  green: "text-[#16a34a]",
  orange: "text-[#d97706]",
  red: "text-[#dc2626]",
};
const BADGE_BG: Record<"green" | "orange" | "red", string> = {
  green: "bg-green-50 text-[#16a34a]",
  orange: "bg-amber-50 text-[#d97706]",
  red: "bg-red-50 text-[#dc2626]",
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface IssueItem {
  category: string;
  title: string;
  quote: string | null;
  callsAffected: number;
  callId: number | null;
  status: "green" | "orange" | "red";
}

interface AgentRow {
  userId: number;
  repName: string;
  callsThisWeek: number;
  avgScore: number | null;
  closeRate: number;
  trendIndicator: "improving" | "stable" | "declining";
  urgency: "red" | "orange" | "green"; // overall urgency
  topIssue: IssueItem | null;
  allIssues: IssueItem[];
  recentCalls: Array<{
    id: number;
    callDate: string | null;
    customerName: string | null;
    overallScore: number | null;
    closeStatus: string | null;
    status: string;
  }>;
}

// ── Parse analysisJson to extract top issue ────────────────────────────────────
function extractIssues(
  calls: Array<{ id: number; analysisJson?: string | null; status: string }>
): IssueItem[] {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

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
      // Compliance issues always come first
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

// ── Agent row component ────────────────────────────────────────────────────────
function AgentCard({
  agent,
  onSelectCall,
}: {
  agent: AgentRow;
  onSelectCall: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = agent.urgency;

  const trendLabel =
    agent.trendIndicator === "improving" ? "↑ Improving" :
    agent.trendIndicator === "declining" ? "↓ Declining" : "→ Stable";
  const trendColor =
    agent.trendIndicator === "improving" ? "text-[#16a34a]" :
    agent.trendIndicator === "declining" ? "text-[#dc2626]" : "text-gray-400";

  const initials = agent.repName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${BORDER[s]} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={() => setOpen(o => !o)}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white text-sm font-black flex-shrink-0">
          {initials}
        </div>

        {/* Name + top issue */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-black text-sm">{agent.repName}</span>
            <span className="text-xs text-gray-400">{agent.callsThisWeek} calls this week</span>
          </div>
          {agent.topIssue ? (
            <div className="flex items-start gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${DOT[agent.topIssue.status]}`} />
              <span className={`text-xs font-semibold leading-snug ${LABEL_COLOR[agent.topIssue.status]}`}>
                {agent.topIssue.title}
                {agent.topIssue.callsAffected > 1 && (
                  <span className="text-gray-400 font-normal"> · {agent.topIssue.callsAffected} calls</span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
              <span className="text-xs text-[#16a34a] font-semibold">No issues this week</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-center hidden sm:block">
            <div className={`text-lg font-black ${
              agent.avgScore == null ? "text-gray-300" :
              agent.avgScore >= 75 ? "text-[#16a34a]" :
              agent.avgScore >= 55 ? "text-[#d97706]" : "text-[#dc2626]"
            }`}>
              {agent.avgScore ?? "—"}
            </div>
            <div className="text-[10px] text-gray-400 font-semibold">Score</div>
          </div>
          <div className="text-center hidden sm:block">
            <div className="text-lg font-black text-black">{agent.closeRate}%</div>
            <div className="text-[10px] text-gray-400 font-semibold">Close</div>
          </div>
          <div className={`text-xs font-bold hidden md:block ${trendColor}`}>{trendLabel}</div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded: all issues + recent calls */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50/50">
          {/* All issues */}
          {agent.allIssues.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Issues This Week
              </div>
              <div className="space-y-2">
                {agent.allIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${DOT[issue.status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider ${LABEL_COLOR[issue.status]}`}>
                          {issue.category}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_BG[issue.status]}`}>
                          {issue.callsAffected} {issue.callsAffected === 1 ? "call" : "calls"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-black mt-0.5">{issue.title}</p>
                      {issue.quote && (
                        <p className="text-xs italic text-gray-500 mt-0.5">"{issue.quote}"</p>
                      )}
                      {issue.callId && (
                        <button
                          onClick={() => onSelectCall(issue.callId!)}
                          className="flex items-center gap-1 mt-1 text-xs font-bold text-black hover:underline"
                        >
                          <Play className="w-3 h-3" /> Listen to call
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent calls */}
          {agent.recentCalls.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Recent Calls
              </div>
              <div className="space-y-1">
                {agent.recentCalls.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectCall(c.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-400 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-black truncate">
                        {c.customerName ?? "Unknown customer"}
                      </span>
                      {c.callDate && (
                        <span className="text-xs text-gray-400">
                          {new Date(c.callDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.overallScore != null && (
                        <span className={`text-xs font-black ${
                          c.overallScore >= 75 ? "text-[#16a34a]" :
                          c.overallScore >= 55 ? "text-[#d97706]" : "text-[#dc2626]"
                        }`}>{c.overallScore}</span>
                      )}
                      {c.closeStatus === "closed" && <span className="text-xs text-[#16a34a] font-bold">Closed</span>}
                      {c.closeStatus === "not_closed" && <span className="text-xs text-[#dc2626] font-bold">Not closed</span>}
                      {c.closeStatus === "follow_up" && <span className="text-xs text-[#d97706] font-bold">Follow-up</span>}
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ManagerCoachingDashboard({
  onSelectCall,
}: {
  onSelectCall: (id: number) => void;
}) {
  const { data: agents, isLoading } = trpc.callCoach.getAgentDashboard.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const { data: allAnalyses } = trpc.callCoach.getAllAnalyses.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!agents?.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No calls yet. Coaching queue will appear after agents upload calls.</p>
      </div>
    );
  }

  // Build per-agent call map from allAnalyses for issue extraction
  const callsByUserId: Record<number, Array<{ id: number; analysisJson?: string | null; status: string }>> = {};
  for (const a of allAnalyses ?? []) {
    if (!callsByUserId[a.userId]) callsByUserId[a.userId] = [];
    callsByUserId[a.userId].push({ id: a.id, analysisJson: (a as any).analysisJson ?? null, status: a.status });
  }

  // Build AgentRow objects
  const rows: AgentRow[] = agents.map(agent => {
    const calls = callsByUserId[agent.userId] ?? [];
    const allIssues = extractIssues(calls);
    const topIssue = allIssues[0] ?? null;
    const urgency: "red" | "orange" | "green" =
      topIssue?.status === "red" ? "red" :
      topIssue?.status === "orange" ? "orange" : "green";

    return {
      userId: agent.userId,
      repName: agent.repName,
      callsThisWeek: agent.callsThisWeek,
      avgScore: agent.avgScore,
      closeRate: agent.closeRate,
      trendIndicator: agent.trendIndicator,
      urgency,
      topIssue,
      allIssues,
      recentCalls: agent.recentCalls,
    };
  });

  // Sort: red first, then orange, then green
  const urgencyOrder = { red: 0, orange: 1, green: 2 };
  rows.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  // Summary stats
  const totalCallsToday = agents.reduce((s, a) => s + a.callsToday, 0);
  const totalThisWeek = agents.reduce((s, a) => s + a.callsThisWeek, 0);
  const redCount = rows.filter(r => r.urgency === "red").length;
  const orangeCount = rows.filter(r => r.urgency === "orange").length;

  return (
    <div className="space-y-5 pb-8">
      {/* ── Summary strip ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: "👥", value: agents.length, label: "Agents" },
          { icon: "📞", value: totalCallsToday, label: "Calls Today" },
          { icon: "📅", value: totalThisWeek, label: "This Week" },
          {
            icon: "🚨",
            value: redCount,
            label: "Need Attention",
            color: redCount > 0 ? "text-[#dc2626]" : "text-black",
          },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className={`text-2xl font-black ${(stat as any).color ?? "text-black"}`}>{stat.value}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Section label ── */}
      {redCount > 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-[#dc2626] px-0.5">
          🚨 Act Now — {redCount} {redCount === 1 ? "agent needs" : "agents need"} immediate attention
        </div>
      )}
      {orangeCount > 0 && redCount === 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-[#d97706] px-0.5">
          ⚠ Coach This Week — {orangeCount} {orangeCount === 1 ? "agent has" : "agents have"} issues to address
        </div>
      )}
      {redCount === 0 && orangeCount === 0 && (
        <div className="text-[10px] font-black uppercase tracking-widest text-[#16a34a] px-0.5">
          ✅ All agents are on track this week
        </div>
      )}

      {/* ── Coaching queue ── */}
      <div className="space-y-2">
        {rows.map(agent => (
          <AgentCard key={agent.userId} agent={agent} onSelectCall={onSelectCall} />
        ))}
      </div>
    </div>
  );
}
