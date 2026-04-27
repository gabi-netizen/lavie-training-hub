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
function normalizePhone(phone: string | number): string {
  return String(phone).replace(/[\s\-().+]/g, "");
}

// ─── Stripe customer name lookup ─────────────────────────────────────────────
/**
 * Look up a customer's name in Stripe by phone number.
 * Tries multiple phone formats (E.164, local UK) to maximise match rate.
 * Returns the customer's full name, or null if not found.
 */
async function lookupStripeCustomerName(phone: string | number): Promise<string | null> {
  const stripeKey = process.env.STRIPE_API_KEY;
  if (!stripeKey) return null;
  const raw = String(phone).trim();
  // Build candidate phone formats to try
  const candidates: string[] = [raw];
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) candidates.push(`+44${digits.slice(1)}`, `0${digits.slice(1)}`);
  if (digits.length === 11 && digits.startsWith("0")) candidates.push(`+44${digits.slice(1)}`);
  if (digits.length === 12 && digits.startsWith("44")) candidates.push(`+${digits}`, `0${digits.slice(2)}`);
  for (const candidate of candidates) {
    try {
      const query = encodeURIComponent(`phone:"${candidate}"`);
      const res = await fetch(`https://api.stripe.com/v1/customers/search?query=${query}&limit=1`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const json = await res.json() as any;
      if (json?.data?.length > 0) {
        const customer = json.data[0];
        const name = customer.name ?? customer.description ?? null;
        if (name) {
          console.log(`[Stripe] Found customer "${name}" for phone ${candidate}`);
          return name;
        }
      }
    } catch (err) {
      console.warn(`[Stripe] Lookup failed for ${candidate}:`, err);
    }
  }
  return null;
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

// ─── Find user by email ───────────────────────────────────────────────────────
async function findUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return results[0] ?? null;
}

// ─── Auto-create user from CloudTalk agent data ───────────────────────────────
async function findOrCreateAgentUser(agentId: string | number, agentName: string | null, agentEmail: string | null) {
  const db = await getDb();
  if (!db) return null;
  const agentIdStr = String(agentId);

  // 1. Try by cloudtalkAgentId
  let user = await findUserByCloudtalkAgentId(agentIdStr);
  if (user) return user;

  // 2. Try by email (agent may already have a Clerk account)
  if (agentEmail) {
    user = await findUserByEmail(agentEmail);
    if (user) {
      // Link the cloudtalkAgentId to the existing account
      await db.update(users)
        .set({ cloudtalkAgentId: agentIdStr })
        .where(eq(users.id, user.id));
      console.log(`[CloudTalk Webhook] Linked cloudtalkAgentId ${agentIdStr} to existing user #${user.id} (${user.name})`);
      return { ...user, cloudtalkAgentId: agentIdStr };
    }
  }

  // 3. Auto-create a new user account
  const name = agentName ?? `Agent ${agentIdStr}`;
  const openId = `cloudtalk-${agentIdStr}`; // placeholder until they log in via Clerk
  try {
    const [result] = await db.insert(users).values({
      openId,
      name,
      email: agentEmail ?? null,
      cloudtalkAgentId: agentIdStr,
      role: "user",
    });
    const newId = (result as any).insertId as number;
    const newUsers = await db.select().from(users).where(eq(users.id, newId)).limit(1);
    console.log(`[CloudTalk Webhook] Auto-created user #${newId} for CloudTalk agent ${agentIdStr} (${name})`);
    return newUsers[0] ?? null;
  } catch (err: any) {
    // Duplicate openId — fetch the existing one
    console.warn(`[CloudTalk Webhook] Auto-create failed (probably duplicate): ${err?.message}`);
    const existing = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return existing[0] ?? null;
  }
}

// ─── Find contact by phone number ─────────────────────────────────────────────
async function findContactByPhone(phone: string | number) {
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

    // Accept call_ended, call_finished, or recording_uploaded events (CloudTalk uses different names)
    const isCallEnded =
      eventType === "call_ended" ||
      eventType === "call_finished" ||
      eventType === "CALL_ENDED" ||
      eventType === "CALL_FINISHED" ||
      eventType === "recording_uploaded" ||
      eventType === "RECORDING_UPLOADED" ||
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
      payload?.call_uuid ||  // CloudTalk v2 top-level field
      call?.call_uuid ||     // CloudTalk v2 nested
      call?.uuid ||
      call?.id ||
      call?.call_id ||
      payload?.uuid ||
      payload?.id;

    const recordingUrl =
      payload?.recording_url ||  // CloudTalk v2 top-level
      call?.recording_url ||
      call?.recordingUrl ||
      call?.recording;

    // Extract agent ID — new format sends payload.agent_id (flat), old format used payload.agent.id (object)
    const agentId =
      payload?.agent_id ||       // NEW format: flat field
      payload?.agent?.id ||      // OLD format: nested agent object (fallback)
      payload?.agent?.user_id ||
      call?.agent_id ||
      call?.agentId ||
      call?.Agent?.id;

    // Extract agent name — handles all CloudTalk payload formats:
    //   payload.agent = "Ava Monroe"  (plain string — current format)
    //   payload.agent_name = "Ava Monroe"  (flat field)
    //   payload.agent = { name, full_name, firstname, lastname, ... }  (object)
    const rawAgent = payload?.agent;
    const cloudtalkAgentName: string | null =
      (typeof rawAgent === "string" && rawAgent.trim() ? rawAgent.trim() : null) ||  // plain string (current format)
      payload?.agent_name ||                                                          // flat field
      (typeof rawAgent === "object" && rawAgent !== null ? (
        (rawAgent as any).first_name || (rawAgent as any).lastname
          ? `${(rawAgent as any).first_name ?? (rawAgent as any).firstname ?? ""} ${(rawAgent as any).last_name ?? (rawAgent as any).lastname ?? ""}`.trim()
          : (rawAgent as any).name || (rawAgent as any).full_name || null
      ) : null) ||
      call?.Agent?.name ||
      call?.Agent?.full_name ||
      call?.agentName ||
      call?.agent_name ||
      null;

    console.log(`[CloudTalk Webhook] Agent info received — agent_id: ${payload?.agent_id ?? "(none)"}, agent_name: ${payload?.agent_name ?? "(none)"}, resolved agentId: ${agentId}, resolved agentName: ${cloudtalkAgentName}`);

    // Extract agent email from CloudTalk payload
    const cloudtalkAgentEmail: string | null =
      payload?.agent?.email ||
      call?.Agent?.email ||
      call?.agentEmail ||
      null;

    // Extract contact name from CloudTalk payload (new field)
    const contactName: string | null =
      payload?.contact_name ||
      null;

    const callerPhone =
      payload?.external_number ||  // CloudTalk v2 top-level
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
      payload?.started_at ||  // CloudTalk v2 top-level
      call?.started_at ||
      call?.startedAt ||
      call?.created_at;

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

    // Find or auto-create the agent user
    let agent = agentId
      ? await findOrCreateAgentUser(agentId, cloudtalkAgentName, cloudtalkAgentEmail)
      : null;

    if (!agent && cloudtalkAgentName) {
      // No agentId in payload, but we have a name — look up user by name (case-insensitive)
      const db = await getDb();
      if (db) {
        const nameMatches = await db.select().from(users)
          .where(like(users.name, cloudtalkAgentName.trim()))
          .limit(1);
        if (nameMatches.length > 0) {
          agent = nameMatches[0];
          console.log(`[CloudTalk Webhook] Matched agent by name "${cloudtalkAgentName}" to user #${agent.id}`);
        } else {
          // Auto-create a user record for this agent name so calls are grouped correctly
          const openId = `cloudtalk-name-${cloudtalkAgentName.toLowerCase().replace(/\s+/g, "-")}`;
          const [inserted] = await db.insert(users).values({
            name: cloudtalkAgentName.trim(),
            email: cloudtalkAgentEmail ?? null,
            openId,
            role: "user",
          });
          const newId = (inserted as any).insertId ?? (inserted as any).lastInsertRowid;
          const created = await db.select().from(users).where(eq(users.id, Number(newId))).limit(1);
          agent = created[0] ?? null;
          console.log(`[CloudTalk Webhook] Auto-created user #${newId} for agent name "${cloudtalkAgentName}"`);
        }
      }
    }

    if (!agent) {
      // Last resort: fallback to first admin (should rarely happen — no agentId AND no name in payload)
      const db = await getDb();
      if (db) {
        const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
        agent = admins[0] ?? null;
        console.warn(`[CloudTalk Webhook] No agent found by ID or name — falling back to admin user`);
      }
    }

    if (!agent) {
      console.error("[CloudTalk Webhook] No agent found and no admin fallback — cannot process");
      res.status(200).json({ received: true, processed: false, reason: "No agent found" });
      return;
    }

    // Find matching contact by phone
    const contact = callerPhone ? await findContactByPhone(String(callerPhone)) : null;
    // Stripe customer name lookup (for retention agents or any call with a phone number)
    let stripeCustomerName: string | null = null;
    if (callerPhone) {
      stripeCustomerName = await lookupStripeCustomerName(String(callerPhone));
      if (stripeCustomerName) {
        console.log(`[CloudTalk Webhook] Stripe customer name: "${stripeCustomerName}"`);
      }
    }
    // Download recording and upload to S3
    console.log(`[CloudTalk Webhook] Downloading recording from ${recordingUrl}`);
    const { fileKey, fileUrl } = await downloadAndStoreRecording(recordingUrl, String(callId));
    // Determine repName: prefer CloudTalk agent name from payload, fallback to user record name
    const repName = cloudtalkAgentName || agent.name || null;
    console.log(`[CloudTalk Webhook] Agent name resolved: "${repName}" (from payload: "${cloudtalkAgentName}", from user: "${agent.name}")`);
    // Determine initial callType based on agent team
    // Retention agents get 'other' as placeholder — AI will classify the exact type from transcript
    // Opening agents get 'cold_call' as default
    const isRetentionAgent = (agent as any).team === "retention";
    const initialCallType = isRetentionAgent ? "other" : "cold_call";
    // Create analysis record
    const analysisId = await createCallAnalysisRecord({
      userId: agent.id,
      repName,
      audioFileKey: fileKey,
      audioFileUrl: fileUrl,
      fileName: `cloudtalk-${callId}.mp3`,
      callDate: callStarted ? new Date(callStarted) : new Date(),
      source: "webhook",
      cloudtalkCallId: String(callId),
      contactId: contact?.id ?? null,
      callType: initialCallType,
      customerName: stripeCustomerName ?? undefined,
      contactName: contactName ?? undefined,
      externalNumber: callerPhone ? String(callerPhone) : undefined,
     } as any);
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
