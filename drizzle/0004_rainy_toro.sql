CREATE TABLE `community_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `community_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_room_name` ON `community_rooms` (`name_key`);--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `coverage` text DEFAULT 'direct' NOT NULL;