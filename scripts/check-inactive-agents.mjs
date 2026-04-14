/**
 * Check CloudTalk agent activity over the last 7 days
 * Lists inactive agents (0 calls) and optionally deletes them
 */
import * as dotenv from "dotenv";
dotenv.config();

const keyId = process.env.CLOUDTALK_API_KEY_ID;
const keySecret = process.env.CLOUDTALK_API_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error("Missing CLOUDTALK_API_KEY_ID or CLOUDTALK_API_KEY_SECRET");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
const BASE_URL = "https://my.cloudtalk.io/api";

async function cloudtalkGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: auth, "Content-Type": "application/json" },
  });
  return res.json();
}

// 1. Get all agents
const agentsJson = await cloudtalkGet("/agents/index.json");
const agents = (agentsJson?.responseData?.data ?? []).map((item) => item.Agent ?? item);
console.log(`Total agents in CloudTalk: ${agents.length}`);

// 2. Get calls from last 7 days (paginated)
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const dateFrom = sevenDaysAgo.toISOString().slice(0, 10);
const dateTo = new Date().toISOString().slice(0, 10);

let page = 1;
let allCalls = [];
while (true) {
  const callsJson = await cloudtalkGet(
    `/calls/index.json?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100&page=${page}`
  );
  const data = callsJson?.responseData?.data ?? [];
  if (data.length === 0) break;
  allCalls = allCalls.concat(data);
  const pageCount = callsJson?.responseData?.pageCount ?? 1;
  if (page >= pageCount) break;
  page++;
}
console.log(`Calls in last 7 days: ${allCalls.length}`);

// 3. Count calls per agent
const callsByAgent = {};
for (const item of allCalls) {
  const call = item.Call ?? item;
  // Try multiple fields where agent ID might appear
  const agentId =
    call?.agent?.id ??
    call?.Agent?.id ??
    call?.internal_number?.agent_id ??
    null;
  if (agentId) {
    callsByAgent[String(agentId)] = (callsByAgent[String(agentId)] || 0) + 1;
  }
}

// 4. Report
console.log("\n=== AGENT ACTIVITY (last 7 days) ===");
const inactive = [];
for (const agent of agents) {
  const count = callsByAgent[String(agent.id)] || 0;
  const marker = count === 0 ? "❌ INACTIVE" : "✅ active  ";
  console.log(`${marker}  [${agent.id}] ${agent.firstname} ${agent.lastname} | ${count} calls | ${agent.email}`);
  if (count === 0) inactive.push(agent);
}

console.log(`\n--- Summary ---`);
console.log(`Active agents:   ${agents.length - inactive.length}`);
console.log(`Inactive agents: ${inactive.length}`);

if (inactive.length > 0) {
  console.log("\nInactive agents to potentially remove:");
  inactive.forEach((a) => console.log(`  - [${a.id}] ${a.firstname} ${a.lastname} (${a.email})`));
  console.log("\nTo delete them, run with --delete flag: node scripts/check-inactive-agents.mjs --delete");
}

// 5. If --delete flag passed, delete inactive agents
if (process.argv.includes("--delete")) {
  console.log("\n⚠️  DELETING inactive agents...");
  for (const agent of inactive) {
    const res = await fetch(`${BASE_URL}/agents/delete/${agent.id}.json`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    const json = await res.json();
    const status = json?.responseData?.status ?? res.status;
    console.log(`  ${status === 200 ? "✅ Deleted" : "❌ Failed"} [${agent.id}] ${agent.firstname} ${agent.lastname} → ${JSON.stringify(json?.responseData)}`);
  }
}
