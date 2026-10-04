import { createRequire } from 'node:module';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const { outputFiles } = await build({stdin: {contents: "export { PUBLIC_SHELL_ROUTES } from './lib/public-built-shell';", resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'esm', write: false});
const { PUBLIC_SHELL_ROUTES } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const server = resolve('dist/server');
const files = (await readdir(server, {recursive:true})).filter(path => /\.(m?js)$/.test(path));
files.sort((a,b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b));
let outboundCalls = 0;
const mf = new Miniflare({modules: files.map(path => ({type:'ESModule', path:resolve(server,path)})), modulesRoot:server,
  compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
  outboundService:async () => {outboundCalls++; throw Error('Public shell generation cannot access providers');}});
try {
  await mkdir('dist/client/__float-shells', {recursive:true});
  for (const path of PUBLIC_SHELL_ROUTES) {
    const response = await mf.dispatchFetch('https://joinfloat.xyz' + path, {headers:{accept:'text/html'}});
    if (response.status !== 200 || response.headers.has('set-cookie') || !response.headers.get('content-type')?.startsWith('text/html')) throw Error('Invalid public shell: ' + path);
    const html = await response.text();
    if (!html.includes('id="main"') || !html.includes('<script')) throw Error('Missing app shell: ' + path);
    // Every referenced local JS/CSS file must belong to this same build.
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/[^"?]+\.(?:js|css))(?:\?[^"]*)?"/g)) await readFile('dist/client' + match[1]);
    await writeFile('dist/client/__float-shells/' + (path === '/' ? 'home' : path.slice(1)) + '.html', html);
  }
  if (outboundCalls) throw Error('Offline shell rendering attempted outbound access');
  console.log('Built ' + PUBLIC_SHELL_ROUTES.length + ' public shells offline. No database, session or provider access.');
} finally { await mf.dispose(); }
