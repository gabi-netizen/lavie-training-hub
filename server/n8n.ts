/**
 * n8n Integration Helper
 * ─────────────────────────────────────────────────────────────────────────────
 * Fires fire-and-forget HTTP POST events to n8n Cloud webhook endpoints.
 * All calls are non-blocking: they never throw or delay the main request.
 *
 * Webhook URL is configured via the N8N_WEBHOOK_URL environment variable.
 * Example: https://gabilavie.app.n8n.cloud/webhook
 */

import { ENV } from "./_core/env";

/**
 * Send a payload to an n8n webhook path.
 * @param path  - The webhook path (e.g. "new-contact")
 * @param body  - JSON-serialisable payload
 */
async function fireN8nWebhook(path: string, body: Record<string, unknown>): Promise<void> {
  const baseUrl = ENV.n8nWebhookUrl;
  if (!baseUrl) {
    // n8n not configured — skip silently
    return;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/${path}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.warn(`[n8n] Webhook ${path} returned ${response.status}`);
    }
  } catch (err) {
    // Never crash the main request — just log
    console.warn(`[n8n] Failed to fire webhook "${path}":`, (err as Error).message);
  }
}

// ─── Event: New Contact Created ───────────────────────────────────────────────
export interface NewContactPayload {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  leadType?: string | null;
  status?: string;
  agentName?: string | null;
  agentEmail?: string | null;
  source?: string | null;
  createdAt: string; // ISO timestamp
}

export function notifyNewContact(payload: NewContactPayload): void {
  // Fire and forget — do not await
  fireN8nWebhook("new-contact", {
    event: "contact.created",
    ...payload,
  }).catch(() => {});
}
