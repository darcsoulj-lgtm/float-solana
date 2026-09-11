// Read-only registry drift check. Never adds tokens without mint review.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(
  new URL('../lib/tokens.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { TOKENS } = await import(
  'data:text/javascript;base64,' + Buffer.from(output).toString('base64')
);
try {
  const response = await fetch('https://api.backpack.exchange/api/v1/assets', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Registry unavailable');
  const assets = await response.json();
  if (
    !Array.isArray(assets) ||
    !assets.length ||
    assets.some((a) => typeof a.symbol !== 'string' || !Array.isArray(a.tokens))
  )
    throw new Error('Invalid registry response');
  const enabled = assets.flatMap((a) =>
    a.symbol.endsWith('.US')
      ? a.tokens
          .filter(
            (t) =>
              t.blockchain === 'Solana' &&
              (t.depositEnabled || t.withdrawEnabled),
          )
          .map((t) => ({
            symbol: a.symbol.slice(0, -3),
            mint: t.contractAddress,
          }))
      : [],
  );
  const key = (t) => `${t.symbol}:${t.mint}`;
  const live = new Set(enabled.map(key)),
    local = new Set(TOKENS.map(key));
  const missing = enabled.filter((t) => !local.has(key(t)));
  const removed = TOKENS.filter((t) => !live.has(key(t)));
  const duplicates =
    live.size !== enabled.length ||
    local.size !== TOKENS.length ||
    new Set(enabled.map((t) => t.symbol)).size !== enabled.length;
  if (missing.length || removed.length || duplicates) {
    console.error(
      JSON.stringify(
        { needsReview: true, missing, removed, duplicates },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else
    console.log(
      `Registry matches all ${TOKENS.length} reviewed Solana tokens. Checked ${new Date().toISOString()}.`,
    );
} catch {
  console.error(
    'Token registry audit could not complete. Do not treat this as a passing check.',
  );
  process.exitCode = 1;
}
