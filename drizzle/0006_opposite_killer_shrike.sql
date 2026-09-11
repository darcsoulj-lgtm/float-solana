ALTER TABLE `community_sessions` ADD `wallet` text;--> statement-breakpoint
ALTER TABLE `community_sessions` ADD `holdings_refresh_at` integer DEFAULT 0 NOT NULL;