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
// Keep Vinext's generated fetch handler, with a tiny project-owned wrapper for
// the public market-data cron. The path is relative to dist/server.
config.main = '../../worker.ts';
config.triggers = { crons: ['* * * * *'] };
// Vinext's generated file is pre-bundled. Our TypeScript wrapper imports that
// handler, so Wrangler must bundle this final entrypoint instead.
delete config.no_bundle;

await writeFile(deployConfig, JSON.stringify(config));
