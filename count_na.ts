import { getDb } from "./server/db";
import { contacts } from "./drizzle/schema";
import { eq, and, isNotNull, ne, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(
      eq(contacts.status, "no_answer"),
      isNotNull(contacts.agentName),
      ne(contacts.agentName, "")
    ));
  
  console.log(`Total N/A leads with agent assigned: ${result.count}`);
  
  const byAgent = await db.select({ 
    agentName: contacts.agentName, 
    count: sql<number>`count(*)` 
  })
    .from(contacts)
    .where(and(
      eq(contacts.status, "no_answer"),
      isNotNull(contacts.agentName),
      ne(contacts.agentName, "")
    ))
    .groupBy(contacts.agentName);
  
  console.log("\nBreakdown by agent:");
  for (const row of byAgent) {
    console.log(`  ${row.agentName}: ${row.count}`);
  }
  
  process.exit(0);
}
main();
