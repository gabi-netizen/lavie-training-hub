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
  <title>Lavi&#233; Labs &#8212; Secure Payment</title>
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
    .trust-items li::before { content: "\2713  "; color: #2d6a4f; font-weight: 700; }
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
    <div class="header-title">Lavi&#233;</div>
  </div>

  <div class="page">
    <div class="product">
      <img src="https://training.lavielabs.com/assets/matinika-product.png"
           onerror="this.style.display='none'"
           alt="Matinika Age Defying Cream" />
      <div class="product-name">Matinika Age Defying Cream</div>
      <div class="product-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <div class="product-reviews">(830 reviews)</div>
      <div class="product-desc">
        Enhance your complexion with this transformative skin treatment,
        crafted to refine texture and deliver a visibly tighter,
        more resilient appearance.
      </div>
      <div class="product-price">&#127468;&#127463; &pound;4.95 P&amp;P</div>
      <ul class="trust-items">
        <li>21-Day Free Trial</li>
        <li>Cancel Anytime</li>
        <li>Secure &amp; Encrypted</li>
        <li>All Skin Types &middot; Anti-Aging</li>
      </ul>
    </div>

    <div class="payment">
      <div class="payment-title">Secure Payment</div>
      <div id="msg" class="msg"></div>

      <!-- Apple Pay / Google Pay button -->
      <div id="payment-request-btn" style="display:none;"></div>
      <div id="divider" class="divider" style="display:none;">or pay with card</div>

      <!-- Card fields only -->
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

      <button id="pay-btn" class="pay-btn">Pay &pound;4.95</button>
      <div class="secure-note">&#128274; Your payment is secured by Stripe</div>
    </div>
  </div>

  <div class="badges">
    <span>Vegan</span>
    <span>Cruelty Free</span>
    <span>Dermatologist Tested</span>
    <span>60-Day Guarantee</span>
  </div>
  <div class="footer">&copy; 2025 Lavie Labs. All rights reserved.</div>

  <script>
    var params = new URLSearchParams(window.location.search);
    var agentName = params.get('agent') || '';

    var stripe = Stripe('${stripePk}');
    var elements = stripe.elements();

    var style = {
      base: {
        fontSize: '15px',
        color: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        '::placeholder': { color: '#aaa' }
      },
      invalid: { color: '#e74c3c' }
    };

    var cardNumber = elements.create('cardNumber', { style: style });
    var cardExpiry = elements.create('cardExpiry', { style: style });
    var cardCvc    = elements.create('cardCvc',    { style: style });

    cardNumber.mount('#card-number');
    cardExpiry.mount('#card-expiry');
    cardCvc.mount('#card-cvc');

    // ── Stripe protocol: create PaymentIntent on page load and cache it.
    // Apple Pay / Google Pay Payment Request Button requires the clientSecret
    // to be available immediately when the wallet sheet opens.
    var clientSecretPromise = fetch('/api/stripe/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: agentName })
    }).then(function(res) {
      if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'Server error'); });
      return res.json();
    }).then(function(data) {
      return data.clientSecret;
    });

    // ── Apple Pay / Google Pay button
    var paymentRequest = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: { label: 'Matinika Trial Package', amount: 495 },
      requestPayerName: false,
      requestPayerEmail: false,
      requestShipping: false
    });

    var prButton = elements.create('paymentRequestButton', {
      paymentRequest: paymentRequest,
      style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '50px' } }
    });

    paymentRequest.canMakePayment().then(function(result) {
      if (result) {
        document.getElementById('payment-request-btn').style.display = 'block';
        document.getElementById('divider').style.display = 'flex';
        prButton.mount('#payment-request-btn');
      }
    });

    paymentRequest.on('paymentmethod', function(ev) {
      showMsg('', '');
      clientSecretPromise.then(function(clientSecret) {
        return stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        ).then(function(result) {
          if (result.error) {
            ev.complete('fail');
            showMsg(result.error.message, 'error');
            return;
          }
          ev.complete('success');
          if (result.paymentIntent.status === 'requires_action') {
            return stripe.confirmCardPayment(clientSecret).then(function(r) {
              if (r.error) { showMsg(r.error.message, 'error'); }
              else { showSuccess(); }
            });
          }
          showSuccess();
        });
      }).catch(function(e) {
        ev.complete('fail');
        showMsg(e.message || 'Payment failed', 'error');
      });
    });

    // ── Manual card payment
    document.getElementById('pay-btn').addEventListener('click', function() {
      var btn = document.getElementById('pay-btn');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      showMsg('', '');

      clientSecretPromise.then(function(clientSecret) {
        return stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardNumber }
        });
      }).then(function(result) {
        if (result.error) {
          showMsg(result.error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Pay \u00a34.95';
        } else if (result.paymentIntent.status === 'succeeded') {
          showSuccess();
          btn.textContent = 'Paid \u2713';
        }
      }).catch(function(e) {
        showMsg(e.message || 'Something went wrong', 'error');
        btn.disabled = false;
        btn.textContent = 'Pay \u00a34.95';
      });
    });

    function showSuccess() {
      showMsg('Payment successful! Thank you.', 'success');
      document.getElementById('pay-btn').disabled = true;
    }

    function showMsg(text, type) {
      var el = document.getElementById('msg');
      el.textContent = text;
      el.className = 'msg' + (type ? ' ' + type : '');
    }
  </script>
</body>
</html>`;
}
