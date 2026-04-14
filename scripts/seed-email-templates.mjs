import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lavié – Post-Call Follow-Up</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e0e0e0;">
          <tr>
            <td style="padding:0;margin:0;">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/lavie-email-header_ed6818fa.jpg"
                alt="Lavié – Personalised Skincare"
                width="600"
                style="display:block;width:100%;max-width:600px;height:auto;border:0;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 24px 40px;color:#222222;font-size:15px;line-height:1.7;">
              <p style="margin:0 0 18px 0;font-size:16px;">Dear \${Customers.First Name},</p>
              <p style="margin:0 0 14px 0;">This is \${Customers.Customers Owner} from Lavie Labs.</p>
              <p style="margin:0 0 14px 0;">After our call today, I realized I didn't fully explain why Matinika™ is different from everything else you've tried.</p>
              <p style="margin:0 0 14px 0;">Most skincare products just sit on your skin. Matinika™ actually <strong>penetrates deep into your cells</strong> to rebuild collagen from the inside out.</p>
              <p style="margin:0 0 14px 0;">That's why women see visible results in 21 days—not months.</p>
              <p style="margin:0 0 14px 0;">Here's what I'd suggest: <strong>Try the 3-week trial for £4.95.</strong></p>
              <p style="margin:0 0 14px 0;">That's enough time to see if it works for you. If it doesn't, just cancel before Day 21. No awkward conversations, no questions asked.</p>
              <p style="margin:0 0 14px 0;">I genuinely believe you'll love it. But only you can decide.</p>
              <p style="margin:0 0 14px 0;">There is more information here regarding the product itself and how to sign up but I'd be more than happy to give you a call back if you'd prefer (1 min read):<br /><a href="https://matinika-trial.lavielabs.co.uk/" style="color:#b8963e;text-decoration:underline;">https://matinika-trial.lavielabs.co.uk/</a></p>
              <p style="margin:0 0 14px 0;">I have also included our website link below so that you can see our full product range!<br /><a href="https://lavielabs.co.uk/" style="color:#b8963e;text-decoration:underline;">https://lavielabs.co.uk/</a></p>
              <p style="margin:0 0 24px 0;">Any questions? Just reply to this email. I'm here to help.</p>
              <p style="margin:0 0 4px 0;">Kind Regards,</p>
              <p style="margin:0 0 6px 0;font-weight:bold;font-size:15px;color:#111111;">\${agentName}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">
                <tr>
                  <td style="vertical-align:top;padding-right:20px;border-right:2px solid #e0e0e0;">
                    <p style="margin:0 0 2px 0;font-family:Arial,sans-serif;font-size:13px;color:#555555;">Account Manager UK</p>
                    <p style="margin:0 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:#555555;">LavieLabs</p>
                  </td>
                  <td style="vertical-align:top;padding-left:20px;">
                    <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:12px;color:#444444;">
                      <span style="color:#b8963e;margin-right:6px;">✉</span>
                      <a href="mailto:\${agentEmail}" style="color:#444444;text-decoration:none;">\${agentEmail}</a>
                    </p>
                    <p style="margin:0 0 0 0;font-family:Arial,sans-serif;font-size:12px;">
                      <span style="color:#b8963e;margin-right:6px;">🔗</span>
                      <a href="https://lavielabs.co.uk/" style="color:#b8963e;text-decoration:underline;">https://lavielabs.co.uk/</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9f9f9;padding:20px 40px;border-top:1px solid #e8e8e8;text-align:center;">
              <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:12px;color:#888888;">Flushing, New York, United States, 11367</p>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#aaaaaa;">Copyright © 2019, @ Lavielabs.com. All Rights Reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check if already seeded
const [rows] = await conn.execute("SELECT id FROM email_templates WHERE name = 'Post-Call Follow-Up (Matinika Trial)'");
if (rows.length > 0) {
  console.log("Template already seeded, skipping.");
  await conn.end();
  process.exit(0);
}

await conn.execute(
  "INSERT INTO email_templates (name, subject, htmlBody, description) VALUES (?, ?, ?, ?)",
  [
    "Post-Call Follow-Up (Matinika Trial)",
    "Following up from our call today — Matinika™",
    htmlBody,
    "Send after a call to follow up on the Matinika 21-day trial offer. Fills in customer name and agent details automatically."
  ]
);

console.log("✅ Email template seeded successfully.");
await conn.end();
