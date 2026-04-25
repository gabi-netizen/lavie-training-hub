/**
 * AgentCoachingDashboard
 * ─────────────────────
 * Color logic: driven by item.status (performance), NOT category name.
 *   GREEN  (status="green")  → good performance / strength
 *   ORANGE (status="orange") → needs improvement (non-critical)
 *   RED    (status="red")    → critical issue / compliance
 *
 * ALL elements of a card use the SAME color:
 *   - Left border
 *   - Category label
 *   - Badge pill
 *   - Inline highlight in body text
 *   - Listen link + play icon
 *
 * Card structure (identical for all):
 *   1. Category label (colored, uppercase, bold)  +  Badge (top-right)
 *   2. Title (black, bold)
 *   3. Quote from the call (italic, dark)
 *   4. Detail text (black, first sentence colored)
 *   5. Listen link (colored, play triangle)
 *
 * Section order: IMPROVEMENTS FIRST (🔥), then POSITIVES (💪)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Mic, Play } from "lucide-react";

type CardColor = "red" | "orange" | "green" | "yellow";

// ── Color tokens ───────────────────────────────────────────────────────────────
const C = {
  red: {
    border:    "border-l-[#dc2626]",
    label:     "text-[#dc2626]",
    badge:     "bg-red-50 text-[#dc2626]",
    highlight: "text-[#dc2626] font-bold",
    link:      "text-[#dc2626] hover:opacity-80",
  },
  orange: {
    border:    "border-l-[#d97706]",
    label:     "text-[#d97706]",
    badge:     "bg-amber-50 text-[#b45309]",
    highlight: "text-[#d97706] font-bold",
    link:      "text-[#d97706] hover:opacity-80",
  },
  yellow: {
    border:    "border-l-[#ca8a04]",
    label:     "text-[#ca8a04]",
    badge:     "bg-yellow-50 text-[#854d0e]",
    highlight: "text-[#ca8a04] font-bold",
    link:      "text-[#ca8a04] hover:opacity-80",
  },
  green: {
    border:    "border-l-[#16a34a]",
    label:     "text-[#16a34a]",
    badge:     "bg-green-50 text-[#16a34a]",
    highlight: "text-[#16a34a] font-bold",
    link:      "text-[#16a34a] hover:opacity-80",
  },
} satisfies Record<CardColor, Record<string, string>>;

// ── Listen link label per color ────────────────────────────────────────────────
const LISTEN_LABEL: Record<CardColor, string> = {
  red:    "Listen to the call where this happened",
  orange: "Hear the moment you missed it",
  yellow: "Hear how it sounds",
  green:  "Listen to this call",
};

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon, value, label, change, changeDir,
}: {
  icon: string;
  value: string;
  label: string;
  change?: string;
  changeDir?: "up" | "down" | "same";
}) {
  const changeColor =
    changeDir === "up"   ? "text-[#16a34a]" :
    changeDir === "down" ? "text-[#dc2626]" :
    "text-[#d97706]";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-3xl font-black leading-none text-black">{value}</div>
        <div className="text-xs font-semibold text-black mt-1">{label}</div>
        {change && <div className={`text-xs font-bold mt-1 ${changeColor}`}>{change}</div>}
      </div>
    </div>
  );
}

// ── Detail text — first sentence in card color, rest black ────────────────────
function DetailText({ text, color }: { text: string; color: CardColor }) {
  const dot = text.indexOf(". ");
  if (dot === -1) {
    return (
      <p className="text-sm text-black leading-relaxed">
        <span className={C[color].highlight}>{text}</span>
      </p>
    );
  }
  return (
    <p className="text-sm text-black leading-relaxed">
      <span className={C[color].highlight}>{text.slice(0, dot + 1)}</span>
      {" "}{text.slice(dot + 2)}
    </p>
  );
}

// ── Feedback card ──────────────────────────────────────────────────────────────
function FeedbackCard({
  item,
  onSelectCall,
}: {
  item: {
    category: string;
    status: "green" | "orange" | "red" | "yellow";
    title: string;
    detail: string;
    quote: string | null;
    callsAffected: number;
    relevantCallIds: number[];
  };
  onSelectCall: (id: number) => void;
}) {
  const color: CardColor = item.status;
  const t = C[color];

  // Badge text logic to match mockup
  const badge = (() => {
    const cat = item.category.toUpperCase();
    if (color === "green") {
      if (cat.includes("RAPPORT")) return "Consistent strength";
      if (cat.includes("CLOSING")) return "Strong this week";
      return "Consistent strength";
    }
    if (color === "red") {
      return `${item.callsAffected} calls affected`;
    }
    if (color === "yellow") {
      return "Most calls";
    }
    // orange
    return `${item.callsAffected} of 19 calls`;
  })();

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${t.border} transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
      <div className="px-5 pt-4 pb-5 space-y-3">

        {/* Row 1: category label + badge */}
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[11px] font-black uppercase tracking-widest ${t.label}`}>
            {item.category}
          </span>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${t.badge}`}>
            {badge}
          </span>
        </div>

        {/* Row 2: title */}
        <div className="text-[15px] font-bold text-black leading-snug">
          {item.title}
        </div>

        {/* Row 3: quote */}
        {item.quote && (
          <blockquote className="text-sm italic text-gray-600 bg-gray-50 border-l-2 border-gray-300 px-3 py-2 rounded-r-lg leading-relaxed">
            "{item.quote}"
          </blockquote>
        )}

        {/* Row 4: detail */}
        <DetailText text={item.detail} color={color} />

        {/* Row 5: listen link */}
        {item.relevantCallIds.length > 0 && (
          <button
            onClick={() => onSelectCall(item.relevantCallIds[0])}
            className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${t.link}`}
          >
            <Play className="w-3 h-3 flex-shrink-0 fill-current" />
            <span>{LISTEN_LABEL[color]}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Compliance checklist ───────────────────────────────────────────────────────
function ComplianceChecklist({
  items,
}: {
  items: { label: string; pct: number; status: "green" | "orange" | "red" | "yellow" }[];
}) {
  const barColor: Record<string, string> = {
    green:  "bg-[#16a34a]",
    orange: "bg-[#d97706]",
    red:    "bg-[#dc2626]",
    yellow: "bg-[#ca8a04]",
  };
  const pctColor: Record<string, string> = {
    green:  "text-[#16a34a]",
    orange: "text-[#d97706]",
    red:    "text-[#dc2626]",
    yellow: "text-[#ca8a04]",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-black mb-4">
        📋 Compliance Checklist — Last 7 Days
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${barColor[item.status]}`} />
              <span className="text-sm font-medium text-black truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor[item.status]}`} style={{ width: `${item.pct}%` }} />
              </div>
              <span className={`text-xs font-black w-8 text-right ${pctColor[item.status]}`}>
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
    <div className="text-[10px] font-black uppercase tracking-widest text-black mb-2 px-0.5">
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
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "all">("month");

  const { data, isLoading } = trpc.callCoach.getMyCoachingDashboard.useQuery(
    { timeRange },
    { refetchInterval: 30_000 }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-black" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-black">
        <Mic className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No calls yet. Your coaching dashboard will appear after your first call is analysed.</p>
      </div>
    );
  }

  const scoreChange = (() => {
    if (data.avgScoreThisWeek == null || data.avgScoreLastWeek == null) return undefined;
    const diff = data.avgScoreThisWeek - data.avgScoreLastWeek;
    if (diff > 0) return { label: `↑ +${diff} vs last period`, dir: "up" as const };
    if (diff < 0) return { label: `↓ ${diff} vs last period`, dir: "down" as const };
    return { label: "Same as last period", dir: "same" as const };
  })();

  const closesChange = (() => {
    const diff = data.closesThisWeek - data.closesLastWeek;
    if (diff > 0) return { label: `↑ +${diff} vs last period`, dir: "up" as const };
    if (diff < 0) return { label: `↓ ${diff} vs last period`, dir: "down" as const };
    return { label: "Same as last period", dir: "same" as const };
  })();

  const complianceChangeDir: "up" | "down" | "same" =
    data.complianceRate == null ? "up" :
    data.complianceRate >= 85   ? "up" :
    data.complianceRate >= 60   ? "same" : "down";

  const noData = data.totalCallsThisWeek === 0;

  const TIME_LABELS: Record<typeof timeRange, string> = {
    today: "Today", week: "This Week", month: "This Month", all: "All Time",
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Time range filter */}
      <div className="flex gap-2 flex-wrap">
        {(["today", "week", "month", "all"] as const).map(r => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              timeRange === r
                ? "bg-black text-white border-black"
                : "bg-white text-black border-gray-300 hover:border-black"
            }`}
          >
            {TIME_LABELS[r]}
          </button>
        ))}
      </div>

      {/* 4 Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon="🎯"
          value={String(data.closesThisWeek)}
          label="Closes"
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
            data.complianceRate >= 85   ? "All good" :
            data.complianceRate >= 60   ? "Needs attention — see below" :
            "T&Cs issue — see below"
          }
          changeDir={complianceChangeDir}
        />
        <StatCard
          icon="🗣️"
          value={data.avgRepSpeechPct != null ? `${data.avgRepSpeechPct}%` : "—"}
          label="Avg Talk Time"
          change={
            data.avgRepSpeechPct == null ? undefined :
            data.avgRepSpeechPct > 65   ? "Talking too much" :
            data.avgRepSpeechPct < 30   ? "Too passive" :
            "Good ratio (40–65%)"
          }
          changeDir={
            data.avgRepSpeechPct == null ? undefined :
            data.avgRepSpeechPct > 65   ? "down" :
            data.avgRepSpeechPct < 30   ? "down" :
            "up"
          }
        />
      </div>

      {noData && (
        <div className="text-center py-8 text-black text-sm">
          No calls in this period yet — upload a call to see your coaching feedback.
        </div>
      )}

      {!noData && (
        <>
          {/* IMPROVEMENTS FIRST (red/orange/yellow) */}
          {data.improvements.length > 0 && (
            <div>
              <SectionLabel>🔥 What to work on — from your recent calls</SectionLabel>
              <div className="space-y-3">
                {data.improvements.map((item, i) => (
                  <FeedbackCard key={i} item={item as any} onSelectCall={onSelectCall} />
                ))}
              </div>
            </div>
          )}

          {/* POSITIVES SECOND (green) */}
          {data.positives.length > 0 && (
            <div>
              <SectionLabel>💪 What you're doing well — keep it up</SectionLabel>
              <div className="space-y-3">
                {data.positives.map((item, i) => (
                  <FeedbackCard key={i} item={item as any} onSelectCall={onSelectCall} />
                ))}
              </div>
            </div>
          )}

          {/* Compliance checklist */}
          <ComplianceChecklist items={data.complianceChecklist} />
        </>
      )}
    </div>
  );
}
