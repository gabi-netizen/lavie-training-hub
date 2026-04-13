import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

let dbUrl;
try {
  const envContent = readFileSync('/home/ubuntu/lavie-training-hub/.env', 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  if (match) dbUrl = match[1].trim();
} catch {}
if (!dbUrl) dbUrl = process.env.DATABASE_URL;

const conn = await createConnection(dbUrl);

// Find Usama
const [users] = await conn.execute("SELECT id, name, email, role FROM users WHERE name LIKE '%Usama%' OR email LIKE '%usama%' OR email LIKE '%waheed%'");
console.log('Found:', JSON.stringify(users, null, 2));

if (users.length > 0) {
  const user = users[0];
  await conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
  console.log(`✅ Set ${user.name} (${user.email}) to admin`);
} else {
  console.log('❌ User not found — listing all users:');
  const [all] = await conn.execute("SELECT id, name, email, role FROM users");
  console.log(JSON.stringify(all, null, 2));
}

await conn.end();
