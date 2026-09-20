export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    /^community\/(challenge|verify|holdings-refresh)$/.test(path)
      ? 45000
      : 25000,
  );
  let response: Response;
  let data: unknown;
  try {
    response = await fetch('/api/' + path, {
      signal: controller.signal,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    data = await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? 'The connection timed out. Please try again.'
        : 'Could not reach Float. Check your connection and try again.',
      0,
      controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (
    response.status === 401 &&
    (path.startsWith('community/') || path.startsWith('market-data')) &&
    !path.includes('moderation') &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event('hp-session-expired'));
  if (!response.ok)
    throw new ApiError(
      data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : 'Request failed.',
      response.status,
      data &&
        typeof data === 'object' &&
        'code' in data &&
        typeof data.code === 'string'
        ? data.code
        : undefined,
    );
  return data as T;
}
