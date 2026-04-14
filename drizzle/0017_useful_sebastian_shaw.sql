CREATE TABLE `form_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`cardholderName` varchar(256) NOT NULL,
	`cardLast4` varchar(4),
	`cardExpiry` varchar(8),
	`addressLine1` varchar(256),
	`addressLine2` varchar(256),
	`city` varchar(128),
	`postcode` varchar(16),
	`agentName` varchar(256),
	`status` enum('new','processed','failed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `form_submissions_id` PRIMARY KEY(`id`)
);
