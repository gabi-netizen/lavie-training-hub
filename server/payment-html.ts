/**
 * Standalone payment page HTML — inlined as a TS string so esbuild
 * bundles it into dist/index.js and no file-copy step is needed on Railway.
 *
 * Usage:
 *   import { getPaymentPageHtml } from "../payment-html";
 *   const html = getPaymentPageHtml(process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");
 */
export function getPaymentPageHtml(stripePk: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lavié Labs — Secure Payment</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f7f4;
      color: #1a1a1a;
      min-height: 100vh;
    }
    .header {
      background: #fff;
      border-bottom: 1px solid #e8e4df;
      padding: 16px 24px;
      text-align: center;
    }
    .header-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #1a1a1a;
    }
    .page {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px 64px;
      display: flex;
      gap: 32px;
      align-items: flex-start;
    }
    @media (max-width: 680px) {
      .page { flex-direction: column; }
    }
    .product {
      flex: 1;
      background: #fff;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .product img {
      width: 100%;
      max-width: 260px;
      display: block;
      margin: 0 auto 20px;
      border-radius: 12px;
    }
    .product-name { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .product-stars { color: #f5a623; font-size: 16px; margin-bottom: 4px; }
    .product-reviews { font-size: 13px; color: #888; margin-bottom: 12px; }
    .product-desc { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px; }
    .product-price { font-size: 22px; font-weight: 700; color: #2d6a4f; margin-bottom: 16px; }
    .trust-items { list-style: none; }
    .trust-items li { font-size: 13px; color: #444; padding: 4px 0; }
    .trust-items li::before { content: "✓  "; color: #2d6a4f; font-weight: 700; }
    .payment {
      flex: 1;
      background: #fff;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .payment-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; text-align: center; }
    #payment-request-btn { margin-bottom: 16px; }
    #payment-request-btn iframe { border-radius: 8px; }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0;
      color: #aaa;
      font-size: 13px;
    }
    .divider::before, .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #e5e5e5;
    }
    .field-label { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 6px; }
    .stripe-input {
      border: 1.5px solid #ddd;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      background: #fafafa;
      transition: border-color 0.2s;
    }
    .stripe-input.StripeElement--focus { border-color: #2d6a4f; background: #fff; }
    .stripe-input.StripeElement--invalid { border-color: #e74c3c; }
    .pay-btn {
      width: 100%;
      background: #1a3c2e;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.2s, opacity 0.2s;
      letter-spacing: 0.02em;
    }
    .pay-btn:hover { background: #2d6a4f; }
    .pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .secure-note { text-align: center; font-size: 12px; color: #aaa; margin-top: 14px; }
    .msg {
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      margin-bottom: 14px;
      display: none;
    }
    .msg.error { background: #fef2f2; color: #c0392b; border: 1px solid #fca5a5; display: block; }
    .msg.success { background: #f0fdf4; color: #166534; border: 1px solid #86efac; display: block; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #bbb; border-top: 1px solid #eee; }
    .badges {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #aaa;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">Lavié</div>
  </div>

  <div class="page">
    <div class="product">
      <img src="https://training.lavielabs.com/assets/matinika-product.png"
           onerror="this.style.display='none'"
           alt="Matinika Age Defying Cream" />
      <div class="product-name">Matinika™ Age Defying Cream</div>
      <div class="product-stars">★★★★★</div>
      <div class="product-reviews">(830 reviews)</div>
      <div class="product-desc">
        Enhance your complexion with this transformative skin treatment,
        crafted to refine texture and deliver a visibly tighter,
        more resilient appearance.
      </div>
      <div class="product-price">🇬🇧 £4.95 P&amp;P</div>
      <ul class="trust-items">
        <li>21-Day Free Trial</li>
        <li>Cancel Anytime</li>
        <li>Secure &amp; Encrypted</li>
        <li>All Skin Types · Anti-Aging</li>
      </ul>
    </div>

    <div class="payment">
      <div class="payment-title">Secure Payment</div>
      <div id="msg" class="msg"></div>

      <!-- Apple Pay / Google Pay button -->
      <div id="payment-request-btn" style="display:none;"></div>
      <div id="divider" class="divider" style="display:none;">or pay with card</div>

      <!-- Card fields only — no email, no name, no address -->
      <div class="field-label">Card Number</div>
      <div id="card-number" class="stripe-input"></div>

      <div style="display:flex;gap:12px;">
        <div style="flex:1;">
          <div class="field-label">Expiry</div>
          <div id="card-expiry" class="stripe-input"></div>
        </div>
        <div style="flex:1;">
          <div class="field-label">CVC</div>
          <div id="card-cvc" class="stripe-input"></div>
        </div>
      </div>

      <button id="pay-btn" class="pay-btn">Pay £4.95</button>
      <div class="secure-note">🔒 Your payment is secured by Stripe</div>
    </div>
  </div>

  <div class="badges">
    <span>Vegan</span>
    <span>Cruelty Free</span>
    <span>Dermatologist Tested</span>
    <span>60-Day Guarantee</span>
  </div>
  <div class="footer">© 2025 Lavié Labs. All rights reserved.</div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const agentName = params.get('agent') || '';

    const stripe = Stripe('${stripePk}');
    const elements = stripe.elements();

    const style = {
      base: {
        fontSize: '15px',
        color: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        '::placeholder': { color: '#aaa' },
      },
      invalid: { color: '#e74c3c' },
    };

    const cardNumber = elements.create('cardNumber', { style });
    const cardExpiry = elements.create('cardExpiry', { style });
    const cardCvc   = elements.create('cardCvc',    { style });

    cardNumber.mount('#card-number');
    cardExpiry.mount('#card-expiry');
    cardCvc.mount('#card-cvc');

    // Apple Pay / Google Pay — no email, no name, no shipping
    const paymentRequest = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: { label: 'Matinika Trial Package', amount: 495 },
      requestPayerName: false,
      requestPayerEmail: false,
      requestShipping: false,
    });

    const prButton = elements.create('paymentRequestButton', {
      paymentRequest,
      style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '50px' } },
    });

    paymentRequest.canMakePayment().then(result => {
      if (result) {
        document.getElementById('payment-request-btn').style.display = 'block';
        document.getElementById('divider').style.display = 'flex';
        prButton.mount('#payment-request-btn');
      }
    });

    paymentRequest.on('paymentmethod', async (ev) => {
      showMsg('', '');
      try {
        const { clientSecret } = await createIntent();
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );
        if (confirmError) { ev.complete('fail'); showMsg(confirmError.message, 'error'); return; }
        ev.complete('success');
        if (paymentIntent.status === 'requires_action') {
          const { error } = await stripe.confirmCardPayment(clientSecret);
          if (error) { showMsg(error.message, 'error'); return; }
        }
        showMsg('Payment successful! Thank you.', 'success');
        document.getElementById('pay-btn').disabled = true;
      } catch (e) {
        ev.complete('fail');
        showMsg(e.message || 'Payment failed', 'error');
      }
    });

    // Manual card payment — no extra fields
    document.getElementById('pay-btn').addEventListener('click', async () => {
      const btn = document.getElementById('pay-btn');
      btn.disabled = true;
      btn.textContent = 'Processing…';
      showMsg('', '');
      try {
        const { clientSecret } = await createIntent();

        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardNumber },
        });

        if (error) {
          showMsg(error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Pay £4.95';
        } else if (paymentIntent.status === 'succeeded') {
          showMsg('Payment successful! Thank you.', 'success');
          btn.textContent = 'Paid ✓';
        }
      } catch (e) {
        showMsg(e.message || 'Something went wrong', 'error');
        btn.disabled = false;
        btn.textContent = 'Pay £4.95';
      }
    });

    async function createIntent() {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not connect to payment server');
      }
      return res.json();
    }

    function showMsg(text, type) {
      const el = document.getElementById('msg');
      el.textContent = text;
      el.className = 'msg' + (type ? ' ' + type : '');
    }
  </script>
</body>
</html>`;
}
