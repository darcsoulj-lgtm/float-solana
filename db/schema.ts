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
