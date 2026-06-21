import { useState } from "react";
// @ts-ignore - trpc is provided by the project's lib/trpc module
import { trpc } from "@/lib/trpc";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type DateRange = "today" | "yesterday" | "7days" | "this_month" | "last_month";

// ─────────────────────────────────────────────────────────────────────────────
// Colors — identical to PerformanceTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  bgBase: "#0d1117",
  bgSurface: "#161b27",
  bgCard: "#1c2333",
  bgCardAlt: "#1e2840",
  bgHeader: "#111827",
  border: "#2a3550",
  borderLight: "#334166",
  textPrimary: "#f0f4ff",
  textSecondary: "#c8d3f0",
  green: "#22c55e",
  greenDim: "#16a34a",
  blue: "#3b82f6",
  blueDim: "#2563eb",
  red: "#ef4444",
  orange: "#f97316",
  gold: "#f59e0b",
  purple: "#a855f7",
  purpleDim: "#7c3aed",
  teal: "#14b8a6",
};

const AGENT_COLORS: Record<string, { primary: string; dim: string }> = {
  Guy: { primary: COLORS.green, dim: COLORS.greenDim },
  Rob: { primary: COLORS.blue, dim: COLORS.blueDim },
  James: { primary: COLORS.purple, dim: COLORS.purpleDim },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
interface AgentPerformanceTabProps {
  agentName: string;
}

export function AgentPerformanceTab({ agentName }: AgentPerformanceTabProps) {
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [planType, setPlanType] = useState<"all" | "installment" | "subscription" | "one_payment">("all");

  const { data, isLoading, refetch } = trpc.manager.getPerformanceData.useQuery(
    {
      dateRange,
      agents: [agentName],
      planType,
    },
    { refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div
        style={{
          background: COLORS.bgBase,
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.textPrimary,
          fontFamily: "'Inter', system-ui, sans-serif",
          borderRadius: 12,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.blue,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Loading your performance data...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const { summary, summaryDelta, agentCards } = data;
  const periodLabel = (data as any).periodLabel || "vs last month";

  // Find this agent's card (or fall back to first card)
  const card = agentCards.find((c: any) => c.agent === agentName) || agentCards[0];
  const colors = card ? (AGENT_COLORS[card.agent] || AGENT_COLORS.Guy) : AGENT_COLORS.Guy;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: COLORS.bgBase,
        minHeight: "60vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: COLORS.textPrimary,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* ═══ HEADER ═══ */}
      <div
        style={{
          background: COLORS.bgHeader,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: COLORS.green,
              boxShadow: `0 0 8px ${COLORS.green}`,
            }}
          />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: COLORS.textPrimary }}>
              My Performance
            </div>
            <div style={{ fontSize: 12, fontWeight: 400, color: COLORS.textSecondary, marginTop: 1 }}>
              Personal dashboard for {agentName} &mdash; Retention Specialist
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.green,
              letterSpacing: 0.5,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green }} />
            LIVE
          </div>
          <button
            onClick={() => refetch()}
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "6px 12px",
              color: COLORS.textSecondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ═══ FILTERS ROW ═══ */}
      <div
        style={{
          background: COLORS.bgSurface,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "10px 28px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Time Period */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Period:
          </span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.textPrimary,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7days">Last 7 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
          </select>
        </div>

        {/* Plan Type */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Plan:
          </span>
          <select
            value={planType}
            onChange={(e) => setPlanType(e.target.value as typeof planType)}
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.textPrimary,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="all">All</option>
            <option value="subscription">Subscription</option>
            <option value="installment">Instalment</option>
            <option value="one_payment">One-Time</option>
          </select>
        </div>

        {/* Locked agent indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Showing:
          </span>
          <div
            style={{
              background: `linear-gradient(135deg, ${colors.primary}22, ${colors.dim}22)`,
              border: `1px solid ${colors.primary}55`,
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 13,
              fontWeight: 700,
              color: colors.primary,
            }}
          >
            {agentName}
          </div>
        </div>
      </div>

      {/* ═══ SUMMARY TILES ═══ */}
      <div
        style={{
          background: COLORS.bgSurface,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "0 28px",
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {[
          { label: "Total Leads", value: String(summary.totalLeads), delta: summaryDelta.totalLeads, color: undefined as string | undefined, sub: undefined as string | undefined },
          { label: "Done Deals", value: String(summary.doneDeals), delta: summaryDelta.doneDeals, color: COLORS.green, sub: undefined as string | undefined },
          { label: "Conversion Rate", value: `${summary.conversionRate}%`, delta: summaryDelta.conversionRate, color: COLORS.gold, sub: undefined as string | undefined },
          { label: "Total Revenue", value: formatCurrency(summary.totalRevenue), delta: summaryDelta.totalRevenue, color: COLORS.green, sub: undefined as string | undefined },
          { label: "Future Deals", value: String(summary.futureDeals), delta: null as number | null, color: COLORS.blue, sub: `Pipeline: ${formatCurrency(summary.futureRevenue)}` },
          { label: "AOV", value: formatCurrency(summary.aov), delta: summaryDelta.aov, color: COLORS.gold, sub: undefined as string | undefined },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "16px 20px",
              borderRight: i < 5 ? `1px solid ${COLORS.border}` : "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: stat.color || COLORS.textPrimary, lineHeight: 1, letterSpacing: -0.5 }}>
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: stat.sub
                  ? COLORS.blue
                  : stat.delta !== null && stat.delta !== undefined
                  ? (stat.delta >= 0 ? COLORS.green : COLORS.red)
                  : COLORS.textSecondary,
                marginTop: 2,
              }}
            >
              {stat.sub
                ? stat.sub
                : stat.delta !== null && stat.delta !== undefined
                ? `${formatPct(stat.delta)} ${periodLabel}`
                : ""}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ padding: "24px 28px" }}>
        {!card ? (
          <div
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              padding: 40,
              textAlign: "center",
              color: COLORS.textSecondary,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: COLORS.textPrimary }}>
              No data available
            </div>
            <div style={{ fontSize: 13 }}>
              No performance data found for {agentName} in the selected period.
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 520 }}>
            {/* ── Agent Performance Card ── */}
            <div
              style={{
                background: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 28,
                boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Top accent bar */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, ${colors.primary}, ${colors.dim})`,
                  borderRadius: "14px 14px 0 0",
                }}
              />

              {/* Card Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: -0.3 }}>
                    {card.agent}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary, marginTop: 3 }}>
                    Retention Specialist
                  </div>
                </div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#fff",
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.dim})`,
                  }}
                >
                  {card.agent[0]}
                </div>
              </div>

              {/* Total Deals — big number */}
              <div
                style={{
                  textAlign: "center",
                  padding: "18px 0 16px",
                  borderTop: `1px solid ${COLORS.border}`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, letterSpacing: -3, color: colors.primary }}>
                  {card.totalDeals}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6 }}>
                  Total Deals Closed
                </div>
              </div>

              {/* Breakdown: Instalments / Future / One-Time */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-around",
                  marginBottom: 20,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 8,
                  padding: "12px 6px",
                }}
              >
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary }}>{card.installments}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Instalments
                  </div>
                </div>
                <div style={{ textAlign: "center", flex: 1, borderLeft: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.blue }}>{card.future}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Future
                  </div>
                </div>
                <div style={{ textAlign: "center", flex: 1, borderLeft: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.gold }}>{card.oneTime}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    One-Time
                  </div>
                </div>
              </div>

              {/* Financials */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Deposit Collected */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>Deposit Collected</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>{formatCurrency(card.deposit)}</span>
                </div>

                {/* Total Turn Over — green highlight */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "rgba(34,197,94,0.07)",
                    borderRadius: 7,
                    margin: "0 -4px",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>Total Turn Over</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.green }}>{formatCurrency(card.totalTurnOver)}</span>
                </div>

                {/* Future Turn Over */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>Future Turn Over</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.blue }}>{formatCurrency(card.futureTurnOver)}</span>
                </div>

                {/* Net Turn Over */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>Net Turn Over</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>{formatCurrency(card.netTurnOver)}</span>
                </div>

                {/* AOV */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>AOV</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.gold }}>{formatCurrency(card.aov)}</span>
                </div>

                {/* Declines Section */}
                <div
                  style={{
                    padding: "12px 12px",
                    background: "rgba(239,68,68,0.06)",
                    borderRadius: 7,
                    margin: "6px -4px 0",
                    border: "1px solid rgba(239,68,68,0.15)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>Declines</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.red }}>
                      {card.declinesCount}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>Remaining Amount</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.red }}>{formatCurrency(card.declineRemaining)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
