import { TOKENS } from './tokens';
export const TOPICS = [
  { id: 'all', label: 'All discussions' },
  { id: 'general', label: 'General' },
  ...TOKENS.map((t) => ({
    id: t.symbol,
    label: t.symbol + ' · ' + t.shortName,
  })),
];
export type CommunityMember = {
  id: string;
  alias: string;
  avatar_key?: string | null;
  bio?: string;
  qualifying_symbol: string;
  show_badge: number;
  notify_replies: number;
  verified_until: number;
  suspended: number;
  created_at: number;
};
export type CommunityAuthor = {
  member_id: string;
  alias: string;
  avatar_key?: string | null;
  bio?: string;
  badge: string | null;
};
export type CommunityThread = CommunityAuthor & {
  id: string;
  topic: string;
  room_name?: string;
  title: string;
  body: string;
  created_at: number;
  reply_count: number;
  hidden: number;
  saved: number;
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
  sources: (CommunitySource & { active: number })[];
  reports: CommunityReport[];
  members: CommunityMember[];
  hiddenThreads: CommunityThread[];
  hiddenReplies: CommunityReply[];
};

export type Holding = {
  symbol: string;
  verified_at: number;
  slot: number;
  raw_amount?: string | null;
  decimals?: number | null;
  ui_amount?: string | null;
};
export type CommunitySource = {
  id: string;
  symbol: string;
  title: string;
  publisher: string;
  url: string;
  saved: number;
};
export type CommunityNotification = {
  id: string;
  thread_id: string;
  title: string;
  alias: string;
  avatar_key?: string | null;
  bio?: string;
  read: number;
  created_at: number;
};
export type CommunityRoom = {
  id: string;
  name: string;
  description: string;
  thread_count: number;
};
export type MemberHome = {
  holdingsRefreshAvailable: boolean;
  rooms: CommunityRoom[];
  holdings: Holding[];
  follows: string[];
  sources: CommunitySource[];
  notifications: CommunityNotification[];
};
