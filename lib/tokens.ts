export const TOKENS = [
  {
    symbol: 'MU',
    name: 'Micron Technology',
    mint: 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1',
    source: 'https://learn.backpack.exchange/blog/tokenized-micron-mu',
  },
  {
    symbol: 'SKHY',
    name: 'SK Hynix ADR',
    mint: 'SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3',
    source: 'https://learn.backpack.exchange/blog/sk-hynix-skhy-backpack',
  },
  {
    symbol: 'SPCX',
    name: 'SpaceX',
    mint: null,
    source: 'https://learn.backpack.exchange/articles/how-to-hold-spcx',
  },
] as const;
export type Question = {
  id: string;
  prompt: string;
  type: 'single' | 'text';
  options: string[];
};
export type Survey = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  symbol: string;
  questions: Question[];
  status: string;
  demo: number;
  target: number;
  reward_cents: number;
  created_at: number;
  updated_at: number;
  response_count: number;
};
export const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
];
export type StoredSurvey = Omit<Survey, 'questions'> & {
  questions: string;
  salt: string;
  owner_id: string;
};
export type StoredResponse = {
  answers: string;
  cohort: string;
  slot: number;
  verified_at: number;
  created_at: number;
};
export type AnalyticsData = {
  survey: Survey;
  count: number;
  questions: (Question & {
    distribution: { option: string; count: number }[];
    textResponses: string[];
  })[];
  cohorts: { label: string; count: number }[];
  cohortsSuppressed: boolean;
  holdingDuration: null;
  newBuyers: null;
  latestVerifiedAt: number | null;
  rows: unknown[];
};
export type CommercialOrder = {
  id: string;
  organization: string;
  plan: string;
  email: string;
  notes: string;
  status: string;
  created_at: number;
};
export type AdminData = {
  surveys: Survey[];
  orders: CommercialOrder[];
  audit: { action: string; target: string; created_at: number }[];
};
export type ResponseReceipt = {
  id: string;
  rewardCents: number;
  claimStatus: string;
};
