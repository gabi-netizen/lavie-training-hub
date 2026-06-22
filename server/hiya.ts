/**
 * Hiya Connect API client helper.
 * Handles branded calling registration for UK phone numbers.
 *
 * Auth: Basic HTTP Auth using HIYA_API_ID:HIYA_API_SECRET (base64 encoded).
 * Base URL: https://api.hiya.com
 */

const HIYA_API_BASE = "https://api.hiya.com";

/** Default display name for all Lavie Labs numbers */
const DEFAULT_DISPLAY_NAME = "Lavie Labs";
/** Default call reason */
const DEFAULT_CALL_REASON = "Customer Service";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HiyaPhoneNumber {
  countryCode: string;
  nationalNumber: string;
}

export interface HiyaRegistration {
  phoneNumber: HiyaPhoneNumber;
  displayName: string;
  callReason?: string;
  registrationStatus?: string;
  spamStatus?: string;
}

export interface HiyaListResponse {
  content?: HiyaRegistration[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

export interface HiyaStatusResponse {
  phoneNumber?: HiyaPhoneNumber;
  displayName?: string;
  callReason?: string;
  registrationStatus?: string;
  spamStatus?: string;
  [key: string]: unknown;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function getHiyaHeaders(): HeadersInit {
  const apiId = process.env.HIYA_API_ID ?? "";
  const apiSecret = process.env.HIYA_API_SECRET ?? "";
  const credentials = Buffer.from(`${apiId}:${apiSecret}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse an E.164 phone number (e.g. "+447888868298") into countryCode and nationalNumber.
 * Assumes UK numbers (+44) by default. Supports other country codes too.
 */
export function parseE164(phoneNumber: string): HiyaPhoneNumber {
  // Remove spaces, dashes, parentheses
  const cleaned = phoneNumber.replace(/[\s\-()]/g, "");

  if (!cleaned.startsWith("+")) {
    // If no +, assume it's already a national number with implicit +44
    return { countryCode: "44", nationalNumber: cleaned.replace(/^0/, "") };
  }

  // UK: +44...
  if (cleaned.startsWith("+44")) {
    return { countryCode: "44", nationalNumber: cleaned.slice(3) };
  }

  // US/Canada: +1...
  if (cleaned.startsWith("+1")) {
    return { countryCode: "1", nationalNumber: cleaned.slice(2) };
  }

  // Generic: try to extract country code (1-3 digits after +)
  // For safety, assume first 2 digits are country code if not UK/US
  const withoutPlus = cleaned.slice(1);
  // Try 3-digit, 2-digit, 1-digit country codes
  for (const len of [3, 2, 1]) {
    const cc = withoutPlus.slice(0, len);
    const national = withoutPlus.slice(len);
    if (national.length >= 6) {
      return { countryCode: cc, nationalNumber: national };
    }
  }

  // Fallback: treat everything after + as national with country code "44"
  return { countryCode: "44", nationalNumber: withoutPlus };
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Register a phone number with Hiya for branded calling.
 * POST /v1/phone
 */
export async function addPhoneToHiya(
  countryCode: string,
  nationalNumber: string,
  displayName: string = DEFAULT_DISPLAY_NAME,
  callReason: string = DEFAULT_CALL_REASON
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${HIYA_API_BASE}/v1/phone`, {
      method: "POST",
      headers: getHiyaHeaders(),
      body: JSON.stringify({
        phoneNumber: { countryCode, nationalNumber },
        displayName,
        callReason,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Hiya] POST /v1/phone failed (${res.status}):`, errorText);
      return { success: false, error: `Hiya API error ${res.status}: ${errorText}` };
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[Hiya] Registered +${countryCode}${nationalNumber} successfully`);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Hiya] addPhoneToHiya error:", message);
    return { success: false, error: message };
  }
}

/**
 * Get the current Hiya status for a phone number.
 * GET /v1/phone/{ccc}/{national}
 * Returns null if 404 (not registered) — that's normal.
 */
export async function getPhoneFromHiya(
  countryCode: string,
  nationalNumber: string
): Promise<{ success: boolean; data?: HiyaStatusResponse | null; error?: string }> {
  try {
    const res = await fetch(
      `${HIYA_API_BASE}/v1/phone/${countryCode}/${nationalNumber}`,
      {
        method: "GET",
        headers: getHiyaHeaders(),
        signal: AbortSignal.timeout(15_000),
      }
    );

    // 404 means not registered — not an error
    if (res.status === 404) {
      return { success: true, data: null };
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Hiya] GET /v1/phone/${countryCode}/${nationalNumber} failed (${res.status}):`, errorText);
      return { success: false, error: `Hiya API error ${res.status}: ${errorText}` };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data: data as HiyaStatusResponse };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Hiya] getPhoneFromHiya error:", message);
    return { success: false, error: message };
  }
}

/**
 * List all phone numbers registered with Hiya.
 * GET /v1/phone
 */
export async function listPhonesFromHiya(
  page: number = 0,
  size: number = 100
): Promise<{ success: boolean; data?: HiyaListResponse; error?: string }> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
    });

    const res = await fetch(`${HIYA_API_BASE}/v1/phone?${params.toString()}`, {
      method: "GET",
      headers: getHiyaHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Hiya] GET /v1/phone failed (${res.status}):`, errorText);
      return { success: false, error: `Hiya API error ${res.status}: ${errorText}` };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data: data as HiyaListResponse };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Hiya] listPhonesFromHiya error:", message);
    return { success: false, error: message };
  }
}

/**
 * Update a branded phone number in Hiya.
 * PUT /v1/phone
 */
export async function updatePhoneInHiya(
  countryCode: string,
  nationalNumber: string,
  displayName: string = DEFAULT_DISPLAY_NAME,
  callReason: string = DEFAULT_CALL_REASON
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${HIYA_API_BASE}/v1/phone`, {
      method: "PUT",
      headers: getHiyaHeaders(),
      body: JSON.stringify({
        phoneNumber: { countryCode, nationalNumber },
        displayName,
        callReason,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Hiya] PUT /v1/phone failed (${res.status}):`, errorText);
      return { success: false, error: `Hiya API error ${res.status}: ${errorText}` };
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[Hiya] Updated +${countryCode}${nationalNumber} successfully`);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Hiya] updatePhoneInHiya error:", message);
    return { success: false, error: message };
  }
}

/**
 * Delete a phone number from Hiya.
 * DELETE /v1/phone/{ccc}/{national}
 */
export async function deletePhoneFromHiya(
  countryCode: string,
  nationalNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${HIYA_API_BASE}/v1/phone/${countryCode}/${nationalNumber}`,
      {
        method: "DELETE",
        headers: getHiyaHeaders(),
        signal: AbortSignal.timeout(15_000),
      }
    );

    // 404 means already not registered — treat as success
    if (res.status === 404) {
      console.log(`[Hiya] +${countryCode}${nationalNumber} was not registered (404) — nothing to delete`);
      return { success: true };
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Hiya] DELETE /v1/phone/${countryCode}/${nationalNumber} failed (${res.status}):`, errorText);
      return { success: false, error: `Hiya API error ${res.status}: ${errorText}` };
    }

    console.log(`[Hiya] Deleted +${countryCode}${nationalNumber} successfully`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Hiya] deletePhoneFromHiya error:", message);
    return { success: false, error: message };
  }
}
