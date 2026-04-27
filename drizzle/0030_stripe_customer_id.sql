-- Migration: Add stripeCustomerId to contacts table
-- This column stores the Stripe Customer ID, set automatically when a
-- Stripe payment succeeds for a contact's email address.

ALTER TABLE `contacts`
  ADD COLUMN `stripeCustomerId` varchar(128) DEFAULT NULL;
