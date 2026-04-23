import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, status, audioFileUrl, audioFileKey, errorMessage FROM call_analyses ORDER BY id DESC LIMIT 10'
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
