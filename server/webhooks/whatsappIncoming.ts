/**
 * WhatsApp Incoming Message Webhook Handler
 * 
 * Twilio sends POST requests here when a WhatsApp message is received.
 * Route: POST /api/whatsapp/incoming
 * 
 * Twilio sends form-encoded body with fields:
 *   - Body: message text
 *   - From: "whatsapp:+972524222822"
 *   - To: "whatsapp:+447888868298"
 *   - MessageSid: Twilio message ID
 *   - NumMedia: number of media attachments
 *   - etc.
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
 */
function validateTwilioSignature(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) return false;

  // Build the data string: URL + sorted params concatenated as key+value
  let data = url;
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + params[key];
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
    const {
      Body: body,
      From: from,
      To: to,
      MessageSid: messageSid,
    } = req.body;

    console.log(`[WhatsApp Incoming] Message received — SID: ${messageSid}, From: ${from}, Body: "${(body || "").substring(0, 50)}..."`);

    // ─── Validate Twilio Signature (best-effort) ─────────────────────────────
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const twilioSignature = req.headers["x-twilio-signature"] as string | undefined;

    if (authToken && twilioSignature) {
      // Reconstruct the full URL that Twilio used to compute the signature
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["host"] || "";
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      const isValid = validateTwilioSignature(authToken, twilioSignature, fullUrl, req.body);
      if (!isValid) {
        console.warn("[WhatsApp Incoming] Invalid Twilio signature — rejecting request");
        res.status(403).send("<Response></Response>");
        return;
      }
    } else {
      console.warn("[WhatsApp Incoming] No signature validation (missing auth token or signature header)");
    }

    // ─── Extract and normalise the phone number ──────────────────────────────
    const fromNumber = stripWhatsAppPrefix(from || "");
    const toNumber = stripWhatsAppPrefix(to || "");

    if (!fromNumber) {
      console.error("[WhatsApp Incoming] No From number in request");
      // Return 200 with empty TwiML so Twilio doesn't retry
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

    // Normalise the incoming number for comparison
    const normalised = normalisePhone(fromNumber);

    // Fetch all contacts and find a match by phone
    const allContacts = await db.select().from(contacts);
    const matchedContact = allContacts.find((c) => {
      if (!c.phone) return false;
      const contactNormalised = normalisePhone(c.phone);
      if (!contactNormalised || !normalised) return false;
      // Compare normalised versions (both should be E.164)
      return contactNormalised === normalised;
    });

    if (matchedContact) {
      matchedContactId = matchedContact.id;
      // Use the assigned agent from the contact record
      ownerUserId = matchedContact.assignedUserId;

      // If no assignedUserId on the contact, look at the last outbound message
      // to determine which agent "owns" this conversation
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
      console.log(`[WhatsApp Incoming] No contact match for ${fromNumber}`);
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

    console.log(`[WhatsApp Incoming] Message saved to DB — contact: ${matchedContactId ?? "unmatched"}`);

    // ─── Return empty TwiML response ─────────────────────────────────────────
    // Twilio expects a TwiML response to acknowledge receipt
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[WhatsApp Incoming] Error processing webhook:", err);
    // Always return 200 to prevent Twilio from retrying
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}
