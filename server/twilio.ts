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

// ─── Fetch template body text from Twilio Content API ───────────────────────
/**
 * Fetches the body text of a specific template by Content SID.
 * Substitutes {{1}} and {{2}} with the provided variables.
 * Falls back to the friendly_name if body cannot be resolved.
 */
export async function fetchTemplateBody(
  contentSid: string,
  variables?: Record<string, string>
): Promise<string> {
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}`, {
      method: "GET",
      headers: {
        Authorization: getTwilioAuthHeader(),
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[Twilio] Could not fetch template body for ${contentSid}: ${res.status}`);
      return `[Template: ${contentSid}]`;
    }

    const data = await res.json();
    const types = data.types || {};

    // Try common template type keys in order of preference
    const body: string =
      types["twilio/text"]?.body ||
      types["twilio/quick-reply"]?.body ||
      types["twilio/call-to-action"]?.body ||
      types["twilio/card"]?.body ||
      data.friendly_name ||
      `[Template: ${contentSid}]`;

    // Substitute {{1}}, {{2}}, etc. with provided variables
    if (variables) {
      return body.replace(/\{\{(\d+)\}\}/g, (_match: string, key: string) => variables[key] ?? _match);
    }
    return body;
  } catch (err) {
    console.warn(`[Twilio] Error fetching template body for ${contentSid}:`, err);
    return `[Template: ${contentSid}]`;
  }
}

// ─── Send WhatsApp message via Twilio Messages API ───────────────────────────
export async function sendWhatsAppMessage(opts: {
  to: string; // E.164 phone number (e.g. +447xxxxxxxxx)
  contentSid: string; // Template SID from Content API
  contentVariables?: Record<string, string>; // Template variables (e.g. {"1": "John", "2": "Rob"})
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

  if (opts.contentVariables) {
    body.append("ContentVariables", JSON.stringify(opts.contentVariables));
  }

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

// ─── Send free-text WhatsApp message (within 24h conversation window) ───────
export async function sendWhatsAppFreeText(opts: {
  to: string; // E.164 phone number (e.g. +447xxxxxxxxx)
  body: string; // Free-text message body
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
    Body: opts.body,
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
    console.error(`[Twilio] Free-text Messages API error: ${res.status} ${errText}`);
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
