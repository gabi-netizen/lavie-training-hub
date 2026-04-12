import { getDb } from './server/db.ts';
import { callAnalyses } from './drizzle/schema.ts';
import { desc } from 'drizzle-orm';

const db = await getDb();
const rows = await db.select().from(callAnalyses).orderBy(desc(callAnalyses.createdAt)).limit(5);
console.log('Latest 5 call analyses:');
for (const r of rows) {
  console.log(JSON.stringify({
    id: r.id,
    source: r.source,
    status: r.status,
    cloudtalkCallId: r.cloudtalkCallId,
    repName: r.repName,
    createdAt: r.createdAt
  }));
}
process.exit(0);
