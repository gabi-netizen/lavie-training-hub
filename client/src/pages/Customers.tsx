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
  Filter,
  RefreshCw,
  AlertCircle,
  Users,
  TrendingUp,
  PhoneCall,
  UserCheck,
  UserPlus,
  Trash2,
  UserCog,
  Database,
  Flame,
  Target,
  BarChart3,
  RotateCcw,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import BillingDashboard from "@/components/BillingDashboard";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  leadType?: string | null;
  status: string;
  agentName?: string | null;
  agentEmail?: string | null;
  importedNotes?: string | null;
  source?: string | null;
  leadDate?: Date | null;
  callbackAt?: Date | null;
  address?: string | null;
  department?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── File parsing helpers (CSV + XLSX) ───────────────────────────────────────

/** Parse a CSV text string into an array of header→value maps */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

/** Parse an XLSX ArrayBuffer into an array of header→value maps */
function parseXlsx(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return raw.map(r => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });
}

/**
 * Map a raw spreadsheet row to a CRM contact row.
 * Handles standard CSV columns, purchased-data Excel format, AND Zoho CRM exports:
 *   Forename + Surname / First Name + Last Name → name
 *   Addr1/Addr2/Addr3/PostTown/PostCounty/Postcode → address (purchased data)
 *   Mailing Street/Mailing Street 2/Mailing City/Mailing Province/Mailing Postal Code → address (Zoho)
 *   Mobile / Phone → phone
 *   Agent is always left blank — assign manually after import
 */
function mapCsvRow(row: Record<string, string>) {
  const get = (key: string) => row[key]?.trim() || undefined;
  const find = (...keys: string[]) => {
    for (const k of keys) {
      const val = Object.entries(row).find(([key]) =>
        key.toLowerCase().replace(/[\s_-]/g, "").includes(k.toLowerCase().replace(/[\s_-]/g, ""))
      )?.[1]?.trim();
      if (val) return val;
    }
    return undefined;
  };

  // ── Name: First Name + Last Name (Zoho) or Forename + Surname (purchased data) ──
  const forename = get("First Name") || get("FirstName") || get("Forename");
  const surname  = get("Last Name")  || get("LastName")  || get("Surname");
  const combinedName = forename && surname
    ? `${forename} ${surname}`.trim()
    : forename || surname;
  // "Customers Name" is Zoho's full-name column; fall back to combined parts
  const name = get("Customers Name") || combinedName || find("fullname") || "";

  // ── Address: Zoho Mailing columns take priority, then purchased-data columns ──
  const zohoAddrParts = [
    get("Mailing Street"), get("Mailing Street 2"),
    get("Mailing City"), get("Mailing Province"), get("Mailing Postal Code"),
  ].filter(Boolean);
  const purchasedAddrParts = [
    get("Addr1"), get("Addr2"), get("Addr3"),
    get("PostTown"), get("PostCounty"), get("Postcode"),
  ].filter(Boolean);
  const builtAddress = zohoAddrParts.length > 0
    ? zohoAddrParts.join(", ")
    : purchasedAddrParts.length > 0
      ? purchasedAddrParts.join(", ")
      : undefined;
  // Only use a generic "address" column if no structured parts found
  const address = builtAddress || find("address");

  return {
    name,
    phone: get("Mobile") || get("Phone") || find("mobile", "phone", "tel", "number"),
    email: find("email", "mail"),
    leadType: find("leadtype", "lead type", "type of lead"),
    status: undefined,          // always start as "new" — never import status
    agentName: undefined,       // always blank — assign manually after import
    agentEmail: "trial@lavielabs.com",
    source: find("source", "campaign", "data origin"),
    notes: find("notes", "note", "comment", "rob", "reason for cancellation"),
    leadDate: find("leaddate", "lead date", "date created", "created date"),
    address,
  };
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
const LEAD_TYPE_COLOURS: Record<string, string> = {
  "Pre Cycle":               "bg-amber-100 text-amber-700 border border-amber-200",
  "Pre-Cycle-Cancelled":     "bg-orange-100 text-orange-700 border border-orange-200",
  "Pre-Cycle-Decline":       "bg-red-100 text-red-700 border border-red-200",
  "Cycle 1":                 "bg-sky-100 text-sky-700 border border-sky-200",
  "Cycle 2":                 "bg-indigo-100 text-indigo-700 border border-indigo-200",
  "Cycle 3+":                "bg-violet-100 text-violet-700 border border-violet-200",
  "Cancel 2+ Cycle":         "bg-red-100 text-red-700 border border-red-200",
  "Live Sub 3 Days":         "bg-emerald-100 text-emerald-700 border border-emerald-200",
  "Live Sub 7 Days":         "bg-emerald-100 text-emerald-700 border border-emerald-200",
  "Live Sub 14days+":        "bg-green-100 text-green-700 border border-green-200",
  "Live Sub 2nd+":           "bg-green-100 text-green-700 border border-green-200",
  "Live Sub Declined 2nd+":  "bg-yellow-100 text-yellow-700 border border-yellow-200",
  "Owned Sub":               "bg-teal-100 text-teal-700 border border-teal-200",
  "Same day as charge cancel":"bg-rose-100 text-rose-700 border border-rose-200",
  "Warm lead":               "bg-lime-100 text-lime-700 border border-lime-200",
  "Other":                   "bg-gray-100 text-gray-800 border border-gray-200",
};

const STATUS_COLOURS: Record<string, string> = {
  new:           "bg-gray-100 text-gray-800",
  open:          "bg-blue-100 text-blue-700",
  working:       "bg-amber-100 text-amber-700",
  assigned:      "bg-purple-100 text-purple-700",
  called:        "bg-sky-100 text-sky-700",
  sold:          "bg-green-100 text-green-700",
  not_interested: "bg-orange-100 text-orange-700",
  no_answer:     "bg-yellow-100 text-yellow-700",
  done_deal:     "bg-green-100 text-green-700",
  retained_sub:  "bg-emerald-100 text-emerald-700",
  cancelled_sub: "bg-red-100 text-red-700",
  closed:        "bg-gray-100 text-gray-800",
  do_not_call:   "bg-red-100 text-red-700",
  done:          "bg-indigo-100 text-indigo-700",
};

const STATUS_LABELS: Record<string, string> = {
  new:           "New",
  open:          "Open",
  working:       "Working",
  assigned:      "Assigned",
  called:        "Called",
  sold:          "Sold",
  not_interested: "Not Interested",
  no_answer:     "No Answer",
  done_deal:     "Done Deal",
  retained_sub:  "Retained Sub",
  cancelled_sub: "Cancelled Sub",
  closed:        "Closed",
  do_not_call:   "Do Not Call",
  done:          "Done",
};

// Opening-specific statuses for the filter dropdown
const OPENING_STATUSES = [
  { value: "new", label: "New" },
  { value: "assigned", label: "Assigned" },
  { value: "called", label: "Called" },
  { value: "sold", label: "Sold" },
  { value: "not_interested", label: "Not Interested" },
  { value: "no_answer", label: "No Answer" },
  { value: "skipped", label: "Skipped" },
  { value: "do_not_call", label: "Do Not Call" },
  { value: "done", label: "Done" },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────
function LeadTypeBadge({ type }: { type?: string | null }) {
  if (!type) return <span className="text-gray-800">—</span>;
  const cls = LEAD_TYPE_COLOURS[type] ?? "bg-gray-100 text-gray-800 border border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", cls)}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLOURS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", cls)}>
      {STATUS_LABELS[status] ?? status}
    </span>
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
  const [filterAgent, setFilterAgent] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterLeadDateFrom, setFilterLeadDateFrom] = useState("");
  const [filterLeadDateTo, setFilterLeadDateTo] = useState("");
  const [filterStatusDateFrom, setFilterStatusDateFrom] = useState("");
  const [filterStatusDateTo, setFilterStatusDateTo] = useState("");
  const [importing, setImporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  // ─── Department tab state ─────────────────────────────────────────────────
  const [department, setDepartment] = useState<"opening" | "retention" | "data_management" | "billing">("opening");

  // ─── User role for admin-only features ───────────────────────────────────
  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAdmin = currentUser?.role === "admin";

  // ─── Data Management state ───────────────────────────────────────────────
  const [dmDateFilter, setDmDateFilter] = useState<"today" | "this_week" | "this_month" | "all">("all");
  const { data: dmData, isLoading: dmLoading } = trpc.contacts.dataManagement.useQuery(
    { dateFilter: dmDateFilter },
    { enabled: department === "data_management" && isAdmin }
  );

  // ─── Import department picker state ───────────────────────────────────────
  const [showImportDeptPicker, setShowImportDeptPicker] = useState(false);
  const [importDepartment, setImportDepartment] = useState<"opening" | "retention">("opening");
  const [importSource, setImportSource] = useState("");
  const [importSourceError, setImportSourceError] = useState(false);

  // Reset to page 1 whenever filters/search/pageSize change
  const resetPage = () => setCurrentPage(1);

  const { data: meta } = trpc.contacts.meta.useQuery();
  const { data: totalCount = 0 } = trpc.contacts.count.useQuery({
    search: search || undefined,
    leadType: filterLeadType || undefined,
    status: filterStatus || undefined,
    agentEmail: filterAgent || undefined,
    department: (department === "data_management" || department === "billing") ? "opening" : department,
    source: filterSource || undefined,
    leadDateFrom: filterLeadDateFrom || undefined,
    leadDateTo: filterLeadDateTo || undefined,
    statusDateFrom: filterStatusDateFrom || undefined,
    statusDateTo: filterStatusDateTo || undefined,
  });
  const { data: contacts = [], isLoading, refetch } = trpc.contacts.list.useQuery({
    search: search || undefined,
    leadType: filterLeadType || undefined,
    status: filterStatus || undefined,
    agentEmail: filterAgent || undefined,
    department: (department === "data_management" || department === "billing") ? "opening" : department,
    source: filterSource || undefined,
    leadDateFrom: filterLeadDateFrom || undefined,
    leadDateTo: filterLeadDateTo || undefined,
    statusDateFrom: filterStatusDateFrom || undefined,
    statusDateTo: filterStatusDateTo || undefined,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  });

  const importMutation = trpc.contacts.import.useMutation({
    onSuccess: (result) => {
      toast.success(`Import complete: ${result.imported} contacts imported, ${result.skipped} skipped.`);
      utils.contacts.list.invalidate();
      utils.contacts.count.invalidate();
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
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

    const processRows = (rawRows: Record<string, string>[]) => {
      const rows = rawRows.map(mapCsvRow).filter(r => r.name);
      if (rows.length === 0) {
        toast.error("No valid rows found. Check the file has a Name, Forename, or Surname column.");
        setImporting(false);
        return;
      }
      importMutation.mutate({ rows, department: importDepartment, source: importSource });
    };

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        processRows(parseXlsx(buffer));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        processRows(parseCsv(text));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  }, [importMutation, importDepartment]);

  // ─── Add Contact modal ──────────────────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const emptyForm = () => ({
    name: "", phone: "", email: "", leadType: "",
    status: "new", agentName: "", agentEmail: "trial@lavielabs.com",
    source: "", leadDate: new Date().toISOString().split("T")[0], notes: "",
    address: "",
    department: "opening" as "opening" | "retention",
  });
  const [addForm, setAddForm] = useState(emptyForm);
  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      toast.success("Contact added successfully!");
      utils.contacts.list.invalidate();
      utils.contacts.count.invalidate();
      setShowAddModal(false);
      setAddForm(emptyForm());
    },
    onError: (err) => toast.error(`Failed to add contact: ${err.message}`),
  });
  const handleAddContact = () => {
    if (!addForm.name.trim()) { toast.error("Name is required"); return; }
    createMutation.mutate({
      name: addForm.name,
      phone: addForm.phone || undefined,
      email: addForm.email || undefined,
      leadType: addForm.leadType || undefined,
      status: (addForm.status || "new") as any,
      agentName: addForm.agentName || undefined,
      agentEmail: addForm.agentEmail || undefined,
      source: addForm.source || undefined,
      leadDate: addForm.leadDate || undefined,
      notes: addForm.notes || undefined,
      address: addForm.address || undefined,
      department: addForm.department,
    });
  };

  // ─── Delete contact ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted.");
      utils.contacts.list.invalidate();
      utils.contacts.count.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
      setDeleteTarget(null);
    },
  });

  // ─── Bulk select state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const allIds = contacts.map((c: Contact) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const bulkDeleteMutation = trpc.contacts.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.deleted} contact${result.deleted !== 1 ? 's' : ''} deleted.`);
      utils.contacts.list.invalidate();
      utils.contacts.count.invalidate();
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    },
    onError: (err) => {
      toast.error(`Bulk delete failed: ${err.message}`);
      setShowBulkDeleteDialog(false);
    },
  });

  // ─── Bulk assign state ──────────────────────────────────────────────────
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const { data: agentList = [] } = trpc.callCoach.getAgentList.useQuery();
  const bulkAssignMutation = trpc.contacts.bulkAssign.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.assigned} contact${result.assigned !== 1 ? 's' : ''} assigned.`);
      utils.contacts.list.invalidate();
      setSelectedIds(new Set());
      setShowBulkAssignDialog(false);
      setSelectedAgentId("");
    },
    onError: (err) => {
      toast.error(`Assign failed: ${err.message}`);
    },
  });
  const handleBulkAssign = () => {
    const agent = agentList.find((a: any) => String(a.id) === selectedAgentId);
    if (!agent) { toast.error("Please select an agent"); return; }
    bulkAssignMutation.mutate({
      ids: Array.from(selectedIds),
      agentName: agent.name!,
      agentEmail: agent.email ?? "trial@lavielabs.com",
    });
  };

  // ─── Bulk Return to System ──────────────────────────────────────────────────
  const bulkReturnMutation = trpc.contacts.bulkReturnToSystem.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.returned} contact${result.returned !== 1 ? 's' : ''} returned to system.`);
      utils.contacts.list.invalidate();
      setSelectedIds(new Set());
      setShowBulkAssignDialog(false);
    },
    onError: (err) => {
      toast.error(`Return failed: ${err.message}`);
    },
  });
  const handleBulkReturn = () => {
    bulkReturnMutation.mutate({ ids: Array.from(selectedIds) });
  };

  // ─── Bulk Change Status ──────────────────────────────────────────────────
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("");
  const bulkUpdateStatusMutation = trpc.contacts.bulkUpdateStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.updated} contact${result.updated !== 1 ? 's' : ''} status updated.`);
      utils.contacts.list.invalidate();
      utils.contacts.count.invalidate();
      setSelectedIds(new Set());
      setBulkStatusValue("");
    },
    onError: (err) => {
      toast.error(`Status update failed: ${err.message}`);
    },
  });
  const handleBulkStatusChange = (newStatus: string) => {
    if (!newStatus) return;
    bulkUpdateStatusMutation.mutate({
      ids: Array.from(selectedIds),
      status: newStatus as any,
    });
  };

  const BULK_STATUS_OPTIONS = [
    { value: "new", label: "New" },
    { value: "no_answer", label: "No Answer" },
    { value: "working", label: "In Progress" },
    { value: "done_deal", label: "Done Deals" },
    { value: "assigned", label: "Callback Set" },
  ] as const;

  const activeFilters = [filterLeadType, filterStatus, filterAgent, filterSource, filterLeadDateFrom, filterLeadDateTo, filterStatusDateFrom, filterStatusDateTo].filter(Boolean).length;

  // Stats
  const totalContacts = contacts.length;
  const dealsDone = contacts.filter((c: Contact) => c.status === "done_deal").length;
  const working = contacts.filter((c: Contact) => c.status === "working" || c.status === "open").length;
  const callbacks = contacts.filter((c: Contact) => c.callbackAt).length;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-sm text-gray-700 mt-0.5 hidden sm:block">Manage and track your customer leads</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="border-2 border-gray-900 text-gray-800 hover:text-gray-900 h-9 font-semibold"
              onClick={() => refetch()}
            >
              <RefreshCw size={14} className="mr-1.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 font-semibold border-2 border-indigo-800"
              onClick={() => {
                setImportDepartment((department === "data_management" || department === "billing") ? "opening" : department);
                setShowImportDeptPicker(true);
              }}
              disabled={importing}
            >
              {importing ? (
                <RefreshCw size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1.5" />
              )}
              Import CSV / XLSX
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white h-9 px-4 font-semibold border-2 border-green-800"
              onClick={() => {
                setAddForm({ ...emptyForm(), department: (department === "data_management" || department === "billing") ? "opening" : department });
                setShowAddModal(true);
              }}
            >
              <UserPlus size={14} className="mr-1.5" />
              Add Contact
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          </div>
        </div>

        {/* ── Department Tabs ── */}
        <div className="mt-4">
          <Tabs value={department} onValueChange={(v: string) => { setDepartment(v as "opening" | "retention" | "data_management" | "billing"); resetPage(); setSelectedIds(new Set()); setFilterLeadType(""); setFilterStatus(""); setFilterAgent(""); setFilterSource(""); setFilterLeadDateFrom(""); setFilterLeadDateTo(""); }}>
            <TabsList>
              <TabsTrigger value="opening" className="px-6">Opening</TabsTrigger>
              <TabsTrigger value="retention" className="px-6">Retention</TabsTrigger>
              {isAdmin && <TabsTrigger value="data_management" className="px-6">Data Management</TabsTrigger>}
              {isAdmin && <TabsTrigger value="billing" className="px-6">Billing</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>

        {/* Stats row (hidden when Data Management or Billing tab is active) */}
        {department !== "data_management" && department !== "billing" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { icon: Users,      label: "Total Contacts", value: totalContacts, colour: "text-indigo-600 bg-indigo-50" },
            { icon: TrendingUp, label: "Done Deals",      value: dealsDone,    colour: "text-green-600 bg-green-50" },
            { icon: PhoneCall,  label: "In Progress",     value: working,      colour: "text-amber-600 bg-amber-50" },
            { icon: UserCheck,  label: "Callbacks Set",   value: callbacks,    colour: "text-purple-600 bg-purple-50" },
          ].map(({ icon: Icon, label, value, colour }) => (
            <div key={label} className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", colour)}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
                <p className="text-xs text-gray-700 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── Data Management Tab Content ── */}
      {department === "data_management" && isAdmin && (
        <div className="px-4 md:px-8 py-4 md:py-6">
          {dmLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-900">
              <RefreshCw className="animate-spin mr-2" size={18} /> Loading data management stats…
            </div>
          ) : dmData ? (
            <>
              {/* A) Top Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {/* Total Data */}
                <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-indigo-600 bg-indigo-50">
                    <Database size={18} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-none">{dmData.summary.totalData.toLocaleString()}</p>
                    <p className="text-xs text-gray-900 mt-0.5">Total Data</p>
                  </div>
                </div>
                {/* Unassigned */}
                <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-red-600 bg-red-50">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-none">{dmData.summary.unassigned.toLocaleString()}</p>
                    <p className="text-xs text-gray-900 mt-0.5">Unassigned</p>
                  </div>
                </div>
                {/* Deals */}
                <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-green-600 bg-green-50">
                    <Target size={18} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-none">{dmData.summary.dealsToday} / {dmData.summary.dealsThisWeek} / {dmData.summary.dealsThisMonth}</p>
                    <p className="text-xs text-gray-900 mt-0.5">Deals (Today / Week / Month)</p>
                  </div>
                </div>
                {/* Overall Burn Rate */}
                <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-900 px-4 py-3 shadow-sm">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", dmData.summary.overallBurnRate > 60 ? "text-red-600 bg-red-50" : dmData.summary.overallBurnRate > 40 ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50")}>
                    <Flame size={18} />
                  </div>
                  <div>
                    <p className={cn("text-xl font-bold leading-none", dmData.summary.overallBurnRate > 60 ? "text-red-600" : dmData.summary.overallBurnRate > 40 ? "text-amber-600" : "text-gray-900")}>{dmData.summary.overallBurnRate}%</p>
                    <p className="text-xs text-gray-900 mt-0.5">Overall Burn Rate</p>
                  </div>
                </div>
              </div>

              {/* B) Date Filter Bar */}
              <div className="flex items-center gap-2 mb-6">
                <span className="text-sm font-semibold text-gray-900 mr-2">Filter by:</span>
                {(["today", "this_week", "this_month", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDmDateFilter(f)}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-colors",
                      dmDateFilter === f
                        ? "bg-indigo-600 text-white border-indigo-800"
                        : "bg-white text-gray-900 border-gray-900 hover:bg-gray-50"
                    )}
                  >
                    {f === "today" ? "Today" : f === "this_week" ? "This Week" : f === "this_month" ? "This Month" : "All"}
                  </button>
                ))}
              </div>

              {/* C) Main Table — Agent Performance */}
              <div className="bg-white rounded-xl border-2 border-gray-900 shadow-sm overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-900">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Agent Name</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Assigned</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Worked</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">NA</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Sold</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Done</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Callback</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Remaining</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wide">Burn Rate %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {dmData.agents.map((agent: { agentName: string; assigned: number; worked: number; na: number; sold: number; done: number; callback: number; remaining: number; burnRate: number }) => (
                        <tr key={agent.agentName} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{agent.agentName}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center">{agent.assigned}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center">{agent.worked}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center">{agent.na}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center font-semibold text-green-700">{agent.sold}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center">{agent.done}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center">{agent.callback}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-center font-semibold">{agent.remaining}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold",
                              agent.burnRate > 60 ? "bg-red-100 text-red-700" :
                              agent.burnRate >= 40 ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            )}>
                              {agent.burnRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                      {/* TOTAL row */}
                      <tr className="bg-gray-100 border-t-2 border-gray-900 font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900 font-bold">TOTAL</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.assigned, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.worked, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.na, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold text-green-700">{dmData.agents.reduce((s: number, a: any) => s + a.sold, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.done, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.callback, 0)}</td>
                        <td className="px-3 py-3 text-sm text-gray-900 text-center font-bold">{dmData.agents.reduce((s: number, a: any) => s + a.remaining, 0)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold",
                            dmData.summary.overallBurnRate > 60 ? "bg-red-100 text-red-700" :
                            dmData.summary.overallBurnRate >= 40 ? "bg-amber-100 text-amber-700" :
                            "bg-green-100 text-green-700"
                          )}>
                            {dmData.summary.overallBurnRate}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* D) Bottom Section — Cooling Pool Status (placeholder) */}
              <div className="bg-white rounded-xl border-2 border-gray-900 px-6 py-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={18} className="text-gray-900" />
                  <h3 className="text-base font-bold text-gray-900">Cooling Pool & Smart Retry</h3>
                </div>
                <p className="text-sm text-gray-900">Coming Soon — This section will show leads in the cooling pool, retry schedules, and smart recycling metrics.</p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-900">
              <AlertCircle size={18} className="mr-2" /> Failed to load data management stats.
            </div>
          )}
        </div>
      )}

      {/* ── Billing Tab Content ── */}
      {department === "billing" && isAdmin && (
        <BillingDashboard />
      )}

      {/* ── Search & Filters (hidden when Data Management or Billing tab is active) ── */}
      {department !== "data_management" && department !== "billing" && (
      <>
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-800" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search by name, phone, or email…"
              className="pl-9 bg-white border-gray-200 text-gray-800 placeholder:text-gray-800 text-sm h-9 focus-visible:ring-indigo-400"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              "border-2 border-gray-900 text-gray-800 h-9 px-3 gap-1.5 font-semibold",
              activeFilters > 0 && "border-indigo-600 text-indigo-600 bg-indigo-50"
            )}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} />
            Filters
            {activeFilters > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
            <ChevronDown size={13} />
          </Button>

          {showFilters && department === "opening" && (
            <>
              {/* Source filter (Opening only) */}
              <Select value={filterSource || "__all__"} onValueChange={v => { setFilterSource(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-48">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 max-h-64">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All sources</SelectItem>
                  {meta?.sources?.map(s => (
                    <SelectItem key={s} value={s} className="text-gray-800 text-sm">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter (Opening-specific statuses) */}
              <Select value={filterStatus || "__all__"} onValueChange={v => { setFilterStatus(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All statuses</SelectItem>
                  {OPENING_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-gray-800 text-sm">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Agent filter */}
              <Select value={filterAgent || "__all__"} onValueChange={v => { setFilterAgent(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-48">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 max-h-64">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All agents</SelectItem>
                  <SelectItem value="unassigned" className="text-gray-800 text-sm">Unassigned</SelectItem>
                  {agentList.filter((a: any) => a.team === "opening").map((a: any) => (
                    <SelectItem key={a.id} value={a.email ?? `agent-${a.id}`} className="text-gray-800 text-sm">{a.name ?? `Agent #${a.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Lead Date range filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs font-medium">Lead:</span>
                <input
                  type="date"
                  value={filterLeadDateFrom}
                  onChange={e => { setFilterLeadDateFrom(e.target.value); resetPage(); }}
                  className="bg-white border border-gray-200 text-gray-700 text-sm h-9 px-2 rounded-md w-[130px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="From"
                  title="Lead Date From"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={filterLeadDateTo}
                  onChange={e => { setFilterLeadDateTo(e.target.value); resetPage(); }}
                  className="bg-white border border-gray-200 text-gray-700 text-sm h-9 px-2 rounded-md w-[130px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="To"
                  title="Lead Date To"
                />
              </div>
              {/* Status Date (updatedAt) range filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs font-medium">Action:</span>
                <input
                  type="date"
                  value={filterStatusDateFrom}
                  onChange={e => { setFilterStatusDateFrom(e.target.value); resetPage(); }}
                  className="bg-white border border-orange-200 text-gray-700 text-sm h-9 px-2 rounded-md w-[130px] focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="From"
                  title="Action Date From"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={filterStatusDateTo}
                  onChange={e => { setFilterStatusDateTo(e.target.value); resetPage(); }}
                  className="bg-white border border-orange-200 text-gray-700 text-sm h-9 px-2 rounded-md w-[130px] focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="To"
                  title="Action Date To"
                />
              </div>

              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-800 hover:text-gray-700 h-9 px-2 gap-1"
                  onClick={() => { setFilterSource(""); setFilterStatus(""); setFilterAgent(""); setFilterLeadDateFrom(""); setFilterLeadDateTo(""); setFilterStatusDateFrom(""); setFilterStatusDateTo(""); }}
                >
                  <X size={13} /> Clear
                </Button>
              )}
            </>
          )}

          {showFilters && department === "retention" && (
            <>
              {/* Lead Type filter (Retention only) */}
              <Select value={filterLeadType || "__all__"} onValueChange={v => { setFilterLeadType(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-48">
                  <SelectValue placeholder="All lead types" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 max-h-64">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All lead types</SelectItem>
                  {meta?.leadTypes.map(lt => (
                    <SelectItem key={lt} value={lt} className="text-gray-800 text-sm">{lt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter (Retention - all statuses) */}
              <Select value={filterStatus || "__all__"} onValueChange={v => { setFilterStatus(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All statuses</SelectItem>
                  {meta?.statuses.map(s => (
                    <SelectItem key={s} value={s} className="text-gray-800 text-sm">{STATUS_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Agent filter */}
              <Select value={filterAgent || "__all__"} onValueChange={v => { setFilterAgent(v === "__all__" ? "" : v); resetPage(); }}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-48">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 max-h-64">
                  <SelectItem value="__all__" className="text-gray-700 text-sm">All agents</SelectItem>
                  <SelectItem value="unassigned" className="text-gray-800 text-sm">Unassigned</SelectItem>
                  {agentList.filter((a: any) => a.team === "retention").map((a: any) => (
                    <SelectItem key={a.id} value={a.email ?? `agent-${a.id}`} className="text-gray-800 text-sm">{a.name ?? `Agent #${a.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-800 hover:text-gray-700 h-9 px-2 gap-1"
                  onClick={() => { setFilterLeadType(""); setFilterStatus(""); setFilterAgent(""); }}
                >
                  <X size={13} /> Clear
                </Button>
              )}
            </>
          )}

          {/* ── Page size picker ── */}
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); resetPage(); }}>
            <SelectTrigger className="bg-white border-gray-200 text-gray-700 text-sm h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              {[10, 25, 50, 100, 200].map(n => (
                <SelectItem key={n} value={String(n)} className="text-gray-800 text-sm">Show {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="ml-auto text-sm text-gray-800">
            {isLoading ? "Loading…" : `${totalCount} contact${totalCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Bulk Action Toolbar ── */}
      {selectedIds.size > 0 && (
        <div className="mx-3 md:mx-8 mt-3 flex items-center gap-3 bg-indigo-50 border-2 border-indigo-300 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-indigo-700">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-700 hover:text-gray-900 h-8 px-3"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={bulkStatusValue}
              onValueChange={(val) => handleBulkStatusChange(val)}
            >
              <SelectTrigger className="h-8 w-[160px] bg-white border-indigo-300 text-slate-800 font-semibold text-sm">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                {BULK_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-slate-800">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-4 font-semibold"
              onClick={() => setShowBulkAssignDialog(true)}
            >
              <UserCog size={13} className="mr-1.5" />
              Assign {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white h-8 px-4 font-semibold"
              onClick={() => setShowBulkDeleteDialog(true)}
            >
              <Trash2 size={13} className="mr-1.5" />
              Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="px-3 md:px-8 py-4 md:py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-800">
            <RefreshCw className="animate-spin mr-2" size={18} /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-800 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <AlertCircle size={28} className="text-gray-800" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800">No contacts found</p>
              {activeFilters > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600">Your active filters returned 0 results:</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                    {filterSource && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Source: {filterSource}</span>}
                    {filterStatus && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Status: {OPENING_STATUSES.find(s => s.value === filterStatus)?.label || ((meta?.statuses as unknown as string[]) || []).find(s => s === filterStatus) || filterStatus}</span>}
                    {filterAgent && filterAgent !== 'unassigned' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Agent: {agentList.find((a: any) => a.email === filterAgent)?.name || filterAgent}</span>}
                    {filterAgent === 'unassigned' && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Agent: Unassigned</span>}
                    {filterLeadType && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Lead Type: {filterLeadType}</span>}
                    {filterLeadDateFrom && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Lead From: {filterLeadDateFrom}</span>}
                    {filterLeadDateTo && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Lead To: {filterLeadDateTo}</span>}
                    {filterStatusDateFrom && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Action From: {filterStatusDateFrom}</span>}
                    {filterStatusDateTo && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Action To: {filterStatusDateTo}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Try removing one or more filters to see results</p>
                </div>
              ) : (
                <p className="text-sm mt-1">Import a CSV file to get started</p>
              )}
            </div>
            {activeFilters > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                onClick={() => { setFilterSource(""); setFilterStatus(""); setFilterAgent(""); setFilterLeadType(""); setFilterLeadDateFrom(""); setFilterLeadDateTo(""); setFilterStatusDateFrom(""); setFilterStatusDateTo(""); }}
              >
                Clear All Filters
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2"
                onClick={() => {
                  setImportDepartment(department);
                  setShowImportDeptPicker(true);
                }}
              >
                <Upload size={14} className="mr-1.5" /> Import CSV
              </Button>
            )}
          </div>
        ) : (
          <>
          {/* ── Mobile card list (< md) ── */}
          <div className="md:hidden flex flex-col gap-2">
            {contacts.map((c: Contact) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border-2 border-gray-900 px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-indigo-50 transition-colors"
                onClick={() => navigate(`/contacts/${c.id}`)}
              >
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-indigo-600">{c.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <LeadTypeBadge type={c.leadType} />
                    <StatusBadge status={c.status} />
                  </div>
                  {c.phone && <p className="text-xs text-gray-700 font-mono mt-0.5">{c.phone}</p>}
                </div>
                {c.phone && onDial && (
                  <button
                    className="w-9 h-9 rounded-full bg-green-100 border-2 border-green-600 flex items-center justify-center text-green-600 shrink-0"
                    onClick={e => { e.stopPropagation(); onDial(c.phone!, c.name); }}
                  >
                    <Phone size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ── Desktop table (>= md) ── */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3.5 w-[48px]" onClick={toggleSelectAll}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      className={someSelected ? "data-[state=unchecked]:bg-indigo-200" : ""}
                    />
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[240px]">Name</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[160px]">Lead Type</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[130px]">Status</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[150px]">Phone</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[200px]">Address</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[140px]">Agent</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[200px]">Agent Email</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-700 uppercase tracking-wide w-[110px]">Lead Date</th>
                  <th className="px-4 py-3.5 w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contacts.map((c: Contact) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "hover:bg-indigo-50/40 cursor-pointer transition-colors group border-b-2 border-gray-200 last:border-b-0",
                      selectedIds.has(c.id) && "bg-indigo-50"
                    )}
                    onClick={() => navigate(`/contacts/${c.id}`)}
                  >
                    <td className="px-4 py-3.5" onClick={e => toggleSelect(c.id, e)}>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => {}}
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-indigo-600">{c.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{c.name}</p>
                          {c.email && <p className="text-xs text-gray-800 truncate max-w-[160px]">{c.email.toLowerCase()}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><LeadTypeBadge type={c.leadType} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3.5"><span className="text-sm text-gray-800 font-mono">{c.phone ?? "—"}</span></td>
                    <td className="px-4 py-3.5"><span className="text-xs text-gray-700 max-w-[180px] truncate block" title={c.address ?? ""}>{c.address ? c.address.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : "—"}</span></td>
                    <td className="px-4 py-3.5"><span className="text-sm text-gray-800">{c.agentName ?? "—"}</span></td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-800 font-mono">{c.agentEmail ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3.5"><span className="text-sm text-gray-700">{c.source ?? "—"}</span></td>
                    <td className="px-4 py-3.5"><span className="text-xs text-gray-800">{c.leadDate ? new Date(c.leadDate).toLocaleDateString("en-GB") : "—"}</span></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {c.phone && onDial && (
                          <button
                            className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-500 flex items-center justify-center text-green-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                            onClick={e => { e.stopPropagation(); onDial(c.phone!, c.name); }}
                          >
                            <Phone size={14} />
                          </button>
                        )}
                        <button
                          className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-500 flex items-center justify-center text-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                          onClick={e => { e.stopPropagation(); setDeleteTarget({ id: c.id, name: c.name }); }}
                          title="Delete contact"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* ── Pagination bar ── */}
        {totalCount > pageSize && (() => {
          const totalPages = Math.ceil(totalCount / pageSize);
          const pages: (number | "...")[] = [];
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
          } else {
            pages.push(1);
            if (currentPage > 3) pages.push("...");
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
            if (currentPage < totalPages - 2) pages.push("...");
            pages.push(totalPages);
          }
          return (
            <div className="flex items-center justify-center gap-1 py-4 border-t border-gray-100">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {pages.map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={cn(
                      "w-9 h-9 text-sm rounded-lg border font-medium",
                      currentPage === p
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          );
        })()}
      </div>
      </>
      )}

      {/* ─── Import Department Picker Dialog ─────────────────────────────────────────── */}
      <Dialog open={showImportDeptPicker} onOpenChange={(open) => { setShowImportDeptPicker(open); if (!open) { setImportSourceError(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload size={18} className="text-indigo-600" />
              Import Settings
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Department</p>
              <p className="text-xs text-gray-500">Select the department for all imported contacts:</p>
              <div className="flex gap-3">
                <Button
                  variant={importDepartment === "opening" ? "default" : "outline"}
                  className={cn(
                    "flex-1 h-12 text-base font-semibold",
                    importDepartment === "opening"
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-800"
                      : "border-2 border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
                  )}
                  onClick={() => setImportDepartment("opening")}
                >
                  Opening
                </Button>
                <Button
                  variant={importDepartment === "retention" ? "default" : "outline"}
                  className={cn(
                    "flex-1 h-12 text-base font-semibold",
                    importDepartment === "retention"
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-800"
                      : "border-2 border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
                  )}
                  onClick={() => setImportDepartment("retention")}
                >
                  Retention
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Source Name <span className="text-red-500">*</span></p>
              <p className="text-xs text-gray-500">Required — identifies this data batch (e.g. "40-60 Premium")</p>
              <Input
                value={importSource}
                onChange={(e) => { setImportSource(e.target.value); setImportSourceError(false); }}
                placeholder="e.g. 40-60 Premium"
                className={cn(importSourceError && "border-red-500 ring-1 ring-red-500")}
              />
              {importSourceError && <p className="text-xs text-red-500">Please add the data source name</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowImportDeptPicker(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => {
                if (!importSource.trim()) {
                  setImportSourceError(true);
                  return;
                }
                setShowImportDeptPicker(false);
                fileRef.current?.click();
              }}
            >
              Continue to File Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Assign Dialog─────────────────────────────────────────────────────────────────── */}
      <Dialog open={showBulkAssignDialog} onOpenChange={(open) => { setShowBulkAssignDialog(open); if (!open) setSelectedAgentId(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''} to Agent</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-2 block">Select Agent</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agentList.filter((agent: any) => agent.team === department).map((agent: any) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.name}</span>
                        {agent.email && <span className="text-xs text-gray-500">{agent.email}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setShowBulkAssignDialog(false); setSelectedAgentId(""); }}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleBulkReturn}
              disabled={bulkReturnMutation.isPending}
            >
              <RotateCcw size={13} className="mr-1.5" />
              {bulkReturnMutation.isPending ? "Returning…" : `Return to System`}
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleBulkAssign}
              disabled={!selectedAgentId || bulkAssignMutation.isPending}
            >
              {bulkAssignMutation.isPending ? "Assigning…" : `Assign ${selectedIds.size} Contact${selectedIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Delete Confirmation Dialog ─────────────────────────────────────────────────────────────────── */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting…" : `Delete ${selectedIds.size} Contact${selectedIds.size !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add Contact Modal ─────────────────────────────────────────────── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={18} className="text-green-600" />
              Add New Contact
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Name */}
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Name <span className="text-red-500">*</span></Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            {/* Phone */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Phone</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44 7700 900000" />
            </div>
            {/* Email */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Email</Label>
              <Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            {/* Department */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Department</Label>
              <Select value={addForm.department} onValueChange={v => setAddForm(f => ({ ...f, department: v as "opening" | "retention" }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="retention">Retention</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Lead Type */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Lead Type</Label>
              <Select value={addForm.leadType} onValueChange={v => setAddForm(f => ({ ...f, leadType: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {(meta?.leadTypes ?? []).map(lt => (
                    <SelectItem key={lt} value={lt}>{lt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Status */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Status</Label>
              <Select value={addForm.status} onValueChange={v => setAddForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(meta?.statuses ?? []).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Agent Name */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Agent</Label>
              <Input value={addForm.agentName} onChange={e => setAddForm(f => ({ ...f, agentName: e.target.value }))} placeholder="Agent name" />
            </div>
            {/* Agent Email */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Agent Email</Label>
              <Input value={addForm.agentEmail} onChange={e => setAddForm(f => ({ ...f, agentEmail: e.target.value }))} placeholder="trial@lavielabs.com" />
            </div>
            {/* Source */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Source</Label>
              <Input value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Facebook, Referral" />
            </div>
            {/* Lead Date */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Lead Date</Label>
              <Input type="date" value={addForm.leadDate} onChange={e => setAddForm(f => ({ ...f, leadDate: e.target.value }))} />
            </div>
            {/* Address */}
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Address</Label>
              <Input value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, Town, County, Postcode" />
            </div>
            {/* Notes */}
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Notes</Label>
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={addForm.notes}
                onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this contact..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleAddContact}
              disabled={createMutation.isPending || !addForm.name.trim()}
            >
              {createMutation.isPending ? "Adding..." : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
