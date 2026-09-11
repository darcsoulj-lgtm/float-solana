ALTER TABLE `community_holdings` ADD `raw_amount` text;--> statement-breakpoint
ALTER TABLE `community_holdings` ADD `decimals` integer;--> statement-breakpoint
ALTER TABLE `community_holdings` ADD `ui_amount` text;--> statement-breakpoint
ALTER TABLE `community_members` ADD `bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_members` ADD `avatar_key` text;