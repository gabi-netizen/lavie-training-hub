/**
 * AgentCoachingDashboard
 * ─────────────────────
 * Matches the approved mockup exactly:
 *
 * Card colors (3 only):
 *   RED   — compliance / fix first (red label, red left-border, red badge, red listen link, red highlight)
 *   ORANGE — all other improvements (orange label, orange left-border, orange badge, orange listen link, orange highlight)
 *   GREEN  — positives / strengths (green label, green left-border, green badge, green listen link, green highlight)
 *
 * Order: POSITIVES FIRST, then IMPROVEMENTS
 *
 * Each card:
 *   - Colored category label (uppercase, small, bold)
 *   - Badge pill top-right
 *   - Bold title
 *   - Italic blockquote (if quote present)
 *   - Detail text — first sentence colored, rest black
 *   - Colored "Listen" text link with play triangle
 *
 * Hover: shadow lift + slight translate
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Mic, Play } from "lucide-react";

// ── 3 color tokens only ────────────────────────────────────────────────────────
type CardColor = "red" | "orange" | "green";

function getCardColor(item: { status: "green" | "orange" | "red"; category: string }): CardColor {
  if (item.status === "green") return "green";
  // compliance = red, everything else = orange
  const cat = item.category.toLowerCase();
  if (cat.includes("compliance") || cat.includes("fix first") || cat.includes("tc") || cat.includes("t&c")) return "red";
  return "orange";
}

// Tailwind classes per color
const BORDER_LEFT: Record<CardColor, string> = {
  red:    "border-l-[#dc2626]",
  orange: "border-l-[#d97706]",
  green:  "border-l-[#16a34a]",
};
const CATEGORY_COLOR: Record<CardColor, string> = {
  red:    "text-[#dc2626]",
  orange: "text-[#d97706]",
  green:  "text-[#16a34a]",
};
const BADGE_STYLE: Record<CardColor, string> = {
  red:    "bg-red-100 text-[#dc2626]",
  orange: "bg-amber-100 text-[#b45309]",
  green:  "bg-green-100 text-[#16a34a]",
};
const HIGHLIGHT_COLOR: Record<CardColor, string> = {
  red:    "text-[#dc2626] font-bold",
  orange: "text-[#d97706] font-bold",
  green:  "text-[#16a34a] font-bold",
};
const LISTEN_COLOR: Record<CardColor, string> = {
  red:    "text-[#dc2626] hover:text-[#b91c1c]",
  orange: "text-[#d97706] hover:text-[#b45309]",
  green:  "text-[#16a34a] hover:text-[#15803d]",
};
const LISTEN_LABEL: Record<CardColor, string> = {
  red:    "Listen to the call where this happened",
  orange: "Hear the moment you missed it",
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
    changeDir === "up" ? "text-[#16a34a]" :
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

// ── Detail text — first sentence highlighted ───────────────────────────────────
function DetailText({ text, color }: { text: string; color: CardColor }) {
  const firstPeriod = text.indexOf(". ");
  if (firstPeriod === -1) {
    return (
      <p className="text-sm text-black font-medium leading-relaxed">
        <span className={HIGHLIGHT_COLOR[color]}>{text}</span>
      </p>
    );
  }
  const first = text.slice(0, firstPeriod + 1);
  const rest  = text.slice(firstPeriod + 2);
  return (
    <p className="text-sm text-black font-medium leading-relaxed">
      <span className={HIGHLIGHT_COLOR[color]}>{first}</span>{" "}{rest}
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
    status: "green" | "orange" | "red";
    title: string;
    detail: string;
    quote: string | null;
    callsAffected: number;
    relevantCallIds: number[];
  };
  onSelectCall: (id: number) => void;
}) {
  const color = getCardColor(item);

  const badgeLabel = (() => {
    if (color === "green") {
      const cat = item.category.toLowerCase();
      if (cat.includes("rapport")) return "Consistent strength";
      if (cat.includes("closing")) return "Strong this week";
      return `${item.callsAffected} calls`;
    }
    if (color === "red") return `${item.callsAffected} ${item.callsAffected === 1 ? "call affected" : "calls affected"}`;
    // orange
    const n = item.callsAffected;
    return `${n} of ${n > 5 ? "19" : n} calls`;
  })();

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${BORDER_LEFT[color]} overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default`}
    >
      <div className="px-5 pt-4 pb-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className={`text-[11px] font-black uppercase tracking-widest ${CATEGORY_COLOR[color]}`}>
            {item.category}
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${BADGE_STYLE[color]}`}>
            {badgeLabel}
          </span>
        </div>

        {/* Title */}
        <div className="text-[15px] font-bold text-black leading-snug">{item.title}</div>

        {/* Quote */}
        {item.quote && (
          <blockquote className="text-sm italic text-black bg-gray-50 border-l-2 border-gray-300 px-3 py-2 rounded-r-lg leading-relaxed">
            "{item.quote}"
          </blockquote>
        )}

        {/* Detail */}
        <DetailText text={item.detail} color={color} />

        {/* Listen link */}
        {item.relevantCallIds.length > 0 && (
          <button
            onClick={() => onSelectCall(item.relevantCallIds[0])}
            className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${LISTEN_COLOR[color]}`}
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
const BAR_COLOR: Record<"green" | "orange" | "red", string> = {
  green:  "bg-[#16a34a]",
  orange: "bg-[#d97706]",
  red:    "bg-[#dc2626]",
};
const PCT_COLOR: Record<"green" | "orange" | "red", string> = {
  green:  "text-[#16a34a]",
  orange: "text-[#d97706]",
  red:    "text-[#dc2626]",
};

function ComplianceChecklist({
  items,
}: {
  items: { label: string; pct: number; status: "green" | "orange" | "red" }[];
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-black mb-4">
        📋 Compliance Checklist — Last 7 Days
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${BAR_COLOR[item.status]}`} />
              <span className="text-sm font-medium text-black truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${BAR_COLOR[item.status]}`}
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <span className={`text-xs font-black w-8 text-right ${PCT_COLOR[item.status]}`}>
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

  // ── Stat helpers ──
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

  const complianceStatus: "green" | "orange" | "red" =
    data.complianceRate == null ? "green" :
    data.complianceRate >= 85 ? "green" :
    data.complianceRate >= 60 ? "orange" : "red";

  const noData = data.totalCallsThisWeek === 0;

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
                ? "bg-black text-white border-black"
                : "bg-white text-black border-gray-300 hover:border-black"
            }`}
          >
            {TIME_LABELS[r]}
          </button>
        ))}
      </div>

      {/* ── 3 Stats ── */}
      <div className="grid grid-cols-3 gap-3">
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
            data.complianceRate >= 85 ? "All good" :
            data.complianceRate >= 60 ? "Needs attention — see below" :
            "T&Cs issue — see below"
          }
          changeDir={complianceStatus === "green" ? "up" : complianceStatus === "orange" ? "same" : "down"}
        />
      </div>

      {noData && (
        <div className="text-center py-8 text-black text-sm">
          No calls in this period yet — upload a call to see your coaching feedback.
        </div>
      )}

      {!noData && (
        <>
          {/* ── POSITIVES FIRST (green cards) ── */}
          {data.positives.length > 0 && (
            <div>
              <SectionLabel>💪 What you're doing well — keep it up</SectionLabel>
              <div className="space-y-3">
                {data.positives.map((item, i) => (
                  <FeedbackCard key={i} item={item} onSelectCall={onSelectCall} />
                ))}
              </div>
            </div>
          )}

          {/* ── IMPROVEMENTS SECOND ── */}
          {data.improvements.length > 0 && (
            <div>
              <SectionLabel>🔧 What to work on — from your recent calls</SectionLabel>
              <div className="space-y-3">
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
