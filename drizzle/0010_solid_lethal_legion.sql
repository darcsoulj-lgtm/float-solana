ALTER TABLE `community_rooms` ADD `thread_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE community_rooms SET thread_count=(SELECT count(*) FROM community_threads WHERE topic=community_rooms.id AND hidden=0);
--> statement-breakpoint
CREATE TRIGGER community_room_thread_insert AFTER INSERT ON community_threads
BEGIN
  UPDATE community_rooms SET thread_count=thread_count+(NEW.hidden=0) WHERE id=NEW.topic;
END;
--> statement-breakpoint
CREATE TRIGGER community_room_thread_delete AFTER DELETE ON community_threads
BEGIN
  UPDATE community_rooms SET thread_count=thread_count-(OLD.hidden=0) WHERE id=OLD.topic;
END;
--> statement-breakpoint
CREATE TRIGGER community_room_thread_change AFTER UPDATE OF hidden,topic ON community_threads
WHEN OLD.hidden!=NEW.hidden OR OLD.topic!=NEW.topic
BEGIN
  UPDATE community_rooms SET thread_count=thread_count-(OLD.hidden=0) WHERE id=OLD.topic;
  UPDATE community_rooms SET thread_count=thread_count+(NEW.hidden=0) WHERE id=NEW.topic;
END;
