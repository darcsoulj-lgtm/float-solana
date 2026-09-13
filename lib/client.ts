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
