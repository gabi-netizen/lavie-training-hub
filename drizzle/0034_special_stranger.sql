CREATE TABLE `blocked_senders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`blockedAt` timestamp NOT NULL DEFAULT (now()),
	`blockedBy` varchar(256) NOT NULL,
	CONSTRAINT `blocked_senders_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_senders_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `blocked_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(500) NOT NULL,
	`blockedAt` timestamp NOT NULL DEFAULT (now()),
	`blockedBy` varchar(256) NOT NULL,
	CONSTRAINT `blocked_subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_subjects_keyword_unique` UNIQUE(`keyword`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_conversation_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`assignedUserId` int NOT NULL,
	`assignedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_conversation_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`conversationStatus` enum('open','snoozed','resolved') NOT NULL DEFAULT 'open',
	`snoozedUntil` timestamp,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_conversations_contactId_unique` UNIQUE(`contactId`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int,
	`direction` enum('inbound','outbound') NOT NULL,
	`body` text,
	`templateName` text,
	`sentByUserId` int,
	`fromNumber` text NOT NULL,
	`toNumber` text NOT NULL,
	`twilioMessageSid` text,
	`messageStatus` enum('sent','delivered','read','failed','received') NOT NULL DEFAULT 'sent',
	`isRead` boolean NOT NULL DEFAULT false,
	`mediaUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `support_tickets` MODIFY COLUMN `ticketStatus` enum('open','in_progress','awaiting_response','customer_replied','resolved','closed') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `team` enum('opening','retention','academy');--> statement-breakpoint
ALTER TABLE `gmail_incoming_emails` ADD `recipient` varchar(320);--> statement-breakpoint
ALTER TABLE `lead_assignments` ADD `contactId` int;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `recipient` varchar(320);