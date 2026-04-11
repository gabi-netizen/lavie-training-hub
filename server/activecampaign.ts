/**
 * ActiveCampaign Integration Helper
 * Handles contact management and automation triggers for Lavie Labs CRM.
 *
 * Key operations:
 * - Create/update contacts in ActiveCampaign
 * - Add contacts to lists (Pre Cycle, Live Sub, Cancelled, Win-back etc.)
 * - Trigger automations based on lead type / status changes
 * - Tag contacts for segmentation
 */

import { ENV } from "./_core/env";

const AC_API_VERSION = "/api/3";

function getHeaders() {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Api-Token": ENV.activeCampaignApiKey,
  };
}

function apiUrl(path: string): string {
  return `${ENV.activeCampaignApiUrl}${AC_API_VERSION}${path}`;
}

async function acFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  if (!ENV.activeCampaignApiKey || !ENV.activeCampaignApiUrl) {
    console.warn("[ActiveCampaign] API credentials not configured");
    return null;
  }

  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[ActiveCampaign] ${options.method ?? "GET"} ${path} failed:`, error);
      return null;
    }

    return response.json() as Promise<T>;
  } catch (err) {
    console.error("[ActiveCampaign] Request failed:", err);
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ACContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface ACContactResponse {
  contact: ACContact;
}

interface ACContactsResponse {
  contacts: ACContact[];
}

// ─── Contact Operations ───────────────────────────────────────────────────────

/**
 * Create or update a contact in ActiveCampaign (upsert by email)
 */
export async function upsertContact(options: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  fieldValues?: Array<{ field: string; value: string }>;
}): Promise<ACContact | null> {
  if (!options.email && !options.phone) return null;

  const payload = {
    contact: {
      email: options.email ?? `${options.phone}@noemail.lavielabs.com`,
      firstName: options.firstName ?? "",
      lastName: options.lastName ?? "",
      phone: options.phone ?? "",
      fieldValues: options.fieldValues ?? [],
    },
  };

  const result = await acFetch<ACContactResponse>("/contact/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result?.contact ?? null;
}

/**
 * Get a contact by email
 */
export async function getContactByEmail(email: string): Promise<ACContact | null> {
  const result = await acFetch<ACContactsResponse>(
    `/contacts?email=${encodeURIComponent(email)}`
  );
  return result?.contacts?.[0] ?? null;
}

/**
 * Add a tag to a contact
 */
export async function addTagToContact(
  contactId: string,
  tagName: string
): Promise<boolean> {
  // First, get or create the tag
  const tagsResult = await acFetch<{ tags: Array<{ id: string; tag: string }> }>(
    `/tags?search=${encodeURIComponent(tagName)}`
  );

  let tagId: string | null = null;

  if (tagsResult?.tags?.length) {
    const existing = tagsResult.tags.find(
      (t) => t.tag.toLowerCase() === tagName.toLowerCase()
    );
    tagId = existing?.id ?? null;
  }

  if (!tagId) {
    // Create the tag
    const newTag = await acFetch<{ tag: { id: string } }>("/tags", {
      method: "POST",
      body: JSON.stringify({ tag: { tag: tagName, tagType: "contact", description: "" } }),
    });
    tagId = newTag?.tag?.id ?? null;
  }

  if (!tagId) return false;

  const result = await acFetch("/contactTags", {
    method: "POST",
    body: JSON.stringify({
      contactTag: { contact: contactId, tag: tagId },
    }),
  });

  return result !== null;
}

/**
 * Add a contact to a list
 */
export async function addContactToList(
  contactId: string,
  listId: string,
  status: 1 | 2 = 1 // 1 = subscribed, 2 = unsubscribed
): Promise<boolean> {
  const result = await acFetch("/contactLists", {
    method: "POST",
    body: JSON.stringify({
      contactList: {
        list: listId,
        contact: contactId,
        status,
      },
    }),
  });
  return result !== null;
}

/**
 * Get all lists in the account
 */
export async function getLists(): Promise<Array<{ id: string; name: string }>> {
  const result = await acFetch<{ lists: Array<{ id: string; name: string }> }>("/lists?limit=100");
  return result?.lists ?? [];
}

/**
 * Get all automations in the account
 */
export async function getAutomations(): Promise<Array<{ id: string; name: string; status: string }>> {
  const result = await acFetch<{
    automations: Array<{ id: string; name: string; status: string }>;
  }>("/automations?limit=100");
  return result?.automations ?? [];
}

// ─── CRM-specific helpers ─────────────────────────────────────────────────────

/**
 * Sync a CRM contact to ActiveCampaign with lead type and status tags
 */
export async function syncContactToAC(options: {
  name: string;
  email?: string;
  phone?: string;
  leadType?: string;
  status?: string;
  agentName?: string;
  source?: string;
}): Promise<{ contactId: string | null; success: boolean }> {
  const nameParts = options.name.trim().split(" ");
  const firstName = nameParts[0] ?? options.name;
  const lastName = nameParts.slice(1).join(" ") || "";

  const contact = await upsertContact({
    email: options.email,
    firstName,
    lastName,
    phone: options.phone,
  });

  if (!contact) return { contactId: null, success: false };

  // Add tags for lead type and status
  const tagsToAdd: string[] = [];
  if (options.leadType) tagsToAdd.push(`Lead: ${options.leadType}`);
  if (options.status) tagsToAdd.push(`Status: ${options.status}`);
  if (options.agentName) tagsToAdd.push(`Agent: ${options.agentName}`);
  if (options.source) tagsToAdd.push(`Source: ${options.source}`);
  tagsToAdd.push("Lavie Labs CRM");

  await Promise.all(tagsToAdd.map((tag) => addTagToContact(contact.id, tag)));

  return { contactId: contact.id, success: true };
}

/**
 * Update contact tags when status changes (remove old status tag, add new one)
 */
export async function updateContactStatus(
  contactId: string,
  oldStatus: string,
  newStatus: string
): Promise<boolean> {
  // Add new status tag
  await addTagToContact(contactId, `Status: ${newStatus}`);

  // Add deal-specific tags for important statuses
  if (newStatus === "Done Deal") {
    await addTagToContact(contactId, "Converted");
  } else if (newStatus === "Cancelled Sub") {
    await addTagToContact(contactId, "Cancelled");
  } else if (newStatus === "Retained Sub") {
    await addTagToContact(contactId, "Retained");
  }

  return true;
}
