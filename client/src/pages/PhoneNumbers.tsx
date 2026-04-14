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

/** Colour-codes how long a number has been active */
function DaysActiveBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">—</span>;
  const color =
    days >= 60
      ? "bg-red-100 text-red-700 border-red-200"
      : days >= 30
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-green-100 text-green-700 border-green-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Clock size={10} />
      {days}d
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
      <div className="flex items-center gap-4 pt-1 text-xs text-gray-500">
        <span className="font-medium">Days active colour guide:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200"><Clock size={10} /> &lt;30d — Fresh</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200"><Clock size={10} /> 30–59d — Monitor</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200"><Clock size={10} /> 60d+ — Consider rotating</span>
      </div>
    </div>
  );
}

export default function PhoneNumbers() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<PhoneStatus | "all" | "agents">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCloudtalkId, setNewCloudtalkId] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: numbers = [], isLoading } = trpc.phoneNumbers.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: agentList = [] } = trpc.callCoach.getAgentList.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const utils = trpc.useUtils();

  const add = trpc.phoneNumbers.add.useMutation({
    onSuccess: () => {
      toast.success("Number added to pool");
      setAddOpen(false);
      setNewNumber("");
      setNewCloudtalkId("");
      setNewNotes("");
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

  const filtered =
    activeTab === "all" || activeTab === "agents"
      ? numbers
      : numbers.filter((n) => n.status === activeTab);

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
        <Button onClick={() => setAddOpen(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Add Number
        </Button>
      </div>

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
              disabled={!newNumber.trim() || add.isPending}
              onClick={() => add.mutate({ number: newNumber.trim(), cloudtalkNumberId: newCloudtalkId.trim() || undefined, notes: newNotes.trim() || undefined })}
            >
              Add to Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
