CREATE INDEX `idx_room_created` ON `community_rooms` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_community_threads_topic` ON `community_threads` (`topic`,`hidden`,`created_at`,`id`);
--> statement-breakpoint
INSERT OR IGNORE INTO community_sources(id,symbol,title,publisher,url,created_at) VALUES
('micron-ir','MU','Earnings, filings & investor updates','Micron','https://investors.micron.com/overview/default.aspx',1788994800000),
('skhynix-news','SKHY','Inside the memory industry','SK hynix Newsroom','https://news.skhynix.com/en/',1788994800000),
('nvidia-ir','NVDA','Results & company announcements','NVIDIA','https://investor.nvidia.com/home/default.aspx',1788994800000);

--> statement-breakpoint
INSERT OR IGNORE INTO community_rooms(id,name,name_key,description,creator_id,created_at)
SELECT topic,topic,'topic:' || lower(topic),'Community discussions',MIN(member_id),MIN(created_at)
FROM community_threads WHERE topic NOT IN (SELECT id FROM community_rooms) GROUP BY topic;
