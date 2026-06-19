/**
 * Callback Reminder Cron
 * Runs every minute.
 * Finds lead_assignments where:
 *   - callbackAt is within the next 10 minutes (and not in the past)
 *   - callbackNotifiedAt is NULL (not yet notified)
 * For each match:
 *   1. Marks callbackNotifiedAt = Date.now()
 *   2. Sends an email reminder to the assigned agent
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendViaGmail } from "../gmailTransport";

const APP_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : (process.env.VITE_APP_URL || "https://lavie-training-hub.up.railway.app");

export async function runCallbackReminder() {
  const db = await getDb();
  if (!db) {
    console.error("[CallbackReminder] No DB connection");
    return;
  }

  try {
    const now = Date.now();
    const tenMinutesFromNow = now + 10 * 60 * 1000;

    // Find callbacks due in the next 10 minutes that haven't been notified
    const rows = await db.execute(sql`
      SELECT la.id, la.customerName, la.phone, la.callbackAt, la.assignedAgent, la.agentNote,
             u.email AS agentEmail
      FROM lead_assignments la
      LEFT JOIN users u ON u.name = la.assignedAgent
      WHERE la.callbackAt IS NOT NULL
        AND la.callbackAt > ${now}
        AND la.callbackAt <= ${tenMinutesFromNow}
        AND la.callbackNotifiedAt IS NULL
        AND la.assignedAgent IS NOT NULL
    `);

    const leads = (rows as unknown as any[][])[0] as any[];
    if (!leads || leads.length === 0) return;

    console.log(`[CallbackReminder] Found ${leads.length} callbacks due in next 10 min`);

    for (const lead of leads) {
      // Mark as notified immediately to avoid duplicate sends
      await db.execute(sql`
        UPDATE lead_assignments
        SET callbackNotifiedAt = ${now}
        WHERE id = ${lead.id}
      `);

      // Send email if agent email is available
      if (lead.agentEmail) {
        const callbackDate = new Date(lead.callbackAt);
        const formattedTime = callbackDate.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b; margin-bottom: 16px;">⏰ Callback Reminder</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              You have a callback scheduled in <strong>10 minutes</strong>:
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="padding: 12px 16px; font-weight: 600; color: #475569; width: 140px; border-bottom: 1px solid #e2e8f0;">Customer</td>
                <td style="padding: 12px 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0;">${lead.customerName || "Unknown"}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Phone</td>
                <td style="padding: 12px 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0;">${lead.phone || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; font-weight: 600; color: #475569;">Callback Time</td>
                <td style="padding: 12px 16px; color: #1e293b;">${formattedTime}</td>
              </tr>
            </table>
            <a href="${APP_URL}/retention-workspace" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Open Retention Workspace
            </a>
            <p style="color: #64748b; font-size: 13px; margin-top: 20px;">
              — Lavie Labs Training Hub
            </p>
          </div>
        `;

        try {
          await sendViaGmail({
            from: "Lavie Labs <trial@lavielabs.com>",
            to: lead.agentEmail,
            subject: `⏰ Callback Reminder - ${lead.customerName || "Customer"} in 10 minutes`,
            htmlBody,
          });
          console.log(`[CallbackReminder] Email sent to ${lead.agentEmail} for ${lead.customerName}`);
        } catch (emailErr) {
          console.error(`[CallbackReminder] Email failed for ${lead.customerName}:`, emailErr);
        }
      } else {
        console.warn(`[CallbackReminder] No email found for agent "${lead.assignedAgent}"`);
      }
    }
  } catch (err) {
    console.error("[CallbackReminder] Error:", err);
  }
}

export function startCallbackReminderCron() {
  console.log("[CallbackReminder] Cron started — runs every minute");
  // Run immediately on startup
  runCallbackReminder();
  // Then every 60 seconds
  setInterval(runCallbackReminder, 60 * 1000);
}
