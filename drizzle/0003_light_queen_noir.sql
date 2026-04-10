CREATE TABLE `ai_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysisId` int NOT NULL,
	`userId` int NOT NULL,
	`section` enum('overall','script_compliance','tone','talk_ratio','recommendations','transcript','other') NOT NULL,
	`issue` varchar(512) NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_feedback_id` PRIMARY KEY(`id`)
);
