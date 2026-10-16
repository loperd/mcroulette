import { DataError } from './data-error.ts';
import { waitFor } from '../../../application/cancellation.ts';

export type FetchJson = typeof fetch;

export const browserFetch: FetchJson = (input, init) => globalThis.fetch(input, init);

export async function requestJson(
  url: string,
  signal: AbortSignal,
  fetcher: FetchJson,
  cache: RequestCache = 'default',
): Promise<unknown> {
  signal.throwIfAborted();
  const response = await waitFor(fetcher(url,
    { signal, cache, headers: { Accept: 'application/json' } }), signal);
  signal.throwIfAborted();
  if (!response.ok) {
    throw new DataError('HTTP_ERROR', `The data request failed with HTTP ${response.status}.`);
  }
  try {
    const value: unknown = await waitFor(response.json(), signal);
    signal.throwIfAborted();
    return value;
  } catch (error) {
    signal.throwIfAborted();
    throw new DataError('INVALID_JSON', 'The data response is not valid JSON.', { cause: error });
  }
}
