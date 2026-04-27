# Gmail Webhook Setup — Lavie Training Hub

This document explains how to deploy the Google Apps Script that monitors `support@lavielabs.com` for new emails and forwards them to the Lavie Training Hub server via a webhook.

## Architecture Overview

```
support@lavielabs.com inbox
        │
        ▼
Google Apps Script (runs every 1 min)
        │
        ▼  HTTP POST /api/webhooks/gmail
        │
Lavie Training Hub Server (Railway)
        │
        ▼
gmail_incoming_emails table (MySQL)
```

The Apps Script checks for new unread emails every minute, extracts the metadata and body, and sends a JSON payload to the server. The server deduplicates by Gmail `messageId`, stores the email in the database, and returns `200 OK`.

## Server-Side (Already Deployed)

The server endpoint is already live at:

```
POST /api/webhooks/gmail
```

**Optional environment variable** (set in Railway):

| Variable | Purpose | Required? |
|---|---|---|
| `GMAIL_WEBHOOK_SECRET` | Shared secret to authenticate webhook requests | No (but recommended) |

If you set `GMAIL_WEBHOOK_SECRET` on Railway, you must also set the same value in the `WEBHOOK_SECRET` variable inside the Apps Script.

**Database migration:** The `gmail_incoming_emails` table will be created automatically on the next deploy via migration `0028_gmail_incoming_emails.sql`. If it doesn't auto-run, execute `pnpm db:push` manually.

## Apps Script Deployment (Gabriel's Steps)

### Step 1: Create the Script Project

1. Log in to the Google account that owns `support@lavielabs.com`.
2. Go to [Google Apps Script](https://script.google.com/).
3. Click **New Project** (top left).
4. Rename the project to **"Lavie Gmail Webhook"** (click the title at the top).

### Step 2: Paste the Code

1. In the editor, you'll see a file called `Code.gs` with a default `myFunction()`.
2. **Select all** the default code and **delete** it.
3. Open the `gmail-webhook.js` file from this repo and **copy its entire contents**.
4. **Paste** into the `Code.gs` editor.

### Step 3: Configure the Script

At the top of the script, update these two variables:

```javascript
// IMPORTANT: Update this to your actual Railway URL
var WEBHOOK_URL = 'https://lavie-training-hub-production.up.railway.app/api/webhooks/gmail';

// Optional: Set this to match the GMAIL_WEBHOOK_SECRET env var on Railway
var WEBHOOK_SECRET = '';
```

- **`WEBHOOK_URL`**: Your Railway production URL followed by `/api/webhooks/gmail`. If your Railway app URL is different from the default above, update it.
- **`WEBHOOK_SECRET`**: If you set `GMAIL_WEBHOOK_SECRET` on Railway, paste the same value here. If you haven't set one, leave it as an empty string `''`.

### Step 4: Save and Authorize

1. Press **Ctrl+S** (or **Cmd+S** on Mac) to save.
2. In the function dropdown at the top of the editor, select **`setup`**.
3. Click the **Run** button (play icon ▶).
4. A popup will say **"Authorization required"** — click **Review permissions**.
5. Choose the `support@lavielabs.com` account.
6. You'll see a warning: **"Google hasn't verified this app"**.
   - Click **Advanced** (bottom left of the warning).
   - Click **Go to Lavie Gmail Webhook (unsafe)**.
   - This is safe because you wrote the code yourself.
7. Click **Allow** to grant permissions.

The `setup` function will install a trigger that runs `processNewEmails` every 1 minute.

### Step 5: Verify It's Working

1. Send a test email to `support@lavielabs.com` from another account.
2. Wait 1–2 minutes.
3. Check the Apps Script execution log:
   - In the left sidebar, click **Executions** (clock icon).
   - You should see a successful run with a log message like `Processed 1 new email(s).`
4. Check the server logs on Railway — you should see:
   ```
   [Gmail Webhook] Stored email messageId=xxx from=test@example.com subject="Test"
   ```

## Webhook Payload Format

The Apps Script sends the following JSON to the server:

```json
{
  "messageId":  "18f1a2b3c4d5e6f7",
  "threadId":   "18f1a2b3c4d5e6f7",
  "from":       "customer@example.com",
  "fromName":   "Jane Doe",
  "subject":    "Question about my order",
  "bodyText":   "Hi, I have a question…",
  "bodyHtml":   "<div>Hi, I have a question…</div>",
  "date":       "2026-04-25T14:30:00.000Z",
  "secret":     "your-shared-secret"
}
```

## Maintenance

| Action | How |
|---|---|
| **View logs** | Apps Script editor → left sidebar → **Executions** |
| **Stop the script** | Run the `teardown` function from the dropdown |
| **Restart the script** | Run the `setup` function again |
| **Reprocess old emails** | Run the `resetTimestamp` function, then `setup` |
| **Change webhook URL** | Edit `WEBHOOK_URL` in the script, save |

## Troubleshooting

**"Exceeded maximum execution time"**
The script processes a maximum of 10 emails per run. If there's a large backlog, it will catch up over several 1-minute cycles. No action needed.

**"Exception: Request failed"**
The server may be down or the URL is wrong. Check:
1. Is the Railway app running?
2. Is `WEBHOOK_URL` correct in the script?
3. Check Railway logs for errors.

**Emails not being detected**
The script only processes **unread** emails in the **inbox**. If emails are being auto-archived or auto-read by another tool, they won't be picked up.

**Duplicate emails in the database**
This shouldn't happen — the server deduplicates by `messageId`. If you see duplicates, check that the `gmail_incoming_emails` table has the `messageId` unique constraint.
