import { getDb } from "./server/db";
import { contacts } from "./drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  // 1. All leads with status no_answer that have an agent → unassign
  const [r1] = await db.execute(sql`
    UPDATE contacts 
    SET agentName = NULL, agentEmail = NULL 
    WHERE status = 'no_answer' 
    AND agentName IS NOT NULL 
    AND agentName != ''
  `);
  console.log(`Step 1: Unassigned N/A leads from all agents: ${(r1 as any).affectedRows} rows`);
  
  // 2. Alan Churchman's "assigned" leads → change status to no_answer + unassign
  const [r2] = await db.execute(sql`
    UPDATE contacts 
    SET status = 'no_answer', agentName = NULL, agentEmail = NULL 
    WHERE agentName = 'Alan Churchman' 
    AND status = 'assigned'
  `);
  console.log(`Step 2: Alan's assigned leads → no_answer + unassigned: ${(r2 as any).affectedRows} rows`);
  
  // Verify
  const [verify] = await db.execute(sql`
    SELECT count(*) as cnt FROM contacts 
    WHERE status = 'no_answer' 
    AND (agentName IS NULL OR agentName = '')
  `);
  console.log(`\nVerification: Total N/A unassigned leads (Cooling Pool): ${(verify as any)[0].cnt}`);
  
  process.exit(0);
}
main();
