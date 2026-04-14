# CloudTalk Integration — Complete Reference

**Project:** Lavie Labs Training Hub (`lavie-training-hub`)
**Last updated:** April 2026
**Purpose:** This document is the single source of truth for everything CloudTalk-related in this project. Paste it into the "Instructions" of any new Manus CloudTalk project so the AI starts with full context.

---

## 1. Authentication

CloudTalk uses **HTTP Basic Auth** on every API call.

```
Authorization: Basic base64(CLOUDTALK_API_KEY_ID:CLOUDTALK_API_KEY_SECRET)
Content-Type: application/json
```

Environment variables (already injected by the platform):
- `CLOUDTALK_API_KEY_ID`
- `CLOUDTALK_API_KEY_SECRET`

Base URL: `https://my.cloudtalk.io/api`

Helper function (already in `server/cloudtalk.ts`):
```ts
function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}
```

---

## 2. API Endpoints in Use

| Method | Endpoint | Purpose | Used in |
|--------|----------|---------|---------|
| `GET` | `/agents/index.json` | Fetch all agents (id, name, email, extension, status) | `server/cloudtalk.ts` → `getCloudTalkAgents()` |
| `GET` | `/calls/index.json` | Fetch call history with filters | `server/cloudtalk.ts` → `getCallHistory()` |
| `GET` | `/calls/recording/{callId}.json` | Download call recording as audio buffer | `server/cloudtalk.ts` → `fetchRecording()` |
| `POST` | `/calls/create.json` | Click-to-call: CloudTalk calls agent first, then customer | `server/cloudtalk.ts` → `clickToCall()` |
| `DELETE` | `/numbers/delete/{numberId}.json` | Delete a phone number from CloudTalk (stops billing) | `server/routers/phoneNumbers.ts` → `markAsSpam` |

### 2.1 GET /agents/index.json

Returns all agents. Response shape:
```json
{
  "responseData": {
    "data": [
      {
        "Agent": {
          "id": "12345",
          "firstname": "John",
          "lastname": "Smith",
          "email": "john@example.com",
          "extension": "101",
          "default_number": "+447700900000",
          "associated_numbers": ["+447700900001"],
          "availability_status": "online"
        }
      }
    ]
  }
}
```

### 2.2 GET /calls/index.json

Query parameters:
- `public_external` — filter by customer phone number
- `date_from` — start date (YYYY-MM-DD)
- `date_to` — end date (YYYY-MM-DD)
- `limit` — page size
- `page` — page number
- `status` — `answered` | `missed`

Response shape:
```json
{
  "responseData": {
    "itemsCount": 150,
    "pageCount": 3,
    "data": [
      {
        "Call": {
          "cdr_id": "99999",
          "uuid": "abc-123",
          "date": "2026-04-14 10:30:00",
          "direction": "outgoing",
          "status": "answered",
          "type": "regular",
          "recorded": true,
          "contact": { "id": 1, "name": "Jane Doe", "number": "+447700900123" },
          "internal_number": { "id": 5, "name": "UK Sales 1", "number": "+447700900456" },
          "call_times": {
            "talking_time": 180,
            "ringing_time": 12,
            "total_time": 195,
            "waiting_time": 0,
            "holding_time": 0,
            "wrap_up_time": 3
          },
          "notes": [],
          "call_rating": null
        },
        "Agent": {
          "id": "12345",
          "firstname": "John",
          "lastname": "Smith",
          "email": "john@example.com"
        }
      }
    ]
  }
}
```

### 2.3 POST /calls/create.json (Click-to-Call)

Request body:
```json
{ "agent_id": 12345, "callee_number": "+447700900123" }
```

Flow: CloudTalk calls the **agent** first → agent picks up → CloudTalk calls the **customer**. The agent hears ringing while CloudTalk connects the customer.

Error codes:
| Status | Meaning |
|--------|---------|
| 200 | Success |
| 403 | Agent is not online — must be logged into CloudTalk |
| 404 | Agent not found — check CloudTalk Agent ID |
| 406 | Invalid phone number format |
| 409 | Agent is already on a call |
| 500 | CloudTalk server error |

### 2.4 DELETE /numbers/delete/{numberId}.json

**CRITICAL RULE:** This endpoint MUST be called whenever a phone number is marked as spam in our system. It stops CloudTalk billing immediately.

The `numberId` here is the **CloudTalk internal number ID** (stored as `cloudtalkNumberId` in our `phone_numbers` table — NOT the phone number itself).

---

## 3. Webhook Pipeline

### 3.1 Endpoint

```
POST /api/webhooks/cloudtalk
```

This is a public endpoint (no auth required from CloudTalk's side). CloudTalk sends a POST when a call ends.

### 3.2 Accepted Events

The webhook accepts both `recording_uploaded` and `RECORDING_UPLOADED` event types (CloudTalk uses both casings inconsistently).

### 3.3 Payload Structure

CloudTalk sends a nested payload. Our handler normalises across multiple possible field locations:

```json
{
  "event": "recording_uploaded",
  "call": {
    "cdr_id": "99999",
    "uuid": "abc-123",
    "recording": "https://storage.cloudtalk.io/recordings/abc-123.mp3",
    "started_at": "2026-04-14T10:30:00Z",
    "caller_number": "+447700900123",
    "duration": 180
  },
  "agent": {
    "id": "12345",
    "user_id": "12345"
  }
}
```

Fields extracted (with fallbacks for different CloudTalk versions):
- `callId` → `call.cdr_id` or `call.id`
- `recordingUrl` → `call.recording_url` or `call.recording`
- `agentId` → `agent.id` or `agent.user_id` or `call.agent_id`
- `callerPhone` → `payload.external_number` or `call.caller_number` or `call.customer_number`
- `callDuration` → `call.duration` or `call.call_duration`
- `callStarted` → `payload.started_at` or `call.started_at`

### 3.4 Processing Pipeline

```
Webhook received
  → Validate payload (has callId + recordingUrl?)
  → Deduplicate (check cloudtalkCallId in callAnalyses table)
  → Find agent by cloudtalkAgentId (users.cloudtalkAgentId field)
    → Fallback: first admin user if no match
  → Find contact by phone number (fuzzy match in contacts table)
  → Download recording → upload to S3
  → Create callAnalysis record (source = "webhook")
  → Respond 200 immediately (don't block CloudTalk)
  → Async: run Deepgram transcription → GPT-4 analysis
  → Async: add auto call note to contact timeline
```

### 3.5 Deduplication

Each call has a `cloudtalkCallId` stored in the `callAnalyses` table. If a webhook fires twice for the same call, the second one is silently ignored.

---

## 4. Agent Mapping (CloudTalk ↔ Our System)

Each user in our `users` table has a `cloudtalkAgentId` field (varchar 32). This is the CloudTalk numeric agent ID (e.g. `"12345"`).

**How agents link their ID:**
1. Agent goes to Profile Settings in the app
2. Selects their name from a dropdown (populated by `GET /agents/index.json`)
3. Their CloudTalk agent ID is saved to `users.cloudtalkAgentId`

**How the webhook uses it:**
When a call ends, the webhook payload contains `agent.id`. We look up `users` where `cloudtalkAgentId = agent.id` to find who made the call.

**Click-to-call flow:**
1. Rep clicks "Call" on a contact card
2. Frontend calls `trpc.contacts.clickToCall({ contactId, phone })`
3. Backend fetches the rep's `cloudtalkAgentId` from DB
4. Backend calls `POST /calls/create.json` with `{ agent_id, callee_number }`
5. CloudTalk rings the agent's headset first, then connects the customer

---

## 5. Phone Number Pool

### 5.1 Database Table: `phone_numbers`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `number` | varchar(32) | E.164 format e.g. `+447700900123` |
| `status` | enum | `pool` / `active` / `spam` |
| `assignedUserId` | int | FK to users.id |
| `assignedAgentName` | varchar | Denormalised name for display |
| `assignedAt` | timestamp | When the number was assigned |
| `cloudtalkNumberId` | varchar(64) | CloudTalk's internal number ID — needed for DELETE API |
| `spamMarkedAt` | timestamp | When spam was flagged |
| `historyJson` | text | JSON array of `{ agentName, assignedAt, releasedAt? }` |
| `notes` | text | Free text notes |

### 5.2 Status Lifecycle

```
pool → active    (assign to agent)
active → pool    (release from agent)
active → spam    (mark as spam → DELETE from CloudTalk)
pool → spam      (mark as spam → DELETE from CloudTalk)
spam → pool      (restore — only if marked spam by mistake)
```

### 5.3 Critical Rules

1. **Spam = DELETE from CloudTalk immediately.** Call `DELETE /numbers/delete/{cloudtalkNumberId}.json` the moment a number is marked spam. This stops billing. If `cloudtalkNumberId` is not set, warn the admin to delete manually.

2. **Days Active colour logic** (older = better for retention — customers recognise the number):
   - Green = 60+ days (established, trusted)
   - Amber = 30–59 days (settling in)
   - Gray = <30 days (new, not yet proven)

3. **Agent removal** → release their numbers to `pool`, do NOT delete them.

4. **Pre-populated numbers** (Cat McKay and Marco Salomone's numbers are seeded in the pool, ready to assign to new agents).

---

## 6. Data Structures

### CloudTalkAgent (TypeScript)
```ts
interface CloudTalkAgent {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  extension: string;
  default_number: string;
  associated_numbers: string[];
  availability_status: "online" | "offline" | "busy" | string;
}
```

### CloudTalkCall (TypeScript)
```ts
interface CloudTalkCall {
  cdr_id: number;
  uuid: string;
  date: string;                    // "YYYY-MM-DD HH:mm:ss"
  direction: "incoming" | "outgoing" | "internal";
  status: "answered" | "missed";
  type: string;
  recorded: boolean;
  contact: { id: number; name: string; number: string } | null;
  internal_number: { id: number; name: string; number: string } | null;
  call_times: {
    talking_time: number;          // seconds
    ringing_time: number;
    total_time: number;
    waiting_time: number;
    holding_time: number;
    wrap_up_time: number;
  };
  notes: string[];
  call_rating: number | null;
  agent?: { id: string; name: string; email: string };
}
```

---

## 7. Key Files in the Project

| File | Purpose |
|------|---------|
| `server/cloudtalk.ts` | All CloudTalk API calls (agents, call history, recording, click-to-call) |
| `server/webhooks/cloudtalk.ts` | Webhook handler — receives call_ended events, triggers AI analysis |
| `server/routers/phoneNumbers.ts` | Phone pool CRUD + spam → CloudTalk DELETE |
| `server/routers/contacts.ts` | `clickToCall`, `cloudtalkAgents`, `setCloudtalkAgentId` procedures |
| `client/src/pages/ProfileSettings.tsx` | Where agents link their CloudTalk Agent ID |
| `client/src/pages/PhoneNumbers.tsx` | Phone pool management UI (admin only) |
| `drizzle/schema.ts` | `users.cloudtalkAgentId`, `callAnalyses.cloudtalkCallId`, `phoneNumbers.cloudtalkNumberId` |

---

## 8. What Is Already Built

- [x] Agent list sync (`GET /agents/index.json`)
- [x] Call history fetch with filters (`GET /calls/index.json`)
- [x] Recording download and S3 upload
- [x] Click-to-call (`POST /calls/create.json`)
- [x] Webhook receiver (`POST /api/webhooks/cloudtalk`) with dedup, agent matching, contact matching, AI pipeline
- [x] Phone pool management (assign, release, spam with CloudTalk DELETE)
- [x] Agent ↔ CloudTalk ID mapping via Profile Settings
- [x] "By Agent" view with days-active colour coding

---

## 9. What Is Not Yet Built / Open Items

- [ ] **Webhook signature verification** — CloudTalk can send a secret header; we currently accept all POSTs to `/api/webhooks/cloudtalk` without verifying the source. Should add HMAC validation once CloudTalk provides the secret.
- [ ] **Number provisioning via API** — Currently, new numbers are added manually in the Phone Pool UI. CloudTalk may have an API to purchase/provision numbers programmatically (`POST /numbers/create.json` — needs investigation).
- [ ] **Agent status monitoring** — We can fetch `availability_status` from `/agents/index.json` but don't currently display it in the UI. Could show "online/offline" next to each agent in the Phone Pool "By Agent" view.
- [ ] **Automatic agent ID detection** — Currently agents must manually select their CloudTalk ID in Profile Settings. Could auto-match by email (our `users.email` vs CloudTalk `Agent.email`).
- [ ] **Missed call alerts** — Webhook currently only processes calls with a recording. Could add a separate handler for missed calls (no recording) to log them in the contact timeline.
- [ ] **Call rating sync** — CloudTalk's `call_rating` field is captured in the data structure but not stored or displayed anywhere.

---

## 10. Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDTALK_API_KEY_ID` | CloudTalk API Key ID (from CloudTalk dashboard → Settings → API) |
| `CLOUDTALK_API_KEY_SECRET` | CloudTalk API Key Secret |

Both are already injected by the Manus platform — no manual `.env` setup needed.

---

## 11. CloudTalk Dashboard Setup Checklist

When setting up a new CloudTalk account or connecting a new one:

1. **Create API credentials:** CloudTalk Dashboard → Settings → API → Create new key. Copy Key ID and Secret into Manus project secrets.
2. **Set webhook URL:** CloudTalk Dashboard → Settings → Webhooks → Add webhook → URL: `https://lavietrain-se3fvyjn.manus.space/api/webhooks/cloudtalk` → Event: `recording_uploaded`.
3. **Ensure call recording is enabled** for all agents (required for the AI analysis pipeline to work).
4. **Each agent must link their CloudTalk ID** in their Profile Settings page on the app.
5. **Add phone numbers** to the Phone Pool page with their CloudTalk Number IDs (needed for spam auto-deletion).
