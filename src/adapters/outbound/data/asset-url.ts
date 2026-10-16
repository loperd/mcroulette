import { DataError } from './data-error.ts';

/** Legacy root paths refer to public assets inside the application's deployment base. */
export function resolvePublicAsset(path: string, baseUrl: URL): string {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new DataError('INVALID_URL', 'An asset path must be a nonempty string.');
  }
  const value = path.trim();
  const absolute = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
  let url: URL;
  try {
    url = new URL(absolute ? value : value.replace(/^\/+/, ''), baseUrl);
  } catch (error) {
    throw new DataError('INVALID_URL', 'The asset URL is not valid.', { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DataError('INVALID_URL', 'Assets must use HTTP or HTTPS.');
  }
  return url.href;
}

export function normalizeBaseUrl(value: string | URL): URL {
  const base = new URL(value);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new DataError('INVALID_URL', 'The application base must use HTTP or HTTPS.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.search = '';
  base.hash = '';
  return base;
}
