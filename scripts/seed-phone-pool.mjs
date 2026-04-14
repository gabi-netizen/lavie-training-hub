/**
 * Seed script: pre-populate the phone_numbers pool with Cat McKay's and Marco Salomone's
 * numbers (released when they were removed from CloudTalk).
 *
 * Run: node scripts/seed-phone-pool.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const NUMBERS = [
  // Cat McKay's numbers
  { number: "+447893942312", notes: "Was Cat McKay's number" },
  { number: "+442081065643", notes: "Was Cat McKay's number" },
  // Marco Salomone's numbers
  { number: "+447578276297", notes: "Was Marco Salomone's number" },
  { number: "+447723378731", notes: "Was Marco Salomone's number" },
  { number: "+447446472335", notes: "Was Marco Salomone's number" },
  { number: "+447723330716", notes: "Was Marco Salomone's number" },
  { number: "+447882962694", notes: "Was Marco Salomone's number" },
  { number: "+447578191253", notes: "Was Marco Salomone's number" },
  { number: "+447882950598", notes: "Was Marco Salomone's number" },
  { number: "+447723346230", notes: "Was Marco Salomone's number" },
];

const conn = await mysql.createConnection(DATABASE_URL);

let inserted = 0;
let skipped = 0;

for (const { number, notes } of NUMBERS) {
  try {
    await conn.execute(
      `INSERT IGNORE INTO phone_numbers (number, status, notes, historyJson, createdAt, updatedAt)
       VALUES (?, 'pool', ?, '[]', NOW(), NOW())`,
      [number, notes]
    );
    const [rows] = await conn.execute(
      "SELECT ROW_COUNT() as affected"
    );
    const affected = rows[0]?.affected ?? 0;
    if (affected > 0) {
      console.log(`  ✅ Added: ${number} — ${notes}`);
      inserted++;
    } else {
      console.log(`  ⏭  Skipped (already exists): ${number}`);
      skipped++;
    }
  } catch (err) {
    console.error(`  ❌ Error inserting ${number}:`, err.message);
  }
}

await conn.end();
console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
