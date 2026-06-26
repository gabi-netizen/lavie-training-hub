/**
 * DoneDealModal — Records deal details when marking a lead as Done Deal.
 * All inputs are dropdowns/chips (no manual text input).
 */
import { useState, useMemo } from "react";
import { X, Package, Gift, CreditCard, Calculator, Truck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Product Catalog (from Mintsoft SKU list) ────────────────────────────────

interface ProductVariant {
  label: string;
  sku: string;
}

interface ProductDef {
  name: string;
  variants: ProductVariant[];
}

const PRODUCT_CATALOG: ProductDef[] = [
  {
    name: "Matinika",
    variants: [
      { label: "60ml (Full Size)", sku: "MAT60" },
      { label: "20ml (Starter)", sku: "MAT20" },
    ],
  },
  {
    name: "Oulala",
    variants: [
      { label: "30ml Black Bottle", sku: "BBS30" },
      { label: "30ml Silver Bottle", sku: "S30" },
      { label: "10ml (Starter)", sku: "S10" },
    ],
  },
  {
    name: "Ashkara Eye Serum",
    variants: [
      { label: "15ml", sku: "DLM15" },
      { label: "5ml (Starter)", sku: "LM5" },
    ],
  },
  {
    name: "Brightening Gel",
    variants: [
      { label: "30ml", sku: "GEL30" },
      { label: "5ml (Starter)", sku: "GEL05" },
    ],
  },
  {
    name: "Skin Immortality",
    variants: [
      { label: "50ml NEW BOX", sku: "JSIM50" },
      { label: "50ml", sku: "SIM50" },
      { label: "20ml (Starter)", sku: "SIM20" },
    ],
  },
  {
    name: "Facial Cleanser",
    variants: [
      { label: "125ml", sku: "FC125" },
    ],
  },
  {
    name: "Sun Defense SPF25",
    variants: [
      { label: "SPF25", sku: "SPF25" },
    ],
  },
  {
    name: "Bosem Exfoliating",
    variants: [
      { label: "60ml", sku: "VE50" },
      { label: "15ml", sku: "VE15" },
    ],
  },
];

// Generate price options from 32 to 130
const PRICE_OPTIONS = Array.from({ length: 130 - 32 + 1 }, (_, i) => i + 32);

const DEPOSIT_OPTIONS = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 109, 120, 130, 140, 150, 200, 250, 300,
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSelection {
  name: string;
  variant: string; // label
  sku: string;
  quantity: number;
  pricePerUnit: number | "free" | "custom";
  customPrice?: number;
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
  // Product selections — keyed by "name|sku" to allow same product different sizes
  const [selectedProducts, setSelectedProducts] = useState<Record<string, ProductSelection>>({});
  const [freeProduct, setFreeProduct] = useState("None");
  const [deposit, setDeposit] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [shippingOption, setShippingOption] = useState<"today" | "tomorrow" | "custom">("today");
  const [customShipDate, setCustomShipDate] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

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
  const toggleProduct = (product: ProductDef) => {
    const defaultVariant = product.variants[0];
    const key = `${product.name}|${defaultVariant.sku}`;
    setSelectedProducts((prev) => {
      // If any variant of this product is selected, remove all
      const existingKeys = Object.keys(prev).filter((k) => k.startsWith(`${product.name}|`));
      if (existingKeys.length > 0) {
        const next = { ...prev };
        existingKeys.forEach((k) => delete next[k]);
        return next;
      }
      return {
        ...prev,
        [key]: {
          name: product.name,
          variant: defaultVariant.label,
          sku: defaultVariant.sku,
          quantity: 1,
          pricePerUnit: 50,
        },
      };
    });
  };

  // Change variant for a product
  const changeVariant = (oldKey: string, product: ProductDef, newSku: string) => {
    const newVariant = product.variants.find((v) => v.sku === newSku);
    if (!newVariant) return;
    const newKey = `${product.name}|${newSku}`;
    setSelectedProducts((prev) => {
      const old = prev[oldKey];
      const next = { ...prev };
      delete next[oldKey];
      next[newKey] = {
        ...old,
        variant: newVariant.label,
        sku: newVariant.sku,
      };
      return next;
    });
  };

  // Update product details
  const updateProduct = (key: string, field: "quantity" | "pricePerUnit", value: number | "free") => {
    setSelectedProducts((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  // Calculated fields
  const total = useMemo(() => {
    return Object.values(selectedProducts).reduce(
      (sum, p) => sum + p.quantity * (p.pricePerUnit === "free" ? 0 : p.pricePerUnit === "custom" ? (p.customPrice ?? 0) : p.pricePerUnit),
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
        products: products.map((p) => ({
          name: `${p.name} — ${p.variant} (${p.sku})`,
          quantity: p.quantity,
          pricePerUnit: p.pricePerUnit === "free" ? 0 : p.pricePerUnit === "custom" ? (p.customPrice ?? 0) : p.pricePerUnit,
        })),
        freeProduct,
        deposit,
        installments,
        total,
        monthlyPayment: Math.max(0, monthlyPayment),
        shippingDate: shipDate,
        cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
        cardExpiry,
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
              {PRODUCT_CATALOG.map((product) => {
                const isSelected = Object.keys(selectedProducts).some((k) => k.startsWith(`${product.name}|`));
                return (
                  <button
                    key={product.name}
                    onClick={() => toggleProduct(product)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white border-2 border-blue-700 shadow-md"
                        : "bg-gray-100 text-gray-900 border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {product.name}
                  </button>
                );
              })}
            </div>

            {/* Expanded product details */}
            {Object.entries(selectedProducts).map(([key, product]) => {
              const catalogProduct = PRODUCT_CATALOG.find((p) => p.name === product.name);
              if (!catalogProduct) return null;
              return (
                <div
                  key={key}
                  className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-900">{product.name}</span>
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      SKU: {product.sku}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Size/Variant */}
                    {catalogProduct.variants.length > 1 && (
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-gray-900 block mb-1">Size</label>
                        <select
                          value={product.sku}
                          onChange={(e) => changeVariant(key, catalogProduct, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {catalogProduct.variants.map((v) => (
                            <option key={v.sku} value={v.sku}>
                              {v.label} ({v.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Quantity */}
                    <div>
                      <label className="text-xs font-semibold text-gray-900 block mb-1">Quantity</label>
                      <select
                        value={product.quantity}
                        onChange={(e) => updateProduct(key, "quantity", parseInt(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Price per unit */}
                    <div>
                      <label className="text-xs font-semibold text-gray-900 block mb-1">Price per unit</label>
                      {product.pricePerUnit === "custom" ? (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min={1}
                            value={product.customPrice ?? ""}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setSelectedProducts((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], customPrice: val },
                              }));
                            }}
                            placeholder="£"
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => updateProduct(key, "pricePerUnit", 50)}
                            className="px-2 py-2 rounded-lg text-xs font-medium bg-gray-200 hover:bg-gray-300 text-gray-700"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <select
                          value={product.pricePerUnit}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "custom") {
                              setSelectedProducts((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], pricePerUnit: "custom" as any, customPrice: undefined },
                              }));
                            } else {
                              updateProduct(key, "pricePerUnit", val === "free" ? "free" as any : parseInt(val));
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {PRICE_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              £{p}
                            </option>
                          ))}
                          <option value="custom">Custom...</option>
                          <option value="free">Free</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-sm font-bold text-gray-900">
                      Subtotal: {product.pricePerUnit === "free" ? "Free" : product.pricePerUnit === "custom" ? (product.customPrice ? `£${product.quantity * product.customPrice}` : "—") : `£${product.quantity * product.pricePerUnit}`}
                    </span>
                  </div>
                </div>
              );
            })}
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
              <option value="None">None</option>
              {PRODUCT_CATALOG.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
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

          {/* Card Details */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl border-2 border-black">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={18} className="text-black" />
              <span className="text-base font-bold text-black">Card Details</span>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Card Number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9\s]/g, "").slice(0, 19))}
                className="w-full px-4 py-3 rounded-lg border-2 border-black bg-white text-base text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="MM/YY"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value.replace(/[^0-9/]/g, "").slice(0, 5))}
                  className="flex-1 px-4 py-3 rounded-lg border-2 border-black bg-white text-base text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="CVV"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  className="w-28 px-4 py-3 rounded-lg border-2 border-black bg-white text-base text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
