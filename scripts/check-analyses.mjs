import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL env var found');
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);
const [rows] = await conn.execute(
  `SELECT id, rep_name, source, status, overall_score, cloudtalk_call_id, 
   LEFT(audio_file_url, 80) as audio_url, created_at 
   FROM call_analyses ORDER BY created_at DESC LIMIT 15`
);
console.log('Recent call analyses:');
rows.forEach(r => console.log(JSON.stringify(r)));
await conn.end();
