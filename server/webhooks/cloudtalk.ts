/**
 * CloudTalk Webhook Handler
 *
 * CloudTalk sends a POST request to this endpoint when a call ends.
 * We:
 *  1. Validate the payload
 *  2. Check if the call has a recording URL
 *  3. Deduplicate (skip if already processed)
 *  4. Find the matching agent (user) by CloudTalk agent ID
 *  5. Find the matching contact by phone number
 *  6. Download the recording and upload to S3
 *  7. Create a callAnalysis record (source=webhook)
 *  8. Kick off the async analysis pipeline (Deepgram → GPT-4)
 *  9. Auto-add a call note to the contact timeline when analysis completes
 *
 * CloudTalk webhook payload (call_ended event):
 * https://developers.cloudtalk.io/reference/webhooks
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { users, contacts, contactCallNotes, callAnalyses } from "../../drizzle/schema";
import { eq, or, like } from "drizzle-orm";
import { storagePut } from "../storage";
import {
  createCallAnalysisRecord,
  processCallAnalysis,
  updateCallAnalysisStatus,
} from "../callAnalysis";

// ─── Normalize phone for matching ─────────────────────────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().+]/g, "");
}

// ─── Find user by CloudTalk agent ID ─────────────────────────────────────────
async function findUserByCloudtalkAgentId(agentId: string | number) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);
  const results = await db
    .select()
    .from(users)
    .where(eq(users.cloudtalkAgentId, agentIdStr))
    .limit(1);
  return results[0] ?? null;
}

// ─── Find contact by phone number ─────────────────────────────────────────────
async function findContactByPhone(phone: string) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone(phone);
  // Try exact match first, then partial match
  const results = await db
    .select()
    .from(contacts)
    .where(
      or(
        like(contacts.phone, `%${normalized}%`),
        like(contacts.phone, `%${phone}%`)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

// ─── Check if call already processed (deduplication) ─────────────────────────
async function isCallAlreadyProcessed(cloudtalkCallId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const results = await db
    .select({ id: callAnalyses.id })
    .from(callAnalyses)
    .where(eq(callAnalyses.cloudtalkCallId, cloudtalkCallId))
    .limit(1);
  return results.length > 0;
}

// ─── Download recording and upload to S3 ─────────────────────────────────────
async function downloadAndStoreRecording(
  recordingUrl: string,
  callId: string
): Promise<{ fileKey: string; fileUrl: string }> {
  const response = await fetch(recordingUrl);
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const fileKey = `call-recordings/webhook-${callId}-${Date.now()}.${ext}`;
  const { url } = await storagePut(fileKey, buffer, contentType);
  return { fileKey, fileUrl: url };
}

// ─── Add auto-generated call note to contact timeline ─────────────────────────
async function addAutoCallNote(
  contactId: number,
  userId: number,
  agentName: string,
  analysisId: number,
  summary: string,
  score: number
) {
  const db = await getDb();
  if (!db) return;
  const note = `🤖 AI Coach Analysis (auto)\nScore: ${score}/100\n\n${summary}\n\n[View full analysis: /call-coach/${analysisId}]`;
  await db.insert(contactCallNotes).values({
    contactId,
    userId,
    agentName,
    note,
    statusAtTime: "working",
  });
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
export async function handleCloudTalkWebhook(req: Request, res: Response) {
  try {
    const payload = req.body;

    // Log the raw payload for debugging
    console.log("[CloudTalk Webhook] Received payload:", JSON.stringify(payload, null, 2).substring(0, 1000));

    // CloudTalk sends different event types — we only care about call_ended
    // The event type can be in different fields depending on CloudTalk version
    const eventType =
      payload?.event ||
      payload?.type ||
      payload?.event_type ||
      payload?.Event?.type ||
      "unknown";

    // Accept call_ended or call_finished events (CloudTalk uses different names)
    const isCallEnded =
      eventType === "call_ended" ||
      eventType === "call_finished" ||
      eventType === "CALL_ENDED" ||
      eventType === "CALL_FINISHED" ||
      // Some versions send the event in a nested structure
      payload?.Call?.status === "ANSWERED" ||
      payload?.call?.status === "ANSWERED";

    if (!isCallEnded) {
      console.log(`[CloudTalk Webhook] Ignoring event type: ${eventType}`);
      res.status(200).json({ received: true, processed: false, reason: "Not a call_ended event" });
      return;
    }

    // Extract call data — CloudTalk payload structure varies by version
    const call = payload?.Call ?? payload?.call ?? payload;
    const callId =
      call?.uuid ||
      call?.id ||
      call?.call_id ||
      payload?.uuid ||
      payload?.id;

    const recordingUrl =
      call?.recording_url ||
      call?.recordingUrl ||
      call?.recording ||
      payload?.recording_url;

    const agentId =
      call?.agent_id ||
      call?.agentId ||
      call?.Agent?.id ||
      payload?.agent_id;

    const callerPhone =
      call?.caller_number ||
      call?.callerNumber ||
      call?.from ||
      call?.customer_number ||
      call?.customerNumber ||
      payload?.caller_number;

    const callDuration =
      call?.duration ||
      call?.call_duration ||
      payload?.duration;

    const callStarted =
      call?.started_at ||
      call?.startedAt ||
      call?.created_at ||
      payload?.started_at;

    console.log(`[CloudTalk Webhook] Call ID: ${callId}, Agent: ${agentId}, Phone: ${callerPhone}, Recording: ${recordingUrl ? "YES" : "NO"}`);

    // Skip if no recording
    if (!recordingUrl) {
      console.log("[CloudTalk Webhook] No recording URL — skipping analysis");
      res.status(200).json({ received: true, processed: false, reason: "No recording URL" });
      return;
    }

    // Skip if no call ID (can't deduplicate)
    if (!callId) {
      console.log("[CloudTalk Webhook] No call ID — skipping");
      res.status(200).json({ received: true, processed: false, reason: "No call ID" });
      return;
    }

    // Deduplicate: skip if already processed
    if (await isCallAlreadyProcessed(String(callId))) {
      console.log(`[CloudTalk Webhook] Call ${callId} already processed — skipping`);
      res.status(200).json({ received: true, processed: false, reason: "Already processed" });
      return;
    }

    // Find the agent (user) — fallback to a system/admin user if not found
    let agent = agentId ? await findUserByCloudtalkAgentId(agentId) : null;
    if (!agent) {
      // Fallback: use the first admin user
      const db = await getDb();
      if (db) {
        const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
        agent = admins[0] ?? null;
      }
    }

    if (!agent) {
      console.error("[CloudTalk Webhook] No agent found and no admin fallback — cannot process");
      res.status(200).json({ received: true, processed: false, reason: "No agent found" });
      return;
    }

    // Find matching contact by phone
    const contact = callerPhone ? await findContactByPhone(callerPhone) : null;

    // Download recording and upload to S3
    console.log(`[CloudTalk Webhook] Downloading recording from ${recordingUrl}`);
    const { fileKey, fileUrl } = await downloadAndStoreRecording(recordingUrl, String(callId));

    // Create analysis record
    const analysisId = await createCallAnalysisRecord({
      userId: agent.id,
      repName: agent.name ?? null,
      audioFileKey: fileKey,
      audioFileUrl: fileUrl,
      fileName: `cloudtalk-${callId}.mp3`,
      callDate: callStarted ? new Date(callStarted) : new Date(),
      source: "webhook",
      cloudtalkCallId: String(callId),
      contactId: contact?.id ?? null,
    });

    console.log(`[CloudTalk Webhook] Created analysis record #${analysisId} for call ${callId}`);

    // Respond immediately — don't wait for analysis to complete
    res.status(200).json({ received: true, processed: true, analysisId });

    // Run analysis pipeline asynchronously
    processCallAnalysis(analysisId, fileUrl)
      .then(async () => {
        console.log(`[CloudTalk Webhook] Analysis #${analysisId} complete`);
        // If we have a contact, add an auto call note
        if (contact) {
          try {
            // Fetch the completed analysis to get summary and score
            const db = await getDb();
            if (!db) return;
            const rows = await db
              .select()
              .from(callAnalyses)
              .where(eq(callAnalyses.id, analysisId))
              .limit(1);
            const analysis = rows[0];
            if (analysis?.status === "done" && analysis.analysisJson) {
              const report = JSON.parse(analysis.analysisJson);
              await addAutoCallNote(
                contact.id,
                agent!.id,
                agent!.name ?? "AI Coach",
                analysisId,
                report.summary ?? "Call analyzed",
                analysis.overallScore ?? 0
              );
              console.log(`[CloudTalk Webhook] Added auto note to contact #${contact.id}`);
            }
          } catch (noteErr) {
            console.error("[CloudTalk Webhook] Failed to add auto note:", noteErr);
          }
        }
      })
      .catch(err => {
        console.error(`[CloudTalk Webhook] Analysis #${analysisId} failed:`, err);
      });

  } catch (err) {
    console.error("[CloudTalk Webhook] Unhandled error:", err);
    // Always return 200 to CloudTalk so it doesn't retry
    res.status(200).json({ received: true, processed: false, error: "Internal error" });
  }
}
