CREATE TABLE `call_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`repName` varchar(256),
	`audioFileKey` varchar(512) NOT NULL,
	`audioFileUrl` text NOT NULL,
	`fileName` varchar(256),
	`durationSeconds` float,
	`status` enum('pending','transcribing','analyzing','done','error') NOT NULL DEFAULT 'pending',
	`transcript` text,
	`repSpeechPct` float,
	`overallScore` float,
	`analysisJson` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `call_analyses_id` PRIMARY KEY(`id`)
);
