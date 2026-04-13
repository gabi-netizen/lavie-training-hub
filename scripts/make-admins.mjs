import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show current users
const [rows] = await conn.execute(
  "SELECT id, name, email, role, cloudtalkAgentId FROM users"
);
console.log("Current users:");
rows.forEach(u =>
  console.log(`  id=${u.id} name=${u.name} email=${u.email} role=${u.role} cloudtalkAgentId=${u.cloudtalkAgentId}`)
);

// Update Matthew (535558) and Sara (178617) to admin
const [result] = await conn.execute(
  "UPDATE users SET role = 'admin' WHERE cloudtalkAgentId IN (?, ?)",
  ["535558", "178617"]
);
console.log(`\nRows updated: ${result.affectedRows}`);

// Verify
const [after] = await conn.execute(
  "SELECT id, name, email, role, cloudtalkAgentId FROM users"
);
console.log("\nAll users after update:");
after.forEach(u =>
  console.log(`  id=${u.id} name=${u.name} role=${u.role} cloudtalkAgentId=${u.cloudtalkAgentId}`)
);

await conn.end();
