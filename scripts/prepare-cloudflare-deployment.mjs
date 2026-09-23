import { readFile, writeFile } from 'node:fs/promises';

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
config.triggers = { crons: ['* * * * *'] };
config.services = [{ binding: 'MARKET_REFRESH', service: 'float-solana', entrypoint: 'MarketRefresh' }];
config.vars = { ...config.vars, MARKET_SCHEDULED: '1' };

await writeFile(deployConfig, JSON.stringify(config));
