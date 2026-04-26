/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lavie Labs — Gmail → Command Centre Webhook Script
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 *   Watches the support@lavielabs.com inbox for new unread emails and sends
 *   each one as a POST request to the Lavie Training Hub webhook endpoint.
 *   The server categorizes the email and creates a support ticket automatically.
 *
 * HOW TO INSTALL:
 *   1. Go to https://script.google.com while signed in as support@lavielabs.com
 *   2. Create a new project → name it "Lavie Command Centre Email Forwarder"
 *   3. Paste this entire file into Code.gs (replace any existing code)
 *   4. Click the gear icon (Project Settings) → Script Properties → Add:
 *        Property: WEBHOOK_URL
 *        Value:    https://lavie-ops-server-production.up.railway.app/api/webhooks/gmail
 *
 *        Property: WEBHOOK_SECRET
 *        Value:    (the value of GMAIL_WEBHOOK_SECRET from your Railway env vars)
 *
 *   5. Save the project (Ctrl+S)
 *   6. Run `processNewEmails` once manually to authorize permissions
 *   7. Click Triggers (clock icon) → Add Trigger:
 *        Function:     processNewEmails
 *        Event source: Time-driven
 *        Type:         Minutes timer
 *        Interval:     Every 1 minute
 *   8. Click Save
 *
 * WHAT IT DOES:
 *   - Every 1 minute, searches for unread emails in the inbox
 *   - Skips emails already labelled "Processed-CommandCentre"
 *   - Sends each email as JSON POST to the webhook endpoint
 *   - Labels successfully sent emails as "Processed-CommandCentre"
 *   - Logs all activity for debugging (View → Executions)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Get config from Script Properties (safer than hardcoding).
 * Set these in Project Settings → Script Properties.
 */
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    webhookUrl: props.getProperty("WEBHOOK_URL") || "https://lavie-ops-server-production.up.railway.app/api/webhooks/gmail",
    webhookSecret: props.getProperty("WEBHOOK_SECRET") || "",
  };
}

/**
 * Name of the Gmail label used to mark processed emails.
 * Created automatically if it doesn't exist.
 */
var PROCESSED_LABEL_NAME = "Processed-CommandCentre";

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Main entry point — called by the time-driven trigger every 1 minute.
 * Searches for unread emails, sends them to the webhook, and labels them.
 */
function processNewEmails() {
  var config = getConfig();

  if (!config.webhookUrl) {
    Logger.log("ERROR: WEBHOOK_URL not configured in Script Properties");
    return;
  }

  // Get or create the "Processed-CommandCentre" label
  var label = getOrCreateLabel(PROCESSED_LABEL_NAME);

  // Search for unread emails NOT already labelled
  // Using search to exclude already-processed emails
  var query = "is:unread -label:" + PROCESSED_LABEL_NAME;
  var threads = GmailApp.search(query, 0, 20); // Process up to 20 per run

  if (threads.length === 0) {
    Logger.log("No new unread emails to process.");
    return;
  }

  Logger.log("Found " + threads.length + " thread(s) to process.");

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();

    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];

      // Skip already-read messages in the thread (only process unread)
      if (!message.isUnread()) {
        continue;
      }

      try {
        var success = sendToWebhook(message, config);

        if (success) {
          // Mark as read and apply label
          message.markRead();
          thread.addLabel(label);
          Logger.log("✓ Processed: " + message.getSubject() + " from " + message.getFrom());
        } else {
          Logger.log("✗ Failed to send: " + message.getSubject());
        }
      } catch (err) {
        Logger.log("✗ Error processing message: " + err.toString());
      }
    }
  }
}

// ─── Webhook Sender ──────────────────────────────────────────────────────────

/**
 * Send a single Gmail message to the webhook endpoint.
 * @param {GmailMessage} message - The Gmail message object
 * @param {Object} config - Configuration with webhookUrl and webhookSecret
 * @returns {boolean} true if the webhook accepted the message
 */
function sendToWebhook(message, config) {
  // Extract sender info
  var rawFrom = message.getFrom(); // e.g. "Jane Doe <jane@example.com>"
  var parsed = parseFromField(rawFrom);

  // Build the payload
  var payload = {
    messageId: message.getId(),
    threadId: message.getThread().getId(),
    from: parsed.email,
    fromName: parsed.name,
    subject: message.getSubject() || "(no subject)",
    bodyText: message.getPlainBody() || "",
    bodyHtml: message.getBody() || "",
    date: message.getDate().toISOString(),
    secret: config.webhookSecret,
  };

  // Send HTTP POST
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // Don't throw on 4xx/5xx
    headers: {
      "Authorization": "Bearer " + config.webhookSecret,
    },
  };

  var response = UrlFetchApp.fetch(config.webhookUrl, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  Logger.log("Webhook response [" + code + "]: " + body.substring(0, 500));

  // Accept 200-299 as success
  return code >= 200 && code < 300;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse "Jane Doe <jane@example.com>" into { name, email }.
 */
function parseFromField(raw) {
  if (!raw) return { name: "", email: "" };

  var match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim(),
      email: match[2].trim(),
    };
  }

  // No angle brackets — assume it's just an email
  return { name: "", email: raw.trim() };
}

/**
 * Get an existing Gmail label or create it if it doesn't exist.
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log("Created label: " + labelName);
  }
  return label;
}

// ─── Manual Test Function ────────────────────────────────────────────────────

/**
 * Run this manually to test the webhook with a fake email.
 * Go to Run → testWebhook in the Apps Script editor.
 */
function testWebhook() {
  var config = getConfig();

  var testPayload = {
    messageId: "test-" + new Date().getTime(),
    threadId: "test-thread-" + new Date().getTime(),
    from: "test-customer@example.com",
    fromName: "Test Customer",
    subject: "I want to cancel my subscription please",
    bodyText: "Hi, I would like to cancel my subscription. I no longer need the product. Please stop any further payments. Thank you.",
    bodyHtml: "<p>Hi, I would like to cancel my subscription. I no longer need the product. Please stop any further payments. Thank you.</p>",
    date: new Date().toISOString(),
    secret: config.webhookSecret,
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true,
    headers: {
      "Authorization": "Bearer " + config.webhookSecret,
    },
  };

  var response = UrlFetchApp.fetch(config.webhookUrl, options);
  Logger.log("Test response [" + response.getResponseCode() + "]: " + response.getContentText());
}
