import { useState, useMemo } from "react";
// @ts-ignore - trpc is provided by the project's lib/trpc module
import { trpc } from "@/lib/trpc";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type DateRange = "today" | "yesterday" | "7days" | "this_month" | "last_month" | "custom";

interface DrillDownItem {
  id: number;
  customerName: string;
  email: string;
  phone: string | null;
  leadType: string;
  planName: string;
  amount: number;
  eventDate: string;
  workStatus: string;
  assignedAgent: string;
}

interface DrillDownSub {
  id: number;
  customerName: string;
  email: string;
  phone: string | null;
  leadType: string;
  planType: string;
  planName: string;
  amount: number;
  eventDate: string;
  status: string;
  salesPerson: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Variables (inline styles matching the mockup)
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
export function PerformanceTab({ agentFilter }: { agentFilter?: string } = {}) {
  // ─── Filter State ──────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>(agentFilter ? [agentFilter] : []);
  const [planType, setPlanType] = useState<"all" | "installment" | "subscription" | "one_payment">("all");

  // ─── Drill-down Modal State ────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalType, setModalType] = useState<"leads" | "subs">("leads");
  const [modalFilter, setModalFilter] = useState<{
    agent?: string;
    leadType?: string;
    workStatus?: string;
    planType?: string;
    status?: string;
  }>({});

  // ─── Data Query ────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = trpc.manager.getPerformanceData.useQuery(
    {
      dateRange,
      dateFrom: dateRange === "custom" ? customFrom : undefined,
      dateTo: dateRange === "custom" ? customTo : undefined,
      agents: selectedAgents.length > 0 ? selectedAgents : undefined,
      planType,
    },
    { refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  // ─── Drill-down filtered data ──────────────────────────────────────────────
  const modalData = useMemo(() => {
    if (!data) return [];
    if (modalType === "leads") {
      let items = data.drillDown as DrillDownItem[];
      if (modalFilter.agent) items = items.filter((i) => i.assignedAgent === modalFilter.agent);
      if (modalFilter.leadType) items = items.filter((i) => i.leadType === modalFilter.leadType);
      if (modalFilter.workStatus) {
        const statuses = modalFilter.workStatus.split(",");
        items = items.filter((i) => statuses.includes(i.workStatus));
      }
      return items;
    } else {
      let items = (data.drillDownSubs || []) as DrillDownSub[];
      if (modalFilter.agent) items = items.filter((i) => i.salesPerson === modalFilter.agent);
      if (modalFilter.planType) items = items.filter((i) => i.planType === modalFilter.planType);
      if (modalFilter.status) items = items.filter((i) => i.status === modalFilter.status);
      return items;
    }
  }, [data, modalType, modalFilter]);

  function openDrillDown(
    title: string,
    type: "leads" | "subs",
    filter: typeof modalFilter
  ) {
    setModalTitle(title);
    setModalType(type);
    setModalFilter(filter);
    setModalOpen(true);
  }

  // ─── Agent multi-select toggle ─────────────────────────────────────────────
  function toggleAgent(agent: string) {
    setSelectedAgents((prev) =>
      prev.includes(agent) ? prev.filter((a) => a !== agent) : [...prev, agent]
    );
  }

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div
        style={{
          background: COLORS.bgBase,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.textPrimary,
          fontFamily: "'Inter', system-ui, sans-serif",
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
          <div style={{ fontSize: 14, fontWeight: 500 }}>Loading performance data...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const { summary, summaryDelta, agentCards, conversionByLeadType, conversionByAgent } = data;
  const periodLabel = data.periodLabel || "vs last month";

  // ─── Lead type dot colors ──────────────────────────────────────────────────
  const leadTypeDotColor: Record<string, string> = {
    "Cat to Rob": COLORS.green,
    "Pre-Cycle-Cancelled": COLORS.gold,
    "Cancel Live Sub (Cycle 1)": COLORS.gold,
    "Cancel Live Sub (Cycle 2+)": COLORS.orange,
    "Pre-Cycle-Decline": COLORS.red,
    "Decline Live Sub": COLORS.red,
    "Hot Lead": "#6b7280",
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: COLORS.bgBase, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: COLORS.textPrimary }}>
      {/* ═══ HEADER ═══ */}
      <header
        style={{
          background: COLORS.bgHeader,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: COLORS.textPrimary }}>
              Retention Performance
            </div>
            <div style={{ fontSize: 12, fontWeight: 400, color: COLORS.textSecondary, marginTop: 1 }}>
              Real-time agent performance & lead conversion tracking
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 6,
              padding: "5px 10px",
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
              padding: "7px 12px",
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
      </header>

      {/* ═══ FILTERS ROW ═══ */}
      <div
        style={{
          background: COLORS.bgSurface,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "12px 32px",
          display: "flex",
          alignItems: "center",
          gap: 16,
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
              padding: "7px 14px",
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
            <option value="custom">Custom</option>
          </select>
          {dateRange === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.borderLight}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: COLORS.textPrimary,
                  outline: "none",
                }}
              />
              <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.borderLight}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: COLORS.textPrimary,
                  outline: "none",
                }}
              />
            </>
          )}
        </div>

        {/* Agent Multi-select */}
        {!agentFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Agents:
          </span>
          {["Guy", "Rob", "James"].map((agent) => (
            <button
              key={agent}
              onClick={() => toggleAgent(agent)}
              style={{
                background: selectedAgents.includes(agent)
                  ? AGENT_COLORS[agent].primary
                  : COLORS.bgCard,
                border: `1px solid ${selectedAgents.includes(agent) ? AGENT_COLORS[agent].primary : COLORS.borderLight}`,
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: selectedAgents.includes(agent) ? "#fff" : COLORS.textPrimary,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {agent}
            </button>
          ))}
          {selectedAgents.length > 0 && (
            <button
              onClick={() => setSelectedAgents([])}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.textSecondary,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear
            </button>
          )}
        </div>
        )}

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
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.textPrimary,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="all">All</option>
            <option value="installment">Instalment</option>
            <option value="subscription">Subscription</option>
            <option value="one_payment">One-Time</option>
          </select>
        </div>
      </div>

      {/* ═══ SUMMARY STATS ROW ═══ */}
      <div
        style={{
          background: COLORS.bgSurface,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "0 32px",
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {[
          { label: "Total Leads", value: String(summary.totalLeads), delta: summaryDelta.totalLeads, color: undefined },
          { label: "Done Deals", value: String(summary.doneDeals), delta: summaryDelta.doneDeals, color: COLORS.green },
          { label: "Conversion Rate", value: `${summary.conversionRate}%`, delta: summaryDelta.conversionRate, color: COLORS.gold },
          { label: "Total Revenue", value: formatCurrency(summary.totalRevenue), delta: summaryDelta.totalRevenue, color: COLORS.green },
          { label: "Future Deals", value: String(summary.futureDeals), delta: summaryDelta.futureDeals, color: COLORS.blue, showPipelineValue: true },
          { label: "AOV", value: formatCurrency(summary.aov), delta: summaryDelta.aov, color: undefined },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "18px 24px",
              borderRight: i < 5 ? `1px solid ${COLORS.border}` : "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              cursor: "pointer",
            }}
            onClick={() => {
              if (stat.label === "Total Leads") openDrillDown("All Leads", "leads", {});
              else if (stat.label === "Done Deals") openDrillDown("Done Deals", "subs", {});
              else if (stat.label === "Future Deals") openDrillDown("Future Deals", "subs", { status: "future" });
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color || COLORS.textPrimary, lineHeight: 1, letterSpacing: -0.5 }}>
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: (stat as any).showPipelineValue ? COLORS.blue : (stat.delta >= 0 ? COLORS.green : COLORS.red),
                marginTop: 2,
              }}
            >
              {(stat as any).showPipelineValue
                ? `Pipeline value: ${formatCurrency(summary.futureRevenue)}`
                : `${formatPct(stat.delta)} ${periodLabel}`}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <main style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
        {/* ── SECTION 1: Agent Performance Cards ── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.textPrimary,
                textTransform: "uppercase",
                letterSpacing: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ width: 3, height: 16, background: COLORS.blue, borderRadius: 2 }} />
              Agent Performance
            </div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 500 }}>
              {agentCards.length} active agents &middot; {agentCards.reduce((s: number, a: any) => s + a.totalDeals, 0)} total deals closed
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {agentCards.map((card: any) => {
              const colors = AGENT_COLORS[card.agent] || AGENT_COLORS.Guy;
              return (
                <div
                  key={card.agent}
                  style={{
                    background: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 14,
                    padding: 24,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
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

                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: -0.3 }}>
                        {card.agent}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textSecondary, marginTop: 2 }}>
                        Retention Specialist
                      </div>
                    </div>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#fff",
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.dim})`,
                      }}
                    >
                      {card.agent[0]}
                    </div>
                  </div>

                  {/* Total Deals */}
                  <div
                    style={{
                      textAlign: "center",
                      padding: "16px 0 14px",
                      borderTop: `1px solid ${COLORS.border}`,
                      borderBottom: `1px solid ${COLORS.border}`,
                      marginBottom: 16,
                      cursor: "pointer",
                    }}
                    onClick={() => openDrillDown(`${card.agent} - All Deals`, "subs", { agent: card.agent })}
                  >
                    <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: -2, color: colors.primary }}>
                      {card.totalDeals}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>
                      Total Deals Closed
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-around",
                      marginBottom: 18,
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 8,
                      padding: "10px 6px",
                    }}
                  >
                    <div
                      style={{ textAlign: "center", flex: 1, cursor: "pointer" }}
                      onClick={() => openDrillDown(`${card.agent} - Instalments`, "subs", { agent: card.agent, planType: "installment" })}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary }}>{card.installments}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Instalments
                      </div>
                    </div>
                    <div
                      style={{ textAlign: "center", flex: 1, borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                      onClick={() => openDrillDown(`${card.agent} - Subscriptions`, "subs", { agent: card.agent, planType: "subscription" })}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.teal }}>{card.subscriptions}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Subs
                      </div>
                    </div>
                    <div
                      style={{ textAlign: "center", flex: 1, borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                      onClick={() => openDrillDown(`${card.agent} - Future`, "subs", { agent: card.agent, status: "future" })}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.blue }}>{card.future}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Future
                      </div>
                    </div>
                    <div
                      style={{ textAlign: "center", flex: 1, borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                      onClick={() => openDrillDown(`${card.agent} - One-Time`, "subs", { agent: card.agent, planType: "one_payment" })}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.gold }}>{card.oneTime}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        One-Time
                      </div>
                    </div>
                  </div>

                  {/* Financials */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>Deposit Collected</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{formatCurrency(card.deposit)}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        background: "rgba(34,197,94,0.06)",
                        borderRadius: 6,
                        margin: "0 -4px",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>Total Turn Over</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.green }}>{formatCurrency(card.totalTurnOver)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>Future Turn Over</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue }}>{formatCurrency(card.futureTurnOver)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>Net Turn Over</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{formatCurrency(card.netTurnOver)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>AOV</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold }}>{formatCurrency(card.aov)}</span>
                    </div>

                    {/* Declines Section */}
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 10px",
                        background: "rgba(239,68,68,0.06)",
                        borderRadius: 6,
                        margin: "8px -4px 0",
                        border: "1px solid rgba(239,68,68,0.15)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>Declines</span>
                        <span
                          style={{ fontSize: 15, fontWeight: 700, color: COLORS.red, cursor: "pointer" }}
                          onClick={() =>
                            openDrillDown(`${card.agent} - Declines`, "leads", {
                              agent: card.agent,
                              leadType: "Pre-Cycle-Decline,Decline Live Sub",
                            })
                          }
                        >
                          {card.declinesCount}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textSecondary }}>Remaining Amount</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.red }}>{formatCurrency(card.declineRemaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Deal Type Distribution (Horizontal Bars) ── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.textPrimary,
                textTransform: "uppercase",
                letterSpacing: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ width: 3, height: 16, background: COLORS.gold, borderRadius: 2 }} />
              Deal Type Distribution
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "#ffffff" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.green }} />
                Instalments
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "#ffffff" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.teal }} />
                Subs
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "#ffffff" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(59,130,246,0.6)" }} />
                Future
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "#ffffff" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.gold }} />
                One-Time
              </div>
            </div>
          </div>

          <div
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              padding: "20px 24px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {agentCards.map((card: any) => {
              const colors = AGENT_COLORS[card.agent] || AGENT_COLORS.Guy;
              const total = card.totalDeals || 1;
              const instPct = Math.round((card.installments / total) * 100);
              const subsPct = Math.round(((card.subscriptions || 0) / total) * 100);
              const futPct = Math.round((card.future / total) * 100);
              const otPct = Math.round((card.oneTime / total) * 100);
              return (
                <div key={card.agent}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#ffffff" }}>{card.agent}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#ffffff" }}>{card.totalDeals} deals</span>
                  </div>
                  <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                    {card.installments > 0 && (
                      <div
                        style={{
                          flex: card.installments,
                          background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.greenDim})`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                        onClick={() => openDrillDown(`${card.agent} - Instalments`, "subs", { agent: card.agent, planType: "installment" })}
                      >
                        {card.installments} ({instPct}%)
                      </div>
                    )}
                    {(card.subscriptions || 0) > 0 && (
                      <div
                        style={{
                          flex: card.subscriptions,
                          background: `linear-gradient(90deg, ${COLORS.teal}, #0d9488)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                        onClick={() => openDrillDown(`${card.agent} - Subscriptions`, "subs", { agent: card.agent, planType: "subscription" })}
                      >
                        {card.subscriptions} ({subsPct}%)
                      </div>
                    )}
                    {card.future > 0 && (
                      <div
                        style={{
                          flex: card.future,
                          background: `rgba(59,130,246,0.4)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                        onClick={() => openDrillDown(`${card.agent} - Future`, "subs", { agent: card.agent, status: "future" })}
                      >
                        {card.future} ({futPct}%)
                      </div>
                    )}
                    {card.oneTime > 0 && (
                      <div
                        style={{
                          flex: card.oneTime,
                          background: `linear-gradient(90deg, ${COLORS.gold}, #d97706)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                        onClick={() => openDrillDown(`${card.agent} - One-Time`, "subs", { agent: card.agent, planType: "one_payment" })}
                      >
                        {card.oneTime} ({otPct}%)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECTION 2 + 3: Tables Row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          {/* Conversion by Lead Type */}
          <div
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                padding: "16px 22px",
                borderBottom: `1px solid ${COLORS.border}`,
                background: COLORS.bgCardAlt,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Conversion by Lead Type
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                {summary.totalLeads} total leads
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Lead Type", "Leads In", "Done Deal", "Lost", "Conversion"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "11px 18px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: COLORS.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.9,
                        textAlign: i === 0 ? "left" : "right",
                        background: "rgba(255,255,255,0.02)",
                        borderBottom: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversionByLeadType.map((row: any) => {
                  const pct = row.conversionPct;
                  const pctColor = pct >= 50 ? COLORS.green : pct >= 20 ? COLORS.gold : pct > 0 ? COLORS.orange : COLORS.red;
                  return (
                    <tr
                      key={row.leadType}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <td
                        style={{ padding: "12px 18px", fontSize: 13, fontWeight: 500, color: COLORS.textPrimary, cursor: "pointer" }}
                        onClick={() => openDrillDown(`${row.leadType} - All Leads`, "leads", { leadType: row.leadType })}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                          <div
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: leadTypeDotColor[row.leadType] || "#6b7280",
                              flexShrink: 0,
                            }}
                          />
                          {row.leadType}
                        </div>
                      </td>
                      <td
                        style={{ padding: "12px 18px", fontSize: 13, fontWeight: 500, color: COLORS.textPrimary, textAlign: "right", cursor: "pointer" }}
                        onClick={() => openDrillDown(`${row.leadType} - All Leads`, "leads", { leadType: row.leadType })}
                      >
                        {row.leadsIn}
                      </td>
                      <td
                        style={{ padding: "12px 18px", fontSize: 13, fontWeight: 700, color: COLORS.green, textAlign: "right", cursor: "pointer" }}
                        onClick={() => openDrillDown(`${row.leadType} - Done Deals`, "leads", { leadType: row.leadType, workStatus: "done_deal,future_deal" })}
                      >
                        {row.doneDeal}
                      </td>
                      <td
                        style={{ padding: "12px 18px", fontSize: 13, fontWeight: 600, color: COLORS.red, textAlign: "right", cursor: "pointer" }}
                        onClick={() => openDrillDown(`${row.leadType} - Lost`, "leads", { leadType: row.leadType, workStatus: "closed,not_interested" })}
                      >
                        {row.lost}
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                          <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right", color: pctColor }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Conversion by Agent */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                background: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
              }}
            >
              <div
                style={{
                  padding: "16px 22px",
                  borderBottom: `1px solid ${COLORS.border}`,
                  background: COLORS.bgCardAlt,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Conversion by Agent
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Agent", "Assigned", "Deals", "Conv. %"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "11px 18px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: COLORS.textSecondary,
                          textTransform: "uppercase",
                          letterSpacing: 0.9,
                          textAlign: i === 0 ? "left" : "right",
                          background: "rgba(255,255,255,0.02)",
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversionByAgent
                    .sort((a: any, b: any) => b.conversionPct - a.conversionPct)
                    .map((row: any, idx: number) => {
                      const colors = AGENT_COLORS[row.agent] || AGENT_COLORS.Guy;
                      const pctColor = row.conversionPct >= 50 ? COLORS.green : row.conversionPct >= 30 ? COLORS.gold : COLORS.orange;
                      return (
                        <tr
                          key={row.agent}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                          onClick={() => openDrillDown(`${row.agent} - All Leads`, "leads", { agent: row.agent })}
                        >
                          <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 500, color: COLORS.textPrimary }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: colors.primary, flexShrink: 0 }} />
                              <span style={{ fontWeight: 600 }}>{row.agent}</span>
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: idx === 0 ? "rgba(168,85,247,0.15)" : "rgba(245,158,11,0.15)",
                                  color: idx === 0 ? COLORS.purple : COLORS.gold,
                                  border: `1px solid ${idx === 0 ? "rgba(168,85,247,0.3)" : "rgba(245,158,11,0.3)"}`,
                                }}
                              >
                                {idx + 1}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 500, color: COLORS.textPrimary, textAlign: "right" }}>
                            {row.assigned}
                          </td>
                          <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 700, color: COLORS.green, textAlign: "right" }}>
                            {row.deals}
                          </td>
                          <td style={{ padding: "12px 18px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                              <div style={{ width: 50, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${row.conversionPct}%`, background: colors.primary, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right", color: pctColor }}>
                                {row.conversionPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer
        style={{
          padding: "16px 32px",
          borderTop: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: COLORS.textSecondary,
          background: COLORS.bgSurface,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green }} />
          <span>Last updated: {new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span style={{ color: COLORS.borderLight }}>|</span>
          <span>Data source: CRM & Billing System</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Retention Command Centre</span>
          <span style={{ color: COLORS.borderLight }}>v2.4</span>
        </div>
      </footer>

      {/* ═══ DRILL-DOWN MODAL ═══ */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              width: "90%",
              maxWidth: 900,
              maxHeight: "80vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: COLORS.bgCardAlt,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>{modalTitle}</div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{modalData.length} records</div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: COLORS.textSecondary,
                  fontSize: 18,
                }}
              >
                x
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflow: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {modalType === "leads"
                      ? ["Customer Name", "Email", "Phone", "Lead Type", "Amount", "Date", "Status", "Agent"].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              padding: "10px 14px",
                              fontSize: 10,
                              fontWeight: 700,
                              color: COLORS.textSecondary,
                              textTransform: "uppercase",
                              letterSpacing: 0.8,
                              textAlign: "left",
                              background: "rgba(255,255,255,0.02)",
                              borderBottom: `1px solid ${COLORS.border}`,
                              position: "sticky",
                              top: 0,
                              zIndex: 1,
                            }}
                          >
                            {h}
                          </th>
                        ))
                      : ["Customer Name", "Email", "Phone", "Plan Type", "Plan Name", "Amount", "Date", "Status", "Agent"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "10px 14px",
                              fontSize: 10,
                              fontWeight: 700,
                              color: COLORS.textSecondary,
                              textTransform: "uppercase",
                              letterSpacing: 0.8,
                              textAlign: "left",
                              background: "rgba(255,255,255,0.02)",
                              borderBottom: `1px solid ${COLORS.border}`,
                              position: "sticky",
                              top: 0,
                              zIndex: 1,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody>
                  {modalType === "leads"
                    ? (modalData as DrillDownItem[]).map((item) => (
                        <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.customerName}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.email}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.phone || "-"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.leadType}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{formatCurrency(item.amount)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.eventDate}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.workStatus}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.assignedAgent}</td>
                        </tr>
                      ))
                    : (modalData as DrillDownSub[]).map((item) => (
                        <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.customerName}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.email}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.phone || "-"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.planType}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.planName}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{formatCurrency(item.amount)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.eventDate}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.status}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.salesPerson}</td>
                        </tr>
                      ))}
                  {modalData.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{ padding: "40px 14px", fontSize: 13, fontWeight: 500, color: COLORS.textSecondary, textAlign: "center" }}
                      >
                        No records found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
