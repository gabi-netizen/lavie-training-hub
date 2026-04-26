# Gmail Webhook Setup Instructions

This guide explains how to deploy the Google Apps Script that monitors `support@lavielabs.com` and forwards new emails to the Lavie Training Hub server.

## Part 1: Deploying the Google Apps Script

1. Log in to the Google account for `support@lavielabs.com`.
2. Go to [Google Apps Script](https://script.google.com/).
3. Click **New Project** in the top left corner.
4. Rename the project from "Untitled project" to something like "Lavie Gmail Webhook".
5. In the editor (`Code.gs`), delete any existing code and paste the entire contents of the `gmail-webhook.js` file.
6. **Important Configuration:**
   - Find the `WEBHOOK_URL` variable at the top of the script.
   - Update it to point to your actual production server URL (e.g., `https://your-railway-app.up.railway.app/api/webhooks/gmail`).
   - *(Optional)* If you want to secure the webhook, set a random string for `WEBHOOK_SECRET` in the script, and add the exact same string as the `GMAIL_WEBHOOK_SECRET` environment variable in your Railway project settings.
7. Click the **Save** icon (floppy disk) or press `Ctrl+S` / `Cmd+S`.

## Part 2: Authorizing and Starting the Trigger

The script needs permission to read your emails and send data to the external webhook URL.

1. In the Apps Script editor, look at the toolbar at the top. You'll see a dropdown menu that currently says `processNewEmails`.
2. Click that dropdown and select the **`setup`** function.
3. Click the **Run** button next to the dropdown.
4. A "Authorization required" popup will appear. Click **Review permissions**.
5. Choose your `support@lavielabs.com` account.
6. You may see a warning saying "Google hasn't verified this app". Since you wrote the code yourself, this is safe.
   - Click **Advanced** at the bottom.
   - Click **Go to Lavie Gmail Webhook (unsafe)**.
7. Click **Allow** to grant the script access to read your Gmail and connect to an external service.
8. The script will run. You should see "Execution started" and then "Execution completed" in the execution log at the bottom of the screen.

**That's it!** The script is now running in the background. It will check your inbox every minute for new, unread emails and forward them to your server.

## Troubleshooting & Maintenance

- **To view logs:** In the Apps Script editor, click on **Executions** (the clock icon) in the left sidebar. This will show you a history of every time the script ran and any errors it encountered.
- **To stop the script:** Go back to the editor, select the `teardown` function from the dropdown, and click **Run**. This will delete the background trigger.
- **Deduplication:** The script keeps track of the timestamp of the last processed email to avoid sending the same email twice. The server also deduplicates based on the unique Gmail `messageId`.
- **Timeouts:** Google Apps Script has a 6-minute execution limit. The script is designed to process a maximum of 10 emails per run to ensure it never times out, even if there's a sudden influx of emails. It will catch up on the next minute's run.
