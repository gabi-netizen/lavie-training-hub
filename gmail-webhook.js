/**
 * Gmail Webhook Trigger for Lavie Training Hub
 * 
 * This script monitors the support@lavielabs.com inbox for new emails
 * and forwards them to the Lavie Training Hub server via a webhook.
 * 
 * It uses a time-driven trigger to run frequently (e.g., every minute)
 * but keeps track of the last processed email to avoid duplicates.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to https://script.google.com/ and create a new project
 * 2. Paste this entire code into Code.gs
 * 3. Update the WEBHOOK_URL variable below with your actual server URL
 * 4. Run the 'setup' function once manually (it will ask for permissions)
 * 5. The script will now run automatically every minute
 */

// Configuration
const WEBHOOK_URL = 'https://lavie-training-hub-production.up.railway.app/api/webhooks/gmail';
const WEBHOOK_SECRET = ''; // Optional: set to match GMAIL_WEBHOOK_SECRET on server
const SEARCH_QUERY = 'is:inbox is:unread'; // Only process unread emails in inbox
const MAX_EMAILS_PER_RUN = 10; // Prevent timeout if there's a backlog

/**
 * Main function to process new emails
 * This is the function that runs on the trigger
 */
function processNewEmails() {
  const properties = PropertiesService.getScriptProperties();
  const lastProcessedTime = parseInt(properties.getProperty('LAST_PROCESSED_TIME') || '0', 10);
  
  // Search for recent unread emails
  // We add a time filter to make the search more efficient, looking back 1 hour
  // from the last processed time, or 1 hour ago if never run
  const lookbackTime = Math.max(lastProcessedTime - (60 * 60 * 1000), Date.now() - (60 * 60 * 1000));
  const lookbackSeconds = Math.floor(lookbackTime / 1000);
  const query = `${SEARCH_QUERY} after:${lookbackSeconds}`;
  
  const threads = GmailApp.search(query, 0, MAX_EMAILS_PER_RUN);
  
  if (threads.length === 0) {
    return; // No new emails
  }
  
  let newestTime = lastProcessedTime;
  let processedCount = 0;
  
  for (const thread of threads) {
    const messages = thread.getMessages();
    
    for (const message of messages) {
      const messageTime = message.getDate().getTime();
      
      // Skip if we've already processed this message (based on time)
      // Note: This is a simple heuristic. The server also deduplicates by messageId.
      if (messageTime <= lastProcessedTime) {
        continue;
      }
      
      // Only process unread messages
      if (!message.isUnread()) {
        continue;
      }
      
      try {
        // Extract email data
        const payload = {
          messageId: message.getId(),
          senderEmail: extractEmailAddress(message.getFrom()),
          senderName: extractName(message.getFrom()),
          subject: message.getSubject(),
          body: message.getPlainBody(),
          receivedAt: message.getDate().toISOString(),
          secret: WEBHOOK_SECRET
        };
        
        // Send to webhook
        const success = sendWebhook(payload);
        
        if (success) {
          processedCount++;
          // Update newest time seen
          if (messageTime > newestTime) {
            newestTime = messageTime;
          }
          
          // Optional: Mark as read or add a label so we know it's processed
          // message.markRead(); 
        }
      } catch (e) {
        console.error(`Error processing message ${message.getId()}: ${e.message}`);
      }
    }
  }
  
  // Save the timestamp of the newest email we processed
  if (newestTime > lastProcessedTime) {
    properties.setProperty('LAST_PROCESSED_TIME', newestTime.toString());
  }
  
  console.log(`Processed ${processedCount} new emails.`);
}

/**
 * Sends the payload to the webhook URL
 */
function sendWebhook(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Don't throw exception on non-200 response
  };
  
  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 200 && responseCode < 300) {
      return true;
    } else {
      console.error(`Webhook failed with status ${responseCode}: ${response.getContentText()}`);
      return false;
    }
  } catch (e) {
    console.error(`Webhook request failed: ${e.message}`);
    return false;
  }
}

/**
 * Helper to extract just the email address from a "Name <email@domain.com>" string
 */
function extractEmailAddress(fromStr) {
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1] : fromStr;
}

/**
 * Helper to extract just the name from a "Name <email@domain.com>" string
 */
function extractName(fromStr) {
  const match = fromStr.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/^"|"$/g, '') : '';
}

/**
 * Run this function ONCE manually to set up the trigger
 */
function setup() {
  // Clear existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  
  // Create a new trigger to run every minute
  ScriptApp.newTrigger('processNewEmails')
    .timeBased()
    .everyMinutes(1)
    .create();
    
  console.log('Setup complete! The script will now run every minute.');
}

/**
 * Run this function to stop the script from running
 */
function teardown() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  console.log('Teardown complete. The script will no longer run automatically.');
}
