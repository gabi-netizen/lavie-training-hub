import { config } from "dotenv";
import { readFileSync } from "fs";

// Load env from webdev env file
try {
  const envContent = readFileSync("/opt/.manus/webdev.sh.env", "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^export\s+([^=]+)="?([^"]*)"?$/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

const key = process.env.POSTMARK_API_KEY;
if (!key) {
  console.log("❌ POSTMARK_API_KEY not found in environment");
  process.exit(1);
}

console.log("✅ POSTMARK_API_KEY found:", key.substring(0, 8) + "...");

// Check sender signatures
const res = await fetch("https://api.postmarkapp.com/senders", {
  headers: {
    "X-Postmark-Account-Token": key,
    "Accept": "application/json",
  },
});

if (res.status === 401) {
  // Try as server token instead
  const res2 = await fetch("https://api.postmarkapp.com/senders", {
    headers: {
      "X-Postmark-Server-Token": key,
      "Accept": "application/json",
    },
  });
  const text2 = await res2.text();
  console.log("Server token response:", res2.status, text2.substring(0, 300));
} else {
  const text = await res.text();
  console.log("Account token response:", res.status, text.substring(0, 500));
}
