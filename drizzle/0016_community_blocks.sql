CREATE TABLE `community_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_blocks_pair` ON `community_blocks` (`blocker_id`,`blocked_id`);
--> statement-breakpoint
CREATE INDEX `idx_community_blocks_blocked` ON `community_blocks` (`blocked_id`);
