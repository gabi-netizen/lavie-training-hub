-- ============================================================================
-- Migration: Opening Dashboard Tables
-- Date: 2026-05-01
-- Branch: feature/opening-dashboard-db
-- Description: Creates tables for the Opening Dashboard and migrates
--              hardcoded April 2026 data from OpeningDashboard.tsx
-- ============================================================================

-- ─── Table 1: Opening trials data ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_trials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subscription_id VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(255),
  agent_name VARCHAR(100) NOT NULL,
  plan_name VARCHAR(255),
  created_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL,
  classification VARCHAR(50) NOT NULL,
  -- classification values: 'still_in_trial', 'live', 'saved_by_retention',
  --   'cancelled_after_payment', 'cancelled_before_payment', 'dunning', 'future_deal'
  month VARCHAR(7) NOT NULL, -- format: '2026-04'
  term_start DATE,
  term_end DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_month (agent_name, month),
  INDEX idx_month (month)
);

-- ─── Table 2: Agent working days from Hubstaff ───────────────────────────────
CREATE TABLE IF NOT EXISTS agent_working_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_manual_override BOOLEAN DEFAULT FALSE,
  month VARCHAR(7) NOT NULL, -- format: '2026-04'
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_agent_date (agent_name, work_date),
  INDEX idx_agent_month (agent_name, month)
);

-- ─── Table 3: Manual override log (for email alerts) ─────────────────────────
CREATE TABLE IF NOT EXISTS manual_overrides_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL,
  work_date DATE NOT NULL,
  old_hours DECIMAL(5,2),
  new_hours DECIMAL(5,2) NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  reason VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DATA MIGRATION: April 2026 Opening Trials
-- Source: OpeningDashboard.tsx APRIL_2026_DATA array
-- Subscription IDs are placeholders (MIGRATED-{agent}-{n})
-- ============================================================================

-- ─── Debbie: 75 trials ───────────────────────────────────────────────────────
-- stillInTrial: 50, live: 10, saved: 1, cancelledAfterPayment: 2,
-- cancelledBeforePayment: 11, dunning: 1, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Debbie-1', 'Customer Debbie-1', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-2', 'Customer Debbie-2', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-3', 'Customer Debbie-3', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-4', 'Customer Debbie-4', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-5', 'Customer Debbie-5', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-6', 'Customer Debbie-6', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-7', 'Customer Debbie-7', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-8', 'Customer Debbie-8', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-9', 'Customer Debbie-9', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-10', 'Customer Debbie-10', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-11', 'Customer Debbie-11', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-12', 'Customer Debbie-12', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-13', 'Customer Debbie-13', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-14', 'Customer Debbie-14', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-15', 'Customer Debbie-15', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-16', 'Customer Debbie-16', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-17', 'Customer Debbie-17', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-18', 'Customer Debbie-18', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-19', 'Customer Debbie-19', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-20', 'Customer Debbie-20', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-21', 'Customer Debbie-21', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-22', 'Customer Debbie-22', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-23', 'Customer Debbie-23', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-24', 'Customer Debbie-24', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-25', 'Customer Debbie-25', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-26', 'Customer Debbie-26', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-27', 'Customer Debbie-27', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-28', 'Customer Debbie-28', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-29', 'Customer Debbie-29', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-30', 'Customer Debbie-30', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-31', 'Customer Debbie-31', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-32', 'Customer Debbie-32', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-33', 'Customer Debbie-33', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-34', 'Customer Debbie-34', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-35', 'Customer Debbie-35', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-36', 'Customer Debbie-36', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-37', 'Customer Debbie-37', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-38', 'Customer Debbie-38', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-39', 'Customer Debbie-39', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-40', 'Customer Debbie-40', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-41', 'Customer Debbie-41', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-42', 'Customer Debbie-42', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-43', 'Customer Debbie-43', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-44', 'Customer Debbie-44', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-45', 'Customer Debbie-45', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-46', 'Customer Debbie-46', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-47', 'Customer Debbie-47', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-48', 'Customer Debbie-48', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-49', 'Customer Debbie-49', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-50', 'Customer Debbie-50', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Debbie-51', 'Customer Debbie-51', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-52', 'Customer Debbie-52', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-53', 'Customer Debbie-53', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-54', 'Customer Debbie-54', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-55', 'Customer Debbie-55', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-56', 'Customer Debbie-56', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-57', 'Customer Debbie-57', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-58', 'Customer Debbie-58', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-59', 'Customer Debbie-59', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-60', 'Customer Debbie-60', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Debbie-61', 'Customer Debbie-61', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'live', 'saved_by_retention', '2026-04'),
('MIGRATED-Debbie-62', 'Customer Debbie-62', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Debbie-63', 'Customer Debbie-63', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Debbie-64', 'Customer Debbie-64', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-65', 'Customer Debbie-65', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-66', 'Customer Debbie-66', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-67', 'Customer Debbie-67', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-68', 'Customer Debbie-68', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-69', 'Customer Debbie-69', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-70', 'Customer Debbie-70', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-71', 'Customer Debbie-71', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-72', 'Customer Debbie-72', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-73', 'Customer Debbie-73', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-74', 'Customer Debbie-74', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Debbie-75', 'Customer Debbie-75', 'Debbie', 'Free Trial £4.95', '2026-04-15', 'dunning', 'dunning', '2026-04');

-- ─── Ava: 36 trials ─────────────────────────────────────────────────────────
-- stillInTrial: 32, live: 0, saved: 1, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 3, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Ava-1', 'Customer Ava-1', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-2', 'Customer Ava-2', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-3', 'Customer Ava-3', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-4', 'Customer Ava-4', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-5', 'Customer Ava-5', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-6', 'Customer Ava-6', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-7', 'Customer Ava-7', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-8', 'Customer Ava-8', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-9', 'Customer Ava-9', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-10', 'Customer Ava-10', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-11', 'Customer Ava-11', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-12', 'Customer Ava-12', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-13', 'Customer Ava-13', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-14', 'Customer Ava-14', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-15', 'Customer Ava-15', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-16', 'Customer Ava-16', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-17', 'Customer Ava-17', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-18', 'Customer Ava-18', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-19', 'Customer Ava-19', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-20', 'Customer Ava-20', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-21', 'Customer Ava-21', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-22', 'Customer Ava-22', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-23', 'Customer Ava-23', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-24', 'Customer Ava-24', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-25', 'Customer Ava-25', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-26', 'Customer Ava-26', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-27', 'Customer Ava-27', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-28', 'Customer Ava-28', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-29', 'Customer Ava-29', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-30', 'Customer Ava-30', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-31', 'Customer Ava-31', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-32', 'Customer Ava-32', 'Ava', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ava-33', 'Customer Ava-33', 'Ava', 'Free Trial £4.95', '2026-04-15', 'live', 'saved_by_retention', '2026-04'),
('MIGRATED-Ava-34', 'Customer Ava-34', 'Ava', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ava-35', 'Customer Ava-35', 'Ava', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ava-36', 'Customer Ava-36', 'Ava', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Ashley: 23 trials ──────────────────────────────────────────────────────
-- stillInTrial: 18, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 5, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Ashley-1', 'Customer Ashley-1', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-2', 'Customer Ashley-2', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-3', 'Customer Ashley-3', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-4', 'Customer Ashley-4', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-5', 'Customer Ashley-5', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-6', 'Customer Ashley-6', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-7', 'Customer Ashley-7', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-8', 'Customer Ashley-8', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-9', 'Customer Ashley-9', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-10', 'Customer Ashley-10', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-11', 'Customer Ashley-11', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-12', 'Customer Ashley-12', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-13', 'Customer Ashley-13', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-14', 'Customer Ashley-14', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-15', 'Customer Ashley-15', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-16', 'Customer Ashley-16', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-17', 'Customer Ashley-17', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-18', 'Customer Ashley-18', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ashley-19', 'Customer Ashley-19', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ashley-20', 'Customer Ashley-20', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ashley-21', 'Customer Ashley-21', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ashley-22', 'Customer Ashley-22', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Ashley-23', 'Customer Ashley-23', 'Ashley', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Paige: 19 trials ───────────────────────────────────────────────────────
-- stillInTrial: 14, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 5, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Paige-1', 'Customer Paige-1', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-2', 'Customer Paige-2', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-3', 'Customer Paige-3', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-4', 'Customer Paige-4', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-5', 'Customer Paige-5', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-6', 'Customer Paige-6', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-7', 'Customer Paige-7', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-8', 'Customer Paige-8', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-9', 'Customer Paige-9', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-10', 'Customer Paige-10', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-11', 'Customer Paige-11', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-12', 'Customer Paige-12', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-13', 'Customer Paige-13', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-14', 'Customer Paige-14', 'Paige', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Paige-15', 'Customer Paige-15', 'Paige', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Paige-16', 'Customer Paige-16', 'Paige', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Paige-17', 'Customer Paige-17', 'Paige', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Paige-18', 'Customer Paige-18', 'Paige', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Paige-19', 'Customer Paige-19', 'Paige', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Ryan: 19 trials ────────────────────────────────────────────────────────
-- stillInTrial: 11, live: 3, saved: 1, cancelledAfterPayment: 3,
-- cancelledBeforePayment: 1, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Ryan-1', 'Customer Ryan-1', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-2', 'Customer Ryan-2', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-3', 'Customer Ryan-3', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-4', 'Customer Ryan-4', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-5', 'Customer Ryan-5', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-6', 'Customer Ryan-6', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-7', 'Customer Ryan-7', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-8', 'Customer Ryan-8', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-9', 'Customer Ryan-9', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-10', 'Customer Ryan-10', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-11', 'Customer Ryan-11', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Ryan-12', 'Customer Ryan-12', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Ryan-13', 'Customer Ryan-13', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Ryan-14', 'Customer Ryan-14', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Ryan-15', 'Customer Ryan-15', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'live', 'saved_by_retention', '2026-04'),
('MIGRATED-Ryan-16', 'Customer Ryan-16', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Ryan-17', 'Customer Ryan-17', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Ryan-18', 'Customer Ryan-18', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Ryan-19', 'Customer Ryan-19', 'Ryan', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Harrison: 14 trials ────────────────────────────────────────────────────
-- stillInTrial: 12, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 2, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Harrison-1', 'Customer Harrison-1', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-2', 'Customer Harrison-2', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-3', 'Customer Harrison-3', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-4', 'Customer Harrison-4', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-5', 'Customer Harrison-5', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-6', 'Customer Harrison-6', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-7', 'Customer Harrison-7', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-8', 'Customer Harrison-8', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-9', 'Customer Harrison-9', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-10', 'Customer Harrison-10', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-11', 'Customer Harrison-11', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-12', 'Customer Harrison-12', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Harrison-13', 'Customer Harrison-13', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Harrison-14', 'Customer Harrison-14', 'Harrison', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Angel: 13 trials ───────────────────────────────────────────────────────
-- stillInTrial: 10, live: 0, saved: 0, cancelledAfterPayment: 2,
-- cancelledBeforePayment: 1, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Angel-1', 'Customer Angel-1', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-2', 'Customer Angel-2', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-3', 'Customer Angel-3', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-4', 'Customer Angel-4', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-5', 'Customer Angel-5', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-6', 'Customer Angel-6', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-7', 'Customer Angel-7', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-8', 'Customer Angel-8', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-9', 'Customer Angel-9', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-10', 'Customer Angel-10', 'Angel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Angel-11', 'Customer Angel-11', 'Angel', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Angel-12', 'Customer Angel-12', 'Angel', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Angel-13', 'Customer Angel-13', 'Angel', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Matt: 13 trials ────────────────────────────────────────────────────────
-- stillInTrial: 3, live: 4, saved: 0, cancelledAfterPayment: 3,
-- cancelledBeforePayment: 3, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Matt-1', 'Customer Matt-1', 'Matt', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Matt-2', 'Customer Matt-2', 'Matt', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Matt-3', 'Customer Matt-3', 'Matt', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Matt-4', 'Customer Matt-4', 'Matt', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Matt-5', 'Customer Matt-5', 'Matt', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Matt-6', 'Customer Matt-6', 'Matt', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Matt-7', 'Customer Matt-7', 'Matt', 'Free Trial £4.95', '2026-04-15', 'live', 'live', '2026-04'),
('MIGRATED-Matt-8', 'Customer Matt-8', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Matt-9', 'Customer Matt-9', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Matt-10', 'Customer Matt-10', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04'),
('MIGRATED-Matt-11', 'Customer Matt-11', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Matt-12', 'Customer Matt-12', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04'),
('MIGRATED-Matt-13', 'Customer Matt-13', 'Matt', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── Darrel: 8 trials ───────────────────────────────────────────────────────
-- stillInTrial: 8, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 0, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Darrel-1', 'Customer Darrel-1', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-2', 'Customer Darrel-2', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-3', 'Customer Darrel-3', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-4', 'Customer Darrel-4', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-5', 'Customer Darrel-5', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-6', 'Customer Darrel-6', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-7', 'Customer Darrel-7', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Darrel-8', 'Customer Darrel-8', 'Darrel', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04');

-- ─── Nisha: 7 trials ────────────────────────────────────────────────────────
-- stillInTrial: 6, live: 0, saved: 1, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 0, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Nisha-1', 'Customer Nisha-1', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-2', 'Customer Nisha-2', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-3', 'Customer Nisha-3', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-4', 'Customer Nisha-4', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-5', 'Customer Nisha-5', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-6', 'Customer Nisha-6', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Nisha-7', 'Customer Nisha-7', 'Nisha', 'Free Trial £4.95', '2026-04-15', 'live', 'saved_by_retention', '2026-04');

-- ─── Shola: 6 trials ────────────────────────────────────────────────────────
-- stillInTrial: 6, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 0, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Shola-1', 'Customer Shola-1', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Shola-2', 'Customer Shola-2', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Shola-3', 'Customer Shola-3', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Shola-4', 'Customer Shola-4', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Shola-5', 'Customer Shola-5', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04'),
('MIGRATED-Shola-6', 'Customer Shola-6', 'Shola', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04');

-- ─── Sara: 1 trial ──────────────────────────────────────────────────────────
-- stillInTrial: 0, live: 0, saved: 0, cancelledAfterPayment: 1,
-- cancelledBeforePayment: 0, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Sara-1', 'Customer Sara-1', 'Sara', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_after_payment', '2026-04');

-- ─── Yasmeen: 1 trial ───────────────────────────────────────────────────────
-- stillInTrial: 0, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 1, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-Yasmeen-1', 'Customer Yasmeen-1', 'Yasmeen', 'Free Trial £4.95', '2026-04-15', 'cancelled', 'cancelled_before_payment', '2026-04');

-- ─── gabi@lavielabs.com: 1 trial ────────────────────────────────────────────
-- stillInTrial: 1, live: 0, saved: 0, cancelledAfterPayment: 0,
-- cancelledBeforePayment: 0, dunning: 0, futureDeal: 0
INSERT INTO opening_trials (subscription_id, customer_name, agent_name, plan_name, created_date, status, classification, month) VALUES
('MIGRATED-gabi@lavielabs.com-1', 'Customer gabi-1', 'gabi@lavielabs.com', 'Free Trial £4.95', '2026-04-15', 'trial', 'still_in_trial', '2026-04');

-- ============================================================================
-- DATA MIGRATION: April 2026 Agent Working Days (from Hubstaff)
-- One summary row per agent for the month
-- work_date = 2026-04-30 (end of month summary)
-- hours = working_days * 8
-- ============================================================================

INSERT INTO agent_working_days (agent_name, work_date, hours, is_manual_override, month) VALUES
('Debbie', '2026-04-30', 132.08, FALSE, '2026-04'),
('Ava', '2026-04-30', 120.00, FALSE, '2026-04'),
('Ashley', '2026-04-30', 108.32, FALSE, '2026-04'),
('Paige', '2026-04-30', 87.04, FALSE, '2026-04'),
('Ryan', '2026-04-30', 0.00, FALSE, '2026-04'),
('Harrison', '2026-04-30', 106.32, FALSE, '2026-04'),
('Angel', '2026-04-30', 0.00, FALSE, '2026-04'),
('Matt', '2026-04-30', 152.00, FALSE, '2026-04'),
('Nisha', '2026-04-30', 0.00, FALSE, '2026-04'),
('Shola', '2026-04-30', 60.96, FALSE, '2026-04'),
('Sara', '2026-04-30', 0.00, FALSE, '2026-04'),
('Darrel', '2026-04-30', 54.56, FALSE, '2026-04'),
('Yasmeen', '2026-04-30', 0.00, FALSE, '2026-04'),
('gabi@lavielabs.com', '2026-04-30', 0.00, FALSE, '2026-04');

-- ============================================================================
-- ROLLBACK (if needed):
-- DROP TABLE IF EXISTS manual_overrides_log;
-- DROP TABLE IF EXISTS agent_working_days;
-- DROP TABLE IF EXISTS opening_trials;
-- ============================================================================
