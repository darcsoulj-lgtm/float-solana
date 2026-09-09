CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`plan` text NOT NULL,
	`organization` text NOT NULL,
	`email` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proofs` (
	`hash` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`wallet` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`wallet_hash` text NOT NULL,
	`answers` text NOT NULL,
	`cohort` text NOT NULL,
	`slot` integer NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_response_wallet` ON `responses` (`survey_id`,`wallet_hash`);--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`status` text DEFAULT 'unfunded' NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reward_response` ON `reward_claims` (`response_id`);--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`symbol` text NOT NULL,
	`questions` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`target` integer DEFAULT 100 NOT NULL,
	`reward_cents` integer DEFAULT 0 NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_surveys_owner` ON `surveys` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_surveys_status` ON `surveys` (`status`);