/**
 * WhatsApp Incoming Message Webhook Handler
 *
 * Twilio sends POST requests here when a WhatsApp message is received.
 * Route: POST /api/whatsapp/incoming
 *
 * Twilio sends application/x-www-form-urlencoded body with fields:
 *   - Body: message text
 *   - From: "whatsapp:+972524222822"
 *   - To: "whatsapp:+447888868298"
 *   - MessageSid: Twilio message ID
 *   - NumMedia: number of media attachments
 *   - etc.
 *
 * IMPORTANT: This route is registered AFTER express.urlencoded() is set globally,
 * so req.body will be correctly parsed as form-encoded fields.
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { whatsappMessages, contacts } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { normalisePhone } from "../contacts";
import crypto from "crypto";

// ─── Twilio Signature Validation ─────────────────────────────────────────────
/**
 * Validates the X-Twilio-Signature header to ensure the request is from Twilio.
 * Uses HMAC-SHA1 with the auth token as the key.
 * Returns true if valid, false if invalid, null if signature header is absent.
 */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  // Build the data string: URL + sorted params concatenated as key+value
  let data = url;
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + (params[key] ?? "");
  }

  const computed = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  return computed === signature;
}

// ─── Phone Number Extraction ─────────────────────────────────────────────────
/**
 * Strips the "whatsapp:" prefix from a Twilio WhatsApp number.
 * "whatsapp:+972524222822" → "+972524222822"
 */
function stripWhatsAppPrefix(twilioNumber: string): string {
  return twilioNumber.replace(/^whatsapp:/, "");
}

// ─── Main Webhook Handler ────────────────────────────────────────────────────
export async function handleWhatsAppIncoming(req: Request, res: Response) {
  try {
    // Log the raw body to help debug parsing issues
    console.log("[WhatsApp Incoming] req.body keys:", Object.keys(req.body || {}));

    const {
      Body: body,
      From: from,
      To: to,
      MessageSid: messageSid,
    } = req.body;

    console.log(`[WhatsApp Incoming] SID: ${messageSid}, From: ${from}, To: ${to}, Body: "${(body || "").substring(0, 80)}"`);

    // ─── Twilio Signature Validation (log-only, never block) ─────────────────
    // We log the result but do NOT reject requests on failure, because Railway
    // sits behind a proxy and URL reconstruction is fragile. Once we confirm
    // real messages are arriving we can tighten this.
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const twilioSignature = req.headers["x-twilio-signature"] as string | undefined;

    if (authToken && twilioSignature) {
      // Try both http and https variants to find which one Twilio signed
      const host = req.headers["host"] || "";
      const path = req.originalUrl;
      const urlHttp = `http://${host}${path}`;
      const urlHttps = `https://${host}${path}`;
      // Also try the hardcoded production URL as a fallback
      const urlProd = "https://lavie-training-hub-production.up.railway.app/api/whatsapp/incoming";

      const validHttp = validateTwilioSignature(authToken, twilioSignature, urlHttp, req.body);
      const validHttps = validateTwilioSignature(authToken, twilioSignature, urlHttps, req.body);
      const validProd = validateTwilioSignature(authToken, twilioSignature, urlProd, req.body);

      if (validHttp || validHttps || validProd) {
        console.log("[WhatsApp Incoming] ✓ Twilio signature valid");
      } else {
        console.warn(
          `[WhatsApp Incoming] ⚠ Signature mismatch (not blocking). ` +
          `Tried: ${urlHttp}, ${urlHttps}, ${urlProd}`
        );
      }
    } else {
      console.warn("[WhatsApp Incoming] No signature header present — accepting request");
    }

    // ─── Extract and normalise the phone number ──────────────────────────────
    const fromNumber = stripWhatsAppPrefix(from || "");
    const toNumber = stripWhatsAppPrefix(to || "");

    if (!fromNumber) {
      console.error("[WhatsApp Incoming] No From number in request body");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    const db = await getDb();
    if (!db) {
      console.error("[WhatsApp Incoming] Database not available");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    // ─── Look up the contact by phone number ─────────────────────────────────
    let matchedContactId: number | null = null;
    let ownerUserId: number | null = null;

    const normalised = normalisePhone(fromNumber);

    const allContacts = await db.select().from(contacts);
    const matchedContact = allContacts.find((c) => {
      if (!c.phone) return false;
      const contactNormalised = normalisePhone(c.phone);
      if (!contactNormalised || !normalised) return false;
      return contactNormalised === normalised;
    });

    if (matchedContact) {
      matchedContactId = matchedContact.id;
      ownerUserId = matchedContact.assignedUserId;

      // If no assignedUserId on the contact, find the agent who last messaged them
      if (!ownerUserId) {
        const lastOutbound = await db
          .select()
          .from(whatsappMessages)
          .where(
            and(
              eq(whatsappMessages.contactId, matchedContactId),
              eq(whatsappMessages.direction, "outbound")
            )
          )
          .orderBy(desc(whatsappMessages.createdAt))
          .limit(1);

        if (lastOutbound.length > 0 && lastOutbound[0].sentByUserId) {
          ownerUserId = lastOutbound[0].sentByUserId;
        }
      }

      console.log(`[WhatsApp Incoming] Matched contact #${matchedContactId} (${matchedContact.name}), owner userId: ${ownerUserId}`);
    } else {
      // No contact found — create one automatically so messages are never orphaned
      console.log(`[WhatsApp Incoming] No contact match for ${fromNumber} (normalised: ${normalised}) — creating new contact`);
      try {
        const [newContact] = await db.insert(contacts).values({
          name: "No Name",
          phone: fromNumber.startsWith("+") ? fromNumber : `+${fromNumber}`,
          status: "new",
          department: "opening",
        }).$returningId();
        matchedContactId = newContact.id;
        console.log(`[WhatsApp Incoming] Created new contact #${matchedContactId} for ${fromNumber}`);
      } catch (createErr) {
        console.error(`[WhatsApp Incoming] Failed to create contact for ${fromNumber}:`, createErr);
      }
    }

    // ─── Save the inbound message ────────────────────────────────────────────
    await db.insert(whatsappMessages).values({
      contactId: matchedContactId,
      direction: "inbound",
      body: body || "",
      templateName: null,
      sentByUserId: ownerUserId,
      fromNumber,
      toNumber,
      twilioMessageSid: messageSid || null,
      status: "received",
      isRead: false,
    });

    console.log(`[WhatsApp Incoming] ✓ Message saved — contact: ${matchedContactId ?? "unmatched"}, SID: ${messageSid}`);

    // ─── Return empty TwiML response ─────────────────────────────────────────
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[WhatsApp Incoming] Error processing webhook:", err);
    // Always return 200 to prevent Twilio from retrying
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}
