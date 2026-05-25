/**
 * Twilio WhatsApp integration helpers.
 * Uses Twilio Content API for templates and Messages API for sending.
 * Auth: Account SID + Auth Token (Basic auth).
 */

// ─── Credentials from environment (read lazily at call time) ─────────────────
function getConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+447888868298",
  };
}

function getTwilioAuthHeader(): string {
  const { accountSid, authToken } = getConfig();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${credentials}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface TwilioTemplate {
  sid: string;
  friendly_name: string;
  language: string;
  date_created: string;
  date_updated: string;
  types?: Record<string, any>;
}

export interface TwilioSendResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  date_created: string;
}

// ─── List WhatsApp templates from Twilio Content API ─────────────────────────
export async function listWhatsAppTemplates(): Promise<TwilioTemplate[]> {
  const { accountSid, authToken } = getConfig();
  if (!accountSid || !authToken) {
    console.error("[Twilio] Missing credentials. ACCOUNT_SID:", accountSid ? "set" : "EMPTY", "AUTH_TOKEN:", authToken ? "set" : "EMPTY");
    return [];
  }

  console.log("[Twilio] Fetching templates from Content API...");

  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "GET",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[Twilio] Content API error: ${res.status} ${errText}`);
    throw new Error(`Twilio Content API error: ${res.status}`);
  }

  const data = await res.json();
  console.log(`[Twilio] Found ${(data.contents || []).length} templates`);
  // The Content API returns { contents: [...] }
  return (data.contents || []).map((item: any) => ({
    sid: item.sid,
    friendly_name: item.friendly_name,
    language: item.language,
    date_created: item.date_created,
    date_updated: item.date_updated,
    types: item.types,
  }));
}

// ─── Send WhatsApp message via Twilio Messages API ───────────────────────────
export async function sendWhatsAppMessage(opts: {
  to: string; // E.164 phone number (e.g. +447xxxxxxxxx)
  contentSid: string; // Template SID from Content API
}): Promise<TwilioSendResult> {
  const { accountSid, authToken, whatsappFrom } = getConfig();

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID not configured");
  }
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN not configured");
  }

  const toWhatsApp = opts.to.startsWith("whatsapp:")
    ? opts.to
    : `whatsapp:${opts.to}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: whatsappFrom,
    To: toWhatsApp,
    ContentSid: opts.contentSid,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[Twilio] Messages API error: ${res.status} ${errText}`);
    throw new Error(`Twilio Messages API error: ${res.status} — ${errText}`);
  }

  const data = await res.json();
  return {
    sid: data.sid,
    status: data.status,
    to: data.to,
    from: data.from,
    date_created: data.date_created,
  };
}
