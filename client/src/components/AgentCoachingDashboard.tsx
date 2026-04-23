/**
 * AgentCoachingDashboard
 * ─────────────────────
 * Shown to non-admin reps on the "My Calls" tab.
 * Traffic-light colors only: green / orange / red.
 * Positive feedback first, then improvements.
 * Each card shows relevant calls to listen to.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Mic, ChevronDown, ChevronUp, Play } from "lucide-react";

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
const BAR_COLOR: Record<"green" | "orange" | "red", string> = {
  green: "bg-[#16a34a]",
  orange: "bg-[#d97706]",
  red: "bg-[#dc2626]",
};

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  value,
  label,
  change,
  changeDir,
}: {
  icon: string;
  value: string;
  label: string;
  change?: string;
  changeDir?: "up" | "down" | "same";
}) {
  const changeColor =
    changeDir === "up" ? "text-[#16a34a]" : changeDir === "down" ? "text-[#dc2626]" : "text-gray-400";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-3xl font-black leading-none text-black">{value}</div>
        <div className="text-xs font-semibold text-gray-500 mt-1">{label}</div>
        {change && (
          <div className={`text-xs font-bold mt-1 ${changeColor}`}>{change}</div>
        )}
      </div>
    </div>
  );
}

// ── Feedback card ──────────────────────────────────────────────────────────────
function FeedbackCard({
  item,
  onSelectCall,
}: {
  item: {
    category: string;
    status: "green" | "orange" | "red";
    title: string;
    detail: string;
    quote: string | null;
    callsAffected: number;
    relevantCallIds: number[];
  };
  onSelectCall: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = item.status;

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${BORDER[s]} overflow-hidden`}>
      {/* Header row — always visible */}
      <button
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${DOT[s]}`} />
          <div className="min-w-0">
            <div className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${LABEL_COLOR[s]}`}>
              {item.category}
            </div>
            <div className="text-sm font-bold text-black leading-snug">{item.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
            s === "green" ? "bg-green-50 text-[#16a34a]" :
            s === "orange" ? "bg-amber-50 text-[#d97706]" :
            "bg-red-50 text-[#dc2626]"
          }`}>
            {item.callsAffected} {item.callsAffected === 1 ? "call" : "calls"}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-5 pb-5 space-y-3">
          {item.quote && (
            <blockquote className="text-sm italic text-gray-500 bg-gray-50 border-l-2 border-gray-200 px-3 py-2 rounded-r-lg leading-relaxed">
              "{item.quote}"
            </blockquote>
          )}
          <p className="text-sm text-black font-medium leading-relaxed">{item.detail}</p>

          {item.relevantCallIds.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Listen to {item.relevantCallIds.length === 1 ? "this call" : "these calls"}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.relevantCallIds.map((id, i) => (
                  <button
                    key={id}
                    onClick={() => onSelectCall(id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Call {i + 1}
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

// ── Compliance checklist ───────────────────────────────────────────────────────
function ComplianceChecklist({
  items,
}: {
  items: { label: string; pct: number; status: "green" | "orange" | "red" }[];
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
        Compliance Checklist — Last 7 Days
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[item.status]}`} />
              <span className="text-sm font-medium text-black truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${BAR_COLOR[item.status]}`}
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <span className={`text-xs font-black w-8 text-right ${LABEL_COLOR[item.status]}`}>
                {item.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-0.5">
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AgentCoachingDashboard({
  onSelectCall,
}: {
  onSelectCall: (id: number) => void;
}) {
  const { data, isLoading } = trpc.callCoach.getMyCoachingDashboard.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Mic className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No calls yet. Your coaching dashboard will appear after your first call is analysed.</p>
      </div>
    );
  }

  // ── Stat helpers ──
  const scoreChange = (() => {
    if (data.avgScoreThisWeek == null || data.avgScoreLastWeek == null) return undefined;
    const diff = data.avgScoreThisWeek - data.avgScoreLastWeek;
    if (diff > 0) return { label: `↑ +${diff} vs last week`, dir: "up" as const };
    if (diff < 0) return { label: `↓ ${diff} vs last week`, dir: "down" as const };
    return { label: "Same as last week", dir: "same" as const };
  })();

  const closesChange = (() => {
    const diff = data.closesThisWeek - data.closesLastWeek;
    if (diff > 0) return { label: `↑ +${diff} vs last week`, dir: "up" as const };
    if (diff < 0) return { label: `↓ ${diff} vs last week`, dir: "down" as const };
    return { label: "Same as last week", dir: "same" as const };
  })();

  const complianceStatus: "green" | "orange" | "red" =
    data.complianceRate == null ? "green" :
    data.complianceRate >= 85 ? "green" :
    data.complianceRate >= 60 ? "orange" : "red";

  const noData = data.totalCallsThisWeek === 0;

  return (
    <div className="space-y-5 pb-8">
      {/* ── 3 Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon="🎯"
          value={String(data.closesThisWeek)}
          label="Closes This Week"
          change={closesChange?.label}
          changeDir={closesChange?.dir}
        />
        <StatCard
          icon="⭐"
          value={data.avgScoreThisWeek != null ? String(data.avgScoreThisWeek) : "—"}
          label="Avg AI Score"
          change={scoreChange?.label}
          changeDir={scoreChange?.dir}
        />
        <StatCard
          icon="✅"
          value={data.complianceRate != null ? `${data.complianceRate}%` : "—"}
          label="Compliance Rate"
          change={
            data.complianceRate == null ? undefined :
            data.complianceRate >= 85 ? "All good" :
            data.complianceRate >= 60 ? "Needs attention — see below" :
            "⚠ Fix this first — see below"
          }
          changeDir={complianceStatus === "green" ? "up" : complianceStatus === "orange" ? "same" : "down"}
        />
      </div>

      {noData && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No calls this week yet — upload a call to see your coaching feedback.
        </div>
      )}

      {!noData && (
        <>
          {/* ── What you're doing well ── */}
          {data.positives.length > 0 && (
            <div>
              <SectionLabel>💪 What you're doing well — keep it up</SectionLabel>
              <div className="space-y-2">
                {data.positives.map((item, i) => (
                  <FeedbackCard key={i} item={item} onSelectCall={onSelectCall} />
                ))}
              </div>
            </div>
          )}

          {/* ── What to work on ── */}
          {data.improvements.length > 0 && (
            <div>
              <SectionLabel>🔧 What to work on — from your last 7 days</SectionLabel>
              <div className="space-y-2">
                {data.improvements.map((item, i) => (
                  <FeedbackCard key={i} item={item} onSelectCall={onSelectCall} />
                ))}
              </div>
            </div>
          )}

          {/* ── Compliance checklist ── */}
          <ComplianceChecklist items={data.complianceChecklist} />
        </>
      )}
    </div>
  );
}
