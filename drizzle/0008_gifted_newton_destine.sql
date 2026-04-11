CREATE TABLE `contact_call_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`userId` int,
	`agentName` varchar(256),
	`note` text NOT NULL,
	`statusAtTime` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_call_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`email` varchar(320),
	`phone` varchar(64),
	`leadType` varchar(128),
	`status` enum('new','open','working','assigned','done_deal','retained_sub','cancelled_sub','closed') NOT NULL DEFAULT 'new',
	`agentName` varchar(256),
	`assignedUserId` int,
	`importedNotes` text,
	`source` varchar(128),
	`leadDate` timestamp,
	`callbackAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
