/**
 * DoneDealModal — Records deal details when marking a lead as Done Deal.
 * Two tabs: Subscription / Installment — fields match Max Billing modals.
 * Retention agents only (Opening uses confirmSold flow).
 */
import { useState, useMemo } from "react";
import { X, Package, Gift, CreditCard, Calculator, Truck, RefreshCw, Calendar } from "lucide-react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSelection {
  name: string;
  variant: string;
  sku: string;
  quantity: number;
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
  const [dealType, setDealType] = useState<"subscription" | "installment">("subscription");

  // ─── Shared State ─────────────────────────────────────────────────────────────
  const [selectedProducts, setSelectedProducts] = useState<ProductSelection[]>([]);
  const [freeGifts, setFreeGifts] = useState<Record<string, { name: string; variant: string; sku: string; quantity: number }>>({});
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [dealNotes, setDealNotes] = useState("");

  // Ship date (only shown when first charge = today)
  const [shipOption, setShipOption] = useState<"today" | "tomorrow" | "custom">("today");
  const [customShipDate, setCustomShipDate] = useState("");

  // ─── Subscription State ─────────────────────────────────────────────────────
  const [subAmount, setSubAmount] = useState("44.90");
  const [subBillingCycle, setSubBillingCycle] = useState("30");
  const [subCustomCycle, setSubCustomCycle] = useState("");
  const [subFirstChargeDate, setSubFirstChargeDate] = useState(""); // empty = today

  // ─── Installment State ──────────────────────────────────────────────────────
  const [instTotalAmount, setInstTotalAmount] = useState("420.00");
  const [instDeposit, setInstDeposit] = useState("0.00");
  const [instPayments, setInstPayments] = useState("12");
  const [instInterval, setInstInterval] = useState("30");
  const [instCustomInterval, setInstCustomInterval] = useState("");
  const [instFirstPaymentDate, setInstFirstPaymentDate] = useState(""); // empty = today

  // ─── Derived ────────────────────────────────────────────────────────────────
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);

  const isSubFuture = subFirstChargeDate !== "" && subFirstChargeDate > todayStr;
  const isInstFuture = instFirstPaymentDate !== "" && instFirstPaymentDate > todayStr;
  const isFutureDeal = dealType === "subscription" ? isSubFuture : isInstFuture;

  const instMonthlyPayment = useMemo(() => {
    const total = parseFloat(instTotalAmount) || 0;
    const dep = parseFloat(instDeposit) || 0;
    const payments = parseInt(instPayments) || 1;
    return payments > 0 ? (total - dep) / payments : 0;
  }, [instTotalAmount, instDeposit, instPayments]);

  const billingCycleDays = subBillingCycle === "custom" ? (parseInt(subCustomCycle) || 30) : parseInt(subBillingCycle);
  const intervalDays = instInterval === "custom" ? (parseInt(instCustomInterval) || 30) : parseInt(instInterval);

  // ─── Product Helpers ────────────────────────────────────────────────────────
  const addProduct = (product: ProductDef) => {
    const exists = selectedProducts.find((p) => p.name === product.name);
    if (exists) {
      setSelectedProducts((prev) => prev.filter((p) => p.name !== product.name));
    } else {
      setSelectedProducts((prev) => [
        ...prev,
        { name: product.name, variant: product.variants[0].label, sku: product.variants[0].sku, quantity: 1 },
      ]);
    }
  };

  const updateProductVariant = (idx: number, sku: string) => {
    const product = PRODUCT_CATALOG.find((p) => p.name === selectedProducts[idx].name);
    if (!product) return;
    const v = product.variants.find((x) => x.sku === sku);
    if (!v) return;
    setSelectedProducts((prev) => prev.map((p, i) => i === idx ? { ...p, variant: v.label, sku: v.sku } : p));
  };

  const updateProductQty = (idx: number, qty: number) => {
    setSelectedProducts((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: qty } : p));
  };

  const removeProduct = (idx: number) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Free Gift Helpers ──────────────────────────────────────────────────────
  const toggleFreeGift = (product: ProductDef) => {
    const key = `free_${product.name}|${product.variants[0].sku}`;
    setFreeGifts((prev) => {
      const existingKeys = Object.keys(prev).filter((k) => k.includes(`free_${product.name}|`));
      if (existingKeys.length > 0) {
        const next = { ...prev };
        existingKeys.forEach((k) => delete next[k]);
        return next;
      }
      return { ...prev, [key]: { name: product.name, variant: product.variants[0].label, sku: product.variants[0].sku, quantity: 1 } };
    });
  };

  const removeFreeGift = (key: string) => {
    setFreeGifts((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const updateFreeGiftVariant = (oldKey: string, product: ProductDef, newSku: string) => {
    const v = product.variants.find((x) => x.sku === newSku);
    if (!v) return;
    const newKey = `free_${product.name}|${newSku}`;
    setFreeGifts((prev) => {
      const old = prev[oldKey];
      const next = { ...prev };
      delete next[oldKey];
      next[newKey] = { ...old, variant: v.label, sku: v.sku };
      return next;
    });
  };

  const updateFreeGiftQty = (key: string, qty: number) => {
    setFreeGifts((prev) => ({ ...prev, [key]: { ...prev[key], quantity: qty } }));
  };

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const markDoneDealMutation = trpc.manager.markDoneDeal.useMutation({
    onSuccess: () => {
      toast.success("Done Deal confirmed!");
      onClose();
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to mark done deal");
    },
  });

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (selectedProducts.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    let shipDate = "After payment";
    if (!isFutureDeal) {
      const today = new Date();
      if (shipOption === "today") {
        shipDate = today.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      } else if (shipOption === "tomorrow") {
        const tmr = new Date(today);
        tmr.setDate(tmr.getDate() + 1);
        shipDate = tmr.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      } else {
        shipDate = customShipDate ? new Date(customShipDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD";
      }
    }

    markDoneDealMutation.mutate({
      contactId,
      subscriptionId,
      customerName,
      agentName,
      dealDetails: {
        products: selectedProducts.map((p) => ({
          name: `${p.name} — ${p.variant} (${p.sku})`,
          quantity: p.quantity,
          pricePerUnit: 0,
        })),
        freeProduct: Object.values(freeGifts).length > 0
          ? Object.values(freeGifts).map((g) => `${g.name} — ${g.variant} (${g.sku}) x${g.quantity}`).join(", ")
          : "None",
        deposit: dealType === "installment" ? (parseFloat(instDeposit) || 0) : 0,
        installments: dealType === "installment" ? (parseInt(instPayments) || 0) : 0,
        total: dealType === "installment" ? (parseFloat(instTotalAmount) || 0) : (parseFloat(subAmount) || 0),
        monthlyPayment: dealType === "installment" ? instMonthlyPayment : (parseFloat(subAmount) || 0),
        shippingDate: shipDate,
        cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
        cardExpiry,
        notes: dealNotes,
        dealType,
      },
    });
  };

  if (!open) return null;

  // ─── Shared: Products Section ───────────────────────────────────────────────
  const renderProductsSection = () => (
    <div>
      <div className="text-[11px] font-bold text-black uppercase tracking-wide mb-3">Products to Ship</div>
      {/* Product Chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRODUCT_CATALOG.map((product) => {
          const isSelected = selectedProducts.some((p) => p.name === product.name);
          return (
            <button
              key={product.name}
              onClick={() => addProduct(product)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-blue-600 text-white border-2 border-blue-700 shadow-md"
                  : "bg-gray-100 text-black border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {product.name}
            </button>
          );
        })}
      </div>
      {/* Selected product rows */}
      {selectedProducts.map((product, idx) => {
        const catalogProduct = PRODUCT_CATALOG.find((p) => p.name === product.name);
        if (!catalogProduct) return null;
        return (
          <div key={`${product.name}-${idx}`} className="flex items-center gap-2 py-2 border-b border-gray-100">
            <span className="text-xs font-bold text-black w-24 truncate">{product.name}</span>
            {catalogProduct.variants.length > 1 ? (
              <select
                value={product.sku}
                onChange={(e) => updateProductVariant(idx, e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-gray-300 bg-white text-xs text-black font-medium"
              >
                {catalogProduct.variants.map((v) => (
                  <option key={v.sku} value={v.sku}>{v.label}</option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-xs text-black">{product.variant}</span>
            )}
            <select
              value={product.quantity}
              onChange={(e) => updateProductQty(idx, parseInt(e.target.value))}
              className="w-14 px-1 py-1 rounded border border-gray-300 bg-white text-xs text-black font-medium"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => (
                <option key={q} value={q}>x{q}</option>
              ))}
            </select>
            <button onClick={() => removeProduct(idx)} className="text-red-500 hover:text-red-700 p-0.5">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );

  // ─── Shared: Free Gifts Section ─────────────────────────────────────────────
  const renderFreeGiftsSection = () => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Gift size={14} className="text-black" />
        <span className="text-[11px] font-bold text-black uppercase tracking-wide">Free Gifts (optional)</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PRODUCT_CATALOG.map((product) => {
          const isSelected = Object.keys(freeGifts).some((k) => k.includes(`free_${product.name}|`));
          return (
            <button
              key={`fg-${product.name}`}
              onClick={() => toggleFreeGift(product)}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                isSelected
                  ? "bg-green-600 text-white border border-green-700"
                  : "bg-gray-100 text-black border border-gray-200 hover:border-green-300"
              }`}
            >
              {product.name}
            </button>
          );
        })}
      </div>
      {Object.entries(freeGifts).map(([key, gift]) => {
        const catalogProduct = PRODUCT_CATALOG.find((p) => p.name === gift.name);
        if (!catalogProduct) return null;
        return (
          <div key={key} className="flex items-center gap-2 py-1 border-b border-gray-100 text-xs">
            <span className="font-semibold text-black w-16 truncate">{gift.name}</span>
            <select
              value={gift.sku}
              onChange={(e) => updateFreeGiftVariant(key, catalogProduct, e.target.value)}
              className="px-1.5 py-1 rounded border border-gray-300 bg-white text-xs text-black flex-1"
            >
              {catalogProduct.variants.map((v) => (
                <option key={v.sku} value={v.sku}>{v.label}</option>
              ))}
            </select>
            <select
              value={gift.quantity}
              onChange={(e) => updateFreeGiftQty(key, parseInt(e.target.value))}
              className="px-1.5 py-1 rounded border border-gray-300 bg-white text-xs text-black w-12"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
            <button onClick={() => removeFreeGift(key)} className="text-red-500 hover:text-red-700 font-bold">✕</button>
          </div>
        );
      })}
    </div>
  );

  // ─── Shared: Ship Date Section (only when NOT future) ───────────────────────
  const renderShipDateSection = () => (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Truck size={14} className="text-black" />
        <span className="text-[11px] font-bold text-black uppercase tracking-wide">Ship Date</span>
      </div>
      <div className="flex gap-2 mb-2">
        {(["today", "tomorrow", "custom"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setShipOption(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              shipOption === opt
                ? "bg-blue-600 text-white border-2 border-blue-700"
                : "bg-gray-100 text-black border-2 border-gray-200 hover:border-blue-300"
            }`}
          >
            {opt === "today" ? "Today" : opt === "tomorrow" ? "Tomorrow" : "Custom"}
          </button>
        ))}
      </div>
      {shipOption === "custom" && (
        <input
          type="date"
          value={customShipDate}
          onChange={(e) => setCustomShipDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-black font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );

  // ─── Shared: Card Details Section ───────────────────────────────────────────
  const renderCardSection = () => (
    <div className="p-3 bg-slate-50 rounded-xl border-2 border-black">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} className="text-black" />
        <span className="text-sm font-bold text-black">Card Details</span>
      </div>
      <p className="text-[11px] text-black font-medium mb-3">
        Leave empty to use the card on file. Fill in only for a new or replacement card.
      </p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Card Number"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9\s]/g, "").slice(0, 19))}
          className="w-full px-3 py-2.5 rounded-lg border-2 border-black bg-white text-sm text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="MM/YY"
            value={cardExpiry}
            onChange={(e) => setCardExpiry(e.target.value.replace(/[^0-9/]/g, "").slice(0, 5))}
            className="flex-1 px-3 py-2.5 rounded-lg border-2 border-black bg-white text-sm text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="CVV"
            value={cardCvv}
            onChange={(e) => setCardCvv(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            className="w-24 px-3 py-2.5 rounded-lg border-2 border-black bg-white text-sm text-black font-bold placeholder:text-black placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );

  // ─── Subscription Tab ───────────────────────────────────────────────────────
  const renderSubscriptionTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
      {/* LEFT — Billing Configuration + Products */}
      <div className="px-6 py-5 border-r border-gray-100 space-y-5">
        {/* Billing Configuration */}
        <div>
          <div className="text-[11px] font-bold text-black uppercase tracking-wide mb-3">Billing Configuration</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Amount (£)</label>
              <input
                type="number"
                step="0.01"
                value={subAmount}
                onChange={(e) => setSubAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Billing cycle</label>
              <select
                value={subBillingCycle}
                onChange={(e) => setSubBillingCycle(e.target.value)}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
              >
                <option value="30">Every 30 days</option>
                <option value="60">Every 60 days</option>
                <option value="90">Every 90 days</option>
                <option value="custom">Custom...</option>
              </select>
              {subBillingCycle === "custom" && (
                <input
                  type="number"
                  min={1}
                  placeholder="Days"
                  value={subCustomCycle}
                  onChange={(e) => setSubCustomCycle(e.target.value)}
                  className="w-full mt-2 px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-black mb-1 block">
                <Calendar size={12} className="inline mr-1" />
                First charge date
              </label>
              <input
                type="date"
                value={subFirstChargeDate}
                onChange={(e) => setSubFirstChargeDate(e.target.value)}
                min={todayStr}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty for today"
              />
              <p className="text-[10px] text-black font-medium mt-1">
                {isSubFuture ? "⏳ Future deal — charge on selected date, shipment after payment" : "Leave empty to charge today"}
              </p>
            </div>
          </div>
        </div>

        {/* Products */}
        {renderProductsSection()}

        {/* Free Gifts */}
        {renderFreeGiftsSection()}
      </div>

      {/* RIGHT — Summary + Ship + Card */}
      <div className="px-6 py-5 space-y-4">
        <span className="text-sm font-bold text-black">Order Summary</span>

        {/* Summary card */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">Recurring Amount</span>
            <span className="text-lg font-bold text-green-700">£{subAmount || "0"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">Billing Cycle</span>
            <span className="text-xs font-bold text-black">Every {billingCycleDays} days</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">First Charge</span>
            <span className="text-xs font-bold text-black">
              {isSubFuture ? new Date(subFirstChargeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today (immediate)"}
            </span>
          </div>
          {isSubFuture && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mt-2">
              <span className="text-xs font-bold text-purple-800">⏳ Future Deal</span>
              <p className="text-[10px] text-purple-800 font-medium">Shipment will be sent automatically after successful payment</p>
            </div>
          )}
          {selectedProducts.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <span className="text-[10px] font-bold text-black uppercase">Products</span>
              {selectedProducts.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-black mt-1">
                  <span>{p.name} — {p.variant}</span>
                  <span className="font-bold">x{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
          {Object.values(freeGifts).length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <span className="text-[10px] font-bold text-black uppercase">Free Gifts</span>
              {Object.values(freeGifts).map((g, i) => (
                <div key={i} className="flex justify-between text-xs text-black mt-1">
                  <span>{g.name} — {g.variant}</span>
                  <span className="font-bold">x{g.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ship Date — only if NOT future */}
        {!isSubFuture && renderShipDateSection()}

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-black block mb-1">Notes</label>
          <textarea
            value={dealNotes}
            onChange={(e) => setDealNotes(e.target.value)}
            placeholder="Add notes about this deal..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-xs text-black font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Card Details */}
        {renderCardSection()}
      </div>
    </div>
  );

  // ─── Installment Tab ────────────────────────────────────────────────────────
  const renderInstallmentTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
      {/* LEFT — Instalment Configuration + Products */}
      <div className="px-6 py-5 border-r border-gray-100 space-y-5">
        {/* Instalment Configuration */}
        <div>
          <div className="text-[11px] font-bold text-black uppercase tracking-wide mb-3">Instalment Configuration</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Total amount (£)</label>
              <input
                type="number"
                step="0.01"
                value={instTotalAmount}
                onChange={(e) => setInstTotalAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Deposit (£)</label>
              <input
                type="number"
                step="0.01"
                value={instDeposit}
                onChange={(e) => setInstDeposit(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Number of payments</label>
              <select
                value={instPayments}
                onChange={(e) => setInstPayments(e.target.value)}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
              >
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black mb-1 block">Payment interval</label>
              <select
                value={instInterval}
                onChange={(e) => setInstInterval(e.target.value)}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
              >
                <option value="14">Every 14 days</option>
                <option value="30">Every 30 days</option>
                <option value="60">Every 60 days</option>
                <option value="90">Every 90 days</option>
                <option value="custom">Custom...</option>
              </select>
              {instInterval === "custom" && (
                <input
                  type="number"
                  min={1}
                  placeholder="Days"
                  value={instCustomInterval}
                  onChange={(e) => setInstCustomInterval(e.target.value)}
                  className="w-full mt-2 px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-black mb-1 block">
                <Calendar size={12} className="inline mr-1" />
                First payment date
              </label>
              <input
                type="date"
                value={instFirstPaymentDate}
                onChange={(e) => setInstFirstPaymentDate(e.target.value)}
                min={todayStr}
                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-black font-medium mt-1">
                {isInstFuture ? "⏳ Future deal — charge on selected date, shipment after payment" : "Leave empty to charge today"}
              </p>
            </div>
          </div>
        </div>

        {/* Products */}
        {renderProductsSection()}

        {/* Free Gifts */}
        {renderFreeGiftsSection()}
      </div>

      {/* RIGHT — Summary + Ship + Card */}
      <div className="px-6 py-5 space-y-4">
        <span className="text-sm font-bold text-black">Order Summary</span>

        {/* Summary card */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">Total Amount</span>
            <span className="text-lg font-bold text-black">£{instTotalAmount || "0"}</span>
          </div>
          {(parseFloat(instDeposit) || 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-black">Deposit</span>
              <span className="text-sm font-bold text-black">-£{instDeposit}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2">
            <span className="text-xs font-semibold text-black">Per Payment (x{instPayments})</span>
            <span className="text-lg font-bold text-green-700">
              £{instMonthlyPayment > 0 ? instMonthlyPayment.toFixed(2) : "0.00"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">Payment Interval</span>
            <span className="text-xs font-bold text-black">Every {intervalDays} days</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">First Payment</span>
            <span className="text-xs font-bold text-black">
              {isInstFuture ? new Date(instFirstPaymentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today (immediate)"}
            </span>
          </div>
          {isInstFuture && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mt-2">
              <span className="text-xs font-bold text-purple-800">⏳ Future Deal</span>
              <p className="text-[10px] text-purple-800 font-medium">Shipment will be sent automatically after successful payment</p>
            </div>
          )}
          {instMonthlyPayment < 0 && (
            <p className="text-xs text-red-600 mt-1 font-bold">Deposit exceeds total!</p>
          )}
          {selectedProducts.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <span className="text-[10px] font-bold text-black uppercase">Products</span>
              {selectedProducts.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-black mt-1">
                  <span>{p.name} — {p.variant}</span>
                  <span className="font-bold">x{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
          {Object.values(freeGifts).length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <span className="text-[10px] font-bold text-black uppercase">Free Gifts</span>
              {Object.values(freeGifts).map((g, i) => (
                <div key={i} className="flex justify-between text-xs text-black mt-1">
                  <span>{g.name} — {g.variant}</span>
                  <span className="font-bold">x{g.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ship Date — only if NOT future */}
        {!isInstFuture && renderShipDateSection()}

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-black block mb-1">Notes</label>
          <textarea
            value={dealNotes}
            onChange={(e) => setDealNotes(e.target.value)}
            placeholder="Add notes about this deal..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-xs text-black font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Card Details */}
        {renderCardSection()}
      </div>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-black">Done Deal</h2>
            <p className="text-sm text-black">{customerName}</p>
          </div>
          {/* Deal Type Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setDealType("subscription")}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                dealType === "subscription"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-black hover:text-black"
              }`}
            >
              Subscription
            </button>
            <button
              onClick={() => setDealType("installment")}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                dealType === "installment"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-black hover:text-black"
              }`}
            >
              Installment
            </button>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-black" />
          </button>
        </div>

        {/* Tab Content */}
        {dealType === "subscription" ? renderSubscriptionTab() : renderInstallmentTab()}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white rounded-b-2xl border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          {isFutureDeal && (
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
              ⏳ Future Deal — No charge today
            </span>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-black border-2 border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={markDoneDealMutation.isPending || selectedProducts.length === 0}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 shadow-md"
              style={{ background: isFutureDeal ? "#7c3aed" : "#16a34a" }}
            >
              {markDoneDealMutation.isPending
                ? "Processing..."
                : isFutureDeal
                  ? "Schedule Future Deal"
                  : dealType === "subscription"
                    ? "Confirm Subscription"
                    : "Confirm Installment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
