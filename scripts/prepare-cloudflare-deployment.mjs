import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {sourceFingerprint} from './source-fingerprint.mjs';

const generatedConfig = 'dist/server/wrangler.json';
const deployConfig = 'dist/server/wrangler.float.json';
const config = JSON.parse(await readFile(generatedConfig, 'utf8'));

config.name = 'float-solana';
config.d1_databases = [
  {
    binding: 'DB',
    database_name: 'float-solana-production',
    database_id: '9b18cdb5-e516-4116-8ab0-90eb670aa6d2',
    migrations_dir: '../../drizzle',
  },
];
config.r2_buckets = [];
config.assets = { ...config.assets, binding: 'ASSETS', html_handling: 'none', not_found_handling: 'none' };
config.triggers = { crons: ['* * * * *'] };
config.services = [{ binding: 'MARKET_REFRESH', service: 'float-solana', entrypoint: 'MarketRefresh' }];
const tradingEnabled = process.env.FLOAT_TRADING_ENABLED ?? 'false';
if (!['true', 'false'].includes(tradingEnabled)) throw new Error('Invalid FLOAT_TRADING_ENABLED');
const collectionSource = process.env.FLOAT_MARKET_COLLECTION_SOURCE ?? 'github';
if (!['github','durable'].includes(collectionSource)) throw new Error('Invalid collection source');
const fastSource = process.env.FLOAT_MARKET_FAST_SOURCE ?? '1';
if (!['0','1'].includes(fastSource)) throw new Error('Invalid fast source flag');
// Public display approved by the provider (reported by RJ, 3 October 2026).
// Keep approved collection enabled across subsequent UI deployments; 0 is the
// explicit rollback override. The runtime still requires the encrypted key.
const birdeyeEnabled = process.env.FLOAT_BIRDEYE_VOLUME_ENABLED ?? '1';
const birdeyeBudget = process.env.FLOAT_BIRDEYE_VOLUME_BUDGET_CU ?? '20000';
if (!['0','1'].includes(birdeyeEnabled) || !Number.isSafeInteger(Number(birdeyeBudget)) || Number(birdeyeBudget) < 5 || Number(birdeyeBudget) > 24000) throw new Error('Invalid Birdeye configuration');
// Durable mode requires migration 0021 and staging CPU/quota/soak evidence.
// RJ chose to keep the free plan and defer public issuer comparison. Never
// inherit an old flag or activate collection as a side effect of a UI release.
config.vars = { ...config.vars, SOURCE_FINGERPRINT: await sourceFingerprint(), PUBLIC_RENDER_VERSION: randomUUID(), BIRDEYE_COMPARISON_ENABLED: '0', BIRDEYE_VOLUME_ENABLED: birdeyeEnabled, BIRDEYE_VOLUME_BUDGET_CU: birdeyeBudget, MARKET_SCHEDULED: '1', MARKET_COLLECTION_SOURCE: collectionSource, MARKET_FAST_SOURCE: fastSource, TRADING_ENABLED: tradingEnabled, TRADING_RPC_URL: 'https://solana-rpc.publicnode.com' };
config.account_id = 'd3e7bd4eb990bc3978aa78cae19c509f';
config.ratelimits = [{ name: 'MARKET_READ_LIMITER', namespace_id: '1001', simple: { limit: 120, period: 60 } }];
config.ai = { binding: 'AI' };

await writeFile(deployConfig, JSON.stringify(config));
