CREATE TABLE `call_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` varchar(128) NOT NULL,
	`agentName` varchar(128),
	`result` varchar(32),
	`note` text,
	`callbackAt` float,
	`followUpAt` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `lead_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` varchar(128) NOT NULL,
	`customerId` varchar(128),
	`customerName` varchar(256),
	`email` varchar(320),
	`phone` varchar(64),
	`leadCategory` varchar(32) DEFAULT 'subscription',
	`leadType` varchar(64),
	`planName` varchar(256),
	`billingCycles` int DEFAULT 0,
	`cyclesCompleted` int DEFAULT 0,
	`totalSpend` float DEFAULT 0,
	`monthlyAmount` float DEFAULT 0,
	`currencyCode` varchar(8) DEFAULT 'GBP',
	`billingStatus` varchar(32),
	`retryAttempts` int DEFAULT 0,
	`urgencyScore` int DEFAULT 0,
	`urgencyFlags` text,
	`eventDate` varchar(32),
	`assignedAgent` varchar(128),
	`assignedAt` float,
	`workStatus` varchar(32) DEFAULT 'new',
	`statusChangedAt` float,
	`managerNote` text,
	`agentNote` text,
	`attemptCount` int DEFAULT 0,
	`noAnswerCount` int DEFAULT 0,
	`lastCallAt` float,
	`lastCallResult` varchar(32),
	`callbackAt` float,
	`followUpAt` float,
	`followUpNote` text,
	`lastTransactionDate` varchar(32),
	`lastShipmentDate` varchar(32),
	`cancelledAt` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lead_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_assignments_subscriptionId_unique` UNIQUE(`subscriptionId`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gmailEmailId` int,
	`messageId` varchar(256),
	`fromEmail` varchar(320) NOT NULL,
	`fromName` varchar(256),
	`subject` varchar(512),
	`body` text,
	`receivedAt` timestamp,
	`category` enum('cancellation_request','shipping_delivery_issue','payment_billing_dispute','address_update','product_feedback','agent_forwarded','system_automated','follow_up_unanswered','subscription_question','general_inquiry') NOT NULL DEFAULT 'general_inquiry',
	`priority` enum('HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
	`customerStatus` enum('existing','new','internal','system') NOT NULL DEFAULT 'new',
	`ticketStatus` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`assignedTo` varchar(256),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_messageId_unique` UNIQUE(`messageId`)
);
--> statement-breakpoint
ALTER TABLE `form_submissions` MODIFY COLUMN `cardholderName` varchar(256) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `contactName` varchar(256);--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `externalNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `form_submissions` ADD `stripePaymentIntentId` varchar(128);--> statement-breakpoint
ALTER TABLE `form_submissions` ADD `paymentMethod` varchar(32);