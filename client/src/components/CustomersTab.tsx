import React, { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  Upload,
  Search,
  Users,
  UserCheck,
  UserPlus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
} from "lucide-react";

// ─── Status Badge Colors ────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: "bg-blue-100", text: "text-blue-800" },
  contacted: { bg: "bg-yellow-100", text: "text-yellow-800" },
  callback: { bg: "bg-orange-100", text: "text-orange-800" },
  done: { bg: "bg-green-100", text: "text-green-800" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return `£${num.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────────
export function CustomersTab() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── State ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignAgent, setAssignAgent] = useState("");
  const [assignDepartment, setAssignDepartment] = useState<"opening" | "retention">("opening");

  // Add Customer modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addLeadType, setAddLeadType] = useState("");
  const [addAgent, setAddAgent] = useState("");
  const [addDepartment, setAddDepartment] = useState<"opening" | "retention">("retention");

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = trpc.customers.getCustomers.useQuery({
    search: search || undefined,
    assignedAgent: agentFilter || undefined,
    department: (departmentFilter as "opening" | "retention") || undefined,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    page,
    perPage: 50,
  });

  const { data: agentList = [] } = trpc.callCoach.getAgentList.useQuery();
  const { data: sources = [] } = trpc.customers.getCustomerSources.useQuery();

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const importMutation = trpc.customers.importCustomers.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} customers, ${result.skipped} skipped (duplicate email)`);
      utils.customers.getCustomers.invalidate();
      utils.customers.getCustomerSources.invalidate();
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const bulkAssignMutation = trpc.customers.bulkAssign.useMutation({
    onSuccess: () => {
      toast.success("Customers assigned successfully");
      setSelectedIds([]);
      setShowAssignModal(false);
      utils.customers.getCustomers.invalidate();
    },
    onError: (err) => toast.error(`Assign failed: ${err.message}`),
  });

  const bulkDeleteMutation = trpc.customers.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast.success(`Deleted ${result.count} customers`);
      setSelectedIds([]);
      utils.customers.getCustomers.invalidate();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const createCustomerMutation = trpc.customers.createCustomer.useMutation({
    onSuccess: () => {
      toast.success("Customer added successfully");
      setShowAddModal(false);
      setAddName(""); setAddEmail(""); setAddPhone(""); setAddAddress(""); setAddLeadType(""); setAddAgent(""); setAddDepartment("retention");
      utils.customers.getCustomers.invalidate();
    },
    onError: (err) => toast.error(`Failed to add customer: ${err.message}`),
  });

  const updateStatusMutation = trpc.customers.updateCustomerStatus.useMutation({
    onSuccess: () => {
      utils.customers.getCustomers.invalidate();
    },
  });

  const assignMutation = trpc.customers.assignCustomer.useMutation({
    onSuccess: () => {
      toast.success("Customer assigned");
      utils.customers.getCustomers.invalidate();
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleCsvImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const mapped = rows
          .filter((r) => r.name || r.Name || r["First Name"] || r["first name"] || r["Last Name"] || r["last name"])
          .map((r) => {
            // Build name from first+last or single name field
            const firstName = r["First Name"] || r["first name"] || r["firstName"] || "";
            const lastName = r["Last Name"] || r["last name"] || r["lastName"] || "";
            const fullName = r.name || r.Name || [firstName, lastName].filter(Boolean).join(" ") || "";

            // Build address from mailing fields or single address field
            const street = r["Mailing Street"] || r["mailing street"] || r["mailingStreet"] || "";
            const city = r["Mailing City"] || r["mailing city"] || r["mailingCity"] || "";
            const postcode = r["Mailing Postcode"] || r["mailing postcode"] || r["Mailing Zip"] || r["mailing zip"] || r["mailingPostcode"] || "";
            const combinedAddress = [street, city, postcode].filter(Boolean).join(", ");
            const address = r.address || r.Address || combinedAddress || undefined;

            return {
              name: fullName,
              email: r.email || r.Email || undefined,
              phone: r.phone || r.Phone || r.mobile || r.Mobile || r["Mobile"] || r["mobile"] || undefined,
              address,
              totalSpent: r.totalSpent || r.TotalSpent || r.total_spent || r["Total Amount"] || r["total amount"] || r["totalAmount"] || undefined,
              lastPurchaseDate: r.lastPurchaseDate || r.LastPurchaseDate || r.last_purchase_date || undefined,
              source: r.source || r.Source || undefined,
              notes: r.notes || r.Notes || undefined,
              assignedAgent:
                r["Customers Owner"] ||
                r["customers owner"] ||
                r["Customer Owner"] ||
                r["customer owner"] ||
                r["Lead Owner"] ||
                r["lead owner"] ||
                r["Owner"] ||
                r["owner"] ||
                r["Assigned Agent"] ||
                r["assigned agent"] ||
                r["Agent"] ||
                r["agent"] ||
                undefined,
            };
          });

        if (mapped.length === 0) {
          toast.error("No valid rows found in CSV. Expected columns: name (or First Name + Last Name)");
          return;
        }

        toast.info(`Importing ${mapped.length} customers...`);
        importMutation.mutate({ customers: mapped });
      },
      error: (err) => {
        toast.error(`CSV parse error: ${err.message}`);
      },
    });

    // Reset file input
    e.target.value = "";
  }, [importMutation]);

  const handleSelectAll = () => {
    if (!data?.customers) return;
    if (selectedIds.length === data.customers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.customers.map((c) => c.id));
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} customers? This cannot be undone.`)) return;
    bulkDeleteMutation.mutate({ ids: selectedIds });
  };

  const handleBulkAssignConfirm = () => {
    if (!assignAgent) {
      toast.error("Please select an agent");
      return;
    }
    bulkAssignMutation.mutate({
      ids: selectedIds,
      assignedAgent: assignAgent,
      department: assignDepartment,
    });
  };

  const resetFilters = () => {
    setSearch("");
    setAgentFilter("");
    setDepartmentFilter("");
    setStatusFilter("");
    setSourceFilter("");
    setPage(1);
  };

  const customersList = data?.customers ?? [];
  const totalCount = data?.totalCount ?? 0;
  const summary = data?.summary ?? { total: 0, assigned: 0, unassigned: 0, opening: 0, retention: 0 };
  const totalPages = Math.ceil(totalCount / 50);

  return (
    <div className="space-y-4">
      {/* ─── Summary Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-600">Total Customers</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{summary.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-gray-600">Assigned</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{summary.assigned.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4 text-yellow-600" />
            <span className="text-xs font-medium text-gray-600">Unassigned</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{summary.unassigned.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-xs font-medium text-gray-600">Opening</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{summary.opening.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span className="text-xs font-medium text-gray-600">Retention</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{summary.retention.toLocaleString()}</p>
        </div>
      </div>

      {/* ─── Action Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg shadow-lg shadow-green-200 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleCsvImport}
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-200 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Customer
        </button>

        {selectedIds.length > 0 && (
          <>
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              Bulk Assign ({selectedIds.length})
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedIds.length})
            </button>
          </>
        )}

        <div className="ml-auto text-sm text-gray-600">
          {importMutation.isPending && "Importing..."}
        </div>
      </div>

      {/* ─── Filter Bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Agents</option>
            {agentList.map((a: any) => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Departments</option>
            <option value="opening">Opening</option>
            <option value="retention">Retention</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="callback">Callback</option>
            <option value="done">Done</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* ─── Table ──────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div
          className="grid gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide"
          style={{ gridTemplateColumns: "32px 1.5fr 1.5fr 1fr 1.2fr 1fr 0.8fr 1fr 1fr 0.8fr 0.7fr 0.6fr" }}
        >
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={customersList.length > 0 && selectedIds.length === customersList.length}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-gray-300"
            />
          </div>
          <div>Name</div>
          <div>Email</div>
          <div>Phone</div>
          <div>Address</div>
          <div>Source</div>
          <div>Total Spent</div>
          <div>Last Purchase</div>
          <div>Agent</div>
          <div>Dept</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="px-4 py-8 text-center text-gray-500">Loading...</div>
        ) : customersList.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">No customers found</div>
        ) : (
          customersList.map((customer) => (
            <div
              key={customer.id}
              className="grid gap-2 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 items-center text-sm"
              style={{ gridTemplateColumns: "32px 1.5fr 1.5fr 1fr 1.2fr 1fr 0.8fr 1fr 1fr 0.8fr 0.7fr 0.6fr" }}
            >
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(customer.id)}
                  onChange={() => handleToggleSelect(customer.id)}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </div>
              <div className="font-medium text-blue-700 truncate" title={customer.name}>
                {customer.name}
              </div>
              <div className="text-gray-600 truncate" title={customer.email ?? ""}>
                {customer.email || "—"}
              </div>
              <div className="text-gray-600 truncate">
                {customer.phone || "—"}
              </div>
              <div className="text-gray-600 truncate" title={customer.address ?? ""}>
                {customer.address || "—"}
              </div>
              <div className="text-gray-600 truncate" title={customer.source ?? ""}>
                {customer.source || "—"}
              </div>
              <div className="text-gray-800 font-medium">
                {formatCurrency(customer.totalSpent)}
              </div>
              <div className="text-gray-600">
                {formatDate(customer.lastPurchaseDate)}
              </div>
              <div className="text-gray-600 truncate">
                {customer.assignedAgent || "—"}
              </div>
              <div>
                {customer.department ? (
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.department === "opening"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {customer.department === "opening" ? "Opening" : "Retention"}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
              <div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_COLORS[customer.status]?.bg ?? "bg-gray-100"
                  } ${STATUS_COLORS[customer.status]?.text ?? "text-gray-800"}`}
                >
                  {customer.status}
                </span>
              </div>
              <div>
                <button
                  onClick={() => {
                    setSelectedIds([customer.id]);
                    setShowAssignModal(true);
                  }}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                  title="Assign"
                >
                  Assign
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── Pagination ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing {customersList.length > 0 ? (page - 1) * 50 + 1 : 0}–{Math.min(page * 50, totalCount)} of {totalCount.toLocaleString()} customers
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Assign Modal ───────────────────────────────────────────────────────── */}
      {/* ─── Add Customer Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Customer</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="07xxx or +44xxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={addAddress}
                  onChange={(e) => setAddAddress(e.target.value)}
                  placeholder="Street, City, Postcode"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Type</label>
                <select
                  value={addLeadType}
                  onChange={(e) => setAddLeadType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select lead type...</option>
                  <option value="Cat to Rob">Cat to Rob</option>
                  <option value="Gabi to Rob">Gabi to Rob</option>
                  <option value="Pre-Cycle-Cancelled">Pre-Cycle-Cancelled</option>
                  <option value="Cancel Live Sub (Cycle 1)">Cancel Live Sub (Cycle 1)</option>
                  <option value="Cancel Live Sub (Cycle 2+)">Cancel Live Sub (Cycle 2+)</option>
                  <option value="Hot Lead">Hot Lead</option>
                  <option value="Pre-Cycle-Decline">Pre-Cycle-Decline</option>
                  <option value="Decline Live Sub">Decline Live Sub</option>
                  <option value="End of Instalment">End of Instalment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Owner</label>
                <select
                  value={addAgent}
                  onChange={(e) => setAddAgent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {agentList.map((a: any) => (
                    <option key={a.id} value={a.name}>{a.name} ({a.team})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="addDept" value="retention" checked={addDepartment === "retention"} onChange={() => setAddDepartment("retention")} className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-gray-800">Retention</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="addDept" value="opening" checked={addDepartment === "opening"} onChange={() => setAddDepartment("opening")} className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-gray-800">Opening</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!addName.trim()) { toast.error("Name is required"); return; }
                  createCustomerMutation.mutate({
                    name: addName.trim(),
                    email: addEmail.trim() || undefined,
                    phone: addPhone.trim() || undefined,
                    address: addAddress.trim() || undefined,
                    leadType: addLeadType || undefined,
                    assignedAgent: addAgent || undefined,
                    department: addDepartment,
                  });
                }}
                disabled={createCustomerMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createCustomerMutation.isPending ? "Adding..." : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Assign {selectedIds.length} Customer{selectedIds.length > 1 ? "s" : ""}
              </h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <select
                  value={assignAgent}
                  onChange={(e) => setAssignAgent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select agent...</option>
                  {agentList.map((a: any) => (
                    <option key={a.id} value={a.name}>{a.name} ({a.team})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="department"
                      value="opening"
                      checked={assignDepartment === "opening"}
                      onChange={() => setAssignDepartment("opening")}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span className="text-sm text-gray-800">Opening</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="department"
                      value="retention"
                      checked={assignDepartment === "retention"}
                      onChange={() => setAssignDepartment("retention")}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm text-gray-800">Retention</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssignConfirm}
                disabled={bulkAssignMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkAssignMutation.isPending ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
