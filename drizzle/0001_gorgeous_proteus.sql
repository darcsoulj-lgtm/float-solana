CREATE TABLE `community_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`symbol` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_hash` text NOT NULL,
	`alias` text NOT NULL,
	`qualifying_symbol` text NOT NULL,
	`show_badge` integer DEFAULT 0 NOT NULL,
	`verified_until` integer NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_wallet` ON `community_members` (`wallet_hash`);--> statement-breakpoint
CREATE TABLE `community_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`member_id` text NOT NULL,
	`body` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `community_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_replies_thread` ON `community_replies` (`thread_id`,`hidden`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_report_unique` ON `community_reports` (`member_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_community_report_status` ON `community_reports` (`status`);--> statement-breakpoint
CREATE TABLE `community_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_sessions_member` ON `community_sessions` (`member_id`);--> statement-breakpoint
CREATE TABLE `community_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`topic` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_threads_feed` ON `community_threads` (`hidden`,`created_at`);