CREATE TABLE `inbound_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(256) NOT NULL,
	`senderEmail` varchar(320) NOT NULL,
	`senderName` varchar(256),
	`subject` varchar(512),
	`body` text,
	`receivedAt` timestamp,
	`status` enum('new','processing','done','error') NOT NULL DEFAULT 'new',
	`errorMessage` text,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `inbound_emails_messageId_unique` UNIQUE(`messageId`)
);
