import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  // Check Gabi's leads by status
  const [gabiLeads] = await db.execute(sql`
    SELECT status, count(*) as cnt, agentName, agentEmail
    FROM contacts 
    WHERE agentName = 'Gabi Lavie' OR agentEmail LIKE '%gabriel%'
    GROUP BY status, agentName, agentEmail
    ORDER BY cnt DESC
  `);
  
  console.log("Gabi's leads by status:");
  const rows = gabiLeads as any[];
  if (Array.isArray(rows)) {
    for (const r of rows) {
      console.log(`  ${r.status}: ${r.cnt} (agent: ${r.agentName}, email: ${r.agentEmail})`);
    }
  }
  
  // Check recent N/A leads (last hour) - where did they go?
  const [recentNA] = await db.execute(sql`
    SELECT id, name, status, agentName, agentEmail, updatedAt
    FROM contacts 
    WHERE status = 'no_answer' 
    AND updatedAt >= NOW() - INTERVAL 1 HOUR
    ORDER BY updatedAt DESC
    LIMIT 20
  `);
  
  console.log("\nRecent N/A leads (last hour):");
  const naRows = recentNA as any[];
  if (Array.isArray(naRows)) {
    for (const r of naRows) {
      console.log(`  #${r.id} ${r.name} | agent: ${r.agentName || 'NONE'} | ${r.updatedAt}`);
    }
  }
  
  process.exit(0);
}
main();
