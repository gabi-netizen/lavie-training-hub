-- Campaign System: campaigns + campaign_sends tables
-- Migration: 0036_campaigns

CREATE TABLE `campaigns` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`channel` enum('whatsapp','sms') NOT NULL,
	`templateName` varchar(255),
	`messageBody` text,
	`campaignStatus` enum('draft','sending','completed','cancelled') NOT NULL DEFAULT 'draft',
	`audienceFilter` json,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`sentCount` int NOT NULL DEFAULT 0,
	`deliveredCount` int NOT NULL DEFAULT 0,
	`readCount` int NOT NULL DEFAULT 0,
	`repliedCount` int NOT NULL DEFAULT 0,
	`createdByUserId` int NOT NULL,
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_sends` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`contactId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`sendChannel` enum('whatsapp','sms') NOT NULL,
	`sendStatus` enum('pending','sent','delivered','read','replied','failed') NOT NULL DEFAULT 'pending',
	`twilioMessageSid` varchar(50),
	`errorMessage` text,
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`readAt` timestamp,
	`repliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_sends_id` PRIMARY KEY(`id`)
);
