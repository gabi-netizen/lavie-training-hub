/**
 * DoneDealModal — Records deal details when marking a lead as Done Deal.
 * Two tabs: Subscription / Installment.
 * Subscription: each product gets its own price + billing cycle.
 * Products with the same cycle ship together in one Mintsoft order.
 * Retention agents only (Opening uses confirmSold flow).
 */
import { useState, useMemo } from "react";
import { X, Package, Gift, CreditCard, Calculator, Truck, Calendar } from "lucide-react";
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
      { label: "30ml Black Bottle (Full Size)", sku: "BBS30" },
      { label: "30ml Silver Bottle (Full Size)", sku: "S30" },
      { label: "10ml (Starter)", sku: "S10" },
    ],
  },
  {
    name: "Ashkara Eye Serum",
    variants: [
      { label: "15ml (Full Size)", sku: "DLM15" },
      { label: "5ml (Starter)", sku: "LM5" },
    ],
  },
  {
    name: "Brightening Gel",
    variants: [
      { label: "30ml (Full Size)", sku: "GEL30" },
      { label: "5ml (Starter)", sku: "GEL05" },
    ],
  },
  {
    name: "Skin Immortality",
    variants: [
      { label: "50ml NEW BOX (Full Size)", sku: "JSIM50" },
      { label: "50ml (Full Size)", sku: "SIM50" },
      { label: "20ml (Starter)", sku: "SIM20" },
    ],
  },
  {
    name: "Facial Cleanser",
    variants: [
      { label: "125ml (Full Size)", sku: "FC125" },
    ],
  },
  {
    name: "Sun Defense SPF25",
    variants: [
      { label: "SPF25 (Full Size)", sku: "SPF25" },
    ],
  },
  {
    name: "Bosem Exfoliating",
    variants: [
      { label: "60ml (Full Size)", sku: "VE50" },
      { label: "15ml (Starter)", sku: "VE15" },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubProduct {
  name: string;
  variant: string;
  sku: string;
  quantity: number;
  price: string; // per cycle
  cycle: string; // "30" | "60" | "90" | custom number
}

interface InstProduct {
  name: string;
  variant: string;
  sku: string;
  quantity: number;
  price: string;
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
  const [freeGifts, setFreeGifts] = useState<Record<string, { name: string; variant: string; sku: string; quantity: number }>>({});
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [shipOption, setShipOption] = useState<"immediate" | "custom">("immediate");
  const [customShipDate, setCustomShipDate] = useState("");

  // ─── Subscription State (per-product price + cycle) ─────────────────────────
  const [subProducts, setSubProducts] = useState<SubProduct[]>([]);
  const [subFirstChargeDate, setSubFirstChargeDate] = useState("");

  // ─── Installment State ──────────────────────────────────────────────────────
  const [instProducts, setInstProducts] = useState<InstProduct[]>([]);
  const [instMode, setInstMode] = useState<"equal" | "custom">("equal");
  // Equal mode
  const [instTotalAmount, setInstTotalAmount] = useState("");
  const [instDeposit, setInstDeposit] = useState("");
  const [instPayments, setInstPayments] = useState("1");
  const [instInterval, setInstInterval] = useState("30");
  const [instCustomInterval, setInstCustomInterval] = useState("");
  const [instFirstPaymentDate, setInstFirstPaymentDate] = useState("");
  // Custom mode — per-payment schedule
  const [customPaymentCount, setCustomPaymentCount] = useState("4");
  const [customPayments, setCustomPayments] = useState<{ amount: string; interval: string }[]>([
    { amount: "", interval: "30" },
    { amount: "", interval: "30" },
    { amount: "", interval: "30" },
    { amount: "", interval: "30" },
  ]);
  const [customFirstPaymentDate, setCustomFirstPaymentDate] = useState("");

  // ─── Derived ────────────────────────────────────────────────────────────────
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const isSubFuture = subFirstChargeDate !== "" && subFirstChargeDate > todayStr;
  const isInstFuture = instFirstPaymentDate !== "" && instFirstPaymentDate > todayStr;
  const isCustomInstFuture = customFirstPaymentDate !== "" && customFirstPaymentDate > todayStr;
  const isFutureDeal = dealType === "subscription" ? isSubFuture : (instMode === "custom" ? isCustomInstFuture : isInstFuture);

  // Auto-calculate total from products
  const instProductsTotal = useMemo(() => {
    return instProducts.reduce((sum, p) => sum + (parseFloat(p.price) || 0) * p.quantity, 0);
  }, [instProducts]);

  const instEffectiveTotal = instProductsTotal > 0 ? instProductsTotal.toFixed(2) : instTotalAmount;

  const instMonthlyPayment = useMemo(() => {
    const total = instProductsTotal > 0 ? instProductsTotal : (parseFloat(instTotalAmount) || 0);
    const dep = parseFloat(instDeposit) || 0;
    const payments = parseInt(instPayments) || 1;
    return payments > 0 ? (total - dep) / payments : 0;
  }, [instProductsTotal, instTotalAmount, instDeposit, instPayments]);

  const intervalDays = instInterval === "custom" ? (parseInt(instCustomInterval) || 30) : parseInt(instInterval);

  // Custom mode: total and future check
  const customTotal = useMemo(() => {
    return customPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [customPayments]);

  // Update custom payments count
  const handleCustomPaymentCountChange = (count: string) => {
    const n = parseInt(count) || 2;
    setCustomPaymentCount(count);
    setCustomPayments((prev) => {
      if (n > prev.length) {
        return [...prev, ...Array(n - prev.length).fill(null).map(() => ({ amount: "", interval: "30" }))];
      }
      return prev.slice(0, n);
    });
  };

  const updateCustomPayment = (idx: number, field: "amount" | "interval", value: string) => {
    setCustomPayments((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  // Group subscription products by cycle for summary
  const subGroupedByCycle = useMemo(() => {
    const groups: Record<string, { products: SubProduct[]; total: number }> = {};
    subProducts.forEach((p) => {
      const key = p.cycle;
      if (!groups[key]) groups[key] = { products: [], total: 0 };
      groups[key].products.push(p);
      groups[key].total += (parseFloat(p.price) || 0) * p.quantity;
    });
    return groups;
  }, [subProducts]);

  const subTotalPerCycle = useMemo(() => {
    return Object.entries(subGroupedByCycle).map(([cycle, data]) => ({
      cycle: parseInt(cycle),
      total: data.total,
      products: data.products,
    }));
  }, [subGroupedByCycle]);

  // ─── Subscription Product Helpers ───────────────────────────────────────────
  const addSubProduct = (product: ProductDef) => {
    const exists = subProducts.find((p) => p.name === product.name);
    if (exists) {
      setSubProducts((prev) => prev.filter((p) => p.name !== product.name));
    } else {
      setSubProducts((prev) => [
        ...prev,
        { name: product.name, variant: product.variants[0].label, sku: product.variants[0].sku, quantity: 1, price: "", cycle: "60" },
      ]);
    }
  };

  const updateSubProduct = (idx: number, field: keyof SubProduct, value: string | number) => {
    setSubProducts((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === "sku") {
        const cat = PRODUCT_CATALOG.find((c) => c.name === p.name);
        const v = cat?.variants.find((x) => x.sku === value);
        if (v) return { ...p, sku: v.sku, variant: v.label };
        return p;
      }
      return { ...p, [field]: value };
    }));
  };

  const removeSubProduct = (idx: number) => {
    setSubProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Installment Product Helpers ────────────────────────────────────────────
  const addInstProduct = (product: ProductDef) => {
    const exists = instProducts.find((p) => p.name === product.name);
    if (exists) {
      setInstProducts((prev) => prev.filter((p) => p.name !== product.name));
    } else {
      setInstProducts((prev) => [
        ...prev,
        { name: product.name, variant: product.variants[0].label, sku: product.variants[0].sku, quantity: 1, price: "" },
      ]);
    }
  };

  const updateInstProduct = (idx: number, field: string, value: string | number) => {
    setInstProducts((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === "sku") {
        const cat = PRODUCT_CATALOG.find((c) => c.name === p.name);
        const v = cat?.variants.find((x) => x.sku === value);
        if (v) return { ...p, sku: v.sku, variant: v.label };
        return p;
      }
      return { ...p, [field]: value };
    }));
  };

  const removeInstProduct = (idx: number) => {
    setInstProducts((prev) => prev.filter((_, i) => i !== idx));
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
    const products = dealType === "subscription" ? subProducts : instProducts;
    if (products.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    let shipDate = "After payment";
    if (!isFutureDeal) {
      if (shipOption === "immediate") {
        shipDate = "Immediate";
      } else {
        shipDate = customShipDate ? new Date(customShipDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD";
      }
    }

    const totalAmount = dealType === "subscription"
      ? subTotalPerCycle.reduce((sum, g) => sum + g.total, 0)
      : (parseFloat(instTotalAmount) || 0);

    markDoneDealMutation.mutate({
      contactId,
      subscriptionId,
      customerName,
      agentName,
      dealDetails: {
        products: products.map((p) => ({
          name: `${p.name} — ${p.variant} (${p.sku})`,
          quantity: p.quantity,
          pricePerUnit: dealType === "subscription" ? (parseFloat((p as SubProduct).price) || 0) : 0,
        })),
        freeProduct: Object.values(freeGifts).length > 0
          ? Object.values(freeGifts).map((g) => `${g.name} — ${g.variant} (${g.sku}) x${g.quantity}`).join(", ")
          : "None",
        deposit: dealType === "installment" ? (parseFloat(instDeposit) || 0) : 0,
        installments: dealType === "installment" ? (parseInt(instPayments) || 0) : 0,
        total: totalAmount,
        monthlyPayment: dealType === "installment" ? instMonthlyPayment : totalAmount,
        shippingDate: shipDate,
        cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
        cardExpiry,
        notes: dealNotes,
        dealType,
      },
    });
  };

  if (!open) return null;

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

  // ─── Shared: Ship Date Section ──────────────────────────────────────────────
  const renderShipDateSection = () => (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Truck size={14} className="text-black" />
        <span className="text-[11px] font-bold text-black uppercase tracking-wide">Ship Date</span>
      </div>
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setShipOption("immediate")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            shipOption === "immediate"
              ? "bg-green-600 text-white border-2 border-green-700 shadow-md"
              : "bg-gray-100 text-black border-2 border-gray-200 hover:border-green-300"
          }`}
        >
          Immediate
        </button>
        <button
          onClick={() => setShipOption("custom")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            shipOption === "custom"
              ? "bg-blue-600 text-white border-2 border-blue-700 shadow-md"
              : "bg-gray-100 text-black border-2 border-gray-200 hover:border-blue-300"
          }`}
        >
          Select Date
        </button>
      </div>
      {shipOption === "custom" && (
        <input
          type="date"
          value={customShipDate}
          onChange={(e) => setCustomShipDate(e.target.value)}
          min={todayStr}
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
      {/* LEFT — Products with price + cycle each */}
      <div className="px-6 py-5 border-r border-gray-100 space-y-5">
        {/* Product Selection */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-black" />
            <span className="text-[11px] font-bold text-black uppercase tracking-wide">Products</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRODUCT_CATALOG.map((product) => {
              const isSelected = subProducts.some((p) => p.name === product.name);
              return (
                <button
                  key={product.name}
                  onClick={() => addSubProduct(product)}
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

          {/* Product rows with price + cycle */}
          <div className="space-y-3">
            {subProducts.map((product, idx) => {
              const catalogProduct = PRODUCT_CATALOG.find((p) => p.name === product.name);
              if (!catalogProduct) return null;
              return (
                <div key={`${product.name}-${idx}`} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-black">{product.name}</span>
                    <button onClick={() => removeSubProduct(idx)} className="text-red-500 hover:text-red-700">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Variant */}
                    {catalogProduct.variants.length > 1 ? (
                      <select
                        value={product.sku}
                        onChange={(e) => updateSubProduct(idx, "sku", e.target.value)}
                        className="px-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                      >
                        {catalogProduct.variants.map((v) => (
                          <option key={v.sku} value={v.sku}>{v.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 py-1.5 text-xs text-black font-medium">{product.variant}</span>
                    )}
                    {/* Qty */}
                    <select
                      value={product.quantity}
                      onChange={(e) => updateSubProduct(idx, "quantity", parseInt(e.target.value))}
                      className="px-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => (
                        <option key={q} value={q}>x{q}</option>
                      ))}
                    </select>
                    {/* Price */}
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-black">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={product.price}
                        onChange={(e) => updateSubProduct(idx, "price", e.target.value)}
                        placeholder="Price"
                        className="w-full pl-5 pr-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    {/* Cycle */}
                    <select
                      value={product.cycle}
                      onChange={(e) => updateSubProduct(idx, "cycle", e.target.value)}
                      className="px-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                    >
                      <option value="30">Every 30 days</option>
                      <option value="60">Every 60 days</option>
                      <option value="90">Every 90 days</option>
                      <option value="120">Every 120 days</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* First Charge Date */}
        <div>
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
          />
          <p className={`text-xs mt-1 font-bold ${isSubFuture ? "text-purple-700" : "text-black"}`}>
            {isSubFuture ? "⏳ Future Deal — customer will be charged on the date above" : "For a future deal, select the date you want the customer to be charged. Leave empty to charge now."}
          </p>
        </div>

        {/* Free Gifts */}
        {renderFreeGiftsSection()}
      </div>

      {/* RIGHT — Order Summary */}
      <div className="px-6 py-5 space-y-4">
        <span className="text-sm font-bold text-black">Order Summary</span>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
          {/* Grouped by cycle */}
          {subTotalPerCycle.length > 0 ? (
            subTotalPerCycle.map((group) => (
              <div key={group.cycle} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Every {group.cycle} days</span>
                  <span className="text-sm font-bold text-green-700">£{group.total.toFixed(2)}</span>
                </div>
                {group.products.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs text-black pl-2">
                    <span>{p.name} — {p.variant} x{p.quantity}</span>
                    <span className="font-semibold">£{((parseFloat(p.price) || 0) * p.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <p className="text-[10px] text-black font-medium mt-1 pl-2">
                  Ships together every {group.cycle} days
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-black font-medium">No products selected</p>
          )}

          {/* First Charge */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2">
            <span className="text-xs font-semibold text-black">First Charge</span>
            <span className="text-xs font-bold text-black">
              {isSubFuture ? new Date(subFirstChargeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today (immediate)"}
            </span>
          </div>

          {isSubFuture && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
              <span className="text-xs font-bold text-purple-800">⏳ Future Deal</span>
              <p className="text-[10px] text-purple-800 font-medium">Shipment after successful payment</p>
            </div>
          )}

          {/* Free Gifts in summary */}
          {Object.values(freeGifts).length > 0 && (
            <div className="border-t border-gray-200 pt-2">
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
      {/* LEFT — Products + Configuration */}
      <div className="px-6 py-5 border-r border-gray-100 space-y-5">
        {/* Products */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-black" />
            <span className="text-[11px] font-bold text-black uppercase tracking-wide">Products to Ship</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRODUCT_CATALOG.map((product) => {
              const isSelected = instProducts.some((p) => p.name === product.name);
              return (
                <button
                  key={product.name}
                  onClick={() => addInstProduct(product)}
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
          {instProducts.map((product, idx) => {
            const catalogProduct = PRODUCT_CATALOG.find((p) => p.name === product.name);
            if (!catalogProduct) return null;
            return (
              <div key={`${product.name}-${idx}`} className="flex items-center gap-2 py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-black w-20 truncate">{product.name}</span>
                {catalogProduct.variants.length > 1 ? (
                  <select
                    value={product.sku}
                    onChange={(e) => updateInstProduct(idx, "sku", e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                  >
                    {catalogProduct.variants.map((v) => (
                      <option key={v.sku} value={v.sku}>{v.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="flex-1 text-xs text-black">{product.variant}</span>
                )}
                <div className="relative w-20">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-bold text-black">£</span>
                  <input
                    type="number"
                    step="0.01"
                    value={product.price}
                    onChange={(e) => updateInstProduct(idx, "price", e.target.value)}
                    placeholder="Price"
                    className="w-full pl-4 pr-1 py-1 rounded border border-gray-300 bg-white text-xs text-black font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <select
                  value={product.quantity}
                  onChange={(e) => updateInstProduct(idx, "quantity", parseInt(e.target.value))}
                  className="w-14 px-1 py-1 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => (
                    <option key={q} value={q}>x{q}</option>
                  ))}
                </select>
                <button onClick={() => removeInstProduct(idx)} className="text-red-500 hover:text-red-700 p-0.5">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Instalment Configuration */}
        <div>
          <div className="text-[11px] font-bold text-black uppercase tracking-wide mb-3">Instalment Configuration</div>
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInstMode("equal")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                instMode === "equal"
                  ? "bg-blue-600 text-white border-2 border-blue-700 shadow-md"
                  : "bg-gray-100 text-black border-2 border-gray-200 hover:border-blue-300"
              }`}
            >
              Equal Payments
            </button>
            <button
              onClick={() => setInstMode("custom")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                instMode === "custom"
                  ? "bg-orange-600 text-white border-2 border-orange-700 shadow-md"
                  : "bg-gray-100 text-black border-2 border-gray-200 hover:border-orange-300"
              }`}
            >
              Custom Payments
            </button>
          </div>

          {instMode === "equal" ? (
            /* Equal mode */
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
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => (
                  <option key={n} value={n}>{n === 1 ? "1 (One Time Payment)" : String(n)}</option>
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
                  <option value="7">Weekly (7 days)</option>
                  <option value="14">Bi-weekly (14 days)</option>
                  <option value="30">Monthly (30 days)</option>
                </select>
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
                <p className={`text-xs mt-1 font-bold ${isInstFuture ? "text-purple-700" : "text-black"}`}>
                  {isInstFuture ? "⏳ Future Deal — customer will be charged on the date above" : "For a future deal, select the date you want the customer to be charged. Leave empty to charge now."}
                </p>
              </div>
            </div>
          ) : (
            /* Custom mode */
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-black mb-1 block">Number of payments</label>
                <select
                  value={customPaymentCount}
                  onChange={(e) => handleCustomPaymentCountChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Payment rows */}
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {customPayments.map((payment, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <span className="text-xs font-bold text-black w-6">#{idx + 1}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-black">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={payment.amount}
                        onChange={(e) => updateCustomPayment(idx, "amount", e.target.value)}
                        placeholder="Amount"
                        className="w-full pl-5 pr-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <select
                      value={payment.interval}
                      onChange={(e) => updateCustomPayment(idx, "interval", e.target.value)}
                      className="w-32 px-2 py-1.5 rounded border border-gray-300 bg-white text-xs text-black font-medium"
                    >
                      <option value="7">Weekly</option>
                      <option value="14">Bi-weekly</option>
                      <option value="30">Monthly</option>
                    </select>
                  </div>
                ))}
              </div>

              {/* First payment date */}
              <div>
                <label className="text-xs font-semibold text-black mb-1 block">
                  <Calendar size={12} className="inline mr-1" />
                  First payment date
                </label>
                <input
                  type="date"
                  value={customFirstPaymentDate}
                  onChange={(e) => setCustomFirstPaymentDate(e.target.value)}
                  min={todayStr}
                  className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg outline-none font-medium focus:ring-2 focus:ring-blue-500"
                />
                <p className={`text-xs mt-1 font-bold ${isCustomInstFuture ? "text-purple-700" : "text-black"}`}>
                  {isCustomInstFuture ? "⏳ Future Deal — customer will be charged on the date above" : "For a future deal, select the date you want the customer to be charged. Leave empty to charge now."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Free Gifts */}
        {renderFreeGiftsSection()}
      </div>

      {/* RIGHT — Summary */}
      <div className="px-6 py-5 space-y-4">
        <span className="text-sm font-bold text-black">Order Summary</span>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          {instMode === "equal" ? (
            /* Equal mode summary */
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-black">Total Amount</span>
                <span className="text-lg font-bold text-black">£{instEffectiveTotal || "0"}</span>
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
                  <p className="text-[10px] text-purple-800 font-medium">Shipment after successful payment</p>
                </div>
              )}
              {instMonthlyPayment < 0 && (
                <p className="text-xs text-red-600 mt-1 font-bold">Deposit exceeds total!</p>
              )}
            </>
          ) : (
            /* Custom mode summary */
            <>
              {instProductsTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-black">Products Total</span>
                  <span className="text-lg font-bold text-black">£{instProductsTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-black">Payments Total ({customPayments.length} payments)</span>
                <span className={`text-lg font-bold ${customTotal > 0 && instProductsTotal > 0 && Math.abs(customTotal - instProductsTotal) > 0.01 ? "text-red-600" : "text-green-700"}`}>£{customTotal.toFixed(2)}</span>
              </div>
              {customTotal > 0 && instProductsTotal > 0 && Math.abs(customTotal - instProductsTotal) > 0.01 && (
                <p className="text-[10px] font-bold text-red-600">Payments total doesn’t match products total (£{instProductsTotal.toFixed(2)})</p>
              )}
              <div className="border-t border-gray-200 pt-2 space-y-1">
                {customPayments.map((p, i) => {
                  const intervalLabel = p.interval === "7" ? "Weekly" : p.interval === "14" ? "Bi-weekly" : "Monthly";
                  return (
                    <div key={i} className="flex justify-between text-xs text-black">
                      <span>#{i + 1} — {intervalLabel}</span>
                      <span className="font-bold">£{p.amount || "0"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="text-xs font-semibold text-black">First Payment</span>
                <span className="text-xs font-bold text-black">
                  {isCustomInstFuture ? new Date(customFirstPaymentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today (immediate)"}
                </span>
              </div>
              {isCustomInstFuture && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mt-2">
                  <span className="text-xs font-bold text-purple-800">⏳ Future Deal</span>
                  <p className="text-[10px] text-purple-800 font-medium">Shipment after successful payment</p>
                </div>
              )}
            </>
          )}
          {instProducts.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <span className="text-[10px] font-bold text-black uppercase">Products</span>
              {instProducts.map((p, i) => (
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-black">Done Deal</h2>
            <p className="text-sm text-black">{customerName}</p>
          </div>
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
              disabled={markDoneDealMutation.isPending || (dealType === "subscription" ? subProducts.length === 0 : instProducts.length === 0)}
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
