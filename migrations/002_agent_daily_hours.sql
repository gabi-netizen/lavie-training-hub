-- Migration 002: Create agent_daily_hours table for daily Hubstaff activity tracking
-- working_day_value logic:
--   hours_tracked >= 7 → 1.00
--   hours_tracked < 7 → hours_tracked / 8 (rounded to 2 decimals)

CREATE TABLE IF NOT EXISTS agent_daily_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  hours_tracked DECIMAL(5,2) NOT NULL DEFAULT 0,
  working_day_value DECIMAL(3,2) NOT NULL DEFAULT 0,
  hubstaff_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_agent_date (agent_name, date)
);

-- Insert May 2026 data
-- working_day_value: >= 7 hours = 1.00, < 7 hours = ROUND(hours/8, 2)

INSERT INTO agent_daily_hours (agent_name, date, hours_tracked, working_day_value) VALUES
-- Alan Churchman
('Alan Churchman', '2026-05-01', 8.08, 1.00),
('Alan Churchman', '2026-05-05', 7.60, 1.00),
('Alan Churchman', '2026-05-06', 8.11, 1.00),
-- Ana Alipat
('Ana Alipat', '2026-05-01', 8.71, 1.00),
('Ana Alipat', '2026-05-05', 8.91, 1.00),
('Ana Alipat', '2026-05-06', 9.01, 1.00),
-- Angel Breheny
('Angel Breheny', '2026-05-01', 8.21, 1.00),
('Angel Breheny', '2026-05-05', 6.01, 0.75),
('Angel Breheny', '2026-05-06', 6.01, 0.75),
-- Ashleigh Walker
('Ashleigh Walker', '2026-05-01', 5.15, 0.64),
('Ashleigh Walker', '2026-05-05', 7.26, 1.00),
('Ashleigh Walker', '2026-05-06', 7.33, 1.00),
-- Ava Monroe
('Ava Monroe', '2026-05-01', 8.02, 1.00),
('Ava Monroe', '2026-05-05', 8.47, 1.00),
('Ava Monroe', '2026-05-06', 8.02, 1.00),
-- Carl Bennett
('Carl Bennett', '2026-05-06', 0.00, 0.00),
-- Daniel Parker
('Daniel Parker', '2026-05-06', 2.93, 0.37),
-- Darrell Loynes
('Darrell Loynes', '2026-05-01', 8.60, 1.00),
('Darrell Loynes', '2026-05-05', 8.20, 1.00),
('Darrell Loynes', '2026-05-06', 8.20, 1.00),
-- Debbie Forbes
('Debbie Forbes', '2026-05-05', 8.08, 1.00),
('Debbie Forbes', '2026-05-06', 8.16, 1.00),
-- Dee Richards
('Dee Richards', '2026-05-06', 5.50, 0.69),
-- Harrison Joslin
('Harrison Joslin', '2026-05-01', 8.04, 1.00),
('Harrison Joslin', '2026-05-05', 8.00, 1.00),
('Harrison Joslin', '2026-05-06', 7.14, 1.00),
-- Julie Ann Relox
('Julie Ann Relox', '2026-05-01', 5.08, 0.64),
('Julie Ann Relox', '2026-05-04', 3.31, 0.41),
('Julie Ann Relox', '2026-05-05', 6.10, 0.76),
('Julie Ann Relox', '2026-05-06', 5.09, 0.64),
-- Matthew Holman
('Matthew Holman', '2026-05-01', 9.13, 1.00),
('Matthew Holman', '2026-05-05', 9.24, 1.00),
('Matthew Holman', '2026-05-06', 8.45, 1.00),
-- Muhammad Usama Waheed
('Muhammad Usama Waheed', '2026-05-02', 0.18, 0.02),
('Muhammad Usama Waheed', '2026-05-04', 9.57, 1.00),
('Muhammad Usama Waheed', '2026-05-06', 7.81, 1.00),
-- Paige Taylor
('Paige Taylor', '2026-05-01', 6.71, 0.84),
('Paige Taylor', '2026-05-05', 6.95, 0.87),
('Paige Taylor', '2026-05-06', 5.79, 0.72),
-- Rob Chidzik
('Rob Chidzik', '2026-05-01', 8.40, 1.00),
('Rob Chidzik', '2026-05-05', 8.40, 1.00),
('Rob Chidzik', '2026-05-06', 7.82, 1.00),
-- Shola Marie
('Shola Marie', '2026-05-01', 6.65, 0.83),
('Shola Marie', '2026-05-06', 8.10, 1.00),
-- Wendy Calderon
('Wendy Calderon', '2026-05-01', 7.02, 1.00),
('Wendy Calderon', '2026-05-04', 6.35, 0.79),
('Wendy Calderon', '2026-05-05', 10.47, 1.00),
('Wendy Calderon', '2026-05-06', 9.95, 1.00)
ON DUPLICATE KEY UPDATE
  hours_tracked = VALUES(hours_tracked),
  working_day_value = VALUES(working_day_value);
