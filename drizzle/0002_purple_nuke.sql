CREATE TABLE `community_bookmarks` (
	`member_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_bookmarks_member_target` ON `community_bookmarks` (`member_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `community_follows` (
	`member_id` text NOT NULL,
	`symbol` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_follows_member_symbol` ON `community_follows` (`member_id`,`symbol`);--> statement-breakpoint
CREATE TABLE `community_holdings` (
	`member_id` text NOT NULL,
	`symbol` text NOT NULL,
	`verified_at` integer NOT NULL,
	`slot` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_holdings_member_symbol` ON `community_holdings` (`member_id`,`symbol`);--> statement-breakpoint
CREATE TABLE `community_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`reply_id` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `community_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reply_id`) REFERENCES `community_replies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_notifications_member_created` ON `community_notifications` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `community_members` ADD `notify_replies` integer DEFAULT 1 NOT NULL;