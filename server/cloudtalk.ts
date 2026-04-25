/**
 * CloudTalk API helper
 * Docs: https://developers.cloudtalk.io/
 *
 * Authentication: HTTP Basic Auth with API Key ID + Secret
 *
 * Real API response shape (calls/index.json):
 * {
 *   responseData: {
 *     itemsCount, pageCount, pageNumber, limit,
 *     data: [
 *       {
 *         Cdr: { id, billsec, type, public_external, public_internal, recorded,
 *                talking_time, started_at, answered_at, ended_at, waiting_time,
 *                wrapup_time, recording_link, ... },
 *         Agent: { id, firstname, lastname, email, fullname, ... },
 *         Contact: { id, name, contact_numbers: [...], contact_emails: [...], ... },
 *         ...
 *       }
 *     ]
 *   }
 * }
 *
 * NOTE: There is NO "Call" key — the call data is under "Cdr".
 * NOTE: There is NO "call_times" nested object — talking_time is a top-level field on Cdr.
 * NOTE: The status filter (status=answered) does NOT work server-side; filter client-side.
 * NOTE: Contact phone is in Contact.contact_numbers[] array, not Contact.number.
 * NOTE: Recording URL is in Cdr.recording_link, not a separate API call.
 */

const BASE_URL = "https://my.cloudtalk.io/api";

function getAuthHeader(): string {
  const keyId = process.env.CLOUDTALK_API_KEY_ID;
  const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("CloudTalk API credentials not configured");
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export interface CloudTalkAgent {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  extension: string;
  default_number: string;
  associated_numbers: string[];
  availability_status: "online" | "offline" | "busy" | string;
}

/**
 * Fetch all agents from CloudTalk
 */
export async function getCloudTalkAgents(): Promise<CloudTalkAgent[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${BASE_URL}/agents/index.json`, {
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const json = await res.json() as any;
    const data = json?.responseData?.data ?? [];
    return data.map((item: any) => item.Agent as CloudTalkAgent);
  } catch (err: any) {
    console.error("CloudTalk getAgents error:", err?.message ?? err);
    return [];
  }
}

export interface CloudTalkCall {
  cdr_id: number;
  uuid: string;
  date: string;
  direction: "incoming" | "outgoing" | "internal";
  status: "answered" | "missed";
  type: string;
  recorded: boolean;
  /** Recording URL — populated directly from Cdr.recording_link */
  recording_link: string | null;
  contact: {
    id: number;
    name: string;
    /** Primary phone number (first entry of contact_numbers[]) */
    number: string;
  } | null;
  internal_number: {
    id: number;
    name: string;
    number: string;
  } | null;
  call_times: {
    talking_time: number;
    ringing_time: number;
    total_time: number;
    waiting_time: number;
    holding_time: number;
    wrap_up_time: number;
  };
  notes: string[];
  call_rating: number | null;
  agent?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CallHistoryResult {
  calls: CloudTalkCall[];
  totalCount: number;
  pageCount: number;
}

/**
 * Fetch call history from CloudTalk
 * Optionally filter by contact phone number or date range
 *
 * IMPORTANT: The CloudTalk API does NOT reliably filter by status server-side.
 * Pass `status` here and it will be applied as a client-side filter after fetching.
 */
export async function getCallHistory(params?: {
  phone?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  page?: number;
  status?: "answered" | "missed";
}): Promise<CallHistoryResult> {
  const query = new URLSearchParams();
  if (params?.phone) query.set("public_external", params.phone);
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.page) query.set("page", String(params.page));
  // NOTE: status filter is intentionally omitted from the API query because
  // the CloudTalk API ignores it — we filter client-side below instead.

  const url = `${BASE_URL}/calls/index.json?${query.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("CloudTalk call history fetch error (timeout or network):", err?.message ?? err);
    return { calls: [], totalCount: 0, pageCount: 0 };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    console.error("CloudTalk call history error:", res.status, await res.text());
    return { calls: [], totalCount: 0, pageCount: 0 };
  }

  const json = await res.json() as any;
  const rd = json?.responseData ?? {};
  const rawCalls: any[] = rd?.data ?? [];

  const calls: CloudTalkCall[] = rawCalls.map((item: any) => {
    // FIX: The real API response uses "Cdr" as the key, NOT "Call".
    // Old code: `const c = item.Call ?? item` — item.Call is always undefined,
    // so c fell back to the whole wrapper object, breaking all field reads.
    const c = item.Cdr ?? item.Call ?? item;
    const agent = item.Agent ?? null;
    const contact = item.Contact ?? null;

    // FIX: talking_time is a top-level field on Cdr (as a string), NOT nested
    // under call_times. Build the call_times object from the flat Cdr fields.
    const talkingTime = parseInt(c.talking_time ?? "0", 10);
    const waitingTime = parseInt(c.waiting_time ?? "0", 10);
    const wrapUpTime = parseInt(c.wrapup_time ?? c.wrap_up_time ?? "0", 10);
    const billsec = parseInt(c.billsec ?? "0", 10);

    // FIX: Contact phone is in contact_numbers[] array, not .number
    const contactPhone: string | null =
      contact?.contact_numbers?.[0] ??
      contact?.number ??  // keep fallback for any future API changes
      null;

    // Determine call status from Cdr fields:
    // answered_at being set (and non-empty) means the call was answered.
    // The API doesn't return a "status" field directly in Cdr.
    const isAnswered = !!(c.answered_at && c.answered_at !== "" && talkingTime > 0);
    const callStatus: "answered" | "missed" = isAnswered ? "answered" : "missed";

    return {
      cdr_id: parseInt(c.id ?? c.cdr_id ?? "0", 10),
      uuid: c.uuid ?? "",
      date: c.started_at ?? c.date ?? c.start_date ?? "",
      direction: c.type ?? c.direction ?? "incoming",
      status: callStatus,
      type: c.type ?? "regular",
      // FIX: recorded is a boolean on Cdr directly
      recorded: c.recorded === true || c.recorded === "1",
      // FIX: recording_link is available directly on Cdr — use it instead of
      // making a separate /api/calls/recording/{id}.json request
      recording_link: c.recording_link ?? null,
      contact: contact
        ? {
            id: parseInt(contact.id ?? "0", 10),
            name: contact.name ?? "",
            number: contactPhone ?? "",
          }
        : null,
      internal_number: c.internal_number ?? null,
      call_times: {
        talking_time: talkingTime,
        ringing_time: waitingTime, // waiting_time is the ring time before answer
        total_time: billsec > 0 ? billsec : talkingTime,
        waiting_time: waitingTime,
        holding_time: 0,
        wrap_up_time: wrapUpTime,
      },
      notes: c.notes ?? [],
      call_rating: c.call_rating ?? null,
      agent: agent
        ? {
            id: String(agent.id),
            name: agent.fullname ?? `${agent.firstname ?? ""} ${agent.lastname ?? ""}`.trim(),
            email: agent.email ?? "",
          }
        : undefined,
    };
  });

  // FIX: Apply status filter client-side since the API ignores it server-side
  const filteredCalls = params?.status
    ? calls.filter((c) => c.status === params.status)
    : calls;

  return {
    calls: filteredCalls,
    totalCount: rd.itemsCount ?? calls.length,
    pageCount: rd.pageCount ?? 1,
  };
}

/**
 * Get recording as a proxied buffer (via our server to avoid CORS + auth issues)
 */
export async function fetchRecording(callId: number): Promise<Buffer | null> {
  try {
    const res = await fetch(`${BASE_URL}/calls/recording/${callId}.json`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("audio") && !contentType.includes("wav")) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Initiate a click-to-call:
 * 1. CloudTalk calls the agent first
 * 2. Once agent picks up, CloudTalk calls the customer
 *
 * Returns { success: true } or throws with error message
 */
export async function clickToCall(agentId: string, calleeNumber: string): Promise<{ success: boolean; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/calls/create.json`, {
      method: "POST",
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: parseInt(agentId, 10), callee_number: calleeNumber }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw new Error(err?.name === "AbortError" ? "CloudTalk request timed out" : (err?.message ?? "Network error"));
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await res.json() as any;
  const status = json?.responseData?.status ?? res.status;

  if (res.status === 200 || status === 200) {
    return { success: true };
  }

  // Map CloudTalk error codes to human-readable messages
  const errorMap: Record<number, string> = {
    403: "Agent is not online — please log in to CloudTalk first",
    404: "Agent not found — check your CloudTalk Agent ID in profile settings",
    406: "Invalid phone number format",
    409: "Agent is already on a call",
    500: "CloudTalk server error — please try again",
  };

  const msg = errorMap[res.status] ?? json?.responseData?.message ?? `CloudTalk error (${res.status})`;
  return { success: false, message: msg };
}

// ─── Contact Sync ─────────────────────────────────────────────────────────────

export interface CloudTalkContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

/**
 * Search CloudTalk for an existing contact by phone number.
 * Returns the CloudTalk contact ID if found, null otherwise.
 */
async function findCloudTalkContactByPhone(phone: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(phone);
    const res = await fetch(`${BASE_URL}/contacts/index.json?keyword=${encoded}&limit=5`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const items: any[] = data?.responseData?.data ?? [];
    const normalise = (n: string) => n.replace(/[\s\-().]/g, "");
    const normPhone = normalise(phone);
    for (const item of items) {
      const ctPhone: string = item?.ContactNumber?.public_number ?? "";
      if (normalise(ctPhone) === normPhone) {
        return item?.Contact?.id ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a new contact in CloudTalk.
 */
/**
 * Normalise to E.164 format with leading + — CloudTalk requires +<digits> format.
 * e.g. "+923406165099" stays as-is; "923406165099" becomes "+923406165099".
 */
function toCloudTalkPhone(phone: string): string {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^0-9+]/g, "");
  // Ensure it starts with +
  return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
}

async function createCloudTalkContact(input: CloudTalkContactInput): Promise<string | null> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.address) body.address = input.address;
  if (input.phone) body.ContactNumber = [{ public_number: toCloudTalkPhone(input.phone) }];
  if (input.email) body.ContactEmail = [{ email: input.email }];

  const res = await fetch(`${BASE_URL}/contacts/add.json`, {
    method: "PUT",
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[CloudTalk] createContact failed:", res.status, text.slice(0, 200));
    return null;
  }
  const data = await res.json() as any;
  return data?.responseData?.data?.id ?? null;
}

/**
 * Update an existing CloudTalk contact.
 */
async function updateCloudTalkContact(cloudtalkId: string, input: CloudTalkContactInput): Promise<void> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.address) body.address = input.address;
  if (input.phone) body.ContactNumber = [{ public_number: toCloudTalkPhone(input.phone) }];
  if (input.email) body.ContactEmail = [{ email: input.email }];

  const res = await fetch(`${BASE_URL}/contacts/edit/${cloudtalkId}.json`, {
    method: "POST",
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[CloudTalk] updateContact failed:", res.status, text.slice(0, 200));
  }
}

/**
 * Upsert a contact in CloudTalk.
 * - If a known cloudtalkId is passed → update directly (no search needed).
 * - If a phone is provided → search for existing contact by phone.
 * - Otherwise → create a new contact.
 *
 * Returns the CloudTalk contact ID on success, null on failure.
 * Fire-and-forget safe: errors are logged but never thrown.
 */
export async function syncContactToCloudTalk(
  input: CloudTalkContactInput,
  knownCloudtalkId?: string | null
): Promise<string | null> {
  try {
    if (knownCloudtalkId) {
      await updateCloudTalkContact(knownCloudtalkId, input);
      return knownCloudtalkId;
    }
    if (!input.phone) {
      const newId = await createCloudTalkContact(input);
      return newId;
    }
    const existingId = await findCloudTalkContactByPhone(input.phone);
    if (existingId) {
      await updateCloudTalkContact(existingId, input);
      return existingId;
    } else {
      const newId = await createCloudTalkContact(input);
      return newId;
    }
  } catch (err) {
    console.error("[CloudTalk] syncContact error:", err);
    return null;
  }
}
