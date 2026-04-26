CREATE TABLE `gmail_incoming_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(256) NOT NULL,
	`threadId` varchar(256),
	`fromEmail` varchar(320) NOT NULL,
	`fromName` varchar(256),
	`subject` varchar(512),
	`bodyText` text,
	`bodyHtml` text,
	`emailDate` timestamp,
	`status` enum('received','processed','error') NOT NULL DEFAULT 'received',
	`errorMessage` text,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gmail_incoming_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `gmail_incoming_emails_messageId_unique` UNIQUE(`messageId`)
);
