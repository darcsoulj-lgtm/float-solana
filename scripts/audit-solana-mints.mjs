// Read-only audit of the reviewed registry; never auto-approves a new issuer or mint.
import fs from 'node:fs';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('lib/tokens.ts', root), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { TOKENS, TOKEN_PROGRAMS } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
const env = ['.dev.vars', '.env']
  .map((f) =>
    fs.existsSync(new URL(f, root))
      ? fs.readFileSync(new URL(f, root), 'utf8')
      : '',
  )
  .join('\n');
const rpc =
  process.env.SOLANA_RPC_URL ||
  env.match(/^SOLANA_RPC_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1] ||
  'https://api.mainnet-beta.solana.com';
const records = [];
for (let i = 0; i < TOKENS.length; i += 90) {
  const tokens = TOKENS.slice(i, i + 90);
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [
        tokens.map((t) => t.mint),
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ],
    }),
  });
  if (!r.ok) throw Error('Solana mint audit HTTP ' + r.status);
  const d = await r.json();
  if (d.error || d.result?.value?.length !== tokens.length)
    throw Error('Incomplete mint audit');
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j],
      a = d.result.value[j],
      info = a?.data?.parsed?.info;
    if (
      !TOKEN_PROGRAMS.includes(a?.owner) ||
      a?.executable !== false ||
      a?.data?.parsed?.type !== 'mint' ||
      info?.isInitialized !== true
    )
      throw Error('Invalid mint: ' + t.symbol);
    records.push({
      symbol: t.symbol,
      mint: t.mint,
      issuer: t.issuer,
      slot: d.result.context.slot,
      account: a,
    });
  }
  console.log(
    'Validated ' + Math.min(i + 90, TOKENS.length) + ' / ' + TOKENS.length,
  );
}
const file = new URL(
  'research/multi-issuer/mint-accounts-2026-09-12.json',
  root,
);
fs.mkdirSync(new URL('research/multi-issuer/', root), { recursive: true });
fs.writeFileSync(
  file,
  JSON.stringify(
    { checkedAt: new Date().toISOString(), commitment: 'finalized', records },
    null,
    2,
  ),
);
console.log('All reviewed mints validated. No registry changes made.');
