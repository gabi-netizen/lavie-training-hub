ALTER TABLE `call_analyses` ADD `source` enum('manual','webhook') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `cloudtalkCallId` varchar(128);--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `contactId` int;