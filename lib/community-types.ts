export const TOPICS = [
  { id: 'all', label: 'All discussions' },
  { id: 'general', label: 'General' },
  { id: 'MU', label: 'MU · Micron' },
  { id: 'SKHY', label: 'SKHY · SK Hynix' },
  { id: 'SPCX', label: 'SPCX · SpaceX' },
] as const;
export type CommunityMember = {
  id: string;
  alias: string;
  qualifying_symbol: string;
  show_badge: number;
  verified_until: number;
  suspended: number;
  created_at: number;
};
export type CommunityAuthor = {
  member_id: string;
  alias: string;
  badge: string | null;
};
export type CommunityThread = CommunityAuthor & {
  id: string;
  topic: string;
  title: string;
  body: string;
  created_at: number;
  reply_count: number;
  hidden: number;
};
export type CommunityReply = CommunityAuthor & {
  id: string;
  thread_id: string;
  body: string;
  created_at: number;
  hidden: number;
};
export type CommunityStatus = {
  member: CommunityMember | null;
  memberCount: number;
  threadCount: number;
  admin: boolean;
};
export type ThreadPage = {
  threads: CommunityThread[];
  nextCursor: string | null;
};
export type ReplyPage = {
  replies: CommunityReply[];
  nextCursor: string | null;
};
export type CommunityReport = {
  id: string;
  target_type: 'thread' | 'reply';
  target_id: string;
  reason: string;
  status: string;
  created_at: number;
  reporter: string;
  content: string | null;
};
export type ModerationData = {
  reports: CommunityReport[];
  members: CommunityMember[];
  hiddenThreads: CommunityThread[];
  hiddenReplies: CommunityReply[];
};
