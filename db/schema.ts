import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
export const surveys = sqliteTable(
  'surveys',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    symbol: text('symbol').notNull(),
    questions: text('questions').notNull(),
    status: text('status').notNull().default('draft'),
    demo: integer('demo').notNull().default(0),
    target: integer('target').notNull().default(100),
    rewardCents: integer('reward_cents').notNull().default(0),
    salt: text('salt').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_surveys_owner').on(t.ownerId),
    index('idx_surveys_status').on(t.status),
  ],
);
export const responses = sqliteTable(
  'responses',
  {
    id: text('id').primaryKey(),
    surveyId: text('survey_id')
      .notNull()
      .references(() => surveys.id),
    walletHash: text('wallet_hash').notNull(),
    answers: text('answers').notNull(),
    cohort: text('cohort').notNull(),
    slot: integer('slot').notNull(),
    verifiedAt: integer('verified_at').notNull(),
    createdAt: integer('created_at').notNull(),
    demo: integer('demo').notNull().default(0),
  },
  (t) => [uniqueIndex('idx_response_wallet').on(t.surveyId, t.walletHash)],
);
export const challenges = sqliteTable('challenges', {
  id: text('id').primaryKey(),
  surveyId: text('survey_id')
    .notNull()
    .references(() => surveys.id),
  wallet: text('wallet').notNull(),
  message: text('message').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumed: integer('consumed').notNull().default(0),
});
export const proofs = sqliteTable('proofs', {
  hash: text('hash').primaryKey(),
  surveyId: text('survey_id')
    .notNull()
    .references(() => surveys.id),
  wallet: text('wallet').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const rewardClaims = sqliteTable(
  'reward_claims',
  {
    id: text('id').primaryKey(),
    responseId: text('response_id')
      .notNull()
      .references(() => responses.id),
    status: text('status').notNull().default('unfunded'),
    amountCents: integer('amount_cents').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_reward_response').on(t.responseId)],
);
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  plan: text('plan').notNull(),
  organization: text('organization').notNull(),
  email: text('email').notNull(),
  notes: text('notes').notNull(),
  status: text('status').notNull().default('requested'),
  createdAt: integer('created_at').notNull(),
});
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const limits = sqliteTable('limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

// Community tables are additive: existing research records remain intact.
export const communityMembers = sqliteTable(
  'community_members',
  {
    id: text('id').primaryKey(),
    walletHash: text('wallet_hash').notNull(),
    alias: text('alias').notNull(),
    qualifyingSymbol: text('qualifying_symbol').notNull(),
    showBadge: integer('show_badge').notNull().default(0),
    notifyReplies: integer('notify_replies').notNull().default(1),
    verifiedUntil: integer('verified_until').notNull(),
    suspended: integer('suspended').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_community_wallet').on(t.walletHash)],
);
export const communityChallenges = sqliteTable('community_challenges', {
  id: text('id').primaryKey(),
  wallet: text('wallet').notNull(),
  symbol: text('symbol').notNull(),
  message: text('message').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumed: integer('consumed').notNull().default(0),
});
export const communitySessions = sqliteTable(
  'community_sessions',
  {
    hash: text('hash').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_community_sessions_member').on(t.memberId)],
);
export const communityThreads = sqliteTable(
  'community_threads',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    hidden: integer('hidden').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_community_threads_feed').on(t.hidden, t.createdAt)],
);
export const communityReplies = sqliteTable(
  'community_replies',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => communityThreads.id),
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    body: text('body').notNull(),
    hidden: integer('hidden').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_community_replies_thread').on(t.threadId, t.hidden, t.createdAt),
  ],
);
export const communityReports = sqliteTable(
  'community_reports',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_community_report_unique').on(
      t.memberId,
      t.targetType,
      t.targetId,
    ),
    index('idx_community_report_status').on(t.status),
  ],
);

export const communityHoldings = sqliteTable(
  'community_holdings',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    symbol: text('symbol').notNull(),
    verifiedAt: integer('verified_at').notNull(),
    slot: integer('slot').notNull(),
  },
  (t) => [
    uniqueIndex('idx_community_holdings_member_symbol').on(
      t.memberId,
      t.symbol,
    ),
  ],
);
export const communityFollows = sqliteTable(
  'community_follows',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    symbol: text('symbol').notNull(),
  },
  (t) => [
    uniqueIndex('idx_community_follows_member_symbol').on(t.memberId, t.symbol),
  ],
);
export const communityBookmarks = sqliteTable(
  'community_bookmarks',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_community_bookmarks_member_target').on(
      t.memberId,
      t.targetType,
      t.targetId,
    ),
  ],
);
export const communitySources = sqliteTable('community_sources', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull(),
  title: text('title').notNull(),
  publisher: text('publisher').notNull(),
  url: text('url').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});
export const communityNotifications = sqliteTable(
  'community_notifications',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => communityMembers.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => communityThreads.id),
    replyId: text('reply_id')
      .notNull()
      .references(() => communityReplies.id),
    read: integer('read').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_community_notifications_member_created').on(
      t.memberId,
      t.createdAt,
    ),
  ],
);

export const editorialItems = sqliteTable(
  'editorial_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    publisher: text('publisher').notNull(),
    url: text('url').notNull(),
    publishedAt: integer('published_at').notNull(),
    eventDate: text('event_date'),
    eventAt: integer('event_at'),
    certainty: text('certainty').notNull().default('confirmed'),
    status: text('status').notNull().default('draft'),
    featured: integer('featured').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    coverage: text('coverage').notNull().default('direct'),
    editToken: text('edit_token').notNull().default(''),
  },
  (t) => [
    uniqueIndex('idx_editorial_kind_url').on(t.kind, t.url),
    index('idx_editorial_feed').on(t.status, t.kind, t.publishedAt),
    index('idx_editorial_calendar').on(t.status, t.kind, t.eventDate),
  ],
);
export const editorialTags = sqliteTable(
  'editorial_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => editorialItems.id),
    symbol: text('symbol').notNull(),
  },
  (t) => [
    uniqueIndex('idx_editorial_tag').on(t.itemId, t.symbol),
    index('idx_editorial_symbol').on(t.symbol, t.itemId),
  ],
);
export const contentReleases = sqliteTable('content_releases', {
  id: text('id').primaryKey(),
  appliedAt: integer('applied_at').notNull(),
});
export const operationCounts = sqliteTable(
  'operation_counts',
  {
    bucket: integer('bucket').notNull(),
    operation: text('operation').notNull(),
    outcome: text('outcome').notNull(),
    count: integer('count').notNull(),
    lastAt: integer('last_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_operation_bucket').on(t.bucket, t.operation, t.outcome),
  ],
);

export const communityRooms = sqliteTable(
  'community_rooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    description: text('description').notNull(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => communityMembers.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_room_name').on(t.nameKey)],
);

// Shared source cache with a bounded refresh lease; no user or wallet data.
export const marketCache = sqliteTable('market_cache', {
  key: text('key').primaryKey(),
  payload: text('payload'),
  fetchedAt: integer('fetched_at').notNull().default(0),
  retryAfter: integer('retry_after').notNull().default(0),
});
