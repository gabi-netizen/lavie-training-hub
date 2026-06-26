/**
 * DoneDealModal — Records deal details when marking a lead as Done Deal.
 * All inputs are dropdowns/chips (no manual text input).
 */
import { useState, useMemo } from "react";
import { X, Package, Gift, CreditCard, Calculator, Truck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCTS = [
  "Matinika",
  "Oulala",
  "Brightening Gel",
  "Retinol",
  "Skin Immortality",
] as const;

const PRICE_OPTIONS = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 52, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 115, 120, 130, 140, 150,
];

const DEPOSIT_OPTIONS = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 109, 120, 130, 140, 150, 200, 250, 300,
];

const FREE_PRODUCT_OPTIONS = ["None", ...PRODUCTS];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSelection {
  name: string;
  quantity: number;
  pricePerUnit: number;
}

interface DoneDealModalProps {
  open: boolean;
  onClose: () => void;
  contactId: number;
  subscriptionId: string;
  customerName: string;
  agentName: string;
  onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DoneDealModal({
  open,
  onClose,
  contactId,
  subscriptionId,
  customerName,
  agentName,
  onSuccess,
}: DoneDealModalProps) {
  // Product selections
  const [selectedProducts, setSelectedProducts] = useState<Record<string, ProductSelection>>({});
  const [freeProduct, setFreeProduct] = useState("None");
  const [deposit, setDeposit] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [shippingOption, setShippingOption] = useState<"today" | "tomorrow" | "custom">("today");
  const [customShipDate, setCustomShipDate] = useState("");

  const markDoneDealMutation = trpc.manager.markDoneDeal.useMutation({
    onSuccess: () => {
      toast.success("Done Deal confirmed! Email sent to support.");
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to mark done deal");
    },
  });

  // Toggle product selection
  const toggleProduct = (productName: string) => {
    setSelectedProducts((prev) => {
      if (prev[productName]) {
        const next = { ...prev };
        delete next[productName];
        return next;
      }
      return { ...prev, [productName]: { name: productName, quantity: 1, pricePerUnit: 50 } };
    });
  };

  // Update product details
  const updateProduct = (productName: string, field: "quantity" | "pricePerUnit", value: number) => {
    setSelectedProducts((prev) => ({
      ...prev,
      [productName]: { ...prev[productName], [field]: value },
    }));
  };

  // Calculated fields
  const total = useMemo(() => {
    return Object.values(selectedProducts).reduce(
      (sum, p) => sum + p.quantity * p.pricePerUnit,
      0
    );
  }, [selectedProducts]);

  const monthlyPayment = useMemo(() => {
    if (installments <= 0) return 0;
    return (total - deposit) / installments;
  }, [total, deposit, installments]);

  // Submit handler
  const handleConfirm = () => {
    const products = Object.values(selectedProducts);
    if (products.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    // Calculate shipping date
    let shipDate: string;
    const today = new Date();
    if (shippingOption === "today") {
      shipDate = today.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } else if (shippingOption === "tomorrow") {
      const tmr = new Date(today);
      tmr.setDate(tmr.getDate() + 1);
      shipDate = tmr.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } else {
      shipDate = customShipDate ? new Date(customShipDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD";
    }

    markDoneDealMutation.mutate({
      contactId,
      subscriptionId,
      customerName,
      agentName,
      dealDetails: {
        products,
        freeProduct,
        deposit,
        installments,
        total,
        monthlyPayment: Math.max(0, monthlyPayment),
        shippingDate: shipDate,
      },
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Done Deal</h2>
            <p className="text-sm text-gray-900">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} className="text-gray-900" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Products Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} className="text-gray-900" />
              <span className="text-sm font-semibold text-gray-900">Products</span>
            </div>

            {/* Product Chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {PRODUCTS.map((product) => {
                const isSelected = !!selectedProducts[product];
                return (
                  <button
                    key={product}
                    onClick={() => toggleProduct(product)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white border-2 border-blue-700 shadow-md"
                        : "bg-gray-100 text-gray-900 border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {product}
                  </button>
                );
              })}
            </div>

            {/* Expanded product details */}
            {Object.entries(selectedProducts).map(([name, product]) => (
              <div
                key={name}
                className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-900">{name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-900 block mb-1">Quantity</label>
                    <select
                      value={product.quantity}
                      onChange={(e) => updateProduct(name, "quantity", parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {[1, 2, 3, 4, 5, 6].map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-900 block mb-1">Price per unit</label>
                    <select
                      value={product.pricePerUnit}
                      onChange={(e) => updateProduct(name, "pricePerUnit", parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PRICE_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          £{p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-sm font-bold text-gray-900">
                    Subtotal: £{product.quantity * product.pricePerUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Free Product */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gift size={16} className="text-gray-900" />
              <span className="text-sm font-semibold text-gray-900">Free Product</span>
            </div>
            <select
              value={freeProduct}
              onChange={(e) => setFreeProduct(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FREE_PRODUCT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Deposit */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={16} className="text-gray-900" />
              <span className="text-sm font-semibold text-gray-900">Deposit</span>
            </div>
            <select
              value={deposit}
              onChange={(e) => setDeposit(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DEPOSIT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  £{d}
                </option>
              ))}
            </select>
          </div>

          {/* Number of Installments */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calculator size={16} className="text-gray-900" />
              <span className="text-sm font-semibold text-gray-900">Number of Installments</span>
            </div>
            <select
              value={installments}
              onChange={(e) => setInstallments(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Shipping Date */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Truck size={16} className="text-gray-900" />
              <span className="text-sm font-semibold text-gray-900">Ship Products</span>
            </div>
            <div className="flex gap-2 mb-2">
              {(["today", "tomorrow", "custom"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setShippingOption(opt)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    shippingOption === opt
                      ? "bg-blue-600 text-white border-2 border-blue-700"
                      : "bg-gray-100 text-gray-900 border-2 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {opt === "today" ? "Today" : opt === "tomorrow" ? "Tomorrow" : "Custom"}
                </button>
              ))}
            </div>
            {shippingOption === "custom" && (
              <input
                type="date"
                value={customShipDate}
                onChange={(e) => setCustomShipDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Calculated Fields */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-gray-900">£{total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Monthly Payment</span>
              <span className="text-lg font-bold text-gray-900">
                £{monthlyPayment > 0 ? monthlyPayment.toFixed(2) : "0.00"}
              </span>
            </div>
            {monthlyPayment < 0 && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Deposit exceeds total — monthly payment would be negative
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white rounded-b-2xl border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border-2 border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={markDoneDealMutation.isPending || Object.keys(selectedProducts).length === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 shadow-md"
            style={{ background: "#16a34a" }}
          >
            {markDoneDealMutation.isPending ? "Sending..." : "Confirm Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
