import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Send notification via Postmark email (used on Railway when Manus forge is unavailable).
 */
async function notifyViaPostmark(title: string, content: string): Promise<boolean> {
  if (!ENV.postmarkApiKey) {
    console.warn("[Notification] Postmark API key not configured — skipping notification.");
    return false;
  }

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": ENV.postmarkApiKey,
      },
      body: JSON.stringify({
        From: "notifications@lavielabs.com",
        To: "notifications@lavielabs.com",
        Subject: `[Lavie Training Hub] ${title}`,
        TextBody: content,
        HtmlBody: `<h2>${title}</h2><pre style="font-family:sans-serif;white-space:pre-wrap">${content}</pre>`,
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Notification] Postmark failed (${response.status}): ${detail}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Postmark error:", error);
    return false;
  }
}

/**
 * Dispatches a project-owner notification.
 * On Manus hosting: uses the Manus Notification Service.
 * On Railway: falls back to Postmark email.
 * Returns `true` if the request was accepted, `false` on failure.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Use Manus notification service if available (Manus hosting)
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${ENV.forgeApiKey}`,
          "content-type": "application/json",
          "connect-protocol-version": "1",
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(
          `[Notification] Manus service failed (${response.status})${detail ? `: ${detail}` : ""} — falling back to Postmark`
        );
        return notifyViaPostmark(title, content);
      }

      return true;
    } catch (error) {
      console.warn("[Notification] Manus service error — falling back to Postmark:", error);
      return notifyViaPostmark(title, content);
    }
  }

  // Railway: use Postmark directly
  return notifyViaPostmark(title, content);
}
