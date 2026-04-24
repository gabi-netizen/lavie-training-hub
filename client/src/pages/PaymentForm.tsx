/**
 * PaymentForm — public /pay page
 *
 * Integrates Stripe Elements with:
 *  - Payment Request Button (Apple Pay / Google Pay) — shown when available
 *  - PaymentElement fallback — always shown (card + other methods)
 *
 * Flow:
 *  1. User lands on /pay (optionally with ?agent=<name> query param)
 *  2. User enters email → frontend calls POST /api/stripe/create-payment-intent
 *  3. Stripe Elements renders; Apple Pay / Google Pay button shown if supported
 *  4. On payment confirmation, Stripe fires a webhook → server marks submission as processed
 */
import { useEffect, useState, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import { toast } from "sonner";

const MATINIKA_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/matinika_product.png";

// Stripe publishable key — set via VITE_STRIPE_PUBLISHABLE_KEY env var
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

// Lazy-load Stripe outside of component render to avoid re-creating the promise
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

// ─── Inner checkout form (rendered inside <Elements>) ────────────────────────

interface CheckoutFormProps {
  email: string;
  onSuccess: () => void;
}

function CheckoutForm({ email, onSuccess }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [prAvailable, setPrAvailable] = useState(false);
  const prInitialised = useRef(false);

  // Set up Payment Request (Apple Pay / Google Pay) once Stripe is ready
  useEffect(() => {
    if (!stripe || prInitialised.current) return;
    prInitialised.current = true;

    const pr = stripe.paymentRequest({
      country: "GB",
      currency: "gbp",
      total: {
        label: "Lavié Labs Trial Package",
        amount: 495, // £4.95 in pence
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
        setPrAvailable(true);
      }
    });

    pr.on("paymentmethod", async (ev) => {
      if (!stripe || !elements) {
        ev.complete("fail");
        return;
      }
      // Confirm the PaymentIntent using the payment method from Apple/Google Pay
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pay?success=1`,
          payment_method_data: {
            billing_details: {
              email,
              name: ev.payerName ?? undefined,
            },
          },
        },
        redirect: "if_required",
      });

      if (error) {
        ev.complete("fail");
        toast.error(error.message ?? "Payment failed. Please try again.");
      } else {
        ev.complete("success");
        onSuccess();
      }
    });
  }, [stripe, elements, email, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/pay?success=1`,
        payment_method_data: {
          billing_details: { email },
        },
      },
      redirect: "if_required",
    });

    if (error) {
      toast.error(error.message ?? "Payment failed. Please try again.");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form className="pay-form" onSubmit={handleSubmit}>
      {/* Apple Pay / Google Pay button */}
      {prAvailable && paymentRequest && (
        <div className="pay-pr-wrap">
          <PaymentRequestButtonElement
            options={{
              paymentRequest,
              style: {
                paymentRequestButton: {
                  type: "buy",
                  theme: "dark",
                  height: "52px",
                },
              },
            }}
          />
          <div className="pay-divider">
            <span>or pay with card</span>
          </div>
        </div>
      )}

      {/* Stripe Payment Element (card + other methods) */}
      <PaymentElement
        options={{
          layout: "tabs",
          fields: {
            billingDetails: {
              email: "never", // collected separately
            },
          },
        }}
      />

      <button
        type="submit"
        className="pay-submit-btn"
        disabled={!stripe || loading}
      >
        {loading ? "Processing..." : "Pay £4.95"}
      </button>
      <p className="pay-secure-note">
        🔒 Secured by Stripe · PCI DSS Level 1 certified
      </p>
    </form>
  );
}

// ─── Outer page component ─────────────────────────────────────────────────────

export default function PaymentForm() {
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [creatingIntent, setCreatingIntent] = useState(false);

  // Read ?agent= query param to track which agent sent the link
  const agentName = new URLSearchParams(window.location.search).get("agent") ?? "";

  // Check for ?success=1 redirect from Stripe (3DS / redirect flows)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setSubmitted(true);
    }
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
      toast.error("Payment system not configured. Please contact support.");
      return;
    }

    setCreatingIntent(true);
    try {
      const res = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, agentName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to initialise payment");
      }
      const data = await res.json() as { clientSecret: string };
      setClientSecret(data.clientSecret);
      setEmailConfirmed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setCreatingIntent(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="pay-page">
        <div className="pay-success">
          <div className="pay-success-icon">✓</div>
          <h2>Payment Successful!</h2>
          <p>Thank you for your order. Your Lavié Labs Trial Package is on its way.</p>
          <p className="pay-success-sub">
            A confirmation email will be sent to <strong>{email || "your email"}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-page">
      {/* Header */}
      <div className="pay-header">
        <div className="pay-logo-text">Lavié</div>
      </div>

      <div className="pay-container">
        {/* LEFT: Product Info */}
        <div className="pay-product">
          <h1 className="pay-title">Trial Package</h1>
          <div className="pay-price">
            <span className="pay-flag">🇬🇧</span>
            <span className="pay-amount">£4.95</span>
            <span className="pay-pp">P&P</span>
          </div>

          <div className="pay-product-card">
            <div className="pay-product-img-wrap">
              <img
                src={MATINIKA_IMG}
                alt="Matinika Age Defying Cream"
                className="pay-product-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div className="pay-product-info">
              <div className="pay-product-tag">ALL SKIN TYPES · ANTI-AGING</div>
              <h2 className="pay-product-name">Matinika™ Age Defying Cream</h2>
              <div className="pay-stars">
                ★★★★★ <span className="pay-reviews">(830 reviews)</span>
              </div>
              <p className="pay-product-desc">
                Enhance your complexion with this transformative skin treatment, crafted to refine
                texture and deliver a visibly tighter, more resilient appearance.
              </p>
            </div>
          </div>

          {/* Trust badges */}
          <div className="pay-trust">
            <div className="pay-trust-item">🔒 Secure &amp; Encrypted</div>
            <div className="pay-trust-item">✓ 21-Day Free Trial</div>
            <div className="pay-trust-item">✓ Cancel Anytime</div>
          </div>
        </div>

        {/* RIGHT: Payment Form */}
        <div className="pay-form-wrap">
          <h2 className="pay-form-title">
            {emailConfirmed ? "Complete Payment" : "Enter Your Email"}
          </h2>

          {/* Step 1: Email collection */}
          {!emailConfirmed && (
            <form className="pay-form" onSubmit={handleEmailSubmit}>
              <div className="pay-field-full">
                <input
                  className="pay-input"
                  type="email"
                  name="email"
                  placeholder="Email address *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="pay-submit-btn"
                disabled={creatingIntent}
              >
                {creatingIntent ? "Loading..." : "Continue to Payment →"}
              </button>
              <p className="pay-secure-note">
                🔒 Your payment is secured by Stripe
              </p>
            </form>
          )}

          {/* Step 2: Stripe Elements */}
          {emailConfirmed && clientSecret && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#2d5a4e",
                    colorBackground: "#f8f8f6",
                    colorText: "#1a1a1a",
                    borderRadius: "8px",
                    fontFamily: "inherit",
                  },
                },
              }}
            >
              <CheckoutForm
                email={email}
                onSuccess={() => setSubmitted(true)}
              />
            </Elements>
          )}

          {/* Stripe not configured fallback */}
          {!STRIPE_PUBLISHABLE_KEY && (
            <div className="pay-stripe-missing">
              <p>⚠️ Payment system is not configured yet.</p>
              <p>
                Please add <code>VITE_STRIPE_PUBLISHABLE_KEY</code> to your Railway environment
                variables.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="pay-footer">
        <div className="pay-footer-badges">
          <span>VEGAN</span>
          <span>CRUELTY FREE</span>
          <span>DERMATOLOGIST TESTED</span>
          <span>60-DAY GUARANTEE</span>
        </div>
        <p className="pay-footer-copy">© 2025 Lavié Labs. All rights reserved.</p>
      </div>
    </div>
  );
}
