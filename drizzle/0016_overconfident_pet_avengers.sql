CREATE TABLE `pitch_customizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`stage_num` int NOT NULL,
	`custom_content` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pitch_customizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `pitch_customizations_user_stage_unique` UNIQUE(`user_id`,`stage_num`)
);
