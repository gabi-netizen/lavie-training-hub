/**
 * syncMintsoftShipments — Fetches orders from Mintsoft for all contacts
 * and upserts them into the local `shipments` table.
 *
 * Usage:
 *   npx tsx server/scripts/syncMintsoftShipments.ts
 *   — OR triggered via the admin `syncShipments` endpoint.
 */
import { getDb } from "../db";
import { contacts, shipments } from "../../drizzle/schema";
import { eq, isNotNull, sql } from "drizzle-orm";
import { getMintsoftOrders, type MintsoftOrder } from "../mintsoft";

/**
 * Maps Mintsoft OrderStatusId to a human-readable status string.
 */
const STATUS_MAP: Record<number, string> = {
  1: "New",
  2: "Printed",
  3: "Cancelled",
  4: "Despatched",
  5: "Invoiced",
  6: "Invoice Failed",
  7: "Holding",
  8: "Failed",
  9: "On Backorder",
  10: "Awaiting Confirmation",
  11: "Awaiting Documentation",
  12: "Awaiting Payment",
  13: "Query Raised",
  14: "Pack and Hold",
  15: "Awaiting Picking",
  16: "Picking Started",
  17: "Picked",
  18: "Fraud Risk",
  19: "Picking Skipped",
  20: "Packed",
  21: "Awaiting Replen",
  22: "Processing",
  23: "Rebinned",
};

/**
 * Converts a Mintsoft order into the shape expected by the shipments table.
 */
function mapOrderToShipment(order: MintsoftOrder, email: string) {
  const status = STATUS_MAP[order.OrderStatusId] ?? "Unknown";
  const items = Array.isArray(order.Items)
    ? order.Items.map((item) => ({
        sku: item.SKU ?? "",
        quantity: item.Quantity ?? 0,
        price: item.Price ?? 0,
      }))
    : [];

  return {
    orderNumber: order.OrderNumber ?? String(order.ID),
    orderId: order.ID,
    customerEmail: email.toLowerCase().trim(),
    orderDate: order.OrderDate ?? "",
    despatchDate: order.DespatchDate ?? null,
    deliveryDate: (order as any).DeliveryDate ?? null,
    status,
    courier: order.CourierServiceName ?? order.CourierName ?? null,
    trackingNumber: order.TrackingNumber ?? null,
    trackingUrl: order.TrackingUrl ?? null,
    numberOfItems: order.NumberOfItems ?? 0,
    orderValue: String(order.OrderValue ?? 0),
    items,
  };
}

/**
 * Main sync function — can be called from the admin endpoint or run standalone.
 */
export async function syncMintsoftShipments(): Promise<{
  totalEmails: number;
  totalOrders: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection unavailable");
  }

  // Get all unique non-null emails from contacts table
  const contactRows = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(isNotNull(contacts.email));

  const emailList = contactRows
    .map((r: { email: string | null }) => r.email?.toLowerCase().trim())
    .filter((e: string | undefined): e is string => !!e);
  const uniqueEmails: string[] = Array.from(new Set<string>(emailList));

  let totalOrders = 0;
  const errors: string[] = [];

  for (const email of uniqueEmails) {
    try {
      const orders = await getMintsoftOrders(email as string);
      if (!orders || orders.length === 0) continue;

      for (const order of orders) {
        const mapped = mapOrderToShipment(order, email as string);
        totalOrders++;

        // Upsert: insert or update on duplicate orderNumber
        await db
          .insert(shipments)
          .values(mapped)
          .onDuplicateKeyUpdate({
            set: {
              orderId: sql`VALUES(orderId)`,
              customerEmail: sql`VALUES(customerEmail)`,
              orderDate: sql`VALUES(orderDate)`,
              despatchDate: sql`VALUES(despatchDate)`,
              deliveryDate: sql`VALUES(deliveryDate)`,
              status: sql`VALUES(status)`,
              courier: sql`VALUES(courier)`,
              trackingNumber: sql`VALUES(trackingNumber)`,
              trackingUrl: sql`VALUES(trackingUrl)`,
              numberOfItems: sql`VALUES(numberOfItems)`,
              orderValue: sql`VALUES(orderValue)`,
              items: sql`VALUES(items)`,
            },
          });
      }
    } catch (err: any) {
      const msg = `Error syncing email ${email}: ${err.message ?? err}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  console.log(
    `[syncMintsoftShipments] Done. Emails: ${uniqueEmails.length}, Orders upserted: ${totalOrders}, Errors: ${errors.length}`
  );

  return {
    totalEmails: uniqueEmails.length,
    totalOrders,
    errors,
  };
}

// ─── Standalone execution ─────────────────────────────────────────────────────
const isMainModule = process.argv[1]?.includes("syncMintsoftShipments");
if (isMainModule) {
  syncMintsoftShipments()
    .then((result) => {
      console.log("Sync complete:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Sync failed:", err);
      process.exit(1);
    });
}
