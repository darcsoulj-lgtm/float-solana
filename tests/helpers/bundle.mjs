import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
export const root = fileURLToPath(new URL('../../', import.meta.url));
export async function bundle(contents) {
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: root, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(outputFiles[0].text).toString('base64')
  );
}
