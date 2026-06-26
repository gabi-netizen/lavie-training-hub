-- Create billing_plans table
CREATE TABLE IF NOT EXISTS `billing_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `type` enum('subscription','installment','one_time') NOT NULL,
  `phases` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add billingPlanId column to contacts table
ALTER TABLE `contacts` ADD COLUMN `billingPlanId` int DEFAULT NULL;
