/**
 * SMS Incoming Message Webhook Handler
 *
 * Twilio sends POST requests here when an SMS is received on +447700139589.
 * Route: POST /api/webhooks/sms-incoming
 *
 * Twilio sends application/x-www-form-urlencoded body with fields:
 *   - Body: message text
 *   - From: "+972524222822"
 *   - To: "+447700139589"
 *   - MessageSid: Twilio message ID
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { whatsappMessages, contacts, whatsappConversationAssignments } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { normalisePhone } from "../contacts";

export async function handleSMSIncoming(req: Request, res: Response) {
  try {
    const {
      Body: body,
      From: from,
      To: to,
      MessageSid: messageSid,
    } = req.body;

    console.log(`[SMS Incoming] SID: ${messageSid}, From: ${from}, To: ${to}, Body: "${(body || "").substring(0, 80)}"`);

    const fromNumber = from || "";
    const toNumber = to || "";

    if (!fromNumber) {
      console.error("[SMS Incoming] No From number in request body");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    const db = await getDb();
    if (!db) {
      console.error("[SMS Incoming] Database not available");
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

      console.log(`[SMS Incoming] Matched contact #${matchedContactId} (${matchedContact.name}), owner userId: ${ownerUserId}`);
    } else {
      console.log(`[SMS Incoming] No contact match for ${fromNumber} (normalised: ${normalised})`);
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
      channel: "sms",
    });

    console.log(`[SMS Incoming] ✓ Message saved — contact: ${matchedContactId ?? "unmatched"}, SID: ${messageSid}`);

    // ─── Auto-assign conversation to the owner agent ─────────────────────────
    if (matchedContactId && ownerUserId) {
      try {
        const [latestAssignment] = await db
          .select({ assignedUserId: whatsappConversationAssignments.assignedUserId })
          .from(whatsappConversationAssignments)
          .where(eq(whatsappConversationAssignments.contactId, matchedContactId))
          .orderBy(desc(whatsappConversationAssignments.createdAt))
          .limit(1);
        if (!latestAssignment || latestAssignment.assignedUserId !== ownerUserId) {
          await db.insert(whatsappConversationAssignments).values({
            contactId: matchedContactId,
            assignedUserId: ownerUserId,
            assignedByUserId: ownerUserId,
          });
          console.log(`[SMS Incoming] Auto-assigned conversation for contact #${matchedContactId} to user #${ownerUserId}`);
        }
      } catch (assignErr) {
        console.error("[SMS Incoming] Auto-assign failed:", assignErr);
      }
    }

    // ─── Return empty TwiML response ─────────────────────────────────────────
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[SMS Incoming] Error processing webhook:", err);
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}
