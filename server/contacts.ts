import { getDb } from "./db";
import { contacts, contactCallNotes, callAnalyses, type Contact, type InsertContact } from "../drizzle/schema";
import { eq, like, or, desc, and, gte, lte, isNull, isNotNull, inArray, count, sql } from "drizzle-orm";

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
  "skipped",
  "do_not_call",
  "no_answer",
  "done",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

// ─── Phone normalisation ────────────────────────────────────────────────────────────────
/**
 * Normalise a phone number to E.164 format.
 * - Strips spaces, dashes, brackets, dots
 * - UK 07xxx → +447xxx
 * - UK 447xxx (no +) → +447xxx
 * - Already has + → leave as-is
 * - Anything else → leave as-is
 */
export function normalisePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Strip whitespace, dashes, brackets, dots
  let p = raw.replace(/[\s\-().]/g, "").trim();
  if (!p) return undefined;
  // UK: starts with 07 (11 digits) → +447...
  if (/^07\d{9}$/.test(p)) return `+44${p.slice(1)}`;
  // UK: starts with 7 (10 digits, missing leading 0) → +447...
  if (/^7\d{9}$/.test(p)) return `+44${p}`;
  // UK: starts with 447 (no +) → +447...
  if (/^447\d{9}$/.test(p)) return `+${p}`;
  // Israel: starts with 05 (10 digits) → +9725...
  if (/^05\d{8}$/.test(p)) return `+972${p.slice(1)}`;
  // Israel: starts with 972 (no +) → +972...
  if (/^972\d{8,9}$/.test(p)) return `+${p}`;
  // Already E.164
  if (p.startsWith("+")) return p;
  // Fallback: return cleaned digits
  return p;
}

// ─── List Contacts ─────────────────────────────────────────────────────────────
export async function listContacts({
  search,
  leadType,
  status,
  agentName,
  agentEmail,
  department,
  source,
  leadDateFrom,
  leadDateTo,
  statusDateFrom,
  statusDateTo,
  naCountFilter,
  sortBy,
  limit = 50,
  offset = 0,
}: {
  search?: string;
  leadType?: string;
  status?: string;
  agentName?: string;
  agentEmail?: string;
  department?: string;
  source?: string;
  leadDateFrom?: string;
  leadDateTo?: string;
  statusDateFrom?: string;
  statusDateTo?: string;
  naCountFilter?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  // ── SMS Outreach Auto-Reset: lazy evaluation ──────────────────────────────────
  // Contacts that received SMS outreach and have been 'no_answer' for 12+ hours
  // are automatically reset back to 'new' so they re-enter the calling queue.
  try {
    await db.execute(
      sql`UPDATE contacts SET status = 'new' WHERE status = 'no_answer' AND smsOutreachSentAt IS NOT NULL AND smsOutreachSentAt <= NOW() - INTERVAL 12 HOUR`
    );
  } catch (_e) {
    // Silently ignore if column doesn't exist yet (pre-migration)
  }

  const conditions = [];

  if (search) {
    // Normalize phone search: strip +, spaces, dashes for flexible matching
    const isPhoneSearch = /^[\+\d\s\-()]{6,}$/.test(search.trim());
    if (isPhoneSearch) {
      const stripped = search.replace(/[\s\-\+\(\)]/g, "");
      // Try multiple formats: raw search, stripped digits, without leading 44, with leading 44
      const phoneVariants = [search, stripped];
      if (stripped.startsWith("44")) phoneVariants.push(stripped.slice(2)); // 447903... → 7903...
      if (stripped.startsWith("0")) phoneVariants.push("44" + stripped.slice(1)); // 07903... → 447903...
      if (!stripped.startsWith("44") && !stripped.startsWith("0")) phoneVariants.push("44" + stripped); // 7903... → 447903...
      const phoneConditions = phoneVariants.map(v => like(contacts.phone, `%${v}%`));
      conditions.push(
        or(
          like(contacts.name, `%${search}%`),
          like(contacts.email, `%${search}%`),
          ...phoneConditions
        )
      );
    } else {
      conditions.push(
        or(
          like(contacts.name, `%${search}%`),
          like(contacts.phone, `%${search}%`),
          like(contacts.email, `%${search}%`)
        )
      );
    }
  }
  if (leadType) conditions.push(eq(contacts.leadType, leadType));
  if (status) {
    if (status.includes(',')) {
      const statusArray = status.split(',').map(s => s.trim()) as ContactStatus[];
      conditions.push(inArray(contacts.status, statusArray));
    } else {
      conditions.push(eq(contacts.status, status as ContactStatus));
    }
  }
  if (agentName) conditions.push(eq(contacts.agentName, agentName));
  if (agentEmail) {
    if (agentEmail.includes(',')) {
      const emailArray = agentEmail.split(',').map(e => e.trim());
      const emailConditions = [];
      const hasUnassigned = emailArray.includes('unassigned');
      const realEmails = emailArray.filter(e => e !== 'unassigned');
      if (hasUnassigned) {
        emailConditions.push(isNull(contacts.agentEmail), eq(contacts.agentEmail, ''), eq(contacts.agentEmail, 'trial@lavielabs.com'));
      }
      if (realEmails.length > 0) {
        emailConditions.push(inArray(contacts.agentEmail, realEmails));
      }
      if (emailConditions.length > 0) {
        conditions.push(or(...emailConditions));
      }
    } else if (agentEmail === 'unassigned') {
      conditions.push(or(isNull(contacts.agentEmail), eq(contacts.agentEmail, ''), eq(contacts.agentEmail, 'trial@lavielabs.com')));
    } else {
      conditions.push(eq(contacts.agentEmail, agentEmail));
    }
  }
  if (department) conditions.push(eq(contacts.department, department as "opening" | "retention"));
  if (source) conditions.push(eq(contacts.source, source));
  if (leadDateFrom) conditions.push(gte(contacts.leadDate, new Date(leadDateFrom)));
  if (leadDateTo) {
    // Include the entire "to" day
    const toEnd = new Date(leadDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.leadDate, toEnd));
  }
  if (statusDateFrom) conditions.push(gte(contacts.updatedAt, new Date(statusDateFrom)));
  if (statusDateTo) {
    const toEnd = new Date(statusDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.updatedAt, toEnd));
  }
  // NA count filter
  if (naCountFilter) {
    if (naCountFilter === '1') conditions.push(eq(contacts.naCount, 1));
    else if (naCountFilter === '2') conditions.push(eq(contacts.naCount, 2));
    else if (naCountFilter === '3+') conditions.push(gte(contacts.naCount, 3));
    else if (naCountFilter === 'any') conditions.push(gte(contacts.naCount, 1));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort logic
  const orderClauses = sortBy === 'na_oldest_first'
    ? [sql`${contacts.lastNaAt} ASC`, desc(contacts.createdAt)]
    : [
        sql`CASE WHEN (${contacts.email} IS NOT NULL AND ${contacts.email} != '' AND ${contacts.address} IS NOT NULL AND ${contacts.address} != '') THEN 0 WHEN (${contacts.email} IS NOT NULL AND ${contacts.email} != '') OR (${contacts.address} IS NOT NULL AND ${contacts.address} != '') THEN 1 ELSE 2 END`,
        sql`CASE WHEN ${contacts.status} = 'new' THEN 0 ELSE 1 END`,
        desc(contacts.createdAt)
      ];

  return db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(...orderClauses)
    .limit(limit)
    .offset(offset);
}

// ─── Count Contacts (for pagination) ─────────────────────────────────────────
export async function countContacts({
  search,
  leadType,
  status,
  agentName,
  agentEmail,
  department,
  source,
  leadDateFrom,
  leadDateTo,
  statusDateFrom,
  statusDateTo,
  naCountFilter,
}: {
  search?: string;
  leadType?: string;
  status?: string;
  agentName?: string;
  agentEmail?: string;
  department?: string;
  source?: string;
  leadDateFrom?: string;
  leadDateTo?: string;
  statusDateFrom?: string;
  statusDateTo?: string;
  naCountFilter?: string;
} = {}) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (search) {
    // Normalize phone search: strip +, spaces, dashes for flexible matching
    const isPhoneSearch = /^[\+\d\s\-()]{6,}$/.test(search.trim());
    if (isPhoneSearch) {
      const stripped = search.replace(/[\s\-\+\(\)]/g, "");
      // Try multiple formats: raw search, stripped digits, without leading 44, with leading 44
      const phoneVariants = [search, stripped];
      if (stripped.startsWith("44")) phoneVariants.push(stripped.slice(2)); // 447903... → 7903...
      if (stripped.startsWith("0")) phoneVariants.push("44" + stripped.slice(1)); // 07903... → 447903...
      if (!stripped.startsWith("44") && !stripped.startsWith("0")) phoneVariants.push("44" + stripped); // 7903... → 447903...
      const phoneConditions = phoneVariants.map(v => like(contacts.phone, `%${v}%`));
      conditions.push(
        or(
          like(contacts.name, `%${search}%`),
          like(contacts.email, `%${search}%`),
          ...phoneConditions
        )
      );
    } else {
      conditions.push(
        or(
          like(contacts.name, `%${search}%`),
          like(contacts.phone, `%${search}%`),
          like(contacts.email, `%${search}%`)
        )
      );
    }
  }
  if (leadType) conditions.push(eq(contacts.leadType, leadType));
  if (status) {
    if (status.includes(',')) {
      const statusArray = status.split(',').map(s => s.trim()) as ContactStatus[];
      conditions.push(inArray(contacts.status, statusArray));
    } else {
      conditions.push(eq(contacts.status, status as ContactStatus));
    }
  }
  if (agentName) conditions.push(eq(contacts.agentName, agentName));
  if (agentEmail) {
    if (agentEmail.includes(',')) {
      const emailArray = agentEmail.split(',').map(e => e.trim());
      const emailConditions = [];
      const hasUnassigned = emailArray.includes('unassigned');
      const realEmails = emailArray.filter(e => e !== 'unassigned');
      if (hasUnassigned) {
        emailConditions.push(isNull(contacts.agentEmail), eq(contacts.agentEmail, ''), eq(contacts.agentEmail, 'trial@lavielabs.com'));
      }
      if (realEmails.length > 0) {
        emailConditions.push(inArray(contacts.agentEmail, realEmails));
      }
      if (emailConditions.length > 0) {
        conditions.push(or(...emailConditions));
      }
    } else if (agentEmail === 'unassigned') {
      conditions.push(or(isNull(contacts.agentEmail), eq(contacts.agentEmail, ''), eq(contacts.agentEmail, 'trial@lavielabs.com')));
    } else {
      conditions.push(eq(contacts.agentEmail, agentEmail));
    }
  }
  if (department) conditions.push(eq(contacts.department, department as "opening" | "retention"));
  if (source) conditions.push(eq(contacts.source, source));
  if (leadDateFrom) conditions.push(gte(contacts.leadDate, new Date(leadDateFrom)));
  if (leadDateTo) {
    const toEnd = new Date(leadDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.leadDate, toEnd));
  }
  if (statusDateFrom) conditions.push(gte(contacts.updatedAt, new Date(statusDateFrom)));
  if (statusDateTo) {
    const toEnd = new Date(statusDateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.updatedAt, toEnd));
  }
  // NA count filter
  if (naCountFilter) {
    if (naCountFilter === '1') conditions.push(eq(contacts.naCount, 1));
    else if (naCountFilter === '2') conditions.push(eq(contacts.naCount, 2));
    else if (naCountFilter === '3+') conditions.push(gte(contacts.naCount, 3));
    else if (naCountFilter === 'any') conditions.push(gte(contacts.naCount, 1));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [row] = await db.select({ total: count() }).from(contacts).where(where);
  return row?.total ?? 0;
}

// ─── Get Distinct Sources ─────────────────────────────────────────────────────
export async function getDistinctSources(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ source: contacts.source })
    .from(contacts)
    .where(isNotNull(contacts.source));
  return rows
    .map((r) => r.source)
    .filter((s): s is string => !!s && s.trim().length > 0)
    .sort();
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

  // Fetch latest AI Coach call analysis for this contact (by contactId or phone match)
  let latestCallAnalysis = null;
  try {
    const analyses = await db
      .select({
        id: callAnalyses.id,
        overallScore: callAnalyses.overallScore,
        audioFileUrl: callAnalyses.audioFileUrl,
        callDate: callAnalyses.callDate,
        repName: callAnalyses.repName,
        callType: callAnalyses.callType,
        status: callAnalyses.status,
      })
      .from(callAnalyses)
      .where(and(eq(callAnalyses.contactId, id), eq(callAnalyses.status, "done")))
      .orderBy(desc(callAnalyses.createdAt))
      .limit(1);
    if (analyses.length > 0) {
      latestCallAnalysis = analyses[0];
    }
  } catch (_e) { /* ignore if table doesn't exist */ }

  return { ...contact, callNotes: notes, openingNotes: contact.callNotes, latestCallAnalysis };
}

// ─── Update Contact ────────────────────────────────────────────────────────────
export async function updateContact(
  id: number,
  updates: Partial<Pick<Contact, "name" | "phone" | "email" | "status" | "agentName" | "agentEmail" | "leadType" | "callbackAt" | "importedNotes" | "skinType" | "concern" | "routine" | "trialKit" | "callNotes" | "address" | "brands">>
) {
  const db = await getDb();
  if (!db) return null;
  // If status is being changed to no_answer, increment naCount and set lastNaAt
  if (updates.status === "no_answer") {
    await db.execute(
      sql`UPDATE contacts SET naCount = COALESCE(naCount, 0) + 1, lastNaAt = NOW() WHERE id = ${id}`
    );
  }
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
  agentEmail?: string;
  notes?: string;
  source?: string;
  leadDate?: string;
  address?: string;
}

export async function importContacts(rows: CsvContactRow[], department: string = "opening"): Promise<{ imported: number; skipped: number; skippedNoName: number; skippedPhone: number; skippedEmail: number }> {
  const db = await getDb();
  if (!db) return { imported: 0, skipped: rows.length, skippedNoName: 0, skippedPhone: 0, skippedEmail: 0 };

  let imported = 0;
  let skippedNoName = 0;
  let skippedPhone = 0;
  let skippedEmail = 0;

  for (const row of rows) {
    if (!row.name?.trim()) {
      skippedNoName++;
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
    // Default to today (import date) if no leadDate provided
    if (!leadDate) leadDate = new Date();

    const normPhone = normalisePhone(row.phone) || undefined;
    const normEmail = row.email?.trim().toLowerCase() || undefined;

    // ── Duplicate prevention: skip if phone or email already exists ──
    if (normPhone) {
      const [existingByPhone] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.phone, normPhone))
        .limit(1);
      if (existingByPhone) { skippedPhone++; continue; }
    }
    if (normEmail) {
      const [existingByEmail] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.email, normEmail))
        .limit(1);
      if (existingByEmail) { skippedEmail++; continue; }
    }
    // ─────────────────────────────────────────────────────────────────

    const insert: InsertContact = {
      name: row.name.trim(),
      email: normEmail,
      phone: normPhone,
      leadType: row.leadType?.trim() || undefined,
      status,
      agentName: row.agentName?.trim() || undefined,
      agentEmail: row.agentEmail?.trim() || "trial@lavielabs.com",
      importedNotes: row.notes?.trim() || undefined,
      source: row.source?.trim() || undefined,
      leadDate,
      address: row.address?.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || undefined,
      department: department as any,
    };

    await db.insert(contacts).values(insert);
    imported++;
  }

  return { imported, skipped: skippedNoName + skippedPhone + skippedEmail, skippedNoName, skippedPhone, skippedEmail };
}

// ─── Get Contacts Due for Callback ────────────────────────────────────────────
export async function getCallbacksDue(agentEmail?: string) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Return contacts where callbackAt is in the past (overdue) and status is still 'working'
  const conditions = [lte(contacts.callbackAt, now)];
  if (agentEmail) {
    conditions.push(eq(contacts.agentEmail, agentEmail));
  }
  return db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(contacts.callbackAt);
}

// ─── Get ALL scheduled callbacks (future + overdue) ──────────────────────────
export async function getAllCallbacks(agentEmail?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    isNotNull(contacts.callbackAt),
    eq(contacts.status, "working"),
  ];
  if (agentEmail) {
    conditions.push(eq(contacts.agentEmail, agentEmail));
  }
  return db
    .select()
    .from(contacts)
    .where(and(...conditions))
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

// ─── Bulk Delete Contacts ──────────────────────────────────────────────────────────────────────────────────
export async function bulkDeleteContacts(ids: number[]): Promise<{ deleted: number }> {
  if (!ids.length) return { deleted: 0 };
  const db = await getDb();
  if (!db) return { deleted: 0 };
  // Delete related call notes first (FK safety)
  await db.delete(contactCallNotes).where(inArray(contactCallNotes.contactId, ids));
  await db.delete(contacts).where(inArray(contacts.id, ids));
  return { deleted: ids.length };
}

// ─── Bulk Assign Contacts to Agent ──────────────────────────────────────────────
export async function bulkAssignContacts(
  ids: number[],
  agentName: string,
  agentEmail: string
): Promise<{ assigned: number }> {
  if (!ids.length) return { assigned: 0 };
  const db = await getDb();
  if (!db) return { assigned: 0 };
  await db
    .update(contacts)
    .set({ agentName, agentEmail, status: "assigned" as any })
    .where(inArray(contacts.id, ids));
  return { assigned: ids.length };
}

/**
 * Bulk return contacts to the system (unassign agent, keep existing status).
 * Leads will re-enter the assignment pool based on lead type logic.
 */
export async function bulkReturnToSystem(
  ids: number[]
): Promise<{ returned: number }> {
  if (!ids.length) return { returned: 0 };
  const db = await getDb();
  if (!db) return { returned: 0 };
  await db
    .update(contacts)
    .set({ agentName: null as any, agentEmail: null as any })
    .where(inArray(contacts.id, ids));
  return { returned: ids.length };
}

// ─── Bulk Update Status ──────────────────────────────────────────────────────
export async function bulkUpdateStatus(
  ids: number[],
  newStatus: ContactStatus
): Promise<{ updated: number }> {
  if (!ids.length) return { updated: 0 };
  const db = await getDb();
  if (!db) return { updated: 0 };
  // If bulk-setting to no_answer, also increment naCount and set lastNaAt
  if (newStatus === "no_answer") {
    await db.execute(
      sql`UPDATE contacts SET naCount = COALESCE(naCount, 0) + 1, lastNaAt = NOW(), status = 'no_answer' WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
    );
  } else {
    await db
      .update(contacts)
      .set({ status: newStatus })
      .where(inArray(contacts.id, ids));
  }
  return { updated: ids.length };
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
