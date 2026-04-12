/*
  CALL LOG PAGE
  Shows all CloudTalk calls globally — including calls with no contact card.
  Filters: date range, status (answered/missed), search by phone/name.
  Links to ContactCard when a matching contact is found in the DB.
*/

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export default function CallLog() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"" | "answered" | "missed">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [audioData, setAudioData] = useState<Record<number, string>>({});

  const { data, isLoading, isFetching } = trpc.contacts.callLog.useQuery({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const streamRecordingMutation = trpc.contacts.streamRecording.useMutation({
    onSuccess: (result, variables) => {
      if (result.success && result.data) {
        setAudioData((prev) => ({ ...prev, [variables.callId]: result.data! }));
      } else {
        toast.error("Recording not available");
      }
    },
    onError: () => toast.error("Failed to load recording"),
  });

  // Client-side search filter on phone / contact name / agent name
  const filteredCalls = useMemo(() => {
    if (!data?.calls) return [];
    if (!search.trim()) return data.calls;
    const q = search.toLowerCase();
    return data.calls.filter((call) => {
      const phone = call.contact?.number ?? "";
      const contactName = (call as any).matchedContact?.name ?? call.contact?.name ?? "";
      const agentName = call.agent?.name ?? "";
      return (
        phone.includes(q) ||
        contactName.toLowerCase().includes(q) ||
        agentName.toLowerCase().includes(q)
      );
    });
  }, [data?.calls, search]);

  const totalPages = data ? Math.ceil(data.totalCount / PAGE_SIZE) : 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dialler")}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Call Log</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {data ? `${data.totalCount.toLocaleString()} total calls in CloudTalk` : "Loading…"}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          {(["", "answered", "missed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                statusFilter === s
                  ? s === "answered"
                    ? "bg-green-100 text-green-700 border-green-200"
                    : s === "missed"
                    ? "bg-red-100 text-red-600 border-red-200"
                    : "bg-indigo-100 text-indigo-700 border-indigo-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              {s === "" ? "All" : s === "answered" ? "Answered" : "Missed"}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading calls from CloudTalk…</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <PhoneOff size={36} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No calls found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Contact</span>
              <span>Phone</span>
              <span>Agent</span>
              <span>Date</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Rec</span>
            </div>

            {/* Rows */}
            <div className={cn("divide-y divide-gray-100", isFetching && "opacity-60")}>
              {filteredCalls.map((call) => {
                const isAnswered = call.status === "answered";
                const durationSec = call.call_times?.talking_time ?? 0;
                const mins = Math.floor(durationSec / 60);
                const secs = durationSec % 60;
                const matchedContact = (call as any).matchedContact as { id: number; name: string } | null;
                const ctContactName = call.contact?.name ?? "";
                const displayName = matchedContact?.name ?? ctContactName ?? "—";
                const phone = call.contact?.number ?? call.internal_number?.number ?? "—";
                const b64 = audioData[call.cdr_id];

                return (
                  <div
                    key={call.cdr_id}
                    className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-gray-50 transition-colors"
                  >
                    {/* Contact name */}
                    <div className="flex items-center gap-2 min-w-0">
                      {isAnswered ? (
                        <PhoneCall size={13} className="text-green-500 shrink-0" />
                      ) : (
                        <PhoneMissed size={13} className="text-red-400 shrink-0" />
                      )}
                      {matchedContact ? (
                        <button
                          onClick={() => navigate(`/contacts/${matchedContact.id}`)}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 truncate flex items-center gap-1"
                        >
                          {displayName}
                          <ExternalLink size={11} className="shrink-0" />
                        </button>
                      ) : (
                        <span className="text-sm text-gray-700 truncate">{displayName || "Unknown"}</span>
                      )}
                    </div>

                    {/* Phone */}
                    <span className="text-sm text-gray-600 font-mono truncate">{phone}</span>

                    {/* Agent */}
                    <span className="text-sm text-gray-600 truncate">{call.agent?.name ?? "—"}</span>

                    {/* Date */}
                    <span className="text-xs text-gray-500">
                      {call.date ? new Date(call.date).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>

                    {/* Duration */}
                    <span className="text-xs text-gray-500">
                      {durationSec > 0 ? `${mins}m ${secs}s` : "—"}
                    </span>

                    {/* Status badge */}
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium w-fit",
                      isAnswered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    )}>
                      {isAnswered ? "Answered" : "Missed"}
                    </span>

                    {/* Recording */}
                    <div className="w-8 flex justify-center">
                      {call.recorded ? (
                        b64 ? (
                          <div className="flex flex-col items-center gap-1">
                            <audio controls className="w-32 h-7" src={`data:audio/wav;base64,${b64}`} />
                            <button
                              onClick={() => setAudioData((prev) => { const n = { ...prev }; delete n[call.cdr_id]; return n; })}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Hide
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => streamRecordingMutation.mutate({ callId: call.cdr_id })}
                            disabled={streamRecordingMutation.isPending}
                            className="text-indigo-500 hover:text-indigo-700 disabled:opacity-40 transition-colors"
                            title="Play recording"
                          >
                            {streamRecordingMutation.isPending ? (
                              <div className="w-3.5 h-3.5 border border-indigo-400 border-t-indigo-700 rounded-full animate-spin" />
                            ) : (
                              <Play size={14} />
                            )}
                          </button>
                        )
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages} · {data.totalCount.toLocaleString()} total calls
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-medium text-gray-700 px-2">{page}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
