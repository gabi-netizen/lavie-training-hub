ALTER TABLE `call_analyses` ADD `saved` boolean;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `upsellAttempted` boolean;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `upsellSucceeded` boolean;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `cancelReason` varchar(128);