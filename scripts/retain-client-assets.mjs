import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const KEEP = 4; // Current build and three previous client dependency graphs.
const assetPath = (p) =>
  typeof p === 'string' &&
  /^_next\/static\/[A-Za-z0-9_./-]+$/.test(p) &&
  !p.split('/').includes('..');
async function history(cache) {
  try {
    return JSON.parse(await readFile(resolve(cache, 'history.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function snapshotClientAssets(outDir, cache) {
  let raw;
  try {
    raw = await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const files = [
    ...new Set(
      Object.values(JSON.parse(raw))
        .flatMap((entry) => [
          entry.file,
          ...(entry.css || []),
          ...(entry.assets || []),
        ])
        .filter(assetPath),
    ),
  ];
  if (!files.length) return;
  const id = createHash('sha256').update(raw).digest('hex');
  const previous = await history(cache);
  if (previous[0]?.id === id) return;
  for (const file of files) {
    const target = resolve(cache, id, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(outDir, file), target);
  }
  const next = [{ id, files }, ...previous.filter((entry) => entry.id !== id)];
  await writeFile(
    resolve(cache, 'history.json'),
    JSON.stringify(next.slice(0, KEEP)),
  );
  for (const old of next.slice(KEEP))
    await rm(resolve(cache, old.id), { recursive: true, force: true });
}

export async function restoreClientAssets(outDir, cache) {
  // Only immutable files referenced by manifests. Never restore HTML, entry
  // manifests, Worker code, or runtime configuration from an earlier release.
  for (const entry of (await history(cache)).slice(1)) {
    for (const file of entry.files.filter(assetPath)) {
      const target = resolve(outDir, file);
      await mkdir(dirname(target), { recursive: true });
      try {
        await copyFile(
          resolve(cache, entry.id, file),
          target,
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }
}

/** @returns {import('vite').Plugin} */
export function retainClientAssets() {
  let outDir, cache;
  return {
    name: 'float-retain-client-assets',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    async buildStart() {
      outDir = resolve(
        this.environment.config.root,
        this.environment.config.build.outDir,
      );
      cache = resolve(
        this.environment.config.root,
        '.float-build-cache/client-assets',
      );
      await snapshotClientAssets(outDir, cache);
    },
    async writeBundle() {
      await snapshotClientAssets(outDir, cache);
      await restoreClientAssets(outDir, cache);
    },
  };
}
