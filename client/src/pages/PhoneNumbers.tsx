import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Phone,
  Plus,
  UserCheck,
  UserMinus,
  AlertTriangle,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Users,
  Clock,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react";

type PhoneStatus = "pool" | "active" | "spam";

interface PhoneNumber {
  id: number;
  number: string;
  status: PhoneStatus;
  assignedUserId: number | null;
  assignedAgentName: string | null;
  cloudtalkNumberId: string | null;
  notes: string | null;
  hiyaCategory: string | null;
  spamMarkedAt: Date | null;
  assignedAt: Date | null;
  historyJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_COLORS: Record<PhoneStatus, string> = {
  pool: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  spam: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<PhoneStatus, string> = {
  pool: "Pool",
  active: "Active",
  spam: "Spam",
};

/**
 * Colour-codes how long a number has been active.
 * Older = more stable = better for retention (customers recognise the number).
 * Green = 60d+ (established, trusted)
 * Amber = 30–59d (settling in)
 * Gray/neutral = <30d (brand new, not yet proven)
 */
function DaysActiveBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">—</span>;
  const color =
    days >= 60
      ? "bg-green-100 text-green-700 border-green-200"
      : days >= 30
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-500 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Clock size={10} />
      {days}d
    </span>
  );
}

/** Hiya registration status badge */
function HiyaStatusBadge({ phoneNumber }: { phoneNumber: string }) {
  const { data, isLoading } = trpc.phoneNumbers.checkHiyaStatus.useQuery(
    { phoneNumber },
    { staleTime: 60_000, refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-400 border-gray-200">
        <Loader2 size={10} className="animate-spin" />
        Checking...
      </span>
    );
  }

  if (!data || data.status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
        <ShieldAlert size={10} />
        Unknown
      </span>
    );
  }

  if (!data.registered || data.status === "not_registered") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-500 border-gray-200">
        <Shield size={10} />
        Not Registered
      </span>
    );
  }

  // Registered states
  const statusLower = data.status.toLowerCase();
  if (statusLower === "pending" || statusLower === "in_review") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
        <Shield size={10} />
        Pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
      <ShieldCheck size={10} />
      Registered
    </span>
  );
}

function HistoryPanel({ historyJson }: { historyJson: string | null }) {
  const [open, setOpen] = useState(false);
  const history: Array<{ agentName: string; assignedAt: string; releasedAt?: string }> =
    JSON.parse(historyJson ?? "[]");
  if (history.length === 0) return <span className="text-xs text-gray-400">No history</span>;
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {history.length} assignment{history.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-2 border-l-2 border-gray-200">
          {history.map((h, i) => (
            <div key={i} className="text-xs text-gray-600">
              <span className="font-medium">{h.agentName}</span>
              <span className="text-gray-400">
                {" "}
                {new Date(h.assignedAt).toLocaleDateString()}
                {h.releasedAt ? ` → ${new Date(h.releasedAt).toLocaleDateString()}` : " → now"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberRow({
  num,
  agents,
}: {
  num: PhoneNumber;
  agents: Array<{ id: number; name: string | null }>;
}) {
  const utils = trpc.useUtils();
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [spamConfirmOpen, setSpamConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [editCloudtalkId, setEditCloudtalkId] = useState(num.cloudtalkNumberId ?? "");
  const [editNotes, setEditNotes] = useState(num.notes ?? "");

  const invalidateAll = () => {
    utils.phoneNumbers.list.invalidate();
    utils.phoneNumbers.agentSummary.invalidate();
  };

  const assign = trpc.phoneNumbers.assign.useMutation({
    onSuccess: () => { toast.success("Number assigned"); setAssignOpen(false); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const release = trpc.phoneNumbers.release.useMutation({
    onSuccess: () => { toast.success("Number released to pool"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const markAsSpam = trpc.phoneNumbers.markAsSpam.useMutation({
    onSuccess: (data) => {
      if (data.cloudtalkDeleted) {
        toast.success("Number marked as spam and deleted from CloudTalk");
      } else {
        toast.warning("Marked as spam — CloudTalk deletion may have failed (check manually)");
      }
      if (data.hiyaDeleted) {
        toast.success("Removed from Hiya branded calling");
      }
      setSpamConfirmOpen(false);
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const unspam = trpc.phoneNumbers.unspam.useMutation({
    onSuccess: () => { toast.success("Number moved back to pool"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.phoneNumbers.update.useMutation({
    onSuccess: () => { toast.success("Number updated"); setEditOpen(false); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteNum = trpc.phoneNumbers.delete.useMutation({
    onSuccess: () => { toast.success("Number deleted"); setDeleteConfirmOpen(false); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const registerWithHiya = trpc.phoneNumbers.registerWithHiya.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Registered with Hiya");
        utils.phoneNumbers.checkHiyaStatus.invalidate({ phoneNumber: num.number });
      } else {
        toast.error(`Hiya registration failed: ${data.error}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedAgent = agents.find((a) => a.id === Number(selectedAgentId));

  // Compute days active
  const daysActive = num.assignedAt
    ? Math.floor((Date.now() - new Date(num.assignedAt).getTime()) / 86_400_000)
    : null;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="py-3 px-4">
          <div className="font-mono text-sm font-medium text-gray-900">{num.number}</div>
          {num.cloudtalkNumberId && (
            <div className="text-xs text-gray-400">CT: {num.cloudtalkNumberId}</div>
          )}
        </td>
        <td className="py-3 px-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[num.status]}`}>
            {STATUS_LABELS[num.status]}
          </span>
        </td>
        <td className="py-3 px-4">
          {num.assignedAgentName ? (
            <div className="text-sm font-medium text-gray-900">{num.assignedAgentName}</div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>
        {/* Days Active column */}
        <td className="py-3 px-4">
          {num.status === "active" ? (
            <DaysActiveBadge days={daysActive} />
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        {/* Hiya / Category column */}
        <td className="py-3 px-4">
          {num.hiyaCategory === "branded" && num.status !== "spam" ? (
            <HiyaStatusBadge phoneNumber={num.number} />
          ) : num.hiyaCategory === "spam_protection" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
              <Shield size={10} />
              Spam Protection
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="py-3 px-4">
          <HistoryPanel historyJson={num.historyJson} />
        </td>
        <td className="py-3 px-4 max-w-[160px]">
          <span className="text-xs text-gray-500 truncate block">{num.notes ?? "—"}</span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            {num.status === "pool" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAssignOpen(true)}>
                <UserCheck size={12} className="mr-1" />Assign
              </Button>
            )}
            {num.status === "active" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => release.mutate({ id: num.id })} disabled={release.isPending}>
                <UserMinus size={12} className="mr-1" />Release
              </Button>
            )}
            {num.status !== "spam" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => setSpamConfirmOpen(true)}>
                <AlertTriangle size={12} className="mr-1" />Spam
              </Button>
            )}
            {num.status === "spam" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => unspam.mutate({ id: num.id })} disabled={unspam.isPending}>
                <RotateCcw size={12} className="mr-1" />Restore
              </Button>
            )}
            {num.status !== "spam" && num.hiyaCategory === "branded" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={() => registerWithHiya.mutate({ id: num.id })}
                disabled={registerWithHiya.isPending}
                title="Register with Hiya Branded Calling"
              >
                {registerWithHiya.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ShieldCheck size={12} />
                )}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditCloudtalkId(num.cloudtalkNumberId ?? ""); setEditNotes(num.notes ?? ""); setEditOpen(true); }}>
              <Edit2 size={12} />
            </Button>
            {num.status !== "active" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:bg-red-50" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {num.number}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Select Agent</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button disabled={!selectedAgentId || assign.isPending} onClick={() => { if (!selectedAgent) return; assign.mutate({ id: num.id, assignedUserId: selectedAgent.id, assignedAgentName: selectedAgent.name ?? `Agent #${selectedAgent.id}` }); }}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {num.number}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>CloudTalk Number ID</Label>
              <Input className="mt-1" placeholder="e.g. 12345" value={editCloudtalkId} onChange={(e) => setEditCloudtalkId(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Required for spam auto-deletion from CloudTalk</p>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" placeholder="e.g. Was Cat's primary number..." value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={update.isPending} onClick={() => update.mutate({ id: num.id, cloudtalkNumberId: editCloudtalkId || undefined, notes: editNotes || undefined })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spam confirm */}
      <AlertDialog open={spamConfirmOpen} onOpenChange={setSpamConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Spam?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{num.number}</strong> as spam
              {num.cloudtalkNumberId ? " and immediately DELETE it from CloudTalk to stop billing." : ". No CloudTalk ID is set — you will need to delete it from CloudTalk manually."}
              {" "}It will also be removed from Hiya branded calling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => markAsSpam.mutate({ id: num.id })}>Mark as Spam</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Number?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove <strong>{num.number}</strong> from the pool. This cannot be undone.
              It will also be removed from Hiya branded calling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteNum.mutate({ id: num.id })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Agents tab — one card per agent showing their numbers + days active */
function AgentsView({ isAdmin }: { isAdmin: boolean }) {
  const { data: agentSummary = [], isLoading } = trpc.phoneNumbers.agentSummary.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  if (isLoading) return <div className="py-16 text-center text-gray-400">Loading...</div>;

  if (agentSummary.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        No active numbers assigned yet. Assign numbers from the Pool tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agentSummary.map((agent) => (
        <Card key={agent.agentName} className="shadow-none border border-gray-200">
          <CardContent className="p-0">
            {/* Agent header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {agent.agentName
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <span className="font-semibold text-gray-900">{agent.agentName}</span>
              </div>
              <span className="text-sm text-gray-500">
                {agent.numbers.length} number{agent.numbers.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Numbers table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Number</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned Since</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Days Active</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody>
                {agent.numbers.map((n) => (
                  <tr key={n.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 px-4 font-mono text-sm font-medium text-gray-900">
                      {n.number}
                      {n.cloudtalkNumberId && (
                        <span className="ml-2 text-xs text-gray-400">CT:{n.cloudtalkNumberId}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-gray-600">
                      {n.assignedAt ? new Date(n.assignedAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <DaysActiveBadge days={n.daysActive} />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-500 max-w-[200px] truncate">
                      {n.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-gray-500">
        <span className="font-medium">Days active colour guide:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200"><Clock size={10} /> 60d+ — Established &amp; trusted</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200"><Clock size={10} /> 30–59d — Settling in</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200"><Clock size={10} /> &lt;30d — New, not yet proven</span>
      </div>
    </div>
  );
}

/** Hiya Sync Panel — shows all numbers registered in Hiya */
function HiyaSyncPanel() {
  const { data, isLoading, refetch, isRefetching } = trpc.phoneNumbers.syncFromHiya.useQuery(
    undefined,
    { enabled: false } // Only fetch on demand
  );

  const [hasLoaded, setHasLoaded] = useState(false);

  const handleSync = async () => {
    setHasLoaded(true);
    await refetch();
  };

  return (
    <Card className="shadow-none border border-gray-200 mb-4">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">Hiya Branded Calling</span>
            <span className="text-xs text-gray-400">— Sync to see all Branded numbers registered with Hiya</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            onClick={handleSync}
            disabled={isLoading || isRefetching}
          >
            {(isLoading || isRefetching) ? (
              <Loader2 size={12} className="mr-1 animate-spin" />
            ) : (
              <RefreshCw size={12} className="mr-1" />
            )}
            Sync from Hiya
          </Button>
        </div>

        {hasLoaded && data && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            {!data.success ? (
              <div className="text-xs text-red-600">Error: {data.error}</div>
            ) : data.numbers.length === 0 ? (
              <div className="text-xs text-gray-400">No numbers registered in Hiya yet.</div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-gray-500 mb-2">{data.numbers.length} number{data.numbers.length !== 1 ? "s" : ""} registered in Hiya:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {data.numbers.map((n, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs">
                      <ShieldCheck size={12} className="text-emerald-500 flex-shrink-0" />
                      <span className="font-mono">+{n.countryCode}{n.nationalNumber}</span>
                      {n.registrationStatus && (
                        <span className="text-gray-400 ml-auto">{n.registrationStatus}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PhoneNumbers() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<PhoneStatus | "all" | "agents">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCloudtalkId, setNewCloudtalkId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newHiyaCategory, setNewHiyaCategory] = useState<"branded" | "spam_protection" | "">("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "branded" | "spam_protection">("all");

  const { data: numbers = [], isLoading } = trpc.phoneNumbers.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: agentList = [] } = trpc.callCoach.getAgentList.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const utils = trpc.useUtils();

  const add = trpc.phoneNumbers.add.useMutation({
    onSuccess: (data) => {
      if (data.hiyaRegistered) {
        toast.success("Number added and registered with Hiya Branded Calling");
      } else if (newHiyaCategory === "spam_protection") {
        toast.success("Number added for Spam Protection (local management)");
      } else {
        toast.success("Number added to pool");
      }
      setAddOpen(false);
      setNewNumber("");
      setNewCloudtalkId("");
      setNewNotes("");
      setNewHiyaCategory("");
      utils.phoneNumbers.list.invalidate();
      utils.phoneNumbers.agentSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (loading) return null;
  if (!user || user.role !== "admin") {
    navigate("/training");
    return null;
  }

  const filteredByStatus =
    activeTab === "all" || activeTab === "agents"
      ? numbers
      : numbers.filter((n) => n.status === activeTab);

  const filtered = categoryFilter === "all"
    ? filteredByStatus
    : filteredByStatus.filter((n: any) => n.hiyaCategory === categoryFilter);

  const counts = {
    all: numbers.length,
    pool: numbers.filter((n) => n.status === "pool").length,
    active: numbers.filter((n) => n.status === "active").length,
    spam: numbers.filter((n) => n.status === "spam").length,
  };

  const tabs: Array<{ key: PhoneStatus | "all" | "agents"; label: string; count?: number; icon?: React.ReactNode }> = [
    { key: "all", label: "All Numbers", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "pool", label: "Pool", count: counts.pool },
    { key: "spam", label: "Spam", count: counts.spam },
    { key: "agents", label: "By Agent", icon: <Users size={12} /> },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Phone className="text-indigo-600" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Phone Numbers</h1>
            <p className="text-sm text-gray-500">Manage the team's number pool</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setProtocolOpen(true)} className="bg-[#FF6B00] hover:bg-[#E55F00] text-white font-bold flex items-center gap-2">
            Usage Protocol
          </Button>
          <Button onClick={() => setAddOpen(true)} className="flex items-center gap-2">
            <Plus size={16} />
            Add Number
          </Button>
        </div>
      </div>

      {/* Hiya Sync Panel */}
      <HiyaSyncPanel />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: counts.all, color: "text-gray-900" },
          { label: "Active", value: counts.active, color: "text-green-700" },
          { label: "Pool", value: counts.pool, color: "text-blue-700" },
          { label: "Spam", value: counts.spam, color: "text-red-700" },
        ].map((s) => (
          <Card key={s.label} className="shadow-none border border-gray-200">
            <CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-gray-600">Category:</span>
        <div className="flex gap-1">
          {([
            { key: "all", label: "All" },
            { key: "branded", label: "Branded Calling" },
            { key: "spam_protection", label: "Spam Protection" },
          ] as const).map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                categoryFilter === cat.key
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.key ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Agents view */}
      {activeTab === "agents" ? (
        <AgentsView isAdmin={user.role === "admin"} />
      ) : (
        /* Numbers table */
        <Card className="shadow-none border border-gray-200">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center text-gray-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No numbers in this category yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Number</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Days Active</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">History</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((num) => (
                      <NumberRow
                        key={num.id}
                        num={num as PhoneNumber}
                        agents={agentList}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Usage Protocol dialog */}
      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Phone Numbers — Usage Protocol</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2 text-sm text-gray-800">
            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">Overview</h3>
              <p>Numbers are split into two categories:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Branded Calling</strong> — Premium service via Hiya API. The recipient sees "Lavie Labs" on their screen instead of an unknown number. Increases answer rates by 30–50%. <span className="text-red-600 font-medium">Costs money per number.</span></li>
                <li><strong>Spam Protection</strong> — Local management only. Numbers tracked for rotation and spam monitoring. No external API. <span className="text-green-700 font-medium">Free.</span></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">Rules & Approval</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Spam Protection</strong> — Any admin can add. No approval needed.</li>
                <li><strong>Branded Calling</strong> — <span className="text-red-600 font-bold">ONLY with Gabi's explicit approval.</span> Each number costs money monthly.</li>
                <li>Assigning, releasing, marking as spam, deleting — any admin, no approval needed.</li>
                <li>The green shield button (Register with Hiya) — only for Branded numbers, only with Gabi's approval.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">How to Add a Number</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Click <strong>"Add Number"</strong> (top right)</li>
                <li>Enter the phone number in international format (e.g. +447893942312)</li>
                <li>Select <strong>Category</strong>:
                  <ul className="list-disc pl-5 mt-1">
                    <li><strong>Branded Calling (Hiya API)</strong> — ONLY if Gabi approved</li>
                    <li><strong>Spam Protection (Local only)</strong> — For all other numbers</li>
                  </ul>
                </li>
                <li>Optionally add CloudTalk Number ID and Notes</li>
                <li>Click <strong>"Add to Pool"</strong></li>
              </ol>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">Category Column Badges</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><span className="text-emerald-700 font-medium">Green "Registered"</span> — Branded, successfully registered with Hiya</li>
                <li><span className="text-amber-700 font-medium">Amber "Pending"</span> — Branded, registration in progress</li>
                <li><span className="text-gray-500 font-medium">Grey "Not Registered"</span> — Branded, registration failed or pending</li>
                <li><span className="text-purple-700 font-medium">Purple "Spam Protection"</span> — Managed locally, no API</li>
                <li><span className="text-gray-400">Dash (—)</span> — Legacy number, no category assigned</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">Hiya Sync Panel</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Click "Sync from Hiya" to see all Branded numbers currently registered</li>
                <li>Spam Protection numbers will never appear here</li>
                <li>Use this to verify successful registration</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-2">Important Notes</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Never add Branded without Gabi's approval</strong> — it costs money</li>
                <li>If a Branded number is marked as spam → automatically removed from Hiya</li>
                <li>Spam Protection works even if Hiya is down (no dependency)</li>
                <li>Future: when we get a Hiya Number Reputation key, Spam Protection will also connect to Hiya for automated detection</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtocolOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Number dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Number to Pool</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Phone Number *</Label>
              <Input className="mt-1" placeholder="+447893942312" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={newHiyaCategory} onValueChange={(v) => setNewHiyaCategory(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branded">Branded Calling (Hiya API)</SelectItem>
                  <SelectItem value="spam_protection">Spam Protection (Local only)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {newHiyaCategory === "branded"
                  ? "Will be registered with Hiya for branded caller ID display"
                  : newHiyaCategory === "spam_protection"
                  ? "Managed locally — no API registration (free)"
                  : "Choose a category for this number"}
              </p>
            </div>
            <div>
              <Label>CloudTalk Number ID</Label>
              <Input className="mt-1" placeholder="e.g. 12345" value={newCloudtalkId} onChange={(e) => setNewCloudtalkId(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Required for automatic spam deletion from CloudTalk</p>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" placeholder="e.g. Was Cat's primary number..." value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!newNumber.trim() || !newHiyaCategory || add.isPending}
              onClick={() => add.mutate({ number: newNumber.trim(), cloudtalkNumberId: newCloudtalkId.trim() || undefined, notes: newNotes.trim() || undefined, hiyaCategory: newHiyaCategory || undefined })}
            >
              Add to Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
