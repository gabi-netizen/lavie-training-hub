/*
  CALL CENTER DASHBOARD PAGE
  Full-featured dashboard for monitoring call center performance.
  Tabs: Opening | Retention | All Calls
  Filter bar, summary cards, paginated call history table.
*/

import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  UserMinus,
  UserPlus,
  Clock,
  Play,
  Pause,
  MoreVertical,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  X as XIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Phone,
  RefreshCw,
  Loader2,
} from "lucide-react";

const PAGE_SIZE = 16;

// ─── Tabs ────────────────────────────────────────────────────────────────────
type TabId = "opening" | "retention" | "all";
const TABS: { id: TabId; label: string }[] = [
  { id: "opening", label: "Opening" },
  { id: "retention", label: "Retention" },
  { id: "all", label: "All Calls" },
];

// ─── Date range options ──────────────────────────────────────────────────────
const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "this_year", label: "This Year" },
  { value: "previous_month", label: "Previous Month" },
];

// ─── Call type options ───────────────────────────────────────────────────────
const CALL_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "cold_call", label: "Cold Call" },
  { value: "follow_up", label: "Follow Up" },
  { value: "retention", label: "Retention" },
  { value: "other", label: "Other" },
];

// ─── Default filter state ────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  agentId: undefined as number | undefined,
  team: undefined as "opening" | "retention" | undefined,
  scoreMin: 0,
  scoreMax: 100,
  dateRange: "this_month",
  callType: "all",
  search: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic color from name
const AVATAR_COLORS = [
  "#3B82F6", "#8B5CF6", "#22C55E", "#EF4444", "#F59E0B",
  "#EC4899", "#06B6D4", "#6366F1", "#14B8A6", "#F97316",
];

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function scoreClass(score: number | null): string {
  if (score === null) return "";
  if (score > 70) return "bg-green-50 text-green-600";
  if (score >= 40) return "bg-amber-50 text-amber-600";
  return "bg-red-50 text-red-600";
}

function statusBadge(status: string) {
  switch (status) {
    case "done":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Done
        </span>
      );
    case "analyzing":
    case "transcribing":
    case "pending":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-600">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          Analyzing
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-500">
          {status}
        </span>
      );
  }
}

function callTypeIcon(callType: string | null, score: number | null) {
  if (score !== null && score < 40) {
    return (
      <div className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
        <XIcon size={16} strokeWidth={2.5} />
      </div>
    );
  }
  if (callType === "follow_up" || callType === "live_sub" || callType === "pre_cycle_cancelled" || callType === "pre_cycle_decline" || callType === "end_of_instalment" || callType === "from_cat" || callType === "retention_win_back") {
    return (
      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
        <ArrowDownLeft size={16} strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-green-50 text-green-500 flex items-center justify-center flex-shrink-0">
      <ArrowUpRight size={16} strokeWidth={2.5} />
    </div>
  );
}

// ─── Pagination Component ────────────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "dots")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("dots");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("dots");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex items-center gap-1 px-3 h-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      {pages.map((p, i) =>
        p === "dots" ? (
          <span key={`dots-${i}`} className="text-sm text-gray-600 px-1.5">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              "w-8 h-8 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors",
              p === page
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-500"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="flex items-center gap-1 px-3 h-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function CallCenterDashboard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // ─── State ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [page, setPage] = useState(1);

  // Audio player state
  const [playingCallId, setPlayingCallId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Filter state (applied)
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  // Filter state (draft — before Apply)
  const [draft, setDraft] = useState({ ...DEFAULT_FILTERS });

  const applyFilters = useCallback(() => {
    setFilters({ ...draft });
    setPage(1);
  }, [draft]);

  const resetFilters = useCallback(() => {
    setDraft({ ...DEFAULT_FILTERS });
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
  }, []);

  // Helper to apply filters programmatically from summary cards
  const applyCardFilter = useCallback((overrides: Partial<typeof DEFAULT_FILTERS>) => {
    const newFilters = { ...DEFAULT_FILTERS, ...overrides };
    setDraft(newFilters);
    setFilters(newFilters);
    setPage(1);
  }, []);

  // ─── Audio playback ───────────────────────────────────────────────────────
  const togglePlay = useCallback((callId: number, audioUrl: string) => {
    if (playingCallId === callId) {
      // Pause current
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingCallId(null);
    } else {
      // Stop any currently playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Start new
      const audio = new Audio(audioUrl);
      audio.addEventListener("ended", () => {
        setPlayingCallId(null);
        audioRef.current = null;
      });
      audio.addEventListener("error", () => {
        toast.error("Failed to play recording");
        setPlayingCallId(null);
        audioRef.current = null;
      });
      audio.play().then(() => {
        audioRef.current = audio;
        setPlayingCallId(callId);
      }).catch(() => {
        toast.error("Failed to play recording — audio may not be available");
      });
    }
  }, [playingCallId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: agentsList } = trpc.dashboard.getAgentsList.useQuery();

  const { data: callsData, isLoading: callsLoading, isFetching } = trpc.dashboard.getDashboardCalls.useQuery({
    page,
    limit: PAGE_SIZE,
    tab: activeTab,
    agentId: filters.agentId,
    team: filters.team,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    dateRange: filters.dateRange,
    callType: filters.callType !== "all" ? filters.callType : undefined,
    search: filters.search || undefined,
  });

  const { data: stats } = trpc.dashboard.getDashboardStats.useQuery({ tab: activeTab });

  const totalPages = callsData ? Math.ceil(callsData.totalCount / PAGE_SIZE) : 1;

  // ─── Sync Calls mutation ──────────────────────────────────────────────────
  const syncCallsMutation = trpc.dashboard.syncCalls.useMutation({
    onSuccess: (data) => {
      const { totalFromApi, answeredCalls, eligibleCalls, alreadyInDb, newSynced, skipped, errors } = data;

      // Build a concise funnel summary: Total → Answered → Eligible → Already in DB → New
      const funnel = `${totalFromApi} from CloudTalk → ${answeredCalls} answered → ${eligibleCalls} eligible → ${alreadyInDb} already in DB → ${newSynced} new`;

      let message: string;
      if (newSynced > 0) {
        message = `Synced ${newSynced} new call${newSynced !== 1 ? "s" : ""}. (${funnel})`;
      } else if (eligibleCalls === 0 && answeredCalls > 0) {
        message = `0 new calls. Found ${answeredCalls} answered but none had a recording over 2 minutes.`;
      } else if (answeredCalls === 0) {
        message = `0 new calls. No answered calls found in the last 24 hours (${totalFromApi} total fetched).`;
      } else if (alreadyInDb === eligibleCalls) {
        message = `0 new calls — all ${eligibleCalls} eligible call${eligibleCalls !== 1 ? "s" : ""} already in DB. (${funnel})`;
      } else {
        message = `0 new calls synced. (${funnel}${skipped > 0 ? `, ${skipped} failed to download` : ""})`;
      }

      if (errors.length > 0) {
        toast.warning(message, {
          description: `${errors.length} error${errors.length !== 1 ? "s" : ""} occurred during sync.`,
          duration: 8000,
        });
      } else {
        toast.success(message, { duration: 6000 });
      }

      // Refetch dashboard data
      utils.dashboard.getDashboardCalls.invalidate();
      utils.dashboard.getDashboardStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  // ─── Navigate to call detail ───────────────────────────────────────────────
  const goToCall = (id: number) => {
    navigate(`/ai-coach?tab=my-calls&analysisId=${id}`);
  };

  // ─── Tab change ────────────────────────────────────────────────────────────
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* ═══════ TOP HEADER ═══════ */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-xl font-bold text-gray-900">Call Center Dashboard</h1>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-500 transition-colors">
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={() => syncCallsMutation.mutate()}
            disabled={syncCallsMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {syncCallsMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {syncCallsMutation.isPending ? "Syncing..." : "Sync Calls"}
          </button>
        </div>
      </div>

      {/* ═══════ TABS ═══════ */}
      <div className="bg-white border-b border-gray-200 px-8 flex gap-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "px-5 py-3.5 text-sm font-medium border-b-2 transition-all",
              activeTab === tab.id
                ? "text-blue-500 border-blue-500 font-semibold"
                : "text-gray-500 border-transparent hover:text-gray-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-8 py-6">
        {/* ═══════ FILTER BAR ═══════ */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 flex flex-wrap gap-4 items-end">
          {/* Agent */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Agent</label>
            <select
              value={draft.agentId ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, agentId: e.target.value ? Number(e.target.value) : undefined }))}
              className="h-[38px] px-3 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[150px] transition-colors"
            >
              <option value="">All Agents</option>
              {agentsList?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Team */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Team</label>
            <select
              value={draft.team ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, team: (e.target.value || undefined) as any }))}
              className="h-[38px] px-3 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[130px] transition-colors"
            >
              <option value="">All Teams</option>
              <option value="opening">Opening</option>
              <option value="retention">Retention</option>
            </select>
          </div>

          {/* AI Score Range */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">AI Score Range</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={draft.scoreMin}
                onChange={(e) => setDraft((d) => ({ ...d, scoreMin: Number(e.target.value) || 0 }))}
                className="w-[60px] h-[38px] px-2 border border-gray-200 rounded-lg text-sm text-center text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
              />
              <span className="text-gray-600 text-xs">–</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.scoreMax}
                onChange={(e) => setDraft((d) => ({ ...d, scoreMax: Number(e.target.value) || 100 }))}
                className="w-[60px] h-[38px] px-2 border border-gray-200 rounded-lg text-sm text-center text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Date Range</label>
            <select
              value={draft.dateRange}
              onChange={(e) => setDraft((d) => ({ ...d, dateRange: e.target.value }))}
              className="h-[38px] px-3 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[130px] transition-colors"
            >
              {DATE_RANGES.map((dr) => (
                <option key={dr.value} value={dr.value}>
                  {dr.label}
                </option>
              ))}
            </select>
          </div>

          {/* Call Type */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Call Type</label>
            <select
              value={draft.callType}
              onChange={(e) => setDraft((d) => ({ ...d, callType: e.target.value }))}
              className="h-[38px] px-3 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[120px] transition-colors"
            >
              {CALL_TYPE_OPTIONS.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex flex-col items-center gap-1.5">
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Customer name or phone..."
                value={draft.search}
                onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                className="h-[38px] pl-8 pr-3 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[200px] transition-colors"
              />
            </div>
          </div>

          {/* Buttons */}
          <button
            onClick={applyFilters}
            className="px-5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors h-[38px]"
          >
            Apply
          </button>
          <button
            onClick={resetFilters}
            className="px-5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-sm font-medium hover:bg-gray-200 transition-colors h-[38px]"
          >
            Reset
          </button>
        </div>

        {/* ═══════ SUMMARY CARDS ═══════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Calls Below 40 Score Today */}
          <div
            onClick={() => applyCardFilter({ scoreMin: 0, scoreMax: 40, dateRange: "today" })}
            className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3.5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="w-11 h-11 rounded-[10px] bg-red-100 text-red-500 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[28px] font-bold text-red-600 leading-tight">{stats?.callsBelowForty ?? 0}</div>
              <div className="text-[13px] text-gray-600 mt-0.5">Calls Below 40 Score Today</div>
              <div className="text-[11.5px] text-gray-600 mt-1.5">Requires manager review</div>
              <div className="text-[11px] text-blue-500 font-semibold mt-2 hover:underline">View these calls →</div>
            </div>
          </div>

          {/* Card 2: Weakest Agent Today */}
          <div
            onClick={() => {
              if (stats?.weakestAgent?.userId) {
                applyCardFilter({ agentId: stats.weakestAgent.userId, dateRange: "today" });
              }
            }}
            className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3.5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="w-11 h-11 rounded-[10px] bg-amber-100 text-amber-500 flex items-center justify-center flex-shrink-0">
              <UserMinus size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[28px] font-bold text-amber-600 leading-tight">
                {stats?.weakestAgent?.avgScore ?? "—"}
                {stats?.weakestAgent && <span className="text-sm font-medium text-amber-700 ml-1">avg</span>}
              </div>
              <div className="text-[13px] text-gray-600 mt-0.5">Weakest Agent Today</div>
              {stats?.weakestAgent && (
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: getAvatarColor(stats.weakestAgent.name) }}
                  >
                    {getInitials(stats.weakestAgent.name)}
                  </div>
                  <span className="text-[13px] font-semibold text-amber-800">{stats.weakestAgent.name}</span>
                </div>
              )}
              <div className="text-[11px] text-blue-500 font-semibold mt-2 hover:underline">Review coaching plan →</div>
            </div>
          </div>

          {/* Card 3: Strongest Agent Today */}
          <div
            onClick={() => {
              if (stats?.strongestAgent?.userId) {
                applyCardFilter({ agentId: stats.strongestAgent.userId, dateRange: "today" });
              }
            }}
            className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3.5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="w-11 h-11 rounded-[10px] bg-green-100 text-green-500 flex items-center justify-center flex-shrink-0">
              <UserPlus size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[28px] font-bold text-green-600 leading-tight">
                {stats?.strongestAgent?.avgScore ?? "—"}
                {stats?.strongestAgent && <span className="text-sm font-medium text-green-700 ml-1">avg</span>}
              </div>
              <div className="text-[13px] text-gray-600 mt-0.5">Strongest Agent Today</div>
              {stats?.strongestAgent && (
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: getAvatarColor(stats.strongestAgent.name) }}
                  >
                    {getInitials(stats.strongestAgent.name)}
                  </div>
                  <span className="text-[13px] font-semibold text-green-800">{stats.strongestAgent.name}</span>
                </div>
              )}
              <div className="text-[11px] text-blue-500 font-semibold mt-2 hover:underline">View performance →</div>
            </div>
          </div>

          {/* Card 4: Pending Analysis */}
          <div
            onClick={() => applyCardFilter({ dateRange: "this_year", scoreMin: 0, scoreMax: 100 })}
            className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-3.5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="w-11 h-11 rounded-[10px] bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0">
              <Clock size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[28px] font-bold text-blue-600 leading-tight">{stats?.pendingCount ?? 0}</div>
              <div className="text-[13px] text-gray-600 mt-0.5">Pending Analysis</div>
              <div className="text-[11.5px] text-gray-600 mt-1.5">Calls still being processed by AI</div>
              <div className="text-[11px] text-blue-500 font-semibold mt-2 hover:underline">Check status →</div>
            </div>
          </div>
        </div>

        {/* ═══════ TABLE HEADER ═══════ */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Call History</h2>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>

        {/* ═══════ CALL TABLE ═══════ */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-[180px_200px_190px_140px_100px_110px_100px_80px_50px] px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wide">
            <div>Type</div>
            <div>Contact</div>
            <div>Agent</div>
            <div>Date</div>
            <div>AI Score</div>
            <div>Status</div>
            <div>Agent Talk</div>
            <div></div>
            <div></div>
          </div>

          {/* Loading state */}
          {callsLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-500">
              <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-sm">Loading calls...</p>
            </div>
          ) : !callsData?.calls?.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-500">
              <Phone size={36} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No calls found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className={cn("divide-y divide-gray-100", isFetching && "opacity-60 transition-opacity")}>
              {callsData.calls.map((call) => {
                const date = new Date(call.createdAt);
                const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const isPlaying = playingCallId === call.id;

                return (
                  <div
                    key={call.id}
                    onClick={() => goToCall(call.id)}
                    className="grid grid-cols-[180px_200px_190px_140px_100px_110px_100px_80px_50px] px-5 py-3.5 items-center hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    {/* Type */}
                    <div className="flex items-center gap-2.5">
                      {callTypeIcon(call.callType, call.overallScore)}
                      <div>
                        <div className="text-[13px] font-medium text-gray-900 capitalize">{call.agentTeam || call.callTypeLabel}</div>
                        <div className="text-xs text-gray-600">{formatDuration(call.durationSeconds)}</div>
                      </div>
                    </div>

                    {/* Contact */}
                    <div>
                      <div className="text-[13px] font-medium text-gray-900 truncate">{call.customerName || "—"}</div>
                      <div className="text-xs text-gray-600 truncate">{call.contactPhone || ""}</div>
                    </div>

                    {/* Agent */}
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0"
                        style={{ background: getAvatarColor(call.agentName) }}
                      >
                        {getInitials(call.agentName)}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-gray-900 truncate">{call.agentName || "—"}</div>
                        <div className="text-[11px] text-gray-600 capitalize">{call.agentTeam || ""}</div>
                      </div>
                    </div>

                    {/* Date */}
                    <div>
                      <div className="text-[13px] text-gray-900">{dateStr}</div>
                      <div className="text-xs text-gray-600">{timeStr}</div>
                    </div>

                    {/* AI Score */}
                    <div>
                      {call.overallScore !== null ? (
                        <span className={cn("inline-flex items-center justify-center px-3 py-1 rounded-full text-[13px] font-semibold min-w-[48px]", scoreClass(call.overallScore))}>
                          {call.overallScore}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div>{statusBadge(call.status)}</div>

                    {/* Agent Talk Time */}
                    <div>
                      {call.repSpeechPct != null ? (() => {
                        const agentPct = call.repSpeechPct as number;
                        const barColor = agentPct > 65 ? "bg-red-400" : agentPct < 30 ? "bg-amber-400" : "bg-emerald-400";
                        const textColor = agentPct > 65 ? "text-red-700" : agentPct < 30 ? "text-amber-700" : "text-emerald-700";
                        return (
                          <div className="flex items-center gap-1.5" title={`Agent spoke ${agentPct}% of the call`}>
                            <div className="w-14 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${agentPct}%` }} />
                            </div>
                            <span className={`text-[12px] font-semibold ${textColor}`}>{agentPct}%</span>
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>

                    {/* Play / Pause */}
                    <div onClick={(e) => e.stopPropagation()}>
                      {call.audioFileUrl ? (
                        <button
                          onClick={() => togglePlay(call.id, call.audioFileUrl)}
                          className={cn(
                            "w-8 h-8 rounded-full border flex items-center justify-center transition-colors",
                            isPlaying
                              ? "border-blue-400 bg-blue-50 text-blue-600"
                              : "border-gray-200 bg-white text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50"
                          )}
                          title={isPlaying ? "Pause recording" : "Play recording"}
                        >
                          {isPlaying ? (
                            <Pause size={14} fill="currentColor" />
                          ) : (
                            <Play size={14} fill="currentColor" />
                          )}
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <button className="w-7 h-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════ BOTTOM PAGINATION ═══════ */}
        {callsData && callsData.totalCount > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-[13px] text-gray-700">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, callsData.totalCount)} of{" "}
              {callsData.totalCount.toLocaleString()} calls
            </p>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
