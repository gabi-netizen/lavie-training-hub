-- Migration 003: Add smsOutreachSentAt column to contacts table
-- Used for SMS outreach auto-reset logic: contacts with status 'no_answer'
-- are automatically reset to 'new' 12 hours after SMS outreach was sent.

ALTER TABLE contacts ADD COLUMN smsOutreachSentAt TIMESTAMP NULL DEFAULT NULL;
