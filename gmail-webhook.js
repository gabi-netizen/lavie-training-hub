/**
 * Gmail Webhook Trigger for Lavie Training Hub
 * ─────────────────────────────────────────────────────────────────────────────
 * This Google Apps Script monitors the support@lavielabs.com inbox for new
 * emails and forwards them to the Lavie Training Hub server via a webhook.
 *
 * It uses a 1-minute time-driven trigger and tracks the last processed
 * timestamp to avoid sending duplicate emails. The server also deduplicates
 * by Gmail messageId as a safety net.
 *
 * DEPLOYMENT: See GMAIL_WEBHOOK_SETUP.md for step-by-step instructions.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Webhook payload format (matches server expectation):
 * {
 *   "messageId":  "18f1a2b3c4d5e6f7",
 *   "threadId":   "18f1a2b3c4d5e6f7",
 *   "from":       "customer@example.com",
 *   "fromName":   "Jane Doe",
 *   "subject":    "Question about my order",
 *   "bodyText":   "Hi, I have a question…",
 *   "bodyHtml":   "<div>Hi, I have a question…</div>",
 *   "date":       "2026-04-25T14:30:00.000Z",
 *   "secret":     "shared-secret-value"
 * }
 */

// ─── Configuration ───────────────────────────────────────────────────────────
// IMPORTANT: Update WEBHOOK_URL to your actual Railway production URL
var WEBHOOK_URL = 'https://lavie-training-hub-production.up.railway.app/api/webhooks/gmail';

// Optional: Set this to match the GMAIL_WEBHOOK_SECRET env var on your server.
// If left empty, the server will accept requests without secret validation.
var WEBHOOK_SECRET = '';

// Only process unread inbox emails
var SEARCH_QUERY = 'is:inbox is:unread';

// Max emails per run to prevent Apps Script timeout (6-min limit)
var MAX_EMAILS_PER_RUN = 10;

// ─── Main function (runs on trigger) ─────────────────────────────────────────
function processNewEmails() {
  var properties = PropertiesService.getScriptProperties();
  var lastProcessedTime = parseInt(properties.getProperty('LAST_PROCESSED_TIME') || '0', 10);

  // Search for recent unread emails
  // Look back 2 hours from last processed time to catch any stragglers
  var lookbackMs = Math.max(
    lastProcessedTime - (2 * 60 * 60 * 1000),
    Date.now() - (2 * 60 * 60 * 1000)
  );
  var lookbackSeconds = Math.floor(lookbackMs / 1000);
  var query = SEARCH_QUERY + ' after:' + lookbackSeconds;

  var threads = GmailApp.search(query, 0, MAX_EMAILS_PER_RUN);

  if (threads.length === 0) {
    return; // Nothing to process
  }

  var newestTime = lastProcessedTime;
  var processedCount = 0;

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();

    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      var messageTime = message.getDate().getTime();

      // Skip already-processed messages (by timestamp)
      if (messageTime <= lastProcessedTime) {
        continue;
      }

      // Only process unread messages
      if (!message.isUnread()) {
        continue;
      }

      try {
        // Build the webhook payload matching the server's expected format
        var payload = {
          messageId: message.getId(),
          threadId: message.getThread().getId(),
          from: extractEmailAddress(message.getFrom()),
          fromName: extractName(message.getFrom()),
          subject: message.getSubject(),
          bodyText: message.getPlainBody(),
          bodyHtml: message.getBody(),
          date: message.getDate().toISOString(),
          secret: WEBHOOK_SECRET
        };

        // Send to webhook
        var success = sendWebhook(payload);

        if (success) {
          processedCount++;
          if (messageTime > newestTime) {
            newestTime = messageTime;
          }
        }
      } catch (e) {
        console.error('Error processing message ' + message.getId() + ': ' + e.message);
      }
    }
  }

  // Persist the newest timestamp so we don't reprocess these emails
  if (newestTime > lastProcessedTime) {
    properties.setProperty('LAST_PROCESSED_TIME', newestTime.toString());
  }

  if (processedCount > 0) {
    console.log('Processed ' + processedCount + ' new email(s).');
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function sendWebhook(payload) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    var code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      return true;
    } else {
      console.error('Webhook returned HTTP ' + code + ': ' + response.getContentText());
      return false;
    }
  } catch (e) {
    console.error('Webhook request failed: ' + e.message);
    return false;
  }
}

// ─── String helpers ──────────────────────────────────────────────────────────
/**
 * Extract email address from "Display Name <email@domain.com>" format.
 * Falls back to the raw string if no angle brackets are found.
 */
function extractEmailAddress(fromStr) {
  var match = fromStr.match(/<([^>]+)>/);
  return match ? match[1] : fromStr.trim();
}

/**
 * Extract display name from "Display Name <email@domain.com>" format.
 * Returns empty string if no name portion is found.
 */
function extractName(fromStr) {
  var match = fromStr.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/^"|"$/g, '') : '';
}

// ─── Setup & Teardown ────────────────────────────────────────────────────────

/**
 * Run this function ONCE to install the 1-minute trigger.
 * It will ask for Gmail + external URL permissions on first run.
 */
function setup() {
  // Remove any existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Create a time-driven trigger that fires every 1 minute
  ScriptApp.newTrigger('processNewEmails')
    .timeBased()
    .everyMinutes(1)
    .create();

  console.log('Setup complete! Trigger installed — checking inbox every 1 minute.');
}

/**
 * Run this function to remove all triggers and stop the script.
 */
function teardown() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  console.log('All triggers removed. Script is no longer running.');
}

/**
 * Run this function to reset the "last processed" timestamp.
 * Useful if you want to reprocess old emails.
 */
function resetTimestamp() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_PROCESSED_TIME');
  console.log('Timestamp reset. Next run will process all recent unread emails.');
}
