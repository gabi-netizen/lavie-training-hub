import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const LAVIE_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/lavie_logo.png";
const MATINIKA_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/matinika_product.png";

export default function PaymentForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    email: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    cardholderName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
  });

  const submitForm = trpc.paymentForm.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "cardNumber") {
      const cleaned = value.replace(/\D/g, "").slice(0, 16);
      const formatted = cleaned.replace(/(.{4})/g, "$1 ").trim();
      setForm((prev) => ({ ...prev, cardNumber: formatted }));
      return;
    }
    if (name === "cardExpiry") {
      const cleaned = value.replace(/\D/g, "").slice(0, 4);
      const formatted = cleaned.length > 2 ? cleaned.slice(0, 2) + "/" + cleaned.slice(2) : cleaned;
      setForm((prev) => ({ ...prev, cardExpiry: formatted }));
      return;
    }
    if (name === "cardCvc") {
      setForm((prev) => ({ ...prev, cardCvc: value.replace(/\D/g, "").slice(0, 4) }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.cardholderName || !form.cardNumber) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const cardLast4 = form.cardNumber.replace(/\s/g, "").slice(-4);
    submitForm.mutate({
      email: form.email,
      cardholderName: form.cardholderName,
      cardLast4,
      cardExpiry: form.cardExpiry,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      postcode: form.postcode,
    });
  };

  if (submitted) {
    return (
      <div className="pay-page">
        <div className="pay-success">
          <div className="pay-success-icon">✓</div>
          <h2>Thank you!</h2>
          <p>Your details have been received. Our team will process your order shortly.</p>
          <p className="pay-success-sub">You will receive a confirmation email at <strong>{form.email}</strong>.</p>
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
                Enhance your complexion with this transformative skin treatment, crafted to refine texture and deliver a visibly tighter, more resilient appearance.
              </p>
            </div>
          </div>

          {/* Trust badges */}
          <div className="pay-trust">
            <div className="pay-trust-item">🔒 Secure & Encrypted</div>
            <div className="pay-trust-item">✓ 21-Day Free Trial</div>
            <div className="pay-trust-item">✓ Cancel Anytime</div>
          </div>
        </div>

        {/* RIGHT: Payment Form */}
        <div className="pay-form-wrap">
          <h2 className="pay-form-title">Pay With Card</h2>
          <form className="pay-form" onSubmit={handleSubmit}>
            {/* Email */}
            <div className="pay-field-full">
              <input
                className="pay-input"
                type="email"
                name="email"
                placeholder="Email *"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>

            {/* Card Number */}
            <div className="pay-field-full pay-card-field">
              <input
                className="pay-input"
                type="text"
                name="cardNumber"
                placeholder="Card Number"
                value={form.cardNumber}
                onChange={handleChange}
                inputMode="numeric"
                autoComplete="cc-number"
              />
              <div className="pay-card-icons">
                <span className="pay-card-icon">VISA</span>
                <span className="pay-card-icon">MC</span>
                <span className="pay-card-icon">AMEX</span>
              </div>
            </div>

            {/* Expiry + CVC */}
            <div className="pay-field-row">
              <input
                className="pay-input"
                type="text"
                name="cardExpiry"
                placeholder="Expiration Date"
                value={form.cardExpiry}
                onChange={handleChange}
                inputMode="numeric"
                autoComplete="cc-exp"
              />
              <div className="pay-cvc-wrap">
                <span className="pay-cvc-icon">⊞</span>
                <input
                  className="pay-input pay-input-cvc"
                  type="text"
                  name="cardCvc"
                  placeholder="CVC"
                  value={form.cardCvc}
                  onChange={handleChange}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                />
              </div>
            </div>

            {/* Cardholder Name */}
            <div className="pay-field-full">
              <input
                className="pay-input"
                type="text"
                name="cardholderName"
                placeholder="Cardholder Name"
                value={form.cardholderName}
                onChange={handleChange}
                required
                autoComplete="cc-name"
              />
            </div>

            {/* Billing Address */}
            <div className="pay-billing-label">Billing Address</div>

            <div className="pay-field-row">
              <input
                className="pay-input"
                type="text"
                name="addressLine1"
                placeholder="Address Line 1"
                value={form.addressLine1}
                onChange={handleChange}
                autoComplete="address-line1"
              />
              <input
                className="pay-input"
                type="text"
                name="addressLine2"
                placeholder="Address Line 2"
                value={form.addressLine2}
                onChange={handleChange}
                autoComplete="address-line2"
              />
            </div>

            <div className="pay-field-row">
              <input
                className="pay-input"
                type="text"
                name="city"
                placeholder="City / Town"
                value={form.city}
                onChange={handleChange}
                autoComplete="address-level2"
              />
              <input
                className="pay-input"
                type="text"
                name="postcode"
                placeholder="Postcode"
                value={form.postcode}
                onChange={handleChange}
                autoComplete="postal-code"
              />
            </div>

            <button
              type="submit"
              className="pay-submit-btn"
              disabled={submitForm.isPending}
            >
              {submitForm.isPending ? "Processing..." : "Pay"}
            </button>

            <p className="pay-secure-note">
              🔒 Your payment information is encrypted and secure
            </p>
          </form>
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
