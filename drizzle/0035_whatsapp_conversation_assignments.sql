CREATE TABLE `whatsapp_conversation_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`assignedUserId` int NOT NULL,
	`assignedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_conversation_assignments_id` PRIMARY KEY(`id`)
);
