import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const FORM_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Complete Your Order — Lavié Labs</title>
<style>
  body { margin: 0; padding: 0; background: #f5f5f0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; }
  .header { background: #fff; padding: 32px 40px 24px; border-bottom: 1px solid #e8e8e4; text-align: center; }
  .logo { font-size: 2rem; font-style: italic; font-weight: 700; color: #1a1a1a; letter-spacing: 0.02em; }
  .hero { background: #2d5a4e; color: #fff; padding: 40px 40px 32px; text-align: center; }
  .hero h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 12px; }
  .hero p { font-size: 1rem; opacity: 0.9; margin: 0; line-height: 1.6; }
  .body { padding: 36px 40px; }
  .greeting { font-size: 1.05rem; margin-bottom: 20px; color: #1a1a1a; }
  .body p { font-size: 0.95rem; color: #444; line-height: 1.7; margin: 0 0 16px; }
  .offer-box { background: #f8faf9; border: 1.5px solid #2d5a4e; border-radius: 10px; padding: 24px 28px; margin: 24px 0; }
  .offer-box h3 { font-size: 1rem; font-weight: 700; color: #2d5a4e; margin: 0 0 12px; }
  .offer-item { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: #333; margin-bottom: 8px; }
  .check { color: #2d5a4e; font-weight: 700; font-size: 1rem; }
  .price-row { margin-top: 16px; padding-top: 16px; border-top: 1px solid #d0e8e0; display: flex; align-items: baseline; gap: 8px; }
  .price-big { font-size: 1.8rem; font-weight: 800; color: #2d5a4e; }
  .price-label { font-size: 0.9rem; color: #666; }
  .cta-wrap { text-align: center; margin: 32px 0; }
  .cta-btn { display: inline-block; background: #2d5a4e; color: #fff !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 1.05rem; font-weight: 700; letter-spacing: 0.02em; }
  .cta-btn:hover { background: #234840; }
  .trust-row { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; margin: 24px 0; }
  .trust-item { font-size: 0.78rem; color: #666; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  .footer { background: #f8f8f6; padding: 24px 40px; text-align: center; border-top: 1px solid #e8e8e4; }
  .footer p { font-size: 0.78rem; color: #aaa; margin: 4px 0; line-height: 1.5; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">Lavié</div>
  </div>

  <div class="hero">
    <h1>Your Complimentary Starter Kit is Ready</h1>
    <p>Complete your details below to receive your Matinika™ Trial — just £4.95 P&P</p>
  </div>

  <div class="body">
    <p class="greeting">Dear \${Customers.First Name},</p>
    <p>
      Following our conversation today, I wanted to make it as easy as possible for you to claim your complimentary Matinika™ Trial Kit. Simply click the secure button below and fill in your details — it takes less than 2 minutes.
    </p>

    <div class="offer-box">
      <h3>What You're Receiving Today</h3>
      <div class="offer-item"><span class="check">✓</span> Matinika™ Age Defying Cream (full size, worth £59) — <strong>FREE</strong></div>
      <div class="offer-item"><span class="check">✓</span> 21-day risk-free trial</div>
      <div class="offer-item"><span class="check">✓</span> Cancel anytime — no questions asked</div>
      <div class="offer-item"><span class="check">✓</span> VIP 30% off locked in permanently</div>
      <div class="price-row">
        <span class="price-big">£4.95</span>
        <span class="price-label">today (covers premium 48-hr tracked delivery)</span>
      </div>
    </div>

    <div class="cta-wrap">
      <a href="https://lavietrain-se3fvyjn.manus.space/pay" class="cta-btn">Complete My Order Securely →</a>
    </div>

    <div class="trust-row">
      <span class="trust-item">🔒 Encrypted & Secure</span>
      <span class="trust-item">✓ Dermatologist Tested</span>
      <span class="trust-item">✓ 60-Day Guarantee</span>
    </div>

    <p>
      If you have any questions, please don't hesitate to reply to this email or call us directly. I'm here to help.
    </p>
    <p>
      Warm regards,<br />
      <strong>\${agentName}</strong><br />
      Lavié Labs Skincare Specialist<br />
      <a href="mailto:\${agentEmail}" style="color:#2d5a4e;">\${agentEmail}</a>
    </p>
  </div>

  <div class="footer">
    <p>© 2025 Lavié Labs. All rights reserved.</p>
    <p>You're receiving this because one of our specialists shared this offer with you.</p>
  </div>
</div>
</body>
</html>`;

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  // Check if template already exists
  const [existing] = await connection.execute(
    "SELECT id FROM email_templates WHERE name = 'Form' LIMIT 1"
  );

  if (existing.length > 0) {
    // Update existing
    await connection.execute(
      "UPDATE email_templates SET subject = ?, htmlBody = ?, description = ?, updatedAt = NOW() WHERE name = 'Form'",
      [
        "Your Complimentary Matinika™ Trial — Complete Your Details",
        FORM_TEMPLATE_HTML,
        "Send to customers who prefer not to give card details over the phone. Links to the secure payment form.",
      ]
    );
    console.log("✅ Updated existing 'Form' email template");
  } else {
    // Insert new
    await connection.execute(
      "INSERT INTO email_templates (name, subject, htmlBody, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [
        "Form",
        "Your Complimentary Matinika™ Trial — Complete Your Details",
        FORM_TEMPLATE_HTML,
        "Send to customers who prefer not to give card details over the phone. Links to the secure payment form.",
      ]
    );
    console.log("✅ Inserted new 'Form' email template");
  }

  await connection.end();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
