CREATE TABLE `agent_daily_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_name` varchar(100) NOT NULL,
	`date` date NOT NULL,
	`hours_tracked` decimal(5,2) NOT NULL DEFAULT '0',
	`working_day_value` decimal(3,2) NOT NULL DEFAULT '0',
	`hubstaff_user_id` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `agent_daily_hours_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_agent_date` UNIQUE(`agent_name`,`date`)
);
--> statement-breakpoint
CREATE TABLE `agent_trials_override` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_name` varchar(100) NOT NULL,
	`month` varchar(7) NOT NULL,
	`trials_count` int NOT NULL,
	`db_count_at_override` int NOT NULL DEFAULT 0,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_trials_override_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_trials_override_agent_month_unique` UNIQUE(`agent_name`,`month`)
);
--> statement-breakpoint
CREATE TABLE `agent_working_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_name` varchar(100) NOT NULL,
	`work_date` date NOT NULL,
	`hours` decimal(5,2) NOT NULL DEFAULT '0',
	`is_manual_override` boolean DEFAULT false,
	`month` varchar(7) NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `agent_working_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manual_overrides_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_name` varchar(100) NOT NULL,
	`work_date` date NOT NULL,
	`old_hours` decimal(5,2),
	`new_hours` decimal(5,2) NOT NULL,
	`changed_by` varchar(100) NOT NULL,
	`reason` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `manual_overrides_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opening_trials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscription_id` varchar(50) NOT NULL,
	`customer_name` varchar(255),
	`email` varchar(255),
	`agent_name` varchar(100) NOT NULL,
	`plan_name` varchar(255),
	`created_date` date NOT NULL,
	`status` varchar(50) NOT NULL,
	`classification` varchar(50) NOT NULL,
	`month` varchar(7) NOT NULL,
	`term_start` date,
	`term_end` date,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `opening_trials_id` PRIMARY KEY(`id`),
	CONSTRAINT `opening_trials_subscription_id_unique` UNIQUE(`subscription_id`)
);
--> statement-breakpoint
CREATE TABLE `support_ticket_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`body` text NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`sentBy` varchar(256) NOT NULL,
	CONSTRAINT `support_ticket_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `call_analyses` MODIFY COLUMN `transcript` mediumtext;--> statement-breakpoint
ALTER TABLE `call_analyses` MODIFY COLUMN `analysisJson` mediumtext;--> statement-breakpoint
ALTER TABLE `call_analyses` MODIFY COLUMN `errorMessage` mediumtext;--> statement-breakpoint
ALTER TABLE `call_analyses` MODIFY COLUMN `callType` enum('cold_call','follow_up','live_sub','pre_cycle_cancelled','pre_cycle_decline','end_of_instalment','from_cat','other','opening','retention_win_back','instalment_decline') DEFAULT 'cold_call';--> statement-breakpoint
ALTER TABLE `call_analyses` MODIFY COLUMN `wordTimestamps` mediumtext;--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `status` enum('new','open','working','assigned','done_deal','retained_sub','cancelled_sub','closed','skipped','do_not_call','no_answer','done') NOT NULL DEFAULT 'new';--> statement-breakpoint
ALTER TABLE `support_tickets` MODIFY COLUMN `ticketStatus` enum('open','in_progress','awaiting_response','resolved','closed') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `shareToken` varchar(64);--> statement-breakpoint
ALTER TABLE `contacts` ADD `department` enum('opening','retention') DEFAULT 'opening' NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `brands` varchar(512);--> statement-breakpoint
ALTER TABLE `contacts` ADD `stripeCustomerId` varchar(128);--> statement-breakpoint
ALTER TABLE `email_templates` ADD `headerImageUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `email_templates` ADD `visibility` text;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD CONSTRAINT `call_analyses_shareToken_unique` UNIQUE(`shareToken`);