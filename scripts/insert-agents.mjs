import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Import schema dynamically
const { users } = await import("../drizzle/schema.ts");

const agents = [
  { name: "Guy Eli",            email: "guy@lavielabs.com",         cloudtalkAgentId: "180333", role: "admin" },
  { name: "Debbie Dobi Debos",  email: "debbie.f@lavielabs.com",    cloudtalkAgentId: "329623", role: "user" },
  { name: "Rob Chizdik",        email: "rob.c@lavielabs.com",       cloudtalkAgentId: "495893", role: "user" },
  { name: "Marco Salomone",     email: "marco.s@lavielabs.com",     cloudtalkAgentId: "513083", role: "user" },
  { name: "Shola Marie",        email: "shola.m@lavielabs.com",     cloudtalkAgentId: "522777", role: "user" },
  { name: "Ryan Spence",        email: "ryan.s@lavielabs.com",      cloudtalkAgentId: "540878", role: "user" },
  { name: "Angel Breheny",      email: "angel.b@lavielabs.com",     cloudtalkAgentId: "540884", role: "user" },
  { name: "Ava Monroe",         email: "ava.m@lavielabs.com",       cloudtalkAgentId: "551003", role: "user" },
  { name: "Nisha Greenwood",    email: "nisha.g@lavielabs.com",     cloudtalkAgentId: "551012", role: "user" },
  { name: "Paige Taylor",       email: "paige.t@lavielabs.com",     cloudtalkAgentId: "551015", role: "user" },
  { name: "Harrison Joslin",    email: "harrison.j@lavielabs.com",  cloudtalkAgentId: "551016", role: "user" },
  { name: "Yasmeen El-mansoob", email: "yasmeen@lavielabs.com",     cloudtalkAgentId: "551019", role: "user" },
];

// Update Ashley Walker's cloudtalkAgentId
await db.update(users)
  .set({ cloudtalkAgentId: "498273" })
  .where(eq(users.email, "ashley.w@lavielabs.com"));
console.log("Updated Ashley Walker cloudtalkAgentId -> 498273");

for (const agent of agents) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, agent.email));
  if (existing.length > 0) {
    console.log("Already exists:", agent.email);
    continue;
  }
  const id = parseInt(agent.cloudtalkAgentId) * 10 + Math.floor(Math.random() * 10);
  await db.insert(users).values({
    id,
    openId: `ct_${agent.cloudtalkAgentId}`,
    name: agent.name,
    email: agent.email,
    loginMethod: "email",
    role: agent.role,
    cloudtalkAgentId: agent.cloudtalkAgentId,
    createdAt: new Date(),
  });
  console.log("Inserted:", agent.name, "(" + agent.role + ") id=" + id);
}

const all = await db.select({ id: users.id, name: users.name, role: users.role, cloudtalkAgentId: users.cloudtalkAgentId }).from(users);
console.log("\nFinal user list (" + all.length + " total):");
all.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).forEach(u => {
  console.log(" -", u.name, "| role:", u.role, "| ct:", u.cloudtalkAgentId ?? "—");
});

await connection.end();
