/**
 * CloudTalk API helper
 * Docs: https://developers.cloudtalk.io/
 *
 * Authentication: HTTP Basic Auth with API Key ID + Secret
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
  const res = await fetch(`${BASE_URL}/agents/index.json`, {
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
  });
  const json = await res.json() as any;
  const data = json?.responseData?.data ?? [];
  return data.map((item: any) => item.Agent as CloudTalkAgent);
}

export interface CloudTalkCall {
  cdr_id: number;
  uuid: string;
  date: string;
  direction: "incoming" | "outgoing" | "internal";
  status: "answered" | "missed";
  type: string;
  recorded: boolean;
  contact: {
    id: number;
    name: string;
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
  if (params?.status) query.set("status", params.status);

  const url = `${BASE_URL}/calls/index.json?${query.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
  });

  if (!res.ok) {
    console.error("CloudTalk call history error:", res.status, await res.text());
    return { calls: [], totalCount: 0, pageCount: 0 };
  }

  const json = await res.json() as any;
  const rd = json?.responseData ?? {};
  const rawCalls: any[] = rd?.data ?? [];

  const calls: CloudTalkCall[] = rawCalls.map((item: any) => {
    const c = item.Call ?? item;
    const agent = item.Agent ?? null;
    return {
      cdr_id: parseInt(c.cdr_id ?? c.id ?? "0", 10),
      uuid: c.uuid ?? "",
      date: c.date ?? c.start_date ?? "",
      direction: c.direction ?? "outgoing",
      status: c.status ?? "missed",
      type: c.type ?? "regular",
      recorded: c.recorded ?? false,
      contact: c.contact ?? null,
      internal_number: c.internal_number ?? null,
      call_times: c.call_times ?? {
        talking_time: 0,
        ringing_time: 0,
        total_time: 0,
        waiting_time: 0,
        holding_time: 0,
        wrap_up_time: 0,
      },
      notes: c.notes ?? [],
      call_rating: c.call_rating ?? null,
      agent: agent ? { id: String(agent.id), name: `${agent.firstname ?? ""} ${agent.lastname ?? ""}`.trim(), email: agent.email ?? "" } : undefined,
    };
  });

  return {
    calls,
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
  const res = await fetch(`${BASE_URL}/calls/create.json`, {
    method: "POST",
    headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: parseInt(agentId, 10), callee_number: calleeNumber }),
  });

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
