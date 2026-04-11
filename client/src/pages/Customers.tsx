import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  Upload,
  Phone,
  ChevronDown,
  X,
  Plus,
  User,
  Clock,
  FileText,
  Filter,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  leadType?: string | null;
  status: string;
  agentName?: string | null;
  importedNotes?: string | null;
  source?: string | null;
  leadDate?: Date | null;
  callbackAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactWithNotes extends Contact {
  callNotes: {
    id: number;
    contactId: number;
    agentName?: string | null;
    note: string;
    statusAtTime?: string | null;
    createdAt: Date;
  }[];
}

// ─── Lead Type Badge ──────────────────────────────────────────────────────────
function LeadTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const t = type.toLowerCase();
  let cls = "bg-slate-700 text-slate-200";
  if (t.includes("pre cycle") || t.includes("pre-cycle")) cls = "bg-amber-600/80 text-amber-100";
  else if (t.includes("live sub")) cls = "bg-emerald-600/80 text-emerald-100";
  else if (t.includes("cancel") || t.includes("declined")) cls = "bg-rose-600/80 text-rose-100";
  else if (t.includes("cycle 1")) cls = "bg-sky-600/80 text-sky-100";
  else if (t.includes("cycle 2")) cls = "bg-indigo-600/80 text-indigo-100";
  else if (t.includes("cycle 3")) cls = "bg-violet-600/80 text-violet-100";
  else if (t.includes("warm")) cls = "bg-orange-500/80 text-orange-100";
  else if (t.includes("owned")) cls = "bg-teal-600/80 text-teal-100";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-slate-600 text-slate-200" },
    open: { label: "Open", cls: "bg-blue-600/80 text-blue-100" },
    working: { label: "Working", cls: "bg-yellow-600/80 text-yellow-100" },
    assigned: { label: "Assigned", cls: "bg-purple-600/80 text-purple-100" },
    done_deal: { label: "Done Deal", cls: "bg-emerald-500/90 text-white font-semibold" },
    retained_sub: { label: "Retained Sub", cls: "bg-teal-500/90 text-white font-semibold" },
    cancelled_sub: { label: "Cancelled Sub", cls: "bg-rose-600/80 text-rose-100" },
    closed: { label: "Closed", cls: "bg-slate-700 text-slate-400" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-700 text-slate-300" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// Map CSV column names to our schema fields
function mapCsvRow(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()] ?? "";
      if (v) return v;
    }
    return "";
  };
  return {
    name: get("name", "full name", "customer name", "contact name"),
    email: get("email", "email address"),
    phone: get("phone", "mobile", "telephone", "tel", "phone number", "mobile number"),
    leadType: get("lead type", "type of lead", "leadtype", "type"),
    status: get("status"),
    agentName: get("agent", "agent name", "rep", "rep name", "assigned to"),
    notes: get("notes", "rob notes", "comments", "note"),
    source: get("source", "data source"),
    leadDate: get("date", "lead date", "created", "created date"),
  };
}

// ─── Customer Card Modal ──────────────────────────────────────────────────────
function CustomerCard({
  contactId,
  onClose,
  onDial,
}: {
  contactId: number;
  onClose: () => void;
  onDial?: (phone: string, name: string) => void;
}) {
  const utils = trpc.useUtils();
  const { data: contact, isLoading } = trpc.contacts.get.useQuery({ id: contactId });
  const updateMutation = trpc.contacts.update.useMutation({
    onSuccess: () => utils.contacts.get.invalidate({ id: contactId }),
  });
  const addNoteMutation = trpc.contacts.addNote.useMutation({
    onSuccess: () => {
      utils.contacts.get.invalidate({ id: contactId });
      setNewNote("");
    },
  });

  const [newNote, setNewNote] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);

  const handleStatusChange = (val: string) => {
    setEditStatus(val);
    updateMutation.mutate({ id: contactId, status: val as any });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNoteMutation.mutate({
      contactId,
      note: newNote.trim(),
      statusAtTime: contact?.status,
    });
    toast.success("Note saved");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (!contact) return null;

  const statusOptions = [
    { value: "new", label: "New" },
    { value: "open", label: "Open" },
    { value: "working", label: "Working" },
    { value: "assigned", label: "Assigned" },
    { value: "done_deal", label: "Done Deal" },
    { value: "retained_sub", label: "Retained Sub" },
    { value: "cancelled_sub", label: "Cancelled Sub" },
    { value: "closed", label: "Closed" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{contact.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <LeadTypeBadge type={contact.leadType} />
            <StatusBadge status={editStatus ?? contact.status} />
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>

      {/* Contact Details */}
      <div className="bg-[#1a2535] rounded-lg p-4 space-y-2">
        {contact.phone && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Phone size={14} className="text-slate-500" />
              <span className="font-mono text-sm">{contact.phone}</span>
            </div>
            {onDial && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-3"
                onClick={() => onDial(contact.phone!, contact.name)}
              >
                <Phone size={12} className="mr-1" /> Call
              </Button>
            )}
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <span className="text-slate-500">✉</span>
            <span>{contact.email}</span>
          </div>
        )}
        {contact.agentName && (
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <User size={14} className="text-slate-500" />
            <span>{contact.agentName}</span>
          </div>
        )}
        {contact.source && (
          <div className="text-xs text-slate-500">Source: {contact.source}</div>
        )}
        {contact.leadDate && (
          <div className="text-xs text-slate-500">
            Lead date: {new Date(contact.leadDate).toLocaleDateString("en-GB")}
          </div>
        )}
      </div>

      {/* Status Update */}
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Update Status</label>
        <Select
          value={editStatus ?? contact.status}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="bg-[#1a2535] border-slate-600 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2535] border-slate-600">
            {statusOptions.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-white">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Imported Notes */}
      {contact.importedNotes && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
          <div className="text-xs text-amber-400 mb-1 font-medium">Imported Notes</div>
          <p className="text-sm text-amber-200">{contact.importedNotes}</p>
        </div>
      )}

      {/* Add Note */}
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Add Call Note</label>
        <Textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="What happened on this call?"
          className="bg-[#1a2535] border-slate-600 text-white text-sm min-h-[80px] resize-none"
        />
        <Button
          size="sm"
          className="mt-2 bg-[#2a7de1] hover:bg-[#1a6dd1] text-white text-xs"
          onClick={handleAddNote}
          disabled={!newNote.trim() || addNoteMutation.isPending}
        >
          <Plus size={12} className="mr-1" />
          Save Note
        </Button>
      </div>

      {/* Call History */}
      {contact.callNotes && contact.callNotes.length > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-2 font-medium flex items-center gap-1">
            <Clock size={12} /> Call History ({contact.callNotes.length})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {contact.callNotes.map(n => (
              <div key={n.id} className="bg-[#1a2535] rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-xs">
                    {n.agentName ?? "Rep"} · {new Date(n.createdAt).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                  {n.statusAtTime && <StatusBadge status={n.statusAtTime} />}
                </div>
                <p className="text-slate-200">{n.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Customers Page ──────────────────────────────────────────────────────
export default function Customers({ onDial }: { onDial?: (phone: string, name: string) => void }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [filterLeadType, setFilterLeadType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data: meta } = trpc.contacts.meta.useQuery();
  const { data: contacts = [], isLoading, refetch } = trpc.contacts.list.useQuery({
    search: search || undefined,
    leadType: filterLeadType || undefined,
    status: filterStatus || undefined,
    limit: 100,
  });

  const importMutation = trpc.contacts.import.useMutation({
    onSuccess: (result) => {
      toast.success(`Import complete: ${result.imported} contacts imported, ${result.skipped} skipped.`);
      utils.contacts.list.invalidate();
      setImporting(false);
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`);
      setImporting(false);
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rawRows = parseCsv(text);
      const rows = rawRows.map(mapCsvRow).filter(r => r.name);
      if (rows.length === 0) {
        toast.error("No valid rows found. Check the CSV has a Name column.");
        setImporting(false);
        return;
      }
      importMutation.mutate({ rows });
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }, [importMutation, toast]);

  const activeFilters = [filterLeadType, filterStatus].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-[#0F1923] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <h1 className="text-lg font-bold text-white">Contacts</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-600 text-slate-300 hover:text-white text-xs h-8"
            onClick={() => refetch()}
          >
            <RefreshCw size={12} className="mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-[#2a7de1] hover:bg-[#1a6dd1] text-white text-xs h-8"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <RefreshCw size={12} className="mr-1 animate-spin" />
            ) : (
              <Upload size={12} className="mr-1" />
            )}
            Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="px-4 py-3 space-y-2 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="pl-8 bg-[#1a2535] border-slate-600 text-white placeholder:text-slate-500 text-sm h-9"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className={`border-slate-600 text-xs h-9 px-3 ${activeFilters > 0 ? "border-[#2a7de1] text-[#2a7de1]" : "text-slate-400"}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={12} className="mr-1" />
            Filters {activeFilters > 0 && `(${activeFilters})`}
            <ChevronDown size={12} className="ml-1" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterLeadType} onValueChange={setFilterLeadType}>
              <SelectTrigger className="bg-[#1a2535] border-slate-600 text-white text-xs h-8 w-44">
                <SelectValue placeholder="All lead types" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a2535] border-slate-600 max-h-60">
                <SelectItem value="" className="text-slate-400 text-xs">All lead types</SelectItem>
                {meta?.leadTypes.map(lt => (
                  <SelectItem key={lt} value={lt} className="text-white text-xs">{lt}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="bg-[#1a2535] border-slate-600 text-white text-xs h-8 w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a2535] border-slate-600">
                <SelectItem value="" className="text-slate-400 text-xs">All statuses</SelectItem>
                {meta?.statuses.map(s => (
                  <SelectItem key={s} value={s} className="text-white text-xs">{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {activeFilters > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white text-xs h-8 px-2"
                onClick={() => { setFilterLeadType(""); setFilterStatus(""); }}
              >
                <X size={12} className="mr-1" /> Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Contact Count */}
      <div className="px-4 py-2 text-xs text-slate-500">
        {isLoading ? "Loading…" : `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`}
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <RefreshCw className="animate-spin mr-2" size={16} /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
            <AlertCircle size={32} className="text-slate-600" />
            <div className="text-center">
              <p className="font-medium">No contacts found</p>
              <p className="text-xs mt-1">Import a CSV file to get started</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {contacts.map((c: Contact) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a2535] cursor-pointer transition-colors"
                onClick={() => navigate(`/contacts/${c.id}`)}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#2a3545] flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-300">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm truncate">{c.name}</span>
                    <LeadTypeBadge type={c.leadType} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.phone && (
                      <span className="text-xs text-slate-400 font-mono">{c.phone}</span>
                    )}
                    {c.agentName && (
                      <span className="text-xs text-slate-500">{c.agentName}</span>
                    )}
                  </div>
                </div>

                {/* Status + Call */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={c.status} />
                  {c.phone && onDial && (
                    <button
                      className="w-7 h-7 rounded-full bg-emerald-600/20 hover:bg-emerald-600/40 flex items-center justify-center text-emerald-400 transition-colors"
                      onClick={e => { e.stopPropagation(); onDial(c.phone!, c.name); }}
                      title="Click to call"
                    >
                      <Phone size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Card Modal */}
      <Dialog open={selectedId !== null} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="bg-[#0F1923] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Customer Card</DialogTitle>
          </DialogHeader>
          {selectedId !== null && (
            <CustomerCard
              contactId={selectedId}
              onClose={() => setSelectedId(null)}
              onDial={onDial}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
