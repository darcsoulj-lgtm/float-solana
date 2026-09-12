// Render saved data as soon as it arrives. Refresh is independent and never
// erases a usable result. The caller owns selection/session cancellation.
export async function readThenRefresh<T>(options: {
  read: () => Promise<T>;
  refresh: () => Promise<unknown>;
  publish: (value: T) => void;
  refreshError?: () => void;
}) {
  let published = false;
  let readError: unknown;
  const saved = options
    .read()
    .then((value) => {
      published = true;
      options.publish(value);
    })
    .catch((error) => {
      readError = error;
    });
  const refreshed = options
    .refresh()
    .then(() => true)
    .catch(() => false);
  await saved;
  if (await refreshed) {
    try {
      options.publish(await options.read());
      return;
    } catch (error) {
      readError = error;
    }
  }
  if (published) options.refreshError?.();
  else throw readError || new Error('Data is temporarily unavailable.');
}
