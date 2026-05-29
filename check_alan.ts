import { getDb } from "./server/db";
import { contacts } from "./drizzle/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  const byStatus = await db.select({ 
    status: contacts.status, 
    count: sql<number>`count(*)` 
  })
    .from(contacts)
    .where(eq(contacts.agentName, "Alan Churchman"))
    .groupBy(contacts.status);
  
  console.log("Alan Churchman leads by status:");
  let total = 0;
  for (const row of byStatus) {
    console.log(`  ${row.status}: ${row.count}`);
    total += Number(row.count);
  }
  console.log(`  TOTAL: ${total}`);
  
  process.exit(0);
}
main();
