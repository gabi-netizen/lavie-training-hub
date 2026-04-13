import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env from .env file manually
let dbUrl;
try {
  const envContent = readFileSync('/home/ubuntu/lavie-training-hub/.env', 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  if (match) dbUrl = match[1].trim();
} catch {}

if (!dbUrl) dbUrl = process.env.DATABASE_URL;

const conn = await createConnection(dbUrl);

// Sara's user ID is 1440118
const SARA_USER_ID = 1440118;

// 1. Set Sara's CloudTalk Agent ID to 178617
await conn.execute(
  "UPDATE users SET cloudtalkAgentId = '178617', role = 'admin' WHERE id = ?",
  [SARA_USER_ID]
);
console.log('✅ Sara cloudtalkAgentId set to 178617, role set to admin');

// 2. Create test contact "Gabi Test" assigned to Sara
// Check if already exists
const [existing] = await conn.execute(
  "SELECT id FROM contacts WHERE phone = '+972522222828' OR phone = '972522222828' LIMIT 1"
);

if (existing.length > 0) {
  console.log('Contact already exists, updating assignment to Sara...');
  await conn.execute(
    "UPDATE contacts SET assignedUserId = ?, agentName = 'Sara Lavie', agentEmail = 'sara.lavie@lavielabs.com' WHERE id = ?",
    [SARA_USER_ID, existing[0].id]
  );
  console.log('✅ Existing contact assigned to Sara, ID:', existing[0].id);
} else {
  const [result] = await conn.execute(
    `INSERT INTO contacts (name, phone, leadType, status, assignedUserId, agentName, agentEmail, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    ['Gabi Test', '+972522222828', 'Warm lead', 'new', SARA_USER_ID, 'Sara Lavie', 'sara.lavie@lavielabs.com']
  );
  console.log('✅ Created contact "Gabi Test" with ID:', result.insertId);
}

// 3. Verify
const [sara] = await conn.execute("SELECT id, name, email, role, cloudtalkAgentId FROM users WHERE id = ?", [SARA_USER_ID]);
console.log('Sara user:', JSON.stringify(sara[0], null, 2));

const [contact] = await conn.execute("SELECT id, name, phone, assignedUserId, agentName FROM contacts WHERE phone LIKE '%972522222828%'");
console.log('Gabi Test contact:', JSON.stringify(contact[0], null, 2));

await conn.end();
