ALTER TABLE `call_analyses` ADD `callDate` timestamp;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `closeStatus` enum('closed','not_closed','follow_up');