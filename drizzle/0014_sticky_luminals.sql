CREATE TABLE `phone_numbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`status` enum('pool','active','spam') NOT NULL DEFAULT 'pool',
	`assignedUserId` int,
	`assignedAgentName` varchar(256),
	`cloudtalkNumberId` varchar(64),
	`notes` text,
	`spamMarkedAt` timestamp,
	`assignedAt` timestamp,
	`historyJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phone_numbers_id` PRIMARY KEY(`id`),
	CONSTRAINT `phone_numbers_number_unique` UNIQUE(`number`)
);
