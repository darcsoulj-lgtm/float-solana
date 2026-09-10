CREATE TABLE `content_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `editorial_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`published_at` integer NOT NULL,
	`event_date` text,
	`event_at` integer,
	`certainty` text DEFAULT 'confirmed' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`edit_token` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_editorial_kind_url` ON `editorial_items` (`kind`,`url`);--> statement-breakpoint
CREATE INDEX `idx_editorial_feed` ON `editorial_items` (`status`,`kind`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_editorial_calendar` ON `editorial_items` (`status`,`kind`,`event_date`);--> statement-breakpoint
CREATE TABLE `editorial_tags` (
	`item_id` text NOT NULL,
	`symbol` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_editorial_tag` ON `editorial_tags` (`item_id`,`symbol`);--> statement-breakpoint
CREATE INDEX `idx_editorial_symbol` ON `editorial_tags` (`symbol`,`item_id`);--> statement-breakpoint
CREATE TABLE `operation_counts` (
	`bucket` integer NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`count` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operation_bucket` ON `operation_counts` (`bucket`,`operation`,`outcome`);