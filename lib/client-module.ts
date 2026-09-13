export function isModuleLoadError(error: unknown) {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (?:CSS )?chunk|Unable to preload CSS/i.test(
      error.message,
    )
  );
}

export async function loadClientModule<T>(
  load: () => Promise<T>,
  pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt === 2 || !isModuleLoadError(error)) throw error;
      await pause(attempt === 0 ? 400 : 1200);
    }
  }
}

// Send technical classifications only: no raw messages, wallet addresses,
// page URLs, query strings, form contents, or user identifiers.
export function clientFault(error: unknown, section: string) {
  const e = error instanceof Error ? error : new Error();
  const assets = [
    ...new Set(
      (e.message + '\n' + e.stack).match(
        /\/_next\/static\/chunks\/[A-Za-z0-9_-]+\.(?:js|css)(?::\d+:\d+)?/g,
      ) || [],
    ),
  ].slice(0, 4);
  return {
    section,
    kind: isModuleLoadError(e) ? 'module' : 'render',
    code: e.message.match(/Minified React error #(\d+)/)?.[1] || null,
    assets,
  };
}

export function reportClientFault(error: unknown, section: string) {
  if (typeof window === 'undefined') return;
  void fetch('/api/client-error', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientFault(error, section)),
    keepalive: true,
  }).catch(() => {});
}
