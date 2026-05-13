CREATE TABLE `agent_trials_override` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_name` varchar(100) NOT NULL,
	`month` varchar(7) NOT NULL,
	`trials_count` int NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_trials_override_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_trials_override_agent_month_unique` UNIQUE(`agent_name`,`month`)
);
