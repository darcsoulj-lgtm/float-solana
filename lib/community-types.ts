import { TOKENS, type StockToken } from './tokens';
import type { RegistryStatus } from './token-registry';
export const COMMUNITY_CHANNELS = [
  {
    id: 'channel-market-talk',
    name: 'Market Talk',
    description: 'Market moves, the economy, portfolios and investing.',
  },
  {
    id: 'channel-crypto',
    name: 'Crypto',
    description: 'Crypto markets, tokens, protocols, DeFi and regulation.',
  },
  {
    id: 'channel-technology',
    name: 'Technology',
    description: 'AI, semiconductors, software, cloud and hardware.',
  },
  {
    id: 'channel-finance-real-estate',
    name: 'Finance & Real Estate',
    description: 'Banks, payments, insurance, brokers, property and REITs.',
  },
  {
    id: 'channel-energy-materials',
    name: 'Energy & Materials',
    description: 'Energy, utilities, renewables, metals and mining.',
  },
  {
    id: 'channel-healthcare',
    name: 'Healthcare',
    description: 'Biotech, pharmaceuticals, devices and health services.',
  },
  {
    id: 'channel-consumer-media',
    name: 'Consumer & Media',
    description: 'Retail, food, travel, cars, entertainment and gaming.',
  },
  {
    id: 'channel-industrials-space',
    name: 'Industrials & Space',
    description: 'Manufacturing, infrastructure, transport and aerospace.',
  },
  {
    id: 'channel-onchain-stocks',
    name: 'Onchain Stocks',
    description: 'Issuers, token rights, custody, minting and redemption.',
  },
  {
    id: 'channel-off-topic',
    name: 'Off Topic',
    description: 'Everyday conversation, questions, humor and everything else.',
  },
] as const;
export const communityTopics = (tokens: readonly StockToken[] = TOKENS) => [
  { id: 'all', label: 'All discussions' },
  { id: 'general', label: 'General' },
  ...COMMUNITY_CHANNELS.map((channel) => ({
    id: channel.id,
    label: channel.name,
  })),
  ...tokens.map((t) => ({
    id: t.symbol,
    label: t.symbol + ' · ' + t.shortName,
  })),
];
export const TOPICS = communityTopics();
export type CommunityMember = {
  id: string;
  alias: string;
  avatar_key?: string | null;
  bio?: string;
  qualifying_symbol: string;
  show_badge: number;
  show_value_badge?: number;
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
  value_tier?: string | null;
  value_tier_expires_at?: number;
};
export type CommunityPollOption = {
  id: string;
  label: string;
  position: number;
  vote_count: number | null;
  selected: boolean;
};
export type CommunityPoll = {
  closes_at: number | null;
  closed: boolean;
  results_visible: boolean;
  total_votes: number | null;
  options: CommunityPollOption[];
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
  poll?: CommunityPoll;
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
export type BlockedMember = {
  id: string;
  alias: string;
  avatar_key?: string | null;
};
export type CommunityRoom = {
  id: string;
  name: string;
  description: string;
  thread_count: number;
};
export type MemberHome = {
  registry?: RegistryStatus;
  holdingsRefreshAvailable: boolean;
  rooms: CommunityRoom[];
  holdings: Holding[];
  follows: string[];
  sources: CommunitySource[];
  notifications: CommunityNotification[];
  blockedMembers: BlockedMember[];
};
