/**
 * WhatsApp Message Status Callback Webhook Handler
 *
 * Twilio sends POST requests here when a message status changes.
 * Route: POST /api/whatsapp/status
 *
 * Twilio sends application/x-www-form-urlencoded body with fields:
 *   - MessageSid: Twilio message SID
 *   - MessageStatus: "sent" | "delivered" | "read" | "failed" | "undelivered" | "queued" | "sending"
 *   - To: recipient number (whatsapp:+...)
 *   - From: sender number (whatsapp:+...)
 *   - AccountSid: Twilio account SID
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { whatsappMessages, campaignSends, campaigns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// ─── Status ordering (higher = more advanced in delivery lifecycle) ───────────
const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,    // Failed is special — always allow setting it
  undelivered: -1,
};

function isStatusUpgrade(current: string, incoming: string): boolean {
  // Always allow setting failed/undelivered
  if (incoming === "failed" || incoming === "undelivered") return true;
  const currentOrder = STATUS_ORDER[current] ?? 0;
  const incomingOrder = STATUS_ORDER[incoming] ?? 0;
  return incomingOrder > currentOrder;
}

// ─── Map Twilio status to our DB enum ────────────────────────────────────────
function mapStatus(twilioStatus: string): "sent" | "delivered" | "read" | "failed" | "received" | null {
  switch (twilioStatus) {
    case "sent":
    case "queued":
    case "sending":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return null; // Unknown status — ignore
  }
}

// ─── Map Twilio status to campaign_sends enum ────────────────────────────────
function mapCampaignSendStatus(twilioStatus: string): "sent" | "delivered" | "read" | "failed" | null {
  switch (twilioStatus) {
    case "sent":
    case "queued":
    case "sending":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return null;
  }
}

// ─── Main Webhook Handler ────────────────────────────────────────────────────
export async function handleWhatsAppStatus(req: Request, res: Response) {
  try {
    const { MessageSid, MessageStatus, ErrorMessage } = req.body;

    console.log(`[WhatsApp Status] SID: ${MessageSid}, Status: ${MessageStatus}`);

    if (!MessageSid || !MessageStatus) {
      console.warn("[WhatsApp Status] Missing MessageSid or MessageStatus — ignoring");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    const newStatus = mapStatus(MessageStatus);
    if (!newStatus) {
      console.log(`[WhatsApp Status] Unrecognised status "${MessageStatus}" — ignoring`);
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    const db = await getDb();
    if (!db) {
      console.error("[WhatsApp Status] Database not available");
      res.type("text/xml").status(200).send("<Response></Response>");
      return;
    }

    // ─── Update whatsapp_messages table (existing behaviour) ─────────────────
    const [existing] = await db
      .select({ id: whatsappMessages.id, status: whatsappMessages.status })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.twilioMessageSid, MessageSid))
      .limit(1);

    if (existing) {
      // Only update if this is a status upgrade (don't downgrade delivered → sent)
      if (isStatusUpgrade(existing.status, newStatus)) {
        await db
          .update(whatsappMessages)
          .set({ status: newStatus })
          .where(eq(whatsappMessages.id, existing.id));

        console.log(`[WhatsApp Status] ✓ Updated message #${existing.id} (SID: ${MessageSid}): ${existing.status} → ${newStatus}`);
      } else {
        console.log(`[WhatsApp Status] Skipping downgrade: ${existing.status} → ${newStatus} for SID ${MessageSid}`);
      }
    } else {
      console.log(`[WhatsApp Status] No whatsapp_messages row for SID ${MessageSid}`);
    }

    // ─── Update campaign_sends table (new campaign tracking) ─────────────────
    const [campaignSend] = await db
      .select({
        id: campaignSends.id,
        status: campaignSends.status,
        campaignId: campaignSends.campaignId,
      })
      .from(campaignSends)
      .where(eq(campaignSends.twilioMessageSid, MessageSid))
      .limit(1);

    if (campaignSend) {
      const campaignNewStatus = mapCampaignSendStatus(MessageStatus);
      if (!campaignNewStatus) {
        res.type("text/xml").status(200).send("<Response></Response>");
        return;
      }

      // Only upgrade status (pending → sent → delivered → read; failed always allowed)
      if (!isStatusUpgrade(campaignSend.status, campaignNewStatus)) {
        console.log(`[WhatsApp Status] Campaign send #${campaignSend.id}: skipping downgrade ${campaignSend.status} → ${campaignNewStatus}`);
        res.type("text/xml").status(200).send("<Response></Response>");
        return;
      }

      // Build the update payload with appropriate timestamp
      const updatePayload: Record<string, any> = { status: campaignNewStatus };

      if (campaignNewStatus === "delivered") {
        updatePayload.deliveredAt = new Date();
      } else if (campaignNewStatus === "read") {
        updatePayload.readAt = new Date();
      } else if (campaignNewStatus === "failed") {
        updatePayload.errorMessage = ErrorMessage || "Message delivery failed";
      }

      await db
        .update(campaignSends)
        .set(updatePayload)
        .where(eq(campaignSends.id, campaignSend.id));

      // Increment the corresponding counter on the parent campaign
      if (campaignNewStatus === "delivered") {
        await db
          .update(campaigns)
          .set({ deliveredCount: sql`${campaigns.deliveredCount} + 1` })
          .where(eq(campaigns.id, campaignSend.campaignId));
      } else if (campaignNewStatus === "read") {
        await db
          .update(campaigns)
          .set({ readCount: sql`${campaigns.readCount} + 1` })
          .where(eq(campaigns.id, campaignSend.campaignId));
      }

      console.log(`[WhatsApp Status] ✓ Campaign send #${campaignSend.id} (campaign #${campaignSend.campaignId}): ${campaignSend.status} → ${campaignNewStatus}`);
    }

    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[WhatsApp Status] Error processing status callback:", err);
    res.type("text/xml").status(200).send("<Response></Response>");
  }
}
