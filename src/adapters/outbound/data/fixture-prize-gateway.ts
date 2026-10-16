import type { Item } from '../../../domain/item.ts';
import type { PrizeGateway } from '../../../application/ports/prize-gateway.ts';
import { normalizeBaseUrl, resolvePublicAsset } from './asset-url.ts';
import { decodeItem } from './item-dto.ts';
import { browserFetch, requestJson, type FetchJson } from './request-json.ts';

export class FixturePrizeGateway implements PrizeGateway {
  private readonly baseUrl: URL;
  private readonly fetcher: FetchJson;
  private readonly path: string;

  constructor(baseUrl: string | URL, fetcher: FetchJson = browserFetch, path = 'selected_prize.json') {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetcher = fetcher; this.path = path;
  }

  async select(sessionId: string, signal: AbortSignal): Promise<Item> {
    if (!sessionId.trim()) throw new Error('The session id must be nonempty.');
    const value = await requestJson(resolvePublicAsset(this.path, this.baseUrl),
      signal, this.fetcher, 'no-store');
    signal.throwIfAborted();
    return decodeItem(value, this.baseUrl);
  }
}
