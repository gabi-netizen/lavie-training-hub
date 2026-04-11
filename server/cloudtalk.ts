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
