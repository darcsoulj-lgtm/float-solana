CREATE TABLE `community_polls` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`closes_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `community_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `community_poll_options` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `community_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_poll_options_thread` ON `community_poll_options` (`thread_id`,`position`);
--> statement-breakpoint
CREATE TABLE `community_poll_votes` (
	`thread_id` text NOT NULL,
	`member_id` text NOT NULL,
	`option_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `community_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`option_id`) REFERENCES `community_poll_options`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_poll_vote_once` ON `community_poll_votes` (`thread_id`,`member_id`);
--> statement-breakpoint
CREATE INDEX `idx_community_poll_votes_option` ON `community_poll_votes` (`option_id`);
