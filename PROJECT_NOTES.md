# Lavie Labs Training Hub — Project Notes

> **IMPORTANT:** Read this file at the start of every new chat session before making any changes.
> This documents all business logic, team structure, and system rules for the Lavie Labs CRM.

---

## 1. What This App Is

A full CRM + AI Call Coach for Lavie Labs — a UK skincare company (Lavie Labs / Matinika cream).
Agents make outbound calls to sell skincare subscriptions. The app:
- Auto-analyses calls via CloudTalk webhook → AI scoring
- Manages agent performance dashboards
- Manages phone number pool (assign/release/spam)
- Tracks retention saves and upsells

---

## 2. Team Structure

### Admins (see ALL agents' calls in AI Coach "My Calls")
| Name | Email | CloudTalk ID | Notes |
|---|---|---|---|
| Gabi Lavie | gabi@lavielabs.com | 178617 | Owner |
| Sara Lavie | sara.lavie@lavielabs.com | 178617 | Shared CT ID with Gabi |
| Matthew Holman | matthew.h@lavielabs.com | 535558 | |
| Guy Eli | guy@lavielabs.com | 180333 | |
| Usama Waheed | m.usamawaheed57@gmail.com | 178617 | Shared CT ID |

### Agents (see ONLY their own calls)
| Name | Email | CloudTalk ID | Team |
|---|---|---|---|
| Alan Churchman | alan.c@lavielabs.com | 460125 | Opening |
| Ashley Walker | ashley.w@lavielabs.com | 498273 | Opening |
| Rob Chizdik | rob.c@lavielabs.com | 495893 | Retention |
| Debbie Dobi Debos | debbie.f@lavielabs.com | 329623 | Opening |
| Shola Marie | shola.m@lavielabs.com | 522777 | Opening |
| Ryan Spence | ryan.s@lavielabs.com | 540878 | Opening |
| Angel Breheny | angel.b@lavielabs.com | 540884 | Opening |
| Ava Monroe | ava.m@lavielabs.com | 551003 | Opening |
| Nisha Greenwood | nisha.g@lavielabs.com | 551012 | Opening |
| Paige Taylor | paige.t@lavielabs.com | 551015 | Opening |
| Harrison Joslin | harrison.j@lavielabs.com | 551016 | Opening |
| Yasmeen El-mansoob | yasmeen@lavielabs.com | 551019 | Opening |

**Rule:** An agent cannot be in both Opening AND Retention. These are mutually exclusive.

---

## 3. Call Types

### Opening Team
| Value | Display | Purpose |
|---|---|---|
| `cold_call` | Cold Call | First call to a new lead |
| `follow_up` | Follow-up | Continuation of a previous call |

### Retention Team
| Value | Display | Purpose | AI Goal |
|---|---|---|---|
| `live_sub` | Live Sub | Active subscriber, hasn't asked to cancel (3/7/14 days) | **Upsell only** |
| `pre_cycle_cancelled` | Pre-Cycle Cancelled | Cancelled before first payment | Save + Upsell |
| `pre_cycle_decline` | Pre-Cycle Decline | Card declined before first payment | Update card details + Upsell |
| `end_of_instalment` | End of Instalment | Previously had instalments, brought back | Upsell to full subscription |
| `from_cat` | From Cat | Escalated from Opening team with complex issue | Resolve + Save + Upsell |
| `other` | Other | Anything that doesn't fit above | General |

**Key distinction:** `live_sub` = customer did NOT ask to cancel. Premium lead for upsell.
`live_sub` with cancel request = use `pre_cycle_cancelled` or `from_cat`.

---

## 4. AI Analysis Rules

### Payment Methods (both count as a valid close)
1. Card details taken directly on the call
2. Payment link/form sent to customer — customer confirms they filled it in
   - Trigger phrases: "I'll send you a link", "fill in the form", "I've filled it in", "sent you the form", "payment link"

### Retention AI Fields (extracted per call)
- `saved` — Yes / No / Partial (frozen/deferred)
- `upsellAttempted` — Yes / No
- `upsellSucceeded` — Yes / No
- `cancelReason` — Can't afford / Skin reaction / No results / Too many products / Other

### AI Prompt Logic per Call Type
- **Cold Call / Follow-up:** Full Lavie Labs script (Magic Wand Question → Product Pitch → Objection Handling → Close)
- **Live Sub:** Score based on upsell attempt and success only
- **Pre-Cycle Cancelled / From Cat:** Score based on save + upsell
- **Pre-Cycle Decline:** Score based on card update + upsell
- **End of Instalment:** Score based on re-engagement + upsell

---

## 5. Phone Number Pool

### How it works
Numbers have 3 statuses:
- `active` — Assigned to an agent in CloudTalk
- `pool` — Available for assignment (released from a removed/inactive agent)
- `spam` — Received spam/blocked calls. **Automatically deleted from CloudTalk** when marked spam.

### CloudTalk API for numbers
- **List numbers:** `GET /numbers/index.json`
- **Assign to agent:** `PUT /numbers/update/{numberId}.json` with `{ agent_id: X }`
- **Delete number:** `DELETE /numbers/delete/{numberId}.json` ← called automatically on spam

### Rules
- When marking a number as **spam** → immediately call CloudTalk DELETE API → stops billing
- When an agent is **removed** → their numbers go to `pool` status (NOT deleted)
- When a **new agent** joins or existing agent needs a new number → assign from pool

### Released numbers (from removed agents)
| Number | Previous Owner | Status |
|---|---|---|
| +447893942312 | Cat McKay | pool |
| +442081065643 | Cat McKay | pool |
| +447578276297 | Marco Salomone | pool |
| +447723378731 | Marco Salomone | pool |
| +447446472335 | Marco Salomone | pool |
| +447723330716 | Marco Salomone | pool |
| +447882962694 | Marco Salomone | pool |
| +447578191253 | Marco Salomone | pool |
| +447882950598 | Marco Salomone | pool |
| +447723346230 | Marco Salomone | pool |

---

## 6. CloudTalk Integration

### Webhook
- Endpoint: `POST /api/webhooks/cloudtalk`
- Accepted events: `recording_uploaded`, `RECORDING_UPLOADED`
- Payload: `agent.id` → matched to `users.cloudtalkAgentId` to assign call to correct user
- On match: creates `callAnalysis` record → triggers AI analysis

### API Credentials
- `CLOUDTALK_API_KEY_ID` + `CLOUDTALK_API_KEY_SECRET` (in env)
- Base URL: `https://my.cloudtalk.io/api`
- Auth: HTTP Basic Auth

### Key API Endpoints Used
- `GET /agents/index.json` — list all agents
- `DELETE /agents/delete/{agentId}.json` — remove agent (stops billing for that seat)
- `GET /calls/index.json` — list calls with filters
- `GET /calls/recording/{callId}.json` — get recording URL
- `DELETE /numbers/delete/{numberId}.json` — delete number (stops billing)

---

## 7. Products

| Product | Description |
|---|---|
| **Matinika** | Medical-grade hydration cream, 32% Hyaluronic Acid. Main product. £59 value, free trial for £4.95 postage |
| **Oulala** | Medical-grade retinol serum |
| **Ashkara** | Eye serum — "8 hours of sleep in a bottle" |

### Trial Terms
- 21-day free trial
- £4.95 postage only
- Auto-transitions to subscription after trial
- 30% VIP discount locked in for subscribers
- Cancel/pause/change anytime with one click or email

---

## 8. Key Objections & Scripts

### Objection 1 — Subscription
"I'm so glad you asked! Yes, after your 21-day free trial, it does automatically transition into a subscription so you never run out of your cream. But here is the best part: you are in complete control..."

### Objection 2 — Trust & Card
Identify which concern: product won't work OR worried about card details. Address specifically.

### Objection 3 — Too Many Products
"If your cabinet is full, it probably means those products promised you results and didn't fully deliver. Am I right?"

---

## 9. Tech Stack

- **Frontend:** React 19 + Tailwind 4 + shadcn/ui
- **Backend:** Express 4 + tRPC 11
- **DB:** MySQL/TiDB via Drizzle ORM
- **Auth:** Manus OAuth
- **File Storage:** S3 via storagePut/storageGet helpers
- **AI:** invokeLLM helper (server-side only)
- **Design:** Dark navy (#0F1923) theme, Space Grotesk headings, DM Sans body

---

## 10. Important Rules for Development

1. **Never hardcode port numbers** — use process.env.PORT
2. **All static assets** → upload via `manus-upload-file --webdev`, use CDN URLs
3. **Spam number** → always call CloudTalk DELETE API immediately, don't just mark in DB
4. **Agent removal** → release their numbers to pool, don't delete numbers
5. **Admin role** → sees all agents' calls in "My Calls" tab
6. **Agent role** → sees only their own calls
7. **Talk Ratio** is currently hidden from call lists (unreliable data from CloudTalk) — do not re-add until fixed
8. **Opening and Retention are mutually exclusive** — an agent belongs to one team only
9. **Webhook events to accept:** `recording_uploaded` AND `RECORDING_UPLOADED` (both cases)
10. **Form/link payment** = valid close, same as card on call
