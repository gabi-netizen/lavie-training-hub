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

-- Insert May 2026 data (May 6th onwards only)
-- working_day_value: >= 7 hours = 1.00, < 7 hours = ROUND(hours/8, 2)

INSERT INTO agent_daily_hours (agent_name, date, hours_tracked, working_day_value) VALUES
('Alan Churchman', '2026-05-06', 8.11, 1.00),
('Ana Alipat', '2026-05-06', 9.01, 1.00),
('Angel Breheny', '2026-05-06', 6.01, 0.75),
('Ashleigh Walker', '2026-05-06', 7.33, 1.00),
('Ava Monroe', '2026-05-06', 8.02, 1.00),
('Carl Bennett', '2026-05-06', 0.00, 0.00),
('Daniel Parker', '2026-05-06', 2.93, 0.37),
('Darrell Loynes', '2026-05-06', 8.20, 1.00),
('Debbie Forbes', '2026-05-06', 8.16, 1.00),
('Dee Richards', '2026-05-06', 5.50, 0.69),
('Harrison Joslin', '2026-05-06', 7.14, 1.00),
('Julie Ann Relox', '2026-05-06', 5.09, 0.64),
('Matthew Holman', '2026-05-06', 8.45, 1.00),
('Muhammad Usama Waheed', '2026-05-06', 7.81, 1.00),
('Paige Taylor', '2026-05-06', 5.79, 0.72),
('Rob Chidzik', '2026-05-06', 7.82, 1.00),
('Shola Marie', '2026-05-06', 8.10, 1.00),
('Wendy Calderon', '2026-05-06', 9.95, 1.00)
ON DUPLICATE KEY UPDATE
  hours_tracked = VALUES(hours_tracked),
  working_day_value = VALUES(working_day_value);
