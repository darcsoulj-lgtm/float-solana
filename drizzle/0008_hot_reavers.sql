ALTER TABLE `community_members` ADD `show_value_badge` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_members` ADD `value_tier` text;--> statement-breakpoint
ALTER TABLE `community_members` ADD `value_tier_expires_at` integer DEFAULT 0 NOT NULL;