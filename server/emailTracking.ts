/**
 * Email Tracking Endpoints
 * - GET /api/email-track/:emailLogId.png — tracking pixel (open tracking)
 * - GET /api/email-link/:emailLogId/:linkIndex — link click tracking + redirect
 *
 * These are public (no auth) because they are called from email clients.
 */
import { Request, Response } from "express";
import { getDb } from "./db";
import { emailLogs, emailLinkClicks, emailNotifications, contacts } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// 1x1 transparent PNG (68 bytes)
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
  "Nl7pcQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Tracking pixel handler — records email open events.
 */
export async function handleEmailTrackPixel(req: Request, res: Response) {
  try {
    // Extract emailLogId from the filename param (e.g. "123.png" → 123)
    const rawId = req.params.emailLogId?.replace(/\.png$/i, "");
    const emailLogId = parseInt(rawId, 10);

    if (!isNaN(emailLogId)) {
      const db = await getDb();
      if (db) {
        // Get the email log to find the sender and contact
        const [emailLog] = await db
          .select()
          .from(emailLogs)
          .where(eq(emailLogs.id, emailLogId))
          .limit(1);

        if (emailLog) {
          // Update openedAt (only if first open) and increment openCount
          await db.execute(sql`
            UPDATE email_logs
            SET openCount = openCount + 1,
                openedAt = COALESCE(openedAt, NOW())
            WHERE id = ${emailLogId}
          `);

          // Create notification for the agent (only on first open)
          if (!emailLog.openedAt) {
            // Get contact name
            let contactName = "Unknown";
            if (emailLog.contactId) {
              const [contact] = await db
                .select({ name: contacts.name })
                .from(contacts)
                .where(eq(contacts.id, emailLog.contactId))
                .limit(1);
              if (contact) contactName = contact.name;
            }

            await db.insert(emailNotifications).values({
              userId: emailLog.sentByUserId,
              emailLogId: emailLogId,
              type: "opened",
              contactId: emailLog.contactId,
              contactName,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[EmailTracking] Error recording open:", err);
  }

  // Always return the pixel regardless of errors
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.status(200).send(TRANSPARENT_PIXEL);
}

/**
 * Link click handler — records click events and redirects to original URL.
 */
export async function handleEmailLinkClick(req: Request, res: Response) {
  const emailLogId = parseInt(req.params.emailLogId, 10);
  const linkIndex = parseInt(req.params.linkIndex, 10);
  const originalUrl = req.query.url as string;

  if (!originalUrl) {
    res.status(400).send("Missing url parameter");
    return;
  }

  try {
    if (!isNaN(emailLogId)) {
      const db = await getDb();
      if (db) {
        // Get the email log to find the sender and contact
        const [emailLog] = await db
          .select()
          .from(emailLogs)
          .where(eq(emailLogs.id, emailLogId))
          .limit(1);

        if (emailLog) {
          // Record the click
          await db.insert(emailLinkClicks).values({
            emailLogId,
            linkIndex: isNaN(linkIndex) ? 0 : linkIndex,
            originalUrl,
          });

          // Update clickedAt (only if first click) and increment clickCount on email_logs
          await db.execute(sql`
            UPDATE email_logs
            SET clickCount = clickCount + 1,
                clickedAt = COALESCE(clickedAt, NOW())
            WHERE id = ${emailLogId}
          `);

          // Create notification for the agent (only on first click)
          if (!emailLog.clickedAt) {
            let contactName = "Unknown";
            if (emailLog.contactId) {
              const [contact] = await db
                .select({ name: contacts.name })
                .from(contacts)
                .where(eq(contacts.id, emailLog.contactId))
                .limit(1);
              if (contact) contactName = contact.name;
            }

            await db.insert(emailNotifications).values({
              userId: emailLog.sentByUserId,
              emailLogId: emailLogId,
              type: "clicked",
              contactId: emailLog.contactId,
              contactName,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[EmailTracking] Error recording click:", err);
  }

  // Always redirect regardless of errors
  res.redirect(302, originalUrl);
}

/**
 * Get the base URL for tracking links.
 * Uses RAILWAY_PUBLIC_DOMAIN or falls back to the known production URL.
 */
export function getTrackingBaseUrl(): string {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  return "https://lavie-training-hub-production.up.railway.app";
}

/**
 * Inject tracking pixel into HTML email body.
 * Appends a 1x1 transparent PNG image at the end of the HTML body.
 */
export function injectTrackingPixel(html: string, emailLogId: number): string {
  const baseUrl = getTrackingBaseUrl();
  const pixelUrl = `${baseUrl}/api/email-track/${emailLogId}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;

  // Insert before </body> if it exists, otherwise append at the end
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixelTag}</body>`);
  }
  return html + pixelTag;
}

/**
 * Rewrite all links in HTML to go through our tracking redirect.
 * Returns the modified HTML with tracked links.
 */
export function rewriteLinksForTracking(html: string, emailLogId: number): string {
  const baseUrl = getTrackingBaseUrl();
  let linkIndex = 0;

  // Match all <a href="..."> tags and rewrite the href
  return html.replace(/<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
    // Skip mailto: and tel: links, and skip anchor links
    if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) {
      return match;
    }
    // Skip the tracking pixel URL itself
    if (url.includes("/api/email-track/")) {
      return match;
    }

    const currentIndex = linkIndex++;
    const encodedUrl = encodeURIComponent(url);
    const trackedUrl = `${baseUrl}/api/email-link/${emailLogId}/${currentIndex}?url=${encodedUrl}`;
    return `<a ${before}href="${trackedUrl}"${after}>`;
  });
}
