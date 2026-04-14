CREATE TABLE `email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`templateId` int NOT NULL,
	`templateName` varchar(256),
	`sentByUserId` int NOT NULL,
	`sentByName` varchar(256),
	`subject` varchar(512),
	`toEmail` varchar(320),
	`postmarkMessageId` varchar(128),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`htmlBody` text NOT NULL,
	`description` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`)
);
