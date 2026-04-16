import { getDb } from "./db";
import { contacts, contactCallNotes, type Contact, type InsertContact } from "../drizzle/schema";
import { eq, like, or, desc, and, gte, isNull } from "drizzle-orm";

// ─── Lead Types ───────────────────────────────────────────────────────────────
export const LEAD_TYPES = [
  "Pre Cycle",
  "Pre-Cycle-Cancelled",
  "Pre-Cycle-Decline",
  "Cycle 1",
  "Cycle 2",
  "Cycle 3+",
  "Cancel 2+ Cycle",
  "Live Sub 3 Days",
  "Live Sub 7 Days",
  "Live Sub 14days+",
  "Live Sub 2nd+",
  "Live Sub Declined 2nd+",
  "Owned Sub",
  "Same day as charge cancel",
  "Warm lead",
  "Other",
] as const;

export const CONTACT_STATUSES = [
  "new",
  "open",
  "working",
  "assigned",
  "done_deal",
  "retained_sub",
  "cancelled_sub",
  "closed",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

// ─── List Contacts ─────────────────────────────────────────────────────────────
export async function listContacts({
  search,
  leadType,
  status,
  agentName,
  limit = 50,
  offset = 0,
}: {
  search?: string;
  leadType?: string;
  status?: string;
  agentName?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(contacts.name, `%${search}%`),
        like(contacts.phone, `%${search}%`),
        like(contacts.email, `%${search}%`)
      )
    );
  }
  if (leadType) conditions.push(eq(contacts.leadType, leadType));
  if (status) conditions.push(eq(contacts.status, status as ContactStatus));
  if (agentName) conditions.push(eq(contacts.agentName, agentName));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .offset(offset);
}

// ─── Get Single Contact ────────────────────────────────────────────────────────
export async function getContact(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);

  if (!contact) return null;

  const notes = await db
    .select()
    .from(contactCallNotes)
    .where(eq(contactCallNotes.contactId, id))
    .orderBy(desc(contactCallNotes.createdAt));

  return { ...contact, callNotes: notes };
}

// ─── Update Contact ────────────────────────────────────────────────────────────
export async function updateContact(
  id: number,
  updates: Partial<Pick<Contact, "status" | "agentName" | "agentEmail" | "leadType" | "callbackAt" | "importedNotes">>
) {
  const db = await getDb();
  if (!db) return null;
  await db.update(contacts).set(updates).where(eq(contacts.id, id));
  return getContact(id);
}

// ─── Add Call Note ─────────────────────────────────────────────────────────────
export async function addCallNote({
  contactId,
  userId,
  agentName,
  note,
  statusAtTime,
}: {
  contactId: number;
  userId?: number;
  agentName?: string;
  note: string;
  statusAtTime?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(contactCallNotes).values({
    contactId,
    userId,
    agentName,
    note,
    statusAtTime,
  });
}

// ─── Import Contacts from CSV rows ────────────────────────────────────────────
export interface CsvContactRow {
  name: string;
  email?: string;
  phone?: string;
  leadType?: string;
  status?: string;
  agentName?: string;
  notes?: string;
  source?: string;
  leadDate?: string;
}

export async function importContacts(rows: CsvContactRow[]): Promise<{ imported: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { imported: 0, skipped: rows.length };

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.name?.trim()) {
      skipped++;
      continue;
    }

    // Normalise status
    const rawStatus = (row.status ?? "new").toLowerCase().trim().replace(/\s+/g, "_");
    const statusMap: Record<string, ContactStatus> = {
      new: "new",
      open: "open",
      working: "working",
      assigned: "assigned",
      done_deal: "done_deal",
      "done deal": "done_deal",
      retained_sub: "retained_sub",
      "retained sub": "retained_sub",
      cancelled_sub: "cancelled_sub",
      "cancelled sub": "cancelled_sub",
      closed: "closed",
    };
    const status: ContactStatus = statusMap[rawStatus] ?? "new";

    let leadDate: Date | undefined;
    if (row.leadDate) {
      const parsed = new Date(row.leadDate);
      if (!isNaN(parsed.getTime())) leadDate = parsed;
    }

    const insert: InsertContact = {
      name: row.name.trim(),
      email: row.email?.trim() || undefined,
      phone: row.phone?.trim() || undefined,
      leadType: row.leadType?.trim() || undefined,
      status,
      agentName: row.agentName?.trim() || undefined,
      importedNotes: row.notes?.trim() || undefined,
      source: row.source?.trim() || undefined,
      leadDate,
    };

    await db.insert(contacts).values(insert);
    imported++;
  }

  return { imported, skipped };
}

// ─── Get Contacts Due for Callback ────────────────────────────────────────────
export async function getCallbacksDue() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(contacts)
    .where(gte(contacts.callbackAt, new Date(now.getTime() - 60 * 60 * 1000)))
    .orderBy(contacts.callbackAt);
}

// ─── Lookup Contact By Phone ───────────────────────────────────────────────────
/**
 * Normalize a phone number for comparison.
 * Strips spaces, dashes, parentheses, dots. Converts leading 0 → +44.
 */
function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-().+]/g, "");
  // Remove leading country code variants so we compare just the national number
  if (stripped.startsWith("44")) return stripped.slice(2);
  if (stripped.startsWith("0")) return stripped.slice(1);
  return stripped;
}

export async function getContactByPhone(rawPhone: string) {
  const db = await getDb();
  if (!db) return null;
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return null;
  // Fetch all contacts and match by normalized phone
  const all = await db.select().from(contacts);
  const match = all.find((c) => {
    if (!c.phone) return false;
    return normalizePhone(c.phone) === normalized;
  });
  if (!match) return null;
  return getContact(match.id);
}

// ─── Delete Contact ────────────────────────────────────────────────────────────
export async function deleteContact(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete related call notes first (FK safety)
  await db.delete(contactCallNotes).where(eq(contactCallNotes.contactId, id));
  await db.delete(contacts).where(eq(contacts.id, id));
}

// ─── Bulk CloudTalk Sync (startup / catch-up) ─────────────────────────────────
/**
 * Sync all contacts that have no cloudtalkId yet.
 * Called on server startup so any contacts created during hibernation get synced.
 * Runs in the background — does not block server startup.
 */
export async function syncUnsyncedContactsToCloudTalk(): Promise<void> {
  const { syncContactToCloudTalk } = await import("./cloudtalk");
  const db = await getDb();
  if (!db) return;

  const unsynced = await db
    .select()
    .from(contacts)
    .where(isNull(contacts.cloudtalkId));

  if (unsynced.length === 0) return;

  console.log(`[CloudTalk] Syncing ${unsynced.length} unsynced contacts...`);

  for (const contact of unsynced) {
    const cloudtalkId = await syncContactToCloudTalk(
      { name: contact.name, email: contact.email, phone: contact.phone },
      null
    );
    if (cloudtalkId) {
      await db
        .update(contacts)
        .set({ cloudtalkId })
        .where(eq(contacts.id, contact.id));
    }
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[CloudTalk] Startup sync complete.`);
}
