export async function api<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch('/api/' + path, {
    signal: AbortSignal.timeout(
      /^community\/(challenge|verify)$/.test(path) ? 45000 : 25000,
    ),
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json();
  if (
    response.status === 401 &&
    path.startsWith('community/') &&
    !path.includes('moderation') &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event('hp-session-expired'));
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : 'Request failed.',
    );
  return data as T;
}
