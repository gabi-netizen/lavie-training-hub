/**
 * CardEntryModal — Reusable Stripe Elements card entry modal.
 *
 * Allows agents/managers to manually charge £4.95 to a customer by entering
 * card details via Stripe Elements. Creates a PaymentMethod, then calls
 * the createManualCharge tRPC mutation to process the charge server-side.
 *
 * The existing webhook (payment_intent.succeeded) handles:
 *   - Mintsoft order creation
 *   - Subscription Schedule creation
 *   automatically.
 */
import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { trpc } from "@/lib/trpc";
import { X, CreditCard, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

// Stripe publishable key
const STRIPE_PK = "pk_live_51IuIy2EfUpox0KeWfAcGnlsc5OyDrbkti82yntGcWWd8xHUHuJBIoUjq5dLQCOBBSGDT7plnxVl8CJxUjTgulIlE00toX4MBQf";
const stripePromise = loadStripe(STRIPE_PK);

// ─── Props ──────────────────────────────────────────────────────────────────────
export interface CardEntryModalProps {
  open: boolean;
  onClose: () => void;
  contactId: number;
  contactName: string;
  agentName: string;
  onSuccess: () => void;
}

// ─── Stripe Element Styles ──────────────────────────────────────────────────────
const ELEMENT_STYLE = {
  base: {
    fontSize: "15px",
    color: "#1f2937",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "500",
    "::placeholder": {
      color: "#9ca3af",
    },
  },
  invalid: {
    color: "#dc2626",
    iconColor: "#dc2626",
  },
};

// ─── Inner Form (needs Stripe context) ──────────────────────────────────────────
function CardEntryForm({
  contactId,
  contactName,
  agentName: agentNameProp,
  onClose,
  onSuccess,
}: Omit<CardEntryModalProps, "open">) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [agentName, setAgentName] = useState(agentNameProp || "");

  const createManualCharge = trpc.billing.createManualCharge.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setProcessing(false);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    },
    onError: (err: any) => {
      setError(err.message || "Charge failed. Please try again.");
      setProcessing(false);
    },
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      if (!agentName.trim()) {
        setError("Agent name is required.");
        return;
      }

      setProcessing(true);
      setError(null);

      // Create PaymentMethod from card details
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        setError("Card element not ready. Please try again.");
        setProcessing(false);
        return;
      }

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardNumberElement,
      });

      if (pmError) {
        setError(pmError.message || "Invalid card details.");
        setProcessing(false);
        return;
      }

      if (!paymentMethod) {
        setError("Failed to create payment method.");
        setProcessing(false);
        return;
      }

      // Call backend to charge
      createManualCharge.mutate({
        contactId,
        paymentMethodId: paymentMethod.id,
        agentName: agentName.trim(),
      });
    },
    [stripe, elements, contactId, agentName, createManualCharge]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Customer info */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Customer</span>
          <span className="text-sm font-bold text-gray-800">{contactName}</span>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-200">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount</span>
          <span className="text-xl font-extrabold text-green-700">£4.95</span>
        </div>
      </div>

      {/* Agent Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Agent Name</label>
        {agentNameProp ? (
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-800">
            {agentNameProp}
          </div>
        ) : (
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Enter agent name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
          />
        )}
      </div>

      {/* Card Number */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Card Number</label>
        <div className="px-3 py-3 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500">
          <CardNumberElement options={{ style: ELEMENT_STYLE, showIcon: true }} />
        </div>
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Expiry</label>
          <div className="px-3 py-3 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500">
            <CardExpiryElement options={{ style: ELEMENT_STYLE }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">CVC</label>
          <div className="px-3 py-3 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500">
            <CardCvcElement options={{ style: ELEMENT_STYLE }} />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700">{error}</span>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
          <span className="text-xs font-medium text-green-700">Payment successful! Webhook will handle order + subscription.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={processing}
          className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing || success}
          className="px-5 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Processing...
            </>
          ) : success ? (
            <>
              <CheckCircle2 size={14} />
              Charged!
            </>
          ) : (
            <>
              <CreditCard size={14} />
              Charge £4.95
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Main Modal Component ───────────────────────────────────────────────────────
export function CardEntryModal({
  open,
  onClose,
  contactId,
  contactName,
  agentName,
  onSuccess,
}: CardEntryModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
              <CreditCard size={18} className="text-green-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Manual Card Charge</h2>
              <p className="text-xs text-gray-500">Charge £4.95 to {contactName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body with Stripe Elements */}
        <div className="px-6 py-5">
          <Elements stripe={stripePromise}>
            <CardEntryForm
              contactId={contactId}
              contactName={contactName}
              agentName={agentName}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}

export default CardEntryModal;
